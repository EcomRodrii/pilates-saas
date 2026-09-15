import { test, expect, type Page, type Route } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// Instructora dada de alta en Equipo con su correo (15-sep-2026).
//
// Contrato que fija esta suite:
//   1. Al entrar en la app con ese correo NO se la da de alta como alumna sin
//      preguntar (pasaba: aparecía como clienta nueva en el panel). Elige.
//   2. «Como instructora» une su cuenta y la lleva a «Tus horarios», de donde no
//      sale hasta marcar al menos una franja.
//   3. «Como alumna» sigue el alta de alumna de siempre, diciendo que lo eligió.
//   4. Quien no tiene nada pendiente no ve nada de esto.
//
// ⚠️ Cada «no hizo X» va con el contador del camino que SÍ debía ocurrir (ver
// test-4xx-necesita-contador). Y hay firma de alumna en la pestaña: sin la
// pregunta, `verificar` intentaría el alta de verdad.
// ─────────────────────────────────────────────────────────────────────────────

const INSTRUCTORA = { instructorId: 'ins-1', nombre: 'Ana Ferrer', fotoUrl: null };

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montar(page: Page, opciones: { pendiente: boolean; yaUnida: boolean; celdas: string[] }) {
  const contador = {
    sesion: 0, unirse: 0, altaAlumna: 0, leer: 0, guardar: 0,
    cuerpoAlta: null as null | Record<string, unknown>, cuerpoUnirse: null as null | Record<string, unknown>,
  };
  let unida = opciones.yaUnida;
  let celdas = opciones.celdas;

  await montarPortal(page, { conSesion: true, sinSocia: true });
  // La firma de alumna recogida en el registro, como si viniera de él.
  await page.addInitScript((slug: string) => {
    sessionStorage.setItem(`st_firma_${slug}`, JSON.stringify({
      fecha: '2026-09-15T10:00:00.000Z', firma: 'Ana Ferrer', versionTexto: 'Condiciones del estudio',
    }));
  }, SLUG);

  // Registradas DESPUÉS de montarPortal: Playwright resuelve la última primero.
  await page.route('**/api/public/session**', (route) => json(route, { error: 'No hay ninguna socia' }, 404));
  await page.route('**/api/portal/instructora/sesion', (route) => {
    contador.sesion++;
    return unida
      ? json(route, { instructora: INSTRUCTORA })
      : json(route, { instructora: null, invitacionPendiente: opciones.pendiente }, 404);
  });
  await page.route('**/api/portal/instructora/unirse', (route) => {
    contador.unirse++;
    contador.cuerpoUnirse = JSON.parse(route.request().postData() || '{}');
    unida = true;
    return json(route, { ok: true });
  });
  await page.route('**/api/portal/instructora/agenda', (route) => json(route, { clases: [], bajas: [] }));
  await page.route('**/api/portal/instructora/disponibilidad', (route) => {
    const cuerpo = JSON.parse(route.request().postData() || '{}') as { accion?: string; celdas?: string[] };
    if (cuerpo.accion === 'guardar') {
      contador.guardar++;
      celdas = cuerpo.celdas ?? [];
      return json(route, { ok: true, guardadas: celdas.length });
    }
    contador.leer++;
    return json(route, { celdas });
  });
  await page.route('**/api/public/socio**', (route) => {
    if (route.request().method() === 'POST') {
      contador.altaAlumna++;
      contador.cuerpoAlta = JSON.parse(route.request().postData() || '{}');
    }
    return json(route, { ok: true });
  });
  return contador;
}

test.describe('Instructora dada de alta con su correo', () => {
  test('al entrar elige; como instructora va a «Tus horarios» y no sale sin marcar una franja', async ({ page }) => {
    test.setTimeout(120_000);
    const contador = await montar(page, { pendiente: true, yaUnida: false, celdas: [] });
    await page.goto(`/portal/${SLUG}/acceso/verificar`);

    await expect(page).toHaveURL(new RegExp(`/portal/${SLUG}/acceso/elegir$`), { timeout: 60_000 });
    await expect(page.getByRole('heading', { name: '¿Cómo quieres entrar?' })).toBeVisible();
    // Preguntó (el camino que debía ocurrir)… y no la dio de alta como alumna.
    expect(contador.sesion).toBeGreaterThan(0);
    expect(contador.altaAlumna).toBe(0);

    await page.getByTestId('entrar-como-instructora').click();
    await expect(page).toHaveURL(new RegExp(`/portal/${SLUG}/equipo/disponibilidad$`), { timeout: 60_000 });
    expect(contador.unirse).toBe(1);
    await expect(page.getByRole('heading', { name: 'Tus horarios' })).toBeVisible();
    await expect(page.getByTestId('horarios-obligatorios')).toBeVisible();
    // Sin pestañas: no hay a dónde ir.
    await expect(page.getByRole('navigation', { name: 'Principal' })).toHaveCount(0);
    const guardar = page.getByRole('button', { name: 'Guardar y entrar' });
    await expect(guardar).toBeDisabled();

    // Aunque abra otra pantalla de su parte, vuelve aquí.
    await page.goto(`/portal/${SLUG}/equipo/agenda`);
    await expect(page).toHaveURL(new RegExp(`/portal/${SLUG}/equipo/disponibilidad$`), { timeout: 60_000 });
    expect(contador.leer).toBeGreaterThan(0);
    expect(contador.altaAlumna).toBe(0);

    const lunesManana = page.locator('[data-celda="1-manana"]');
    await lunesManana.click();
    await expect(lunesManana).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Guardar y entrar' }).click();

    await expect(page).toHaveURL(new RegExp(`/portal/${SLUG}/equipo$`), { timeout: 60_000 });
    expect(contador.guardar).toBe(1);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Ana');
  });

  test('como alumna, sigue su alta de alumna diciendo que lo eligió', async ({ page }) => {
    test.setTimeout(120_000);
    const contador = await montar(page, { pendiente: true, yaUnida: false, celdas: [] });
    await page.goto(`/portal/${SLUG}/acceso/verificar`);

    await expect(page).toHaveURL(new RegExp(`/portal/${SLUG}/acceso/elegir$`), { timeout: 60_000 });
    await page.getByTestId('entrar-como-alumna').click();

    await expect.poll(() => contador.altaAlumna, { timeout: 60_000 }).toBe(1);
    expect(contador.cuerpoAlta?.eligioAlumna).toBe(true);
    expect(contador.unirse).toBe(0);
  });

  test('sin nada pendiente, el alta de alumna sigue como siempre y no se pregunta nada', async ({ page }) => {
    test.setTimeout(120_000);
    const contador = await montar(page, { pendiente: false, yaUnida: false, celdas: [] });
    await page.goto(`/portal/${SLUG}/acceso/verificar`);

    await expect.poll(() => contador.altaAlumna, { timeout: 60_000 }).toBe(1);
    expect(contador.sesion).toBeGreaterThan(0);
    expect(contador.cuerpoAlta?.eligioAlumna).toBe(false);
    await expect(page).not.toHaveURL(/\/acceso\/elegir/);
  });

  test('desde el correo de invitación: elige, se une con el enlace y va a sus horarios', async ({ page }) => {
    test.setTimeout(120_000);
    // Sin ficha pendiente por correo: la invitación es lo único que la trae aquí
    // (entra con otra cuenta, o su cuenta es la de un estudio).
    const contador = await montar(page, { pendiente: false, yaUnida: false, celdas: [] });
    const enlace = 'eyJpbnN0cnVjdG9ySWQiOiJpbnMtMSJ9.ZmlybWFkZWxlbmxhY2U';
    await page.goto(`/portal/${SLUG}/acceso/invitacion?token=${enlace}`);

    // Con sesión, va directa a elegir; el enlace ya no está en la URL.
    await expect(page).toHaveURL(new RegExp(`/portal/${SLUG}/acceso/elegir$`), { timeout: 60_000 });
    await expect(page.getByText('te ha invitado a su equipo')).toBeVisible();
    expect(contador.altaAlumna).toBe(0);

    await page.getByTestId('entrar-como-instructora').click();
    await expect(page).toHaveURL(new RegExp(`/portal/${SLUG}/equipo/disponibilidad$`), { timeout: 60_000 });
    expect(contador.unirse).toBe(1);
    expect(contador.cuerpoUnirse).toEqual({ slug: SLUG, token: enlace });
    // Unida: el enlace se olvida y no vuelve a traerla a elegir.
    expect(await page.evaluate((s) => localStorage.getItem(`st_invitacion_equipo:${s}`), SLUG)).toBeNull();
  });

  test('con horarios ya puestos, entra directa a «Hoy»', async ({ page }) => {
    test.setTimeout(120_000);
    const contador = await montar(page, { pendiente: false, yaUnida: true, celdas: ['1-manana'] });
    await page.goto(`/portal/${SLUG}/equipo`);

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Ana', { timeout: 60_000 });
    await expect(page).toHaveURL(new RegExp(`/portal/${SLUG}/equipo$`));
    expect(contador.leer).toBeGreaterThan(0);
  });
});
