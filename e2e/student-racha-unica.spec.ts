import { test, expect, type Page } from '@playwright/test';
import { SLUG, STUDIO_ID, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// Racha única (PR 3.3, detrás de `RACHA_UNICA`) en la app de la alumna.
//
// La app NO calcula la racha cuando el interruptor está encendido: se la pide al servidor
// (`POST /api/public/racha`, la misma función que el motor de logros). Apagado, la app hace lo de
// siempre (historial en el móvil) y NO toca la ruta nueva.
//
// ⚠️ Cada test de camino de fallo cuenta peticiones: «no mintió» es verdad también si no llegó a
// intentar nada (ver tentare-os, puntos ciegos de la suite). Siempre `pedidas > 0` antes de mirar.

const base = `/portal/${SLUG}`;

function payload(rachaUnica: boolean) {
  const f = fixtureSociaLista() as Record<string, unknown>;
  (f.studio as Record<string, unknown>).rachaUnica = rachaUnica;
  f.rewardRules = [{ id: 'rr-1', studioId: STUDIO_ID, trigger: 'ASISTENCIA_CLASE', nombre: 'Asistir', descripcion: null, creditos: 10, activa: true, topeMensual: null, unidadEuros: null, creadoEn: '2026-08-01T00:00:00Z' }];
  f.levelDefinitions = [{ id: 'n1', studioId: STUDIO_ID, nombre: 'Inicio', orden: 1, umbralCreditos: 0, color: '#aaa', icono: '🌱', beneficios: null }];
  (f.socia as Record<string, unknown>).memberCredits = [{ socioId: 'socio-e2e-1', studioId: STUDIO_ID, saldo: 10, totalGanado: 10, totalCanjeado: 0, actualizadoEn: '2026-08-10T00:00:00Z' }];
  return f;
}

async function montar(page: Page, rachaUnica: boolean) {
  await sembrarSociaLista(page);
  const f = payload(rachaUnica);
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(f) }));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }));
  await page.route((u) => u.pathname === '/api/public/comunidad/posts', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ posts: [] }) }));
  const cuenta = { racha: 0, historial: 0, cuerpos: [] as unknown[] };
  await page.route('**/api/public/historial', (r) => {
    cuenta.historial++;
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ clases: [] }) });
  });
  return cuenta;
}

const RESPUESTA_OK = {
  unica: true, semanas: 5, mejor: 6, esMejor: false, respiroDisponible: true, haciaRespiro: 1,
  semanaEnCurso: { clave: '2026-08-10', hechas: 1, meta: 1, estado: 'hecha' },
};

test.describe('Student PWA · racha única', () => {
  test('encendida: la racha sale del servidor, con la semana en curso y el respiro; el historial no se usa', async ({ page }) => {
    const c = await montar(page, true);
    await page.route('**/api/public/racha', (r) => {
      c.racha++;
      c.cuerpos.push(r.request().postDataJSON());
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RESPUESTA_OK) });
    });
    await page.goto(`${base}/logros`);
    const racha = page.getByTestId('racha');
    await expect(racha).toBeVisible({ timeout: 30_000 });
    await expect(racha.getByText('5 semanas seguidas')).toBeVisible();
    await expect(page.getByTestId('racha-semana')).toHaveText('Esta semana: 1 de 1, hecha');
    await expect(page.getByTestId('racha-respiro')).toBeVisible();
    expect(c.racha).toBeGreaterThan(0);
    // El servidor pone la identidad (token): el cuerpo solo lleva el estudio.
    expect(c.cuerpos[0]).toEqual({ studioId: STUDIO_ID });
    expect(c.historial).toBe(0);
  });

  test('encendida y el servidor falla (500): no se inventa una racha ni un 0', async ({ page }) => {
    const c = await montar(page, true);
    await page.route('**/api/public/racha', (r) => { c.racha++; return r.fulfill({ status: 500, contentType: 'application/json', body: '{}' }); });
    await page.goto(`${base}/logros`);
    await expect(page.getByTestId('nivel')).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => c.racha).toBeGreaterThan(0);
    await expect(page.getByTestId('racha')).toHaveCount(0);
    // Y no cae al cálculo viejo con el historial: dos números distintos serían peor que ninguno.
    expect(c.historial).toBe(0);
  });

  test('encendida en la app pero el servidor dice que no (unica:false): sin racha', async ({ page }) => {
    const c = await montar(page, true);
    await page.route('**/api/public/racha', (r) => { c.racha++; return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ unica: false }) }); });
    await page.goto(`${base}/logros`);
    await expect(page.getByTestId('nivel')).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => c.racha).toBeGreaterThan(0);
    await expect(page.getByTestId('racha')).toHaveCount(0);
  });

  test('encendida con racha 0: no se pinta «0 semanas»', async ({ page }) => {
    const c = await montar(page, true);
    await page.route('**/api/public/racha', (r) => {
      c.racha++;
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...RESPUESTA_OK, semanas: 0, mejor: 0, respiroDisponible: false, semanaEnCurso: { clave: '2026-08-10', hechas: 0, meta: 1, estado: 'pendiente' } }) });
    });
    await page.goto(`${base}/logros`);
    await expect(page.getByTestId('nivel')).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => c.racha).toBeGreaterThan(0);
    await expect(page.getByTestId('racha')).toHaveCount(0);
  });

  test('apagada: no se toca la ruta nueva y la racha es la de siempre (historial)', async ({ page }) => {
    const c = await montar(page, false);
    await page.route('**/api/public/racha', (r) => { c.racha++; return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RESPUESTA_OK) }); });
    await page.goto(`${base}/logros`);
    await expect(page.getByTestId('nivel')).toBeVisible({ timeout: 30_000 });
    // Sin interruptor, la app pide el historial (comportamiento actual) y nada más.
    await expect.poll(() => c.historial).toBeGreaterThan(0);
    expect(c.racha).toBe(0);
  });

  test('Inicio apagado: no pide la racha al servidor ni la enseña', async ({ page }) => {
    const c = await montar(page, false);
    await page.route('**/api/public/racha', (r) => { c.racha++; return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RESPUESTA_OK) }); });
    await page.goto(base);
    await expect(page.getByTestId('tu-progreso').or(page.locator('main')).first()).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1500);
    expect(c.racha).toBe(0);
    await expect(page.getByTestId('lo-tuyo-racha')).toHaveCount(0);
  });
});
