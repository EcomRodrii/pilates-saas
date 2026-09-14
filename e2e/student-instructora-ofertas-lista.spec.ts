import { test, expect, type Page, type Route } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// La instructora en la app del estudio (Fase 1, tercer tramo):
//   1. «Te piden cubrir esta clase» en «Hoy»: «La cubro» contesta al servidor y
//      lo que se pinta después es lo que él diga.
//   2. Si otra la cubrió antes, se explica y no se le dice que es suya.
//   3. Pasar lista: marca «Asistió» y lo deshace, esperando al servidor. No hay
//      ningún botón de «no vino» (eso abre una penalización y lo decide el estudio).
//   4. Si el servidor no guarda la asistencia, la fila no se marca.
//
// ⚠️ Cada camino de fallo lleva contador de intentos: «no pintó éxito» sería
// verdad también si la pantalla no hubiera llegado a enviar nada.
// ─────────────────────────────────────────────────────────────────────────────

const INSTRUCTORA = { instructorId: 'ins-1', nombre: 'Ana Ferrer', fotoUrl: null };
const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' });
const fmtHora = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false });

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

function franja(inicioMs: number, minutos: number) {
  const inicio = new Date(inicioMs).toISOString();
  const fin = new Date(inicioMs + minutos * 60_000).toISOString();
  return {
    inicio, fin, fecha: fmtDia.format(new Date(inicio)),
    hora: fmtHora.format(new Date(inicio)), horaFin: fmtHora.format(new Date(fin)),
  };
}

/** Una oferta para mañana a esta misma hora. */
function oferta() {
  return { sustitucionId: 'sust-9', sesionId: 'ses-barre', tipo: 'Barre', sala: 'Sala Sur', ...franja(Date.now() + 24 * 3_600_000, 50) };
}

async function montarBase(page: Page) {
  await montarPortal(page, { conSesion: true, sinSocia: true });
  await page.route('**/api/public/session**', (route) => json(route, { error: 'No hay ninguna socia' }, 404));
  await page.route('**/api/portal/instructora/sesion', (route) => json(route, { instructora: INSTRUCTORA }));
  await page.route('**/api/portal/instructora/agenda', (route) => json(route, { clases: [], bajas: [] }));
}

async function montarOfertas(page: Page, responde?: { status: number; body: unknown }) {
  const contador = { respuestas: 0, cuerpo: null as null | Record<string, unknown> };
  let contestada = false;
  await montarBase(page);
  await page.route('**/api/portal/instructora/ofertas', (route) => {
    const cuerpo = JSON.parse(route.request().postData() || '{}') as Record<string, unknown>;
    if (cuerpo.accion === 'listar') return json(route, { ofertas: contestada ? [] : [oferta()] });
    contador.respuestas++;
    contador.cuerpo = cuerpo;
    // Tanto si vale como si llega tarde, el servidor ya no se la ofrece.
    contestada = true;
    return responde ? json(route, responde.body, responde.status) : json(route, { ok: true });
  });
  return contador;
}

async function montarLista(page: Page, opciones: { marcarFalla?: boolean } = {}) {
  const contador = { asistio: 0, deshacer: 0, reservas: [] as string[] };
  const estados: Record<string, string> = { r1: 'por-marcar', r2: 'asistio', r3: 'no-vino' };
  await montarBase(page);
  await page.route('**/api/portal/instructora/lista', (route) => {
    const cuerpo = JSON.parse(route.request().postData() || '{}') as { accion?: string; reservaId?: string };
    if (cuerpo.accion === 'leer') {
      return json(route, {
        // En curso: empezó hace 10 minutos.
        clase: { id: 'ses-ana', tipo: 'Reformer Flow', cancelada: false, ...franja(Date.now() - 10 * 60_000, 55) },
        alumnas: [
          { reservaId: 'r1', nombre: 'Aina P.', estado: estados.r1 },
          { reservaId: 'r3', nombre: 'Carmen S.', estado: estados.r3 },
          { reservaId: 'r2', nombre: 'Laura M.', estado: estados.r2 },
        ],
      });
    }
    if (cuerpo.accion === 'asistio') contador.asistio++;
    if (cuerpo.accion === 'deshacer') contador.deshacer++;
    contador.reservas.push(cuerpo.reservaId ?? '');
    if (opciones.marcarFalla) return json(route, { error: 'No hemos podido guardar la lista. Vuelve a intentarlo.' }, 500);
    const nuevo = cuerpo.accion === 'asistio' ? 'asistio' : 'por-marcar';
    estados[cuerpo.reservaId ?? ''] = nuevo;
    return json(route, { ok: true, estado: nuevo });
  });
  return contador;
}

test.describe('La instructora contesta sustituciones y pasa lista desde la app', () => {
  test('«La cubro» contesta al servidor y la tarjeta se va con lo que él diga', async ({ page }) => {
    const contador = await montarOfertas(page);
    await page.goto(`/portal/${SLUG}/equipo`);

    const tarjeta = page.getByTestId('oferta-sustitucion');
    await expect(tarjeta).toContainText('Barre', { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Te piden cubrir esta clase', exact: true })).toBeVisible();
    await tarjeta.getByRole('button', { name: 'La cubro', exact: true }).click();

    await expect(page.getByText('La clase es tuya. Ya está en tu agenda.')).toBeVisible({ timeout: 15_000 });
    await expect(tarjeta).toHaveCount(0);
    expect(contador.respuestas).toBe(1);
    expect(contador.cuerpo).toMatchObject({ slug: SLUG, accion: 'aceptar', sustitucionId: 'sust-9' });
  });

  test('si otra la cubrió antes, lo explica y no le dice que es suya', async ({ page }) => {
    const contador = await montarOfertas(page, {
      status: 409,
      body: { ok: false, motivo: 'ya_resuelta', error: 'Otra persona la ha cubierto antes. ¡Gracias igualmente!' },
    });
    await page.goto(`/portal/${SLUG}/equipo`);

    const tarjeta = page.getByTestId('oferta-sustitucion');
    await tarjeta.getByRole('button', { name: 'La cubro', exact: true }).click({ timeout: 30_000 });

    await expect(page.getByText('Otra persona la ha cubierto antes')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('La clase es tuya')).toHaveCount(0);
    expect(contador.respuestas).toBeGreaterThan(0);
  });

  test('pasar lista: marca «Asistió» y lo deshace, y no hay forma de marcar «no vino»', async ({ page }) => {
    const contador = await montarLista(page);
    await page.goto(`/portal/${SLUG}/equipo/clase/ses-ana/lista`);

    const resumen = page.getByTestId('resumen-lista');
    await expect(resumen).toHaveText('1 de 3 han venido', { timeout: 30_000 });

    const aina = page.getByTestId('alumna-en-lista').filter({ hasText: 'Aina P.' }).getByRole('button');
    await expect(aina).toHaveAttribute('aria-pressed', 'false');
    await aina.click();
    await expect(aina).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
    await expect(resumen).toHaveText('2 de 3 han venido');

    await aina.click();
    await expect(aina).toHaveAttribute('aria-pressed', 'false', { timeout: 15_000 });
    await expect(resumen).toHaveText('1 de 3 han venido');

    // El «no vino» que marcó el estudio se ve, pero no se toca.
    const carmen = page.getByTestId('alumna-en-lista').filter({ hasText: 'Carmen S.' });
    await expect(carmen).toContainText('No vino');
    await expect(carmen.getByRole('button')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /no vino|no asisti/i })).toHaveCount(0);

    expect(contador.asistio).toBe(1);
    expect(contador.deshacer).toBe(1);
    expect(contador.reservas).toEqual(['r1', 'r1']);
  });

  test('si el servidor no guarda la asistencia, la fila no se marca y explica por qué', async ({ page }) => {
    const contador = await montarLista(page, { marcarFalla: true });
    await page.goto(`/portal/${SLUG}/equipo/clase/ses-ana/lista`);

    const fila = page.getByTestId('alumna-en-lista').filter({ hasText: 'Aina P.' });
    await fila.getByRole('button').click({ timeout: 30_000 });

    await expect(fila.getByRole('alert')).toContainText('No hemos podido guardar la lista', { timeout: 15_000 });
    await expect(fila.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('resumen-lista')).toHaveText('1 de 3 han venido');
    expect(contador.asistio).toBeGreaterThan(0);
  });
});
