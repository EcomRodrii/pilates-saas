import { type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Una clase con dos reservas (una normal y una plaza fija) dentro de dos días,
// abierta en el Calendario, con la devolución de bonos contestando lo que diga
// cada spec. `orden` apunta cada escritura en el orden en que sale, y
// `cuerposDevolver`, lo que se manda a `/api/reservas/devolver-bonos`.
//
// Lo comparten `calendario-eliminar-clase-libera-antes.spec.ts` y
// `escrituras-responden.spec.ts` (P0.3).
// ─────────────────────────────────────────────────────────────────────────────

const STUDIO_ID = 'studio-test';
const json = (r: Route, b: unknown, s = 200) => r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

const ahora = Date.now();
export const SESION = {
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
export const RESERVAS = [reserva('res-eliminar-1', 'soc-1'), reserva('res-pf-eliminar-2', 'soc-2')];

export async function abrirClaseConReservas(page: Page, respuestaDevolverBonos: { status: number; cuerpo: unknown }) {
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
