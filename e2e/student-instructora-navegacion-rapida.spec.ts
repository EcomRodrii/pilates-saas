import { test, expect, type Route } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// Cambiar de pestaña en la app de la instructora no vuelve a empezar de cero
// (15-sep-2026). Medido en producción antes del cambio: cada pestaña volvía a
// preguntar si era instructora (~400 ms), esperaba a la ficha de ALUMNA y
// volvía a pedir todos sus datos con el esqueleto delante (1-2 s).
//
// Contrato:
//   1. «¿Es instructora?» se pregunta UNA vez al entrar, no en cada pestaña.
//   2. Volver a una pantalla ya vista la pinta al momento con lo último cargado
//      y la refresca por detrás (vuelve a pedir la agenda, sin esqueleto).
// ─────────────────────────────────────────────────────────────────────────────

const INSTRUCTORA = { instructorId: 'ins-1', nombre: 'Ana Ferrer', fotoUrl: null };
const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' });
const fmtHora = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false });

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** Una clase suya cada día de las próximas dos semanas, a las 18:00 UTC. */
function agenda() {
  const hoy = fmtDia.format(new Date());
  const clases = Array.from({ length: 14 }, (_, d) => {
    const base = new Date(`${hoy}T12:00:00Z`);
    base.setUTCDate(base.getUTCDate() + d);
    const fecha = base.toISOString().slice(0, 10);
    const inicio = `${fecha}T18:00:00.000Z`;
    const fin = new Date(Date.parse(inicio) + 55 * 60_000).toISOString();
    return {
      id: `ses-${d}`, inicio, fin, fecha, hora: fmtHora.format(new Date(inicio)), horaFin: fmtHora.format(new Date(fin)),
      tipo: 'Reformer Flow', color: '#2C352C', sala: 'Sala Norte', aforo: 8, confirmadas: 5, enEspera: 0, cancelada: false, baja: null,
    };
  });
  return { clases, bajas: [], puedeCrearClases: false };
}

test.describe('La app de la instructora al cambiar de pestaña', () => {
  test.describe.configure({ timeout: 120_000 });

  test('pregunta si es instructora una sola vez y vuelve a «Hoy» sin esqueleto', async ({ page }) => {
    const contador = { sesion: 0, agenda: 0 };
    await montarPortal(page, { conSesion: true, sinSocia: true });
    await page.route('**/api/public/session**', (route) => json(route, { error: 'No hay ninguna socia' }, 404));
    await page.route('**/api/portal/instructora/sesion', (route) => {
      contador.sesion++;
      return json(route, { instructora: INSTRUCTORA });
    });
    await page.route('**/api/portal/instructora/agenda', (route) => {
      contador.agenda++;
      return json(route, agenda());
    });
    await page.route('**/api/portal/instructora/disponibilidad', (route) => json(route, { celdas: ['1-manana'] }));

    await page.goto(`/portal/${SLUG}/equipo`);
    await expect(page.getByTestId('clase-que-da').first()).toBeVisible({ timeout: 60_000 });
    const barra = page.getByRole('navigation', { name: 'Principal' });

    await barra.getByRole('link', { name: 'Agenda', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Agenda', exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('clase-que-da').first()).toBeVisible({ timeout: 30_000 });
    const agendaAntesDeVolver = contador.agenda;

    await barra.getByRole('link', { name: 'Hoy', exact: true }).click();
    // Lo ya visto sale al momento: no espera a ninguna petición.
    await expect(page.getByTestId('clase-que-da').first()).toBeVisible({ timeout: 2_000 });

    // …y se refresca por detrás.
    await expect.poll(() => contador.agenda, { timeout: 30_000 }).toBeGreaterThan(agendaAntesDeVolver);
    // Una sola vez en toda la visita, no una por pestaña.
    expect(contador.sesion).toBe(1);
  });
});
