import { test, expect, type Page } from '@playwright/test';
import { SLUG, STUDIO_ID, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// Gamificación en la app de la alumna.
//
// El estudio ya podía configurar créditos, logros, niveles y retos en su panel,
// y el servidor los evalúa de verdad en cada reserva; la alumna no veía nada.
// Lo que rompe aquí: pintar un tablero a cero en un estudio que no la usa,
// enseñar retos ya terminados como si se pudieran ganar, o dejar canjear algo
// que no se puede pagar.

const base = `/portal/${SLUG}`;
const HOY = '2026-08-12'; // el reloj que fija sembrarSociaLista

function conGamificacion() {
  const f = fixtureSociaLista() as Record<string, unknown>;
  f.levelDefinitions = [
    { id: 'n1', studioId: STUDIO_ID, nombre: 'Inicio', orden: 1, umbralCreditos: 0, color: '#aaa', icono: '🌱', beneficios: null },
    { id: 'n2', studioId: STUDIO_ID, nombre: 'Constante', orden: 2, umbralCreditos: 100, color: '#bbb', icono: '⭐', beneficios: 'Prioridad en lista de espera' },
    { id: 'n3', studioId: STUDIO_ID, nombre: 'Veterana', orden: 3, umbralCreditos: 500, color: '#ccc', icono: '🏆', beneficios: null },
  ];
  f.achievementDefinitions = [
    { id: 'l1', studioId: STUDIO_ID, metric: 'CLASES', nombre: 'Diez clases', descripcion: null, umbral: 10, icono: '🔟', creditosRecompensa: 20, activo: true },
    { id: 'l2', studioId: STUDIO_ID, metric: 'CLASES', nombre: 'Primeros pasos', descripcion: null, umbral: 5, icono: '👣', creditosRecompensa: 10, activo: true },
  ];
  f.challengeDefinitions = [
    { id: 'r1', studioId: STUDIO_ID, nombre: 'Agosto activo', descripcion: 'Doce clases este mes', icono: '🔥', metric: 'CLASES', objetivo: 12, fechaInicio: '2026-08-01', fechaFin: '2026-08-31', creditosRecompensa: 50 },
    { id: 'r2', studioId: STUDIO_ID, nombre: 'Reto de julio', descripcion: null, icono: '⏰', metric: 'CLASES', objetivo: 8, fechaInicio: '2026-07-01', fechaFin: '2026-07-31', creditosRecompensa: 30 },
  ];
  f.rewardCatalog = [
    { id: 'p1', studioId: STUDIO_ID, nombre: 'Clase suelta', descripcion: null, costeCreditos: 100, icono: '🎟', activo: true, stock: null },
    { id: 'p2', studioId: STUDIO_ID, nombre: 'Camiseta', descripcion: null, costeCreditos: 500, icono: '👕', activo: true, stock: 3 },
  ];
  const socia = f.socia as Record<string, unknown>;
  socia.memberCredits = [{ socioId: 'socio-e2e-1', studioId: STUDIO_ID, saldo: 150, totalGanado: 250, totalCanjeado: 100, actualizadoEn: '2026-08-10T00:00:00Z' }];
  socia.achievementProgress = [{ id: 'ap1', studioId: STUDIO_ID, socioId: 'socio-e2e-1', achievementId: 'l1', progresoActual: 8, completado: false, completadoEn: null },
    { id: 'ap2', studioId: STUDIO_ID, socioId: 'socio-e2e-1', achievementId: 'l2', progresoActual: 5, completado: true, completadoEn: '2026-08-01T00:00:00Z' }];
  socia.challengeProgress = [{ id: 'cp1', studioId: STUDIO_ID, socioId: 'socio-e2e-1', challengeId: 'r1', progresoActual: 7, completado: false, completadoEn: null }];
  socia.retosApuntados = ['r1'];
  return f;
}

async function montar(page: Page, payload: unknown, opts: { canje?: number; reto?: number } = {}) {
  await sembrarSociaLista(page);
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) }));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }));
  await page.route((u) => u.pathname === '/api/public/comunidad/posts', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ posts: [] }) }));
  const peticiones: Array<{ url: string; body: Record<string, unknown> }> = [];
  await page.route('**/api/public/canje', (r) => {
    peticiones.push({ url: '/canje', body: r.request().postDataJSON() as Record<string, unknown> });
    const s = opts.canje ?? 200;
    return r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(s === 200 ? { ok: true } : { error: 'No tienes créditos suficientes' }) });
  });
  await page.route('**/api/public/retos', (r) => {
    peticiones.push({ url: '/retos', body: r.request().postDataJSON() as Record<string, unknown> });
    const s = opts.reto ?? 200;
    return r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(s === 200 ? { ok: true } : { error: 'boom' }) });
  });
  return peticiones;
}

test.describe('Student PWA · gamificación', () => {
  test('nivel desde el total GANADO, no desde el saldo', async ({ page }) => {
    await montar(page, conGamificacion());
    await page.goto(`${base}/logros`);
    const nivel = page.getByTestId('nivel');
    await expect(nivel).toBeVisible({ timeout: 30_000 });
    // Ganó 250 históricos y le quedan 150 de saldo: el nivel va por los 250.
    await expect(nivel.getByText('Constante', { exact: false })).toBeVisible();
    await expect(nivel.getByText('150', { exact: false })).toBeVisible();
    await expect(nivel.getByText(/Te faltan 250 créditos para Veterana/)).toBeVisible();
    await expect(nivel.getByText('Prioridad en lista de espera')).toBeVisible();
  });

  test('solo los retos vigentes, con su progreso real', async ({ page }) => {
    await montar(page, conGamificacion());
    await page.goto(`${base}/logros`);
    const retos = page.getByTestId('retos');
    await expect(retos).toBeVisible({ timeout: 30_000 });
    await expect(retos.getByText('Agosto activo', { exact: false })).toBeVisible();
    await expect(retos.getByText(/Reto de julio/)).toHaveCount(0);
    await expect(retos.getByText('7 de 12 · 50 créditos')).toBeVisible();
  });

  test('apuntarse a un reto manda la acción al servidor', async ({ page }) => {
    const p = await montar(page, conGamificacion());
    await page.goto(`${base}/logros`);
    const boton = page.getByTestId('retos').getByRole('button', { name: /ya no participo/i });
    await expect(boton).toBeVisible({ timeout: 30_000 });
    await boton.click();
    await expect.poll(() => p.length).toBe(1);
    expect(p[0].body).toEqual({ studioId: STUDIO_ID, retoKey: 'r1', accion: 'desmarcar' });
  });

  test('canjear: solo lo que puede pagar, y el servidor tiene la última palabra', async ({ page }) => {
    const p = await montar(page, conGamificacion());
    await page.goto(`${base}/logros`);
    const rec = page.getByTestId('recompensas');
    await expect(rec).toBeVisible({ timeout: 30_000 });
    // 150 de saldo: la de 100 se puede, la de 500 no y dice cuánto falta.
    await expect(rec.getByText('te faltan 350', { exact: false })).toBeVisible();
    const botones = rec.getByRole('button', { name: /canjear/i });
    await expect(botones.nth(0)).toBeEnabled();
    await expect(botones.nth(1)).toBeDisabled();
    await botones.nth(0).click();
    await expect.poll(() => p.length).toBe(1);
    expect(p[0].body).toEqual({ studioId: STUDIO_ID, catalogItemId: 'p1' });
    await expect(page.getByText(/has canjeado/i)).toBeVisible();
  });

  test('si el servidor rechaza el canje, se dice lo que él dijo', async ({ page }) => {
    await montar(page, conGamificacion(), { canje: 400 });
    await page.goto(`${base}/logros`);
    await page.getByTestId('recompensas').getByRole('button', { name: /canjear/i }).first().click({ timeout: 30_000 });
    await expect(page.getByText(/no tienes créditos suficientes/i)).toBeVisible();
  });

  test('un estudio que no usa gamificación no ve un tablero a cero', async ({ page }) => {
    await montar(page, fixtureSociaLista());
    await page.goto(`${base}/logros`);
    await expect(page.getByText(/aún no ha configurado esto/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('nivel')).toHaveCount(0);
    // Y en Inicio tampoco aparece la tarjeta.
    await page.goto(base);
    await expect(page.getByText(/¿qué te apetece hoy\?/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('nivel-inicio')).toHaveCount(0);
  });

  test('Inicio enseña nivel y créditos, y lleva a la pantalla completa', async ({ page }) => {
    await montar(page, conGamificacion());
    await page.goto(base);
    const card = page.getByTestId('nivel-inicio');
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card.getByText('Constante', { exact: false })).toBeVisible();
    await expect(card.getByText('150 créditos →')).toBeVisible();
    await card.click();
    await expect(page).toHaveURL(/\/logros$/);
    void HOY;
  });
});
