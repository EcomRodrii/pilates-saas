import { test, expect, type Page, type Route } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// Fichaje de la instructora en la app del estudio (`/equipo/fichaje`).
//
// El servidor está simulado con estado (una jornada abierta o no) para poder
// recargar y ver que sigue ahí. ⚠️ Un mock nunca es el servidor real: que el
// índice único de la base de datos absorbe el doble clic, y que la RLS niega
// escrituras directas, se comprobó aparte contra PostgreSQL; aquí se prueba lo
// que ve y hace la pantalla.
//
// Cada camino de fallo lleva contador de intentos: «no pintó éxito» sería verdad
// también si la pantalla no hubiera llegado a enviar nada.
// ─────────────────────────────────────────────────────────────────────────────

const INSTRUCTORA = { instructorId: 'ins-1', nombre: 'Ana Ferrer', fotoUrl: null };

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montar(page: Page, opciones: { entradaFalla?: boolean; abiertaHaceMin?: number; estadoFalla?: boolean; revisar?: boolean } = {}) {
  const contador = { entrada: 0, salida: 0, estado: 0, cuerpos: [] as Record<string, unknown>[] };
  let abierta: { id: string; checkInAt: string; requiereRevision: boolean } | null = opciones.abiertaHaceMin != null
    ? { id: 'j1', checkInAt: new Date(Date.now() - opciones.abiertaHaceMin * 60_000).toISOString(), requiereRevision: opciones.revisar === true }
    : null;

  await montarPortal(page, { conSesion: true, sinSocia: true });
  await page.route('**/api/public/session**', (route) => json(route, { error: 'No hay ninguna socia' }, 404));
  await page.route('**/api/portal/instructora/sesion', (route) => json(route, { instructora: INSTRUCTORA }));
  await page.route('**/api/portal/instructora/agenda', (route) => json(route, { clases: [], bajas: [] }));
  await page.route('**/api/portal/instructora/fichaje', async (route) => {
    const cuerpo = JSON.parse(route.request().postData() || '{}') as { slug?: string; accion?: string };
    contador.cuerpos.push(cuerpo);
    const estado = () => ({ abierta, proxima: null, ventanaMinutos: 10 });
    if (cuerpo.accion === 'estado') {
      contador.estado++;
      return opciones.estadoFalla ? json(route, { error: 'caído' }, 500) : json(route, { estado: estado() });
    }
    // Latencia real: sin ella el segundo clic de un doble clic llegaría cuando ya se ha repintado.
    await new Promise((r) => setTimeout(r, 300));
    if (cuerpo.accion === 'entrada') {
      contador.entrada++;
      if (opciones.entradaFalla) return json(route, { error: 'No hemos podido registrarlo.' }, 500);
      const yaAbierta = abierta !== null;
      abierta ??= { id: 'j1', checkInAt: new Date().toISOString(), requiereRevision: false };
      return json(route, { yaAbierta, estado: estado() });
    }
    contador.salida++;
    const yaCerrada = abierta === null;
    const minutos = abierta ? Math.round((Date.now() - Date.parse(abierta.checkInAt)) / 60_000) : null;
    abierta = null;
    return json(route, { yaCerrada, minutos, estado: estado() });
  });
  return contador;
}

const URL_FICHAR = `/portal/${SLUG}/equipo/fichaje`;

test.describe('Fichaje de la instructora', () => {
  test('sin jornada: entrada → abierta con hora y cronómetro → recargar sigue abierta → salida → cerrada', async ({ page }) => {
    const c = await montar(page);
    await page.goto(URL_FICHAR);

    const estado = page.getByTestId('fichaje-estado');
    await expect(estado).toHaveAttribute('data-abierta', 'false', { timeout: 30_000 });
    await expect(page.getByText('No has fichado la entrada')).toBeVisible();

    await page.getByRole('button', { name: 'Fichar entrada', exact: true }).click();
    await expect(estado).toHaveAttribute('data-abierta', 'true');
    await expect(page.getByText(/Entraste a las \d{2}:\d{2}/)).toBeVisible();
    await expect(page.getByTestId('fichaje-tiempo')).toHaveText(/\d+ h \d{2} min/);
    await expect(page.getByRole('button', { name: 'Fichar salida', exact: true })).toBeVisible();
    expect(c.entrada).toBe(1);

    await page.reload();
    await expect(page.getByTestId('fichaje-estado')).toHaveAttribute('data-abierta', 'true', { timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Fichar salida', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Fichar salida', exact: true }).click();
    await expect(page.getByText(/Salida registrada · \d+ h \d{2} min/)).toBeVisible();
    await expect(page.getByTestId('fichaje-estado')).toHaveAttribute('data-abierta', 'false');
    await expect(page.getByRole('button', { name: 'Fichar entrada', exact: true })).toBeVisible();
    expect(c.salida).toBe(1);
  });

  test('doble clic en entrada y en salida: una única petición de cada una', async ({ page }) => {
    const c = await montar(page);
    await page.goto(URL_FICHAR);
    await expect(page.getByTestId('fichaje-estado')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Fichar entrada', exact: true }).dblclick();
    await expect(page.getByTestId('fichaje-estado')).toHaveAttribute('data-abierta', 'true');
    expect(c.entrada).toBe(1);

    await page.getByRole('button', { name: 'Fichar salida', exact: true }).dblclick();
    await expect(page.getByTestId('fichaje-estado')).toHaveAttribute('data-abierta', 'false');
    expect(c.salida).toBe(1);
  });

  test('la petición solo lleva el estudio y la acción: nunca ids de instructora ni de jornada', async ({ page }) => {
    const c = await montar(page, { abiertaHaceMin: 30 });
    await page.goto(URL_FICHAR);
    await page.getByRole('button', { name: 'Fichar salida', exact: true }).click();
    await expect(page.getByText(/Salida registrada/)).toBeVisible();
    expect(c.cuerpos.length).toBeGreaterThan(0);
    for (const cuerpo of c.cuerpos) assert(Object.keys(cuerpo).sort().join() === 'accion,slug', `cuerpo inesperado: ${JSON.stringify(cuerpo)}`);
  });

  test('si el servidor dice que no, la pantalla no da por hecha la entrada', async ({ page }) => {
    const c = await montar(page, { entradaFalla: true });
    await page.goto(URL_FICHAR);
    await expect(page.getByTestId('fichaje-estado')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Fichar entrada', exact: true }).click();
    await expect(page.getByText('No hemos podido registrarlo. Inténtalo de nuevo.')).toBeVisible();
    await expect(page.getByTestId('fichaje-estado')).toHaveAttribute('data-abierta', 'false');
    await expect(page.getByRole('button', { name: 'Fichar entrada', exact: true })).toBeEnabled();
    expect(c.entrada).toBeGreaterThan(0);
  });

  test('en el móvil el botón de fichar se ve entero y se puede tocar', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await montar(page);
    await page.goto(URL_FICHAR);
    const boton = page.getByRole('button', { name: 'Fichar entrada', exact: true });
    await expect(boton).toBeVisible({ timeout: 30_000 });
    const caja = await boton.boundingBox();
    expect(caja).not.toBeNull();
    expect(caja!.height).toBeGreaterThanOrEqual(44);
    expect(caja!.x).toBeGreaterThanOrEqual(0);
    expect(caja!.x + caja!.width).toBeLessThanOrEqual(375);
    expect(caja!.y + caja!.height).toBeLessThanOrEqual(667);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await boton.click();
    await expect(page.getByTestId('fichaje-estado')).toHaveAttribute('data-abierta', 'true');
  });

  test('en «Hoy» se ve si está fichada y lleva a fichar', async ({ page }) => {
    const c = await montar(page, { abiertaHaceMin: 45 });
    await page.goto(`/portal/${SLUG}/equipo`);
    const tarjeta = page.getByTestId('fichaje-hoy');
    await expect(tarjeta).toContainText(/Jornada abierta desde las \d{2}:\d{2}/, { timeout: 30_000 });
    await expect(tarjeta).toContainText('Fichar salida');
    expect(c.estado).toBeGreaterThan(0);
    await tarjeta.click();
    await expect(page).toHaveURL(new RegExp(`/portal/${SLUG}/equipo/fichaje$`), { timeout: 30_000 });
    await expect(page.getByTestId('fichaje-estado')).toHaveAttribute('data-abierta', 'true', { timeout: 30_000 });
  });

  test('con la jornada abierta de más, «Hoy» le recuerda fichar la salida; si no, no dice nada', async ({ page }) => {
    await montar(page, { abiertaHaceMin: 14 * 60, revisar: true });
    await page.goto(`/portal/${SLUG}/equipo`);
    await expect(page.getByTestId('fichaje-hoy-revisar')).toContainText('¿Se te olvidó fichar la salida?', { timeout: 30_000 });
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await montar(page, { abiertaHaceMin: 30 });
    await page.goto(`/portal/${SLUG}/equipo`);
    await expect(page.getByTestId('fichaje-hoy')).toContainText('Jornada abierta desde las', { timeout: 30_000 });
    await expect(page.getByTestId('fichaje-hoy-revisar')).toHaveCount(0);
  });

  test('si no se puede leer el fichaje, «Hoy» se ve igual y el acceso sigue ahí', async ({ page }) => {
    const c = await montar(page, { estadoFalla: true });
    await page.goto(`/portal/${SLUG}/equipo`);
    const tarjeta = page.getByTestId('fichaje-hoy');
    await expect(tarjeta).toContainText('Tu entrada y salida', { timeout: 30_000 });
    await expect(tarjeta).toContainText('Fichar →');
    await expect(page.getByTestId('resumen-semana')).toBeVisible();
    expect(c.estado).toBeGreaterThan(0);
  });
});

function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }
