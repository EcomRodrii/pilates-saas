import { test, expect, type Page, type Route } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// «Nueva clase» de la instructora en la app del estudio (Fase 2):
//   1. Desde la agenda crea una clase: manda SOLO tipo, sala, día y hora (ni
//      instructora, ni aforo, ni precio), ve antes el resumen y vuelve a la agenda.
//   2. Si choca con otra clase (409), lo explica y no sale de la pantalla.
//   3. Si el estudio asigna las clases, ni botón ni formulario.
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

async function montar(page: Page, opciones: { puedeCrear?: boolean; crearResponde?: { status: number; body: unknown } } = {}) {
  const puedeCrear = opciones.puedeCrear ?? true;
  const contador = { crear: 0, cuerpo: null as null | Record<string, unknown> };

  await montarPortal(page, { conSesion: true, sinSocia: true });
  await page.route('**/api/public/session**', (route) => json(route, { error: 'No hay ninguna socia' }, 404));
  await page.route('**/api/portal/instructora/sesion', (route) => json(route, { instructora: INSTRUCTORA }));
  await page.route('**/api/portal/instructora/agenda', (route) => json(route, { clases: [], bajas: [], puedeCrearClases: puedeCrear }));
  await page.route('**/api/portal/instructora/clases', (route) => {
    const cuerpo = JSON.parse(route.request().postData() || '{}') as Record<string, unknown>;
    if (cuerpo.accion === 'opciones') {
      return json(route, puedeCrear
        ? {
          puedeCrear: true,
          tipos: [{ id: 'tc-reformer', nombre: 'Reformer', color: '#2C352C', duracionMin: 55, aforo: 8 }],
          salas: [{ id: 'sala-1', nombre: 'Sala Norte', capacidad: 10 }],
        }
        : { puedeCrear: false, tipos: [], salas: [] });
    }
    contador.crear++;
    contador.cuerpo = cuerpo;
    if (opciones.crearResponde) return json(route, opciones.crearResponde.body, opciones.crearResponde.status);
    return json(route, { ok: true, sesionId: 'ses-nueva', inicio: new Date().toISOString() });
  });
  return contador;
}

async function rellenar(page: Page, fecha: string) {
  await page.getByRole('button', { name: 'Reformer', exact: true }).click({ timeout: 30_000 });
  await page.getByLabel('Día', { exact: true }).fill(fecha);
  await page.getByLabel('Hora', { exact: true }).fill('10:00');
}

test.describe('La instructora crea sus clases desde la app', () => {
  test('desde la agenda crea una clase: solo tipo, sala, día y hora, y vuelve a la agenda', async ({ page }) => {
    const contador = await montar(page);
    await page.goto(`/portal/${SLUG}/equipo/agenda`);

    await page.getByTestId('nueva-clase').click({ timeout: 30_000 });
    const fecha = diaMas(2);
    await rellenar(page, fecha);

    await expect(page.getByTestId('resumen-nueva-clase')).toContainText('55 min · termina a las 10:55 · 8 plazas');
    await page.getByRole('button', { name: 'Crear clase', exact: true }).click();

    await expect(page.getByText(/Clase creada/)).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(new RegExp(`/portal/${SLUG}/equipo/agenda`));
    expect(contador.crear).toBe(1);
    expect(contador.cuerpo).toEqual({ slug: SLUG, accion: 'crear', tipoClaseId: 'tc-reformer', salaId: 'sala-1', fecha, hora: '10:00' });
  });

  test('si choca con otra clase, lo explica y no sale de la pantalla', async ({ page }) => {
    const contador = await montar(page, {
      crearResponde: { status: 409, body: { error: 'Ya tienes una clase a esa hora. Elige otro hueco.' } },
    });
    await page.goto(`/portal/${SLUG}/equipo/nueva-clase`);

    await rellenar(page, diaMas(2));
    await page.getByRole('button', { name: 'Crear clase', exact: true }).click();

    await expect(page.getByRole('alert').filter({ hasText: 'Ya tienes una clase a esa hora' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Clase creada/)).toHaveCount(0);
    await expect(page).toHaveURL(/\/equipo\/nueva-clase/);
    expect(contador.crear).toBeGreaterThan(0);
  });

  test('si el estudio asigna las clases, no hay botón ni formulario', async ({ page }) => {
    await montar(page, { puedeCrear: false });
    await page.goto(`/portal/${SLUG}/equipo/agenda`);
    await expect(page.getByRole('heading', { name: 'Agenda', exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('nueva-clase')).toHaveCount(0);

    await page.goto(`/portal/${SLUG}/equipo/nueva-clase`);
    await expect(page.getByText('Tu estudio asigna las clases')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Crear clase', exact: true })).toHaveCount(0);
  });
});
