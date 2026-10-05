import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { COLUMNAS_LEDGER, TIPOS_DE_BONO, serializarMovimiento, type FilaLedger, type MovimientoBonoVista, type ReservaSuya, type SesionMin } from './movimientos-bono.ts';
import { ESTADOS_QUE_USAN_LA_SEMANA, contarSemana, lunesDeLaSemana, ventanaSemana, type PlanSemana, type SemanaCuota } from './semana-cuota.ts';
import { hoyEnEstudio, inicioDelDiaEstudio } from '../utils.ts';

// Lo que la pantalla de Bonos necesita y NO viaja en el payload cacheado de studio-data (P4, 5-oct-2026): los
// movimientos del ledger de UN bono suyo y el recuento de la semana de su cuota. Lo llama `/api/public/mis-bonos`, que
// solo hace la puerta (rate limit, sesión con segundo paso, estudio, socia del token). Recibe el cliente para poder
// probarse contra la base real (supabase/tests/mis-bonos.test.ts).
//
// ⚠️ Todo filtra por estudio Y por socia, y cada id del cuerpo se comprueba antes de leer nada con él: un id de otra
// persona contesta igual que uno que no existe. Nunca `select('*')`: la lista blanca del ledger va en COLUMNAS_LEDGER.

type Admin = SupabaseClient;

export interface SuscripcionSuya {
  id: string;
  planId: string | null;
  saldo: number | null;
  tipoPlan: string | null;
  limiteSemanal: number | null;
}

/** Sus suscripciones con esos ids (las que no son suyas, simplemente no vuelven). */
export async function suscripcionesSuyas(admin: Admin, p: { studioId: string; socioId: string; ids: string[] }): Promise<Map<string, SuscripcionSuya>> {
  if (p.ids.length === 0) return new Map();
  const { data, error } = await admin.from('suscripciones')
    .select('id, plan_id, sesiones_restantes, planes_tarifa(tipo, limite_semanal)')
    .eq('studio_id', p.studioId).eq('socio_id', p.socioId).in('id', p.ids);
  if (error) throw error;
  const out = new Map<string, SuscripcionSuya>();
  for (const f of (data ?? []) as unknown as Array<{ id: string; plan_id: string | null; sesiones_restantes: number | null; planes_tarifa: { tipo: string | null; limite_semanal: number | null } | null }>) {
    out.set(f.id, {
      id: f.id, planId: f.plan_id, saldo: f.sesiones_restantes,
      tipoPlan: f.planes_tarifa?.tipo ?? null, limiteSemanal: f.planes_tarifa?.limite_semanal ?? null,
    });
  }
  return out;
}

export interface Cursor { creadoEn: string; id: string }

export interface MovimientosBono {
  movimientos: MovimientoBonoVista[];
  hayMas: boolean;
  /** El saldo cuadra con la suma de movimientos (`ledger_conciliacion` sin filas para este bono). */
  cuadra: boolean;
  /** El primer movimiento apuntado es la COMPRA: la lista lo cuenta todo. Si es la APERTURA, solo desde `desde`. */
  historialCompleto: boolean;
  desde: string | null;
}

const fechaEstudio = (iso: string) => hoyEnEstudio(new Date(iso));

/**
 * Los movimientos de UN bono suyo, del más reciente al más antiguo, de `limite` en `limite`.
 *
 * ⚠️ El cursor es compuesto (creado_en, id): los movimientos de una misma transacción comparten `now()`, y con un
 * `creado_en < X` a secas la página siguiente se saltaría filas.
 */
export async function leerMovimientosBono(admin: Admin, p: {
  studioId: string; socioId: string; bonoId: string; limite: number; antes: Cursor | null;
}): Promise<MovimientosBono> {
  let q = admin.from('movimientos_derecho').select(COLUMNAS_LEDGER)
    .eq('studio_id', p.studioId).eq('socio_id', p.socioId)
    .eq('derecho_tipo', 'SUSCRIPCION').eq('derecho_id', p.bonoId)
    .in('tipo', [...TIPOS_DE_BONO])
    .order('creado_en', { ascending: false }).order('id', { ascending: false })
    .limit(p.limite + 1);
  if (p.antes) q = q.or(`creado_en.lt.${p.antes.creadoEn},and(creado_en.eq.${p.antes.creadoEn},id.lt.${p.antes.id})`);
  const [{ data: filas, error }, { data: primero, error: e2 }, { data: descuadre, error: e3 }] = await Promise.all([
    q,
    admin.from('movimientos_derecho').select('tipo, creado_en')
      .eq('studio_id', p.studioId).eq('socio_id', p.socioId)
      .eq('derecho_tipo', 'SUSCRIPCION').eq('derecho_id', p.bonoId)
      .order('creado_en', { ascending: true }).order('id', { ascending: true }).limit(1),
    admin.from('ledger_conciliacion').select('derecho_id')
      .eq('studio_id', p.studioId).eq('derecho_tipo', 'SUSCRIPCION').eq('derecho_id', p.bonoId).limit(1),
  ]);
  if (error) throw error;
  if (e2) throw e2;
  if (e3) throw e3;

  const todas = (filas ?? []) as unknown as FilaLedger[];
  const pagina = todas.slice(0, p.limite);

  // Las reservas de esas filas, SOLO si son suyas; y de ellas, sus clases y el nombre de su tipo.
  const reservaIds = [...new Set(pagina.map((f) => f.reserva_id).filter((x): x is string => !!x))];
  const reservas = new Map<string, ReservaSuya>();
  const sesiones = new Map<string, SesionMin>();
  const nombres = new Map<string, string>();
  if (reservaIds.length > 0) {
    const { data: rs, error: er } = await admin.from('reservas').select('id, estado, sesion_id, cancelada_tardia')
      .eq('studio_id', p.studioId).eq('socio_id', p.socioId).in('id', reservaIds);
    if (er) throw er;
    for (const r of (rs ?? []) as ReservaSuya[]) reservas.set(r.id, r);
    const sesionIds = [...new Set([...reservas.values()].map((r) => r.sesion_id))];
    if (sesionIds.length > 0) {
      const { data: ss, error: es } = await admin.from('sesiones').select('id, inicio, tipo_clase_id, cancelada')
        .eq('studio_id', p.studioId).in('id', sesionIds);
      if (es) throw es;
      for (const s of (ss ?? []) as SesionMin[]) sesiones.set(s.id, s);
      const tipoIds = [...new Set([...sesiones.values()].map((s) => s.tipo_clase_id).filter((x): x is string => !!x))];
      if (tipoIds.length > 0) {
        const { data: ts, error: et } = await admin.from('tipos_clase').select('id, nombre').eq('studio_id', p.studioId).in('id', tipoIds);
        if (et) throw et;
        for (const t of (ts ?? []) as Array<{ id: string; nombre: string }>) nombres.set(t.id, t.nombre);
      }
    }
  }

  const primera = ((primero ?? []) as Array<{ tipo: string; creado_en: string }>)[0] ?? null;
  return {
    movimientos: pagina.map((f) => serializarMovimiento(f, reservas, sesiones, nombres, fechaEstudio)),
    hayMas: todas.length > p.limite,
    cuadra: (descuadre ?? []).length === 0,
    historialCompleto: primera ? primera.tipo !== 'APERTURA' : true,
    desde: primera?.creado_en ?? null,
  };
}

export interface SemanaDeCuota extends SemanaCuota { suscripcionId: string; desde: string; hasta: string }

/**
 * «Esta semana» de una cuota suya con tope: cuántas le cuentan, de las que cuántas pagó una recuperación, y lo mismo por
 * actividad. La cuenta es la de `calcular_excede_limite_semanal` (ver lib/student/semana-cuota.ts).
 */
export async function leerSemanaCuota(admin: Admin, p: {
  studioId: string; socioId: string; suscripcion: SuscripcionSuya; ahora?: Date;
}): Promise<SemanaDeCuota | null> {
  if (!p.suscripcion.planId) return null;
  const { data: tipos, error: et } = await admin.from('plan_tipos_clase').select('tipo_clase_id, limite_semanal')
    .eq('studio_id', p.studioId).eq('plan_id', p.suscripcion.planId);
  if (et) throw et;
  const filasTipo = (tipos ?? []) as Array<{ tipo_clase_id: string; limite_semanal: number | null }>;
  const plan: PlanSemana = {
    limiteSemanal: p.suscripcion.limiteSemanal,
    tiposClaseIds: filasTipo.map((t) => t.tipo_clase_id),
    limitePorTipo: Object.fromEntries(filasTipo.filter((t) => (t.limite_semanal ?? 0) > 0).map((t) => [t.tipo_clase_id, t.limite_semanal as number])),
  };
  if (!(plan.limiteSemanal && plan.limiteSemanal > 0) && Object.keys(plan.limitePorTipo).length === 0) return null;

  const ventana = ventanaSemana(inicioDelDiaEstudio(lunesDeLaSemana(hoyEnEstudio(p.ahora ?? new Date()))));
  const { data: rs, error: er } = await admin.from('reservas')
    .select('id, estado, sesiones!inner(inicio, tipo_clase_id, cancelada)')
    .eq('studio_id', p.studioId).eq('socio_id', p.socioId)
    .in('estado', [...ESTADOS_QUE_USAN_LA_SEMANA])
    .gte('sesiones.inicio', ventana.desde).lt('sesiones.inicio', ventana.hasta);
  if (er) throw er;
  const reservas = ((rs ?? []) as unknown as Array<{ id: string; estado: string; sesiones: { inicio: string; tipo_clase_id: string | null; cancelada: boolean | null } }>)
    .map((r) => ({ id: r.id, estado: r.estado, inicio: r.sesiones.inicio, tipoClaseId: r.sesiones.tipo_clase_id, claseCancelada: r.sesiones.cancelada }));

  const conRecuperacion = new Set<string>();
  if (reservas.length > 0) {
    const { data: recs, error: eRec } = await admin.from('recuperaciones').select('usada_en_reserva_id')
      .eq('studio_id', p.studioId).eq('socio_id', p.socioId).in('usada_en_reserva_id', reservas.map((r) => r.id));
    if (eRec) throw eRec;
    for (const x of (recs ?? []) as Array<{ usada_en_reserva_id: string | null }>) if (x.usada_en_reserva_id) conRecuperacion.add(x.usada_en_reserva_id);
  }

  return { suscripcionId: p.suscripcion.id, ...ventana, ...contarSemana(reservas, plan, ventana, conRecuperacion) };
}
