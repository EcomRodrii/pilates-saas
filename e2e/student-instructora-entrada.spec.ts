import { test, expect, type Page, type Route } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// La app del estudio es también la de la instructora (decisión del 14-sep-2026).
//
// Contrato que fija esta suite:
//   1. Una instructora entra con su cuenta y va DIRECTA a su parte («Hoy»), sin
//      selector ni ninguna mención en el acceso.
//   2. Nunca se la da de alta como alumna: antes `acceso/verificar` le firmaba
//      el consentimiento de alumna y le ocupaba cupo del plan.
//   3. Una alumna no entra en la parte de instructora.
//   4. Agenda única: si además es alumna, ve lo que da y lo que ha reservado.
//
// ⚠️ Cada «no hizo X» va con su contador de intentos del camino que SÍ debía
// ocurrir: sin él, «no llamó al alta» sería verdad también si la pantalla no
// hubiera llegado a preguntar nada (ver test-4xx-necesita-contador).
// ─────────────────────────────────────────────────────────────────────────────

const INSTRUCTORA = { instructorId: 'ins-1', nombre: 'Ana Ferrer', fotoUrl: null };
const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' });
const fmtHora = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false });

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** Una clase que imparte cada uno de los próximos 14 días, en la zona del estudio. */
function agendaDeCatorceDias() {
  const hoy = fmtDia.format(new Date());
  const clases = Array.from({ length: 14 }, (_, d) => {
    const base = new Date(`${hoy}T12:00:00Z`);
    base.setUTCDate(base.getUTCDate() + d);
    const fecha = base.toISOString().slice(0, 10);
    const inicio = `${fecha}T18:00:00.000Z`;
    const fin = new Date(Date.parse(inicio) + 55 * 60_000).toISOString();
    return {
      id: `ses-da-${d}`, inicio, fin, fecha, hora: fmtHora.format(new Date(inicio)), horaFin: fmtHora.format(new Date(fin)),
      tipo: 'Reformer Flow', color: '#2C352C', sala: 'Sala Norte', aforo: 8, confirmadas: 5, enEspera: d === 0 ? 2 : 0,
      cancelada: false, baja: null,
    };
  });
  const conBaja = clases[2];
  return {
    clases,
    bajas: [{
      sustitucionId: 'sust-1', sesionId: conBaja.id, estado: 'buscando', sustituta: null,
      inicio: conBaja.inicio, fecha: conBaja.fecha, hora: conBaja.hora, tipo: conBaja.tipo,
    }],
  };
}

async function montarInstructora(page: Page, opciones: { tambienAlumna: boolean; esInstructora?: boolean }) {
  const contador = { instructora: 0, altaAlumna: 0, agenda: 0 };
  await montarPortal(page, { conSesion: true, sinSocia: !opciones.tambienAlumna });

  // Registradas DESPUÉS de montarPortal: Playwright resuelve la última primero.
  if (!opciones.tambienAlumna) {
    await page.route('**/api/public/session**', (route) => json(route, { error: 'No hay ninguna socia' }, 404));
  }
  await page.route('**/api/portal/instructora/sesion', (route) => {
    contador.instructora++;
    return opciones.esInstructora === false
      ? json(route, { instructora: null }, 404)
      : json(route, { instructora: INSTRUCTORA });
  });
  await page.route('**/api/portal/instructora/agenda', (route) => {
    contador.agenda++;
    return json(route, agendaDeCatorceDias());
  });
  await page.route('**/api/public/socio**', (route) => {
    if (route.request().method() === 'POST') contador.altaAlumna++;
    return json(route, { ok: true });
  });
  return contador;
}

test.describe('La instructora entra en la app del estudio', () => {
  test('sin ficha de alumna, entra directa a «Hoy» con su próxima clase y sus bajas', async ({ page }) => {
    const contador = await montarInstructora(page, { tambienAlumna: false });
    await page.goto(`/portal/${SLUG}`);

    await expect(page).toHaveURL(new RegExp(`/portal/${SLUG}/equipo$`), { timeout: 30_000 });
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Ana');
    await expect(page.getByTestId('clase-que-da').first()).toBeVisible();
    await expect(page.getByTestId('baja-pedida')).toContainText('Buscando quién la cubra');
    await expect(page.getByTestId('baja-pedida')).toContainText('sigue a tu nombre');
    // La barra es la de la instructora, sin «Bonos» ni «Reservar».
    // `exact`: el nombre accesible es SUBCADENA por defecto, y «Agenda» casaría
    // también con «Ver toda tu agenda».
    await expect(page.getByRole('link', { name: 'Agenda', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Bonos', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Reservar', exact: true })).toHaveCount(0);

    expect(contador.instructora).toBeGreaterThan(0);
    expect(contador.agenda).toBeGreaterThan(0);
  });

  test('al aterrizar del enlace, NO se la da de alta como alumna', async ({ page }) => {
    const contador = await montarInstructora(page, { tambienAlumna: false });
    await page.goto(`/portal/${SLUG}/acceso/verificar`);

    await expect(page).toHaveURL(new RegExp(`/portal/${SLUG}/equipo$`), { timeout: 30_000 });
    // Preguntó si era instructora (el camino que debía ocurrir)…
    expect(contador.instructora).toBeGreaterThan(0);
    // …y no intentó el alta de alumna.
    expect(contador.altaAlumna).toBe(0);
  });

  test('una alumna que abre la parte de instructora vuelve a su inicio', async ({ page }) => {
    const contador = await montarInstructora(page, { tambienAlumna: true, esInstructora: false });
    await page.goto(`/portal/${SLUG}/equipo`);

    await expect(page).toHaveURL(new RegExp(`/portal/${SLUG}$`), { timeout: 30_000 });
    expect(contador.instructora).toBeGreaterThan(0);
    expect(contador.agenda).toBe(0);
    await expect(page.getByTestId('clase-que-da')).toHaveCount(0);
  });

  test('agenda única: si además es alumna, ve lo que da y lo que ha reservado', async ({ page }) => {
    await montarInstructora(page, { tambienAlumna: true });
    await page.goto(`/portal/${SLUG}/equipo/agenda`);

    await expect(page.getByRole('heading', { name: 'Agenda', exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('clase-que-da').first()).toBeVisible();

    // La reserva de muestra cae hoy o mañana según la hora de la CI: se recorre
    // la semana hasta encontrarla en vez de fijar el día a mano.
    const dias = page.getByRole('tab');
    const reserva = page.getByTestId('clase-que-reserva');
    for (let i = 0; i < Math.min(await dias.count(), 14); i++) {
      await dias.nth(i).click();
      if (await reserva.first().isVisible()) break;
    }
    await expect(reserva.first()).toContainText('Vienes a clase');
    await expect(page.getByTestId('clase-que-da').first()).toContainText('Das clase');
    // Con doble rol, la barra sí ofrece reservar.
    await expect(page.getByRole('link', { name: 'Reservar' })).toBeVisible();
  });
});
