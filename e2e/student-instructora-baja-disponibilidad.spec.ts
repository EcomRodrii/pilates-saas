import { test, expect, type Page, type Route } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// La instructora en la app del estudio (Fase 1, segundo tramo):
//   1. Desde la ficha de una clase avisa de que no puede dar la clase. NO se
//      cancela nada: se pide la baja y lo que se pinta después es lo que dice
//      el servidor («el estudio lo está revisando»).
//   2. Si el servidor dice que no, se explica y la hoja sigue abierta con su
//      motivo: no se da por hecha una baja que no existe.
//   3. Marca su disponibilidad, «Rellenar con mis clases» incluido, y solo se
//      da por guardada cuando el servidor lo confirma.
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

/** Una clase de la instructora pasado mañana a las 18:00 UTC (tarde-noche en Madrid). */
function claseDePasadoManana(baja: null | { estado: string; revision?: unknown }) {
  const base = new Date(`${fmtDia.format(new Date())}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + 2);
  const fecha = base.toISOString().slice(0, 10);
  const inicio = `${fecha}T18:00:00.000Z`;
  const fin = new Date(Date.parse(inicio) + 55 * 60_000).toISOString();
  return {
    id: 'ses-ana', inicio, fin, fecha, hora: fmtHora.format(new Date(inicio)), horaFin: fmtHora.format(new Date(fin)),
    tipo: 'Reformer Flow', color: '#2C352C', sala: 'Sala Norte', aforo: 8, confirmadas: 6, enEspera: 1, cancelada: false,
    baja: baja ? { sustitucionId: 'sust-1', sesionId: 'ses-ana', estado: baja.estado, sustituta: null, revision: baja.revision ?? null } : null,
  };
}

async function montar(page: Page, opciones: {
  bajaResponde?: { status: number; body: unknown };
  bajaInicial?: { estado: string; revision?: unknown };
} = {}) {
  const contador = { baja: 0, guardar: 0, cuerpoBaja: null as null | Record<string, unknown>, celdasGuardadas: null as null | string[] };
  let bajaPedida = false;
  let guardadas: string[] = ['1-manana'];

  await montarPortal(page, { conSesion: true, sinSocia: true });
  await page.route('**/api/public/session**', (route) => json(route, { error: 'No hay ninguna socia' }, 404));
  await page.route('**/api/portal/instructora/sesion', (route) => json(route, { instructora: INSTRUCTORA }));
  await page.route('**/api/portal/instructora/agenda', (route) => {
    const clase = claseDePasadoManana(bajaPedida ? { estado: 'revisando' } : opciones.bajaInicial ?? null);
    return json(route, { clases: [clase], bajas: clase.baja ? [{ ...clase.baja, inicio: clase.inicio, fecha: clase.fecha, hora: clase.hora, tipo: clase.tipo }] : [] });
  });
  await page.route('**/api/portal/instructora/baja', (route) => {
    contador.baja++;
    contador.cuerpoBaja = JSON.parse(route.request().postData() || '{}');
    if (opciones.bajaResponde) return json(route, opciones.bajaResponde.body, opciones.bajaResponde.status);
    bajaPedida = true;
    return json(route, { ok: true, yaAvisada: false });
  });
  await page.route('**/api/portal/instructora/disponibilidad', (route) => {
    const cuerpo = JSON.parse(route.request().postData() || '{}') as { accion?: string; celdas?: string[] };
    if (cuerpo.accion === 'guardar') {
      contador.guardar++;
      contador.celdasGuardadas = cuerpo.celdas ?? [];
      guardadas = cuerpo.celdas ?? [];
      return json(route, { ok: true, guardadas: guardadas.length });
    }
    return json(route, { celdas: guardadas });
  });
  return contador;
}

test.describe('La instructora avisa de una baja y marca su disponibilidad', () => {
  test('desde la ficha, «No puedo dar esta clase» pide la baja y enseña el estado real', async ({ page }) => {
    const contador = await montar(page);
    await page.goto(`/portal/${SLUG}/equipo/agenda`);

    // Se llega a la ficha tocando la clase en la agenda. Desde #2034 la agenda
    // enseña los 14 días seguidos, así que la clase ya está en la lista: no hace
    // falta ir tocando días. Y tocar uno antes lanzaba un desplazamiento suave
    // hasta ese día, con lo que el toque en la tarjeta caía a mitad de animación y
    // no llegaba a la ficha (se quedaba en la agenda).
    const clase = page.getByTestId('clase-que-da');
    await expect(clase.first()).toBeVisible({ timeout: 30_000 });
    await clase.first().click();

    await expect(page.getByRole('heading', { name: 'Reformer Flow', level: 1 })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'No puedo dar esta clase', exact: true }).click();

    const hoja = page.getByRole('dialog');
    await expect(hoja).toContainText('la clase sigue a tu nombre');
    await expect(hoja).toContainText('No hace falta dar detalles de salud');
    // El motivo en opciones fijas, opcional: se elige y se puede quitar.
    const personal = hoja.getByRole('button', { name: 'Asunto personal', exact: true });
    await personal.click();
    await expect(personal).toHaveAttribute('aria-pressed', 'true');
    await hoja.getByLabel(/Lo que quieras contarle al estudio/).fill('Me ha surgido un imprevisto');
    await hoja.getByRole('button', { name: 'Avisar al estudio', exact: true }).click();

    await expect(page.getByTestId('estado-baja')).toContainText('El estudio lo está revisando', { timeout: 15_000 });
    await expect(page.getByTestId('estado-baja')).toContainText('sigue a tu nombre');
    // Con la baja abierta ya no se ofrece pedirla otra vez.
    await expect(page.getByRole('button', { name: 'No puedo dar esta clase', exact: true })).toHaveCount(0);

    expect(contador.baja).toBe(1);
    expect(contador.cuerpoBaja).toMatchObject({
      slug: SLUG, sesionId: 'ses-ana', motivo: 'Me ha surgido un imprevisto', categoria: 'PERSONAL',
    });
  });

  test('ve lo que el estudio le dice de una baja ya resuelta, con su nota y sin palabras de sanción', async ({ page }) => {
    await montar(page, {
      bajaInicial: {
        estado: 'resuelta',
        revision: { estado: 'LO_HABLAMOS', nota: 'Pásate el jueves y lo vemos', revisadaEn: new Date().toISOString() },
      },
    });
    await page.goto(`/portal/${SLUG}/equipo/clase/ses-ana`);

    const revision = page.getByTestId('revision-baja');
    await expect(revision).toContainText('El estudio quiere hablarlo contigo', { timeout: 30_000 });
    await expect(revision).toContainText('Pásate el jueves y lo vemos');
    await expect(page.getByTestId('estado-baja')).not.toContainText(/sanci|penaliz|justific/i);
  });

  test('si el servidor dice que no, lo explica y la hoja sigue abierta con su motivo', async ({ page }) => {
    const contador = await montar(page, {
      bajaResponde: { status: 409, body: { error: 'Esta clase ya ha empezado: habla directamente con el estudio.' } },
    });
    await page.goto(`/portal/${SLUG}/equipo/clase/ses-ana`);

    await page.getByRole('button', { name: 'No puedo dar esta clase', exact: true }).click({ timeout: 30_000 });
    const hoja = page.getByRole('dialog');
    const motivo = hoja.getByLabel(/Lo que quieras contarle al estudio/);
    await motivo.fill('Estoy con fiebre');
    await hoja.getByRole('button', { name: 'Avisar al estudio', exact: true }).click();

    await expect(hoja.getByRole('alert')).toContainText('ya ha empezado', { timeout: 15_000 });
    await expect(motivo).toHaveValue('Estoy con fiebre');
    await expect(page.getByTestId('estado-baja')).toHaveCount(0);
    expect(contador.baja).toBeGreaterThan(0);
  });

  test('marca su disponibilidad, rellena con sus clases y solo la da por guardada si el servidor lo confirma', async ({ page }) => {
    const contador = await montar(page);
    await page.goto(`/portal/${SLUG}/equipo/disponibilidad`);

    const lunesPrimera = page.locator('[data-celda="1-manana"]');
    await expect(lunesPrimera).toHaveAttribute('aria-pressed', 'true', { timeout: 30_000 });

    // Una franja a mano…
    const miercolesTarde = page.locator('[data-celda="3-tarde"]');
    await miercolesTarde.click();
    await expect(miercolesTarde).toHaveAttribute('aria-pressed', 'true');
    // …y las de sus clases (la de pasado mañana, en su franja del estudio).
    await page.getByTestId('rellenar-con-clases').click();
    const clase = claseDePasadoManana(null);
    const dow = new Date(`${clase.fecha}T12:00:00Z`).getUTCDay();
    const franjaDeLaClase = page.locator(`[data-celda^="${dow}-"][aria-pressed="true"]`);
    await expect(franjaDeLaClase.first()).toBeVisible();

    await expect(page.getByText('Tienes cambios sin guardar')).toBeVisible();
    await page.getByRole('button', { name: 'Guardar disponibilidad', exact: true }).click();

    await expect(page.getByText('Disponibilidad guardada')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Tienes cambios sin guardar')).toHaveCount(0);
    expect(contador.guardar).toBe(1);
    expect(contador.celdasGuardadas).toEqual(expect.arrayContaining(['1-manana', '3-tarde']));
  });
});
