import { test, expect, type Page, type Route } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// La instructora en la app del estudio (Fase 1, cuarto tramo):
//   1. Perfil: ve su tarifa (solo lectura) y salta a sus otros estudios.
//   2. Registra una ausencia: se manda tipo y fechas, NUNCA un instructorId, y se
//      le dice si tiene clases en esas fechas.
//   3. Si el servidor no la guarda, se explica y no se da por guardada.
//   4. Quita una ausencia tras confirmarlo.
//
// ⚠️ Cada camino de fallo lleva contador de intentos: «no pintó éxito» sería
// verdad también si la pantalla no hubiera llegado a enviar nada.
// ─────────────────────────────────────────────────────────────────────────────

const INSTRUCTORA = { instructorId: 'ins-1', nombre: 'Ana Ferrer', fotoUrl: null };
const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' });

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

function diaMas(n: number): string {
  const d = new Date(`${fmtDia.format(new Date())}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

type Ausencia = { id: string; tipo: string; desde: string; hasta: string; motivo: string | null };

async function montar(
  page: Page,
  opciones: { iniciales?: Ausencia[]; crearFalla?: boolean; valoraciones?: unknown; perfilFalla?: boolean } = {},
) {
  const contador = {
    crear: 0, borrar: 0, cuerpoCrear: null as null | Record<string, unknown>, idBorrado: null as unknown,
    perfil: 0, cuerpoPerfil: null as null | Record<string, unknown>,
  };
  let items: Ausencia[] = opciones.iniciales ?? [];

  await montarPortal(page, { conSesion: true, sinSocia: true });
  await page.route('**/api/public/session**', (route) => json(route, { error: 'No hay ninguna socia' }, 404));
  await page.route('**/api/portal/instructora/sesion', (route) => json(route, { instructora: INSTRUCTORA }));
  await page.route('**/api/portal/instructora/perfil', (route) => {
    contador.perfil++;
    contador.cuerpoPerfil = JSON.parse(route.request().postData() || '{}') as Record<string, unknown>;
    if (opciones.perfilFalla) return json(route, { error: 'No se ha podido cargar tu perfil.' }, 500);
    return json(route, {
      estudios: [
        { nombre: 'Estudio Centro', slug: SLUG, actual: true },
        { nombre: 'Estudio Playa', slug: 'estudio-playa', actual: false },
      ],
      tarifa: { tarifaHora: 22, baseMensualEur: null },
      valoraciones: opciones.valoraciones ?? null,
    });
  });
  await page.route('**/api/portal/instructora/ausencias', (route) => {
    const cuerpo = JSON.parse(route.request().postData() || '{}') as Record<string, unknown>;
    if (cuerpo.accion === 'crear') {
      contador.crear++;
      contador.cuerpoCrear = cuerpo;
      if (opciones.crearFalla) return json(route, { error: 'No se ha podido guardar la ausencia' }, 500);
      items = [...items, { id: 'aus-nueva', tipo: String(cuerpo.tipo), desde: String(cuerpo.desde), hasta: String(cuerpo.hasta), motivo: null }];
      return json(route, { ok: true, clasesAfectadas: 2 });
    }
    if (cuerpo.accion === 'borrar') {
      contador.borrar++;
      contador.idBorrado = cuerpo.id;
      items = items.filter((a) => a.id !== cuerpo.id);
      return json(route, { ok: true });
    }
    return json(route, { items });
  });
  return contador;
}

test.describe('La instructora ve su perfil y gestiona sus ausencias desde la app', () => {
  test('el perfil enseña su tarifa y enlaza con sus otros estudios', async ({ page }) => {
    await montar(page);
    await page.goto(`/portal/${SLUG}/equipo/perfil`);

    const tarifa = page.getByTestId('tarifa');
    await expect(tarifa).toContainText('Por hora', { timeout: 30_000 });
    await expect(tarifa).toContainText('22');
    await expect(page.getByRole('link', { name: /Estudio Playa/ })).toHaveAttribute('href', '/portal/estudio-playa/equipo');
    await expect(page.getByRole('link', { name: /Estudio Centro/ })).toContainText('Estás aquí');
    await expect(page.getByRole('link', { name: 'Tus ausencias', exact: true })).toBeVisible();
  });

  test('registra una ausencia sin mandar ninguna instructora y le avisa de sus clases', async ({ page }) => {
    const contador = await montar(page);
    await page.goto(`/portal/${SLUG}/equipo/ausencias`);

    const baja = page.getByRole('button', { name: 'Baja médica', exact: true });
    await baja.click({ timeout: 30_000 });
    await expect(baja).toHaveAttribute('aria-pressed', 'true');
    const desde = diaMas(1);
    const hasta = diaMas(3);
    await page.getByLabel('Desde', { exact: true }).fill(desde);
    await page.getByLabel('Hasta', { exact: true }).fill(hasta);
    await page.getByRole('button', { name: 'Guardar ausencia', exact: true }).click();

    await expect(page.getByText('Tienes 2 clases en esas fechas')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('ausencia')).toContainText('Baja médica');
    expect(contador.crear).toBe(1);
    expect(contador.cuerpoCrear).toMatchObject({ slug: SLUG, accion: 'crear', tipo: 'BAJA_MEDICA', desde, hasta });
    expect(contador.cuerpoCrear).not.toHaveProperty('instructorId');
  });

  test('si el servidor no la guarda, lo explica y no la da por guardada', async ({ page }) => {
    const contador = await montar(page, { crearFalla: true });
    await page.goto(`/portal/${SLUG}/equipo/ausencias`);

    await page.getByRole('button', { name: 'Guardar ausencia', exact: true }).click({ timeout: 30_000 });

    await expect(page.getByRole('alert').filter({ hasText: 'No se ha podido guardar la ausencia' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Ausencia guardada')).toHaveCount(0);
    await expect(page.getByTestId('ausencia')).toHaveCount(0);
    expect(contador.crear).toBeGreaterThan(0);
  });

  test('quita una ausencia solo tras confirmarlo', async ({ page }) => {
    const contador = await montar(page, {
      iniciales: [{ id: 'aus-1', tipo: 'VACACIONES', desde: diaMas(5), hasta: diaMas(9), motivo: null }],
    });
    await page.goto(`/portal/${SLUG}/equipo/ausencias`);

    const ausencia = page.getByTestId('ausencia');
    await expect(ausencia).toContainText('Vacaciones', { timeout: 30_000 });
    await ausencia.getByRole('button', { name: 'Quitar', exact: true }).click();
    expect(contador.borrar).toBe(0);

    await page.getByRole('dialog').getByRole('button', { name: 'Quitar', exact: true }).click();
    await expect(page.getByText('Ausencia quitada')).toBeVisible({ timeout: 15_000 });
    await expect(ausencia).toHaveCount(0);
    expect(contador.borrar).toBe(1);
    expect(contador.idBorrado).toBe('aus-1');
  });
});

test.describe('La instructora ve su nota agregada en el perfil', () => {
  test('con datos suficientes, la media con su número de valoraciones y hasta cuándo', async ({ page }) => {
    const contador = await montar(page, { valoraciones: { media: 4.63, total: 38, hasta: '2026-08-31' } });
    await page.goto(`/portal/${SLUG}/equipo/perfil`);

    const tarjeta = page.getByTestId('valoraciones');
    await expect(tarjeta).toContainText('4,6 · 38 valoraciones', { timeout: 30_000 });
    await expect(tarjeta).toContainText('Datos hasta el 31 de agosto');
    expect(contador.perfil).toBeGreaterThan(0);
    // La instructora sale del token: el cuerpo solo lleva el estudio.
    expect(contador.cuerpoPerfil).toEqual({ slug: SLUG });
  });

  test('sin datos suficientes, una línea neutra y ningún número', async ({ page }) => {
    const contador = await montar(page, { valoraciones: null });
    await page.goto(`/portal/${SLUG}/equipo/perfil`);

    const tarjeta = page.getByTestId('valoraciones');
    await expect(tarjeta).toContainText('Cuando al menos 5 alumnas hayan valorado tus clases', { timeout: 30_000 });
    await expect(tarjeta).not.toContainText('·');
    expect(contador.perfil).toBeGreaterThan(0);
  });

  test('si el perfil falla, no inventa ninguna nota y el resto del perfil sigue sirviendo', async ({ page }) => {
    const contador = await montar(page, { perfilFalla: true });
    await page.goto(`/portal/${SLUG}/equipo/perfil`);

    await expect(page.getByRole('link', { name: 'Tus ausencias', exact: true })).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => contador.perfil, { timeout: 30_000 }).toBeGreaterThan(0);
    await expect(page.getByTestId('valoraciones')).toHaveCount(0);
    await expect(page.getByText('Cuando al menos 5 alumnas')).toHaveCount(0);
  });
});
