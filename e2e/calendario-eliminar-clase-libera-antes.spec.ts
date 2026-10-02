import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// «Eliminar clase» cancela las reservas y las libera POR EL SERVIDOR antes de borrar.
//
// Antes borraba la clase primero (el borrado se lleva las reservas por cascada) y después
// sumaba una sesión «a ciegas» al bono que pareciera: sin la reserva no había forma de saber
// qué bono pagó cada plaza, ni si la había pagado un bono (una plaza fija o una pagada con
// una recuperación no consumieron ninguno), ni de no devolver dos veces.
//
// Ahora el orden es: marcar la clase cancelada → cancelar sus reservas → `/api/reservas/
// devolver-bonos` (que libera cada reserva con `liberar_derecho`) → borrar. Y si alguna
// devolución falla NO se borra: las reservas son lo único que dice a quién hay que devolver.
//
// Con contador: que «no se borra» sea cierto solo vale si se demuestra que SÍ se intentó
// devolver (si el servidor nunca se llamara, la clase tampoco se borraría y el test pasaría
// por una razón equivocada).
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid', viewport: { width: 1440, height: 900 } });
test.describe.configure({ timeout: 120_000 });

const STUDIO_ID = 'studio-test';
const json = (r: Route, b: unknown, s = 200) => r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

const ahora = Date.now();
const SESION = {
  id: 'ses-eliminar', studio_id: STUDIO_ID, tipo_clase_id: 'tc-reformer', sala_id: 'sala-1', instructor_id: 'ins-marta',
  inicio: new Date(ahora + 2 * 24 * 60 * 60_000).toISOString(),
  fin: new Date(ahora + (2 * 24 * 60 + 50) * 60_000).toISOString(),
  aforo_maximo: 6, cancelada: false, notas: null, google_event_id: null, serie_id: null,
  incidencia_texto: null, precio_puntual: null, zoom_meeting_id: null, zoom_join_url: null,
};
const reserva = (id: string, socioId: string) => ({
  id, studio_id: STUDIO_ID, sesion_id: SESION.id, socio_id: socioId,
  estado: 'CONFIRMADA', spot_id: null, posicion_espera: null, oferta_expira_en: null,
  check_in_en: null, creado_en: new Date(ahora - 3 * 24 * 60 * 60_000).toISOString(), confirmacion_pedida_en: null,
  confirmado_en: null, recordatorio_confirmacion_en: null, valoracion_experiencia: null, cancelada_tardia: false,
});
// Una plaza normal y una plaza fija (la fija nunca consumió bono: el servidor la deja fuera).
const RESERVAS = [reserva('res-eliminar-1', 'soc-1'), reserva('res-pf-eliminar-2', 'soc-2')];

async function abrir(page: Page, respuestaDevolverBonos: { status: number; cuerpo: unknown }) {
  await montar(page);
  // DESPUÉS de `montar`: ganan a sus comodines.
  const orden: string[] = [];
  const cuerposDevolver: { reservaIds?: string[]; motivo?: string }[] = [];
  await page.route('**/rest/v1/sesiones**', (r) => {
    const m = r.request().method();
    if (m !== 'GET') { orden.push(`${m} sesiones`); return json(r, []); }
    return json(r, [SESION]);
  });
  await page.route('**/rest/v1/reservas**', (r) => {
    const m = r.request().method();
    if (m !== 'GET') { orden.push(`${m} reservas`); return json(r, RESERVAS.map((x) => ({ id: x.id }))); }
    return json(r, RESERVAS);
  });
  await page.route((u) => u.pathname === '/api/reservas/devolver-bonos', (r) => {
    orden.push('POST devolver-bonos');
    cuerposDevolver.push(JSON.parse(r.request().postData() ?? '{}'));
    return json(r, respuestaDevolverBonos.cuerpo, respuestaDevolverBonos.status);
  });
  await page.route((u) => u.pathname === '/api/calendario', (r) => json(r, {
    sesiones: [{
      id: SESION.id, studioId: STUDIO_ID, tipoClaseId: SESION.tipo_clase_id, salaId: SESION.sala_id, instructorId: SESION.instructor_id,
      inicio: SESION.inicio, fin: SESION.fin, aforoMaximo: SESION.aforo_maximo, cancelada: false, notas: null, precioPuntual: null,
      serieId: null, sustitucionAbierta: false, motivoBaja: null, sustitucionId: null,
    }],
    reservas: RESERVAS.map((x) => ({
      id: x.id, studioId: STUDIO_ID, sesionId: x.sesion_id, socioId: x.socio_id, estado: x.estado, spotId: null, posicionEspera: null,
      ofertaExpiraEn: null, checkInEn: null, creadoEn: x.creado_en, confirmacionPedidaEn: null, confirmadoEn: null,
      recordatorioConfirmacionEn: null, valoracionExperiencia: null, canceladaTardia: false,
    })),
    sustituciones: [],
    salas: [{ id: 'sala-1', studioId: STUDIO_ID, nombre: 'Sala Reformer', capacidad: 6 }],
    instructores: [{ id: 'ins-marta', studioId: STUDIO_ID, nombre: 'Marta Ruiz', rol: 'INSTRUCTOR', color: '#D9C29E', activo: true }],
    horaApertura: '00:00', horaCierre: '23:59', horarioSemana: [], rol: 'PROPIETARIO',
  }));
  await ir(page, `calendario?sesion=${SESION.id}`);
  return { orden, cuerposDevolver };
}

async function eliminarLaClase(page: Page) {
  await page.getByRole('button', { name: 'Más acciones de la clase' }).click({ timeout: 30_000 });
  await page.getByRole('menu', { name: 'Más acciones de la clase' }).getByRole('menuitem', { name: /^Eliminar/ }).click();
  await page.getByRole('alertdialog').or(page.getByRole('dialog')).getByRole('button', { name: 'Eliminar clase' }).click();
}

test('eliminar una clase cancela y libera sus reservas por el servidor ANTES de borrarla', async ({ page }) => {
  const { orden, cuerposDevolver } = await abrir(page, { status: 200, cuerpo: { devueltas: 1, recuperaciones: 0, fallos: 0, saldos: [] } });
  await eliminarLaClase(page);

  await expect.poll(() => orden.includes('DELETE sesiones'), { timeout: 20_000 }).toBe(true);
  expect(cuerposDevolver.length, 'el servidor nunca recibió la devolución').toBeGreaterThan(0);

  const reservasCanceladas = orden.indexOf('PATCH reservas');
  const devolucion = orden.indexOf('POST devolver-bonos');
  const borrado = orden.indexOf('DELETE sesiones');
  expect(reservasCanceladas, 'no se cancelaron las reservas').toBeGreaterThanOrEqual(0);
  expect(reservasCanceladas, 'se devolvió antes de cancelar las reservas').toBeLessThan(devolucion);
  expect(devolucion, 'se borró la clase ANTES de devolver: el borrado se lleva las reservas por cascada').toBeLessThan(borrado);

  // Dice POR QUÉ, y manda las reservas (no un +1 a ciegas por socia). La plaza fija viaja también
  // y es el servidor quien la deja fuera.
  expect(cuerposDevolver[0].motivo).toBe('eliminar_clase');
  expect(cuerposDevolver[0].reservaIds).toEqual(expect.arrayContaining(['res-eliminar-1']));
});

test('si el servidor no puede devolver, la clase NO se borra', async ({ page }) => {
  const { orden, cuerposDevolver } = await abrir(page, { status: 500, cuerpo: { error: 'No se ha podido devolver el bono.' } });
  await eliminarLaClase(page);

  // Se intentó devolver (contador): sin esto el test pasaría aunque nunca se hubiera llamado.
  await expect.poll(() => cuerposDevolver.length, { timeout: 20_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(1500);
  expect(orden, 'se borró la clase con una devolución sin hacer: se pierde a quién había que devolver').not.toContain('DELETE sesiones');
});
