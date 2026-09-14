import { test, expect, type Page, type Route } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// «Tus alumnas» de la instructora en la app del estudio (Fase 2):
//   1. Desde Perfil llega a la lista: nombre corto, próxima clase con ella y
//      «Primera clase»; y abre la ficha mínima de una.
//   2. Una alumna que no es suya (o no existe) no se ve: el servidor da 404 y la
//      pantalla lo explica sin enseñar nada.
//   3. Si la lista falla, se dice y no se inventa una lista vacía.
//
// ⚠️ Cada camino de fallo lleva contador de intentos: «no pintó nada» sería
// verdad también si la pantalla no hubiera llegado a pedir nada.
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

const PROXIMA = { sesionId: 'ses-1', inicio: `${diaMas(2)}T08:00:00.000Z`, fecha: diaMas(2), hora: '10:00', tipo: 'Reformer', estado: 'viene' };

async function montar(page: Page, opciones: { listarFalla?: boolean } = {}) {
  const contador = { listar: 0, fichas: [] as string[] };
  await montarPortal(page, { conSesion: true, sinSocia: true });
  await page.route('**/api/public/session**', (route) => json(route, { error: 'No hay ninguna socia' }, 404));
  await page.route('**/api/portal/instructora/sesion', (route) => json(route, { instructora: INSTRUCTORA }));
  await page.route('**/api/portal/instructora/perfil', (route) => json(route, { estudios: [], tarifa: null }));
  await page.route('**/api/portal/instructora/alumnas', (route) => {
    const cuerpo = JSON.parse(route.request().postData() || '{}') as { accion?: string; socioId?: string };
    if (cuerpo.accion === 'listar') {
      contador.listar++;
      if (opciones.listarFalla) return json(route, { error: 'No hemos podido cargar tus alumnas.' }, 500);
      return json(route, {
        alumnas: [
          { socioId: 'soc-aina', nombre: 'Aina P.', fotoUrl: null, primeraClase: true, proxima: PROXIMA },
          { socioId: 'soc-carmen', nombre: 'Carmen L.', fotoUrl: null, primeraClase: false, proxima: null },
        ],
      });
    }
    contador.fichas.push(cuerpo.socioId ?? '');
    if (cuerpo.socioId !== 'soc-aina') return json(route, { error: 'No encontramos a esta alumna.' }, 404);
    return json(route, {
      socioId: 'soc-aina', nombre: 'Aina P.', fotoUrl: null, primeraClase: true,
      proximas: [PROXIMA],
      pasadas: [{ sesionId: 'ses-0', inicio: `${diaMas(-3)}T08:00:00.000Z`, fecha: diaMas(-3), hora: '10:00', tipo: 'Mat', estado: 'no-vino' }],
    });
  });
  return contador;
}

test.describe('«Tus alumnas» en la app de la instructora', () => {
  test('desde Perfil ve sus alumnas con lo mínimo y abre la ficha de una', async ({ page }) => {
    const contador = await montar(page);
    await page.goto(`/portal/${SLUG}/equipo/perfil`);
    await page.getByRole('link', { name: 'Tus alumnas', exact: true }).click({ timeout: 30_000 });

    const aina = page.getByTestId('alumna').filter({ hasText: 'Aina P.' });
    await expect(aina).toContainText('Primera clase', { timeout: 30_000 });
    await expect(aina).toContainText('Reformer');
    await expect(page.getByTestId('alumna').filter({ hasText: 'Carmen L.' })).toContainText('Sin clases próximas contigo');

    await aina.click();
    await expect(page.getByTestId('nombre-alumna')).toHaveText('Aina P.', { timeout: 30_000 });
    await expect(page.getByTestId('clase-alumna').filter({ hasText: 'Reformer' })).toContainText('Viene');
    await expect(page.getByTestId('clase-alumna').filter({ hasText: 'Mat' })).toContainText('No vino');
    expect(contador.listar).toBeGreaterThan(0);
    expect(contador.fichas).toContain('soc-aina');
  });

  test('una alumna que no es suya no se ve: lo explica sin enseñar nada', async ({ page }) => {
    const contador = await montar(page);
    await page.goto(`/portal/${SLUG}/equipo/alumnas/soc-ajena`);

    await expect(page.getByText('No encontramos a esta alumna')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('nombre-alumna')).toHaveCount(0);
    expect(contador.fichas).toContain('soc-ajena');
  });

  test('si la lista falla, lo dice y no pinta una lista vacía', async ({ page }) => {
    const contador = await montar(page, { listarFalla: true });
    await page.goto(`/portal/${SLUG}/equipo/alumnas`);

    await expect(page.getByText('No hemos podido cargar tus alumnas.')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Todavía no tienes alumnas')).toHaveCount(0);
    expect(contador.listar).toBeGreaterThan(0);
  });
});
