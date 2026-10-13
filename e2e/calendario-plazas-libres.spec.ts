import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Calendario: «Plazas libres» (P3.9, pieza F).
//
// Entra APAGADA (interruptor `CALENDARIO_PLAZAS_LIBRES`, leído en el servidor).
// Aquí se fija:
//   - apagada, no hay enlace en la línea de cifras del Calendario y la URL
//     directa vuelve al Calendario, y se ha preguntado (contador: «no se ve»
//     podría ser «no preguntó»); un 403 también vuelve;
//   - encendida, la semana enseña las dos cifras de cada clase y la lleva a su
//     ficha; el mes, «sitio a partir del…» por franja;
//   - con el servidor fallando o sin red, un error con «Reintentar», nunca un cero.
// Las cifras las cuenta el servidor (sus reglas, en `lib/calendario/plazas-libres.test.ts`):
// aquí se simula su respuesta a partir del rango que pide la pantalla, así que vale cualquier día.
// ─────────────────────────────────────────────────────────────────────────────

const json = (r: Route, b: unknown, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });
const hoyMadrid = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
const masDias = (ymd: string, n: number) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dowDe = (ymd: string) => new Date(`${ymd}T12:00:00Z`).getUTCDay();
/** Las 18:00 de Madrid de ese día (verano UTC+2, invierno UTC+1). */
function a18(ymd: string): string {
  for (const desfase of [2, 1]) {
    const d = new Date(Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)), 18 - desfase));
    if (Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hourCycle: 'h23' }).format(d)) === 18) return d.toISOString();
  }
  throw new Error('sin hora');
}

/** Los martes a las 18:00 del rango, en Reformer y sala 1: los dos primeros sin sitio para clase fija, el resto con. */
function respuesta(desde: string, hasta: string) {
  const sesiones: Record<string, unknown>[] = [];
  let k = 0;
  for (let d = desde; d <= hasta; d = masDias(d, 1)) {
    if (dowDe(d) !== 2) continue;
    const sinSitio = k < 2;
    sesiones.push({
      id: `ses-pl-${d}`, inicio: a18(d), fin: a18(d), salaId: 'sala-1', tipoClaseId: 'tc-reformer', instructorId: 'ins-cloe', cancelada: false,
      aforo: 8, ocupadas: sinSitio ? 6 : 5, apartadas: 2, enEspera: sinSitio ? 2 : 0, porAprobar: 0, ofrecidas: 0,
      libres: sinSitio ? 0 : 1, paraFija: sinSitio ? 0 : 1, fijasPorVenir: 0, vuelvenDePausa: 0,
    });
    k++;
  }
  return { disponible: true, hoy: hoyMadrid(), desde, hasta, ofertaOcupa: false, contadoEn: new Date().toISOString(), sesiones };
}

async function preparar(page: Page, opciones: { encendido?: boolean; datos?: 'ok' | '500' | 'red' | '403' } = {}) {
  const peticiones = { sonda: 0, datos: 0 };
  await montar(page);
  await page.route((u) => u.pathname === '/api/calendario/plazas-libres', (route) => {
    const url = new URL(route.request().url());
    if (!url.searchParams.has('desde')) {
      peticiones.sonda++;
      return json(route, { disponible: opciones.encendido ?? true });
    }
    peticiones.datos++;
    if (opciones.encendido === false) return json(route, { disponible: false });
    if (opciones.datos === '403') return json(route, { error: 'No tienes permiso para esto' }, 403);
    if (opciones.datos === '500') return json(route, { error: 'x' }, 500);
    if (opciones.datos === 'red') return route.abort('failed');
    return json(route, respuesta(url.searchParams.get('desde')!, url.searchParams.get('hasta')!));
  });
  return peticiones;
}

test.describe('Calendario: plazas libres (P3.9)', () => {
  test.describe.configure({ timeout: 120_000 });

  test('apagada: sin enlace en el Calendario, y la URL directa vuelve al Calendario', async ({ page }) => {
    const peticiones = await preparar(page, { encendido: false });
    await ir(page, 'calendario');
    await expect.poll(() => peticiones.sonda).toBeGreaterThan(0);
    await page.evaluate(() => new Promise(r => setTimeout(r, 800)));
    await expect(page.getByRole('link', { name: /Plazas libres/ })).toHaveCount(0);
    await page.goto('/calendario/plazas-libres');
    await expect(page).toHaveURL(/\/calendario$/, { timeout: 30_000 });
    expect(peticiones.datos, 'el servidor lo dijo al pedir los datos').toBeGreaterThan(0);
  });

  test('un 403 al pedir los datos (otro rol) también vuelve al Calendario', async ({ page }) => {
    const peticiones = await preparar(page, { datos: '403' });
    await page.goto('/calendario/plazas-libres');
    await expect(page).toHaveURL(/\/calendario$/, { timeout: 30_000 });
    expect(peticiones.datos).toBeGreaterThan(0);
  });

  test('encendida: el enlace de la línea de cifras lleva a la pantalla; la semana dice sus cifras y por qué, y cada clase abre su ficha', async ({ page }) => {
    const peticiones = await preparar(page);
    await ir(page, 'calendario');
    const enlace = page.getByTestId('resumen-calendario').getByRole('link', { name: /Plazas libres/ });
    await expect(enlace).toBeVisible({ timeout: 30_000 });
    await enlace.click();
    await expect(page.getByTestId('plazas-libres')).toBeVisible({ timeout: 30_000 });
    // La semana que viene, para que haya un martes por delante pase lo que pase hoy.
    await page.getByRole('button', { name: 'Semana siguiente' }).click();
    const semana = page.getByTestId('plazas-libres-semana');
    await expect(semana).toBeVisible();
    await expect.poll(() => peticiones.datos).toBeGreaterThan(0);
    const fila = semana.locator('[data-plazas-sesion]').first();
    await expect(fila).toBeVisible();
    await expect(fila).toHaveAttribute('href', /\/calendario\?sesion=ses-pl-/);
    await expect(fila).toContainText('Completa');
    await expect(fila).toContainText('6 de 8 ocupadas');
    await expect(fila).toContainText('2 apartadas para ClassPass');
    await expect(page.getByTestId('plazas-libres-contado')).toContainText('Contado a las');
  });

  test('el mes: una fila por franja con «sitio del… al…» (sus dos extremos)', async ({ page }) => {
    await preparar(page);
    await page.goto('/calendario/plazas-libres');
    await expect(page.getByTestId('plazas-libres')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Mes', exact: true }).click();
    await page.getByRole('button', { name: 'Mes siguiente' }).click();
    const mes = page.getByTestId('plazas-libres-mes');
    await expect(mes).toBeVisible();
    await expect(mes.getByTestId('franja-texto')).toHaveText(/^Sitio del \d{1,2}\/\d{1,2} al \d{1,2}\/\d{1,2}$/);
    // El periodo va en la URL: recargar (o volver atrás desde una clase) lo conserva.
    const rango = await page.getByTestId('plazas-libres-rango').innerText();
    await page.reload();
    await expect(page.getByTestId('plazas-libres-rango')).toHaveText(rango, { timeout: 30_000 });
    await expect(page.getByTestId('plazas-libres-mes')).toBeVisible();
    // No se navega a lo que ya pasó.
    await page.getByRole('button', { name: 'Hoy' }).click();
    await expect(page.getByRole('button', { name: 'Mes anterior' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Hoy' })).toBeDisabled();
  });

  for (const fallo of ['500', 'red'] as const) {
    test(`con ${fallo === '500' ? 'un 500' : 'la red caída'}: un error con «Reintentar», nunca un cero`, async ({ page }) => {
      const peticiones = await preparar(page, { datos: fallo });
      await page.goto('/calendario/plazas-libres');
      const error = page.getByTestId('plazas-libres-error');
      await expect(error).toBeVisible({ timeout: 30_000 });
      expect(peticiones.datos).toBeGreaterThan(0);
      await expect(page.getByTestId('plazas-libres-semana')).toHaveCount(0);
      await expect(page.getByTestId('plazas-libres-mes')).toHaveCount(0);
      const antes = peticiones.datos;
      await error.getByRole('button', { name: 'Reintentar' }).click();
      await expect.poll(() => peticiones.datos).toBe(antes + 1);
    });
  }

  test('móvil: la pantalla cabe sin desbordar', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await preparar(page);
    await page.goto('/calendario/plazas-libres');
    await expect(page.getByTestId('plazas-libres')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Semana siguiente' }).click();
    await expect(page.getByTestId('plazas-libres-semana')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });
});
