// ─────────────────────────────────────────────────────────────────────────────
// Cobros externos en el servidor: subir un fichero, emparejar, y resolver cada
// movimiento (confirmar, enlazar, descartar, reabrir, marcar doble cobro).
// Diseño: docs/cobros-externos-diseno.md (secciones C, D, F y G).
//
// Lo que no se negocia:
//  · El cobro lo escribe SIEMPRE `confirmarCobro()` (origen 'externo'). Aquí no
//    hay ni un UPDATE a `recibos`.
//  · Confirmar empieza con un cerrojo `POR_REVISAR → CONFIRMANDO` que lleva el
//    `recibo_id` en el mismo UPDATE: el índice único para a un segundo movimiento
//    sobre el mismo recibo antes de llamar a nada.
//  · Antes de cobrar se cierra lo que pueda cobrarse por otro lado (enlace de pago,
//    datáfono) con la MISMA guarda que «Marcar cobrado» (`antesDeCobrar`).
//  · Un `CONFIRMANDO` colgado (la función murió) se recupera al abrir la bandeja:
//    o se cerró el cobro y se terminan sus efectos, o se suelta.
//  · Enlazar no escribe en `recibos`: el enlace vive en `cobros_externos.recibo_id`.
//  · El estudio sale SIEMPRE de la sesión, y va en cada consulta.
//
// Sin `server-only` ni alias `@/`: se prueba con `node --test`. Lo que necesita
// Stripe (`antesDeCobrar`) lo inyecta la ruta.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { horaEstudio, hoyEnEstudio, masDias, uuidV4 } from '../utils.ts';
import {
  aplicarEfectosCobro as aplicarEfectosCobroReal, confirmarCobro as confirmarCobroReal,
} from '../billing/confirmar-cobro.ts';
import { facturaIdExterno } from '../billing/cobro-confirmado-reglas.ts';
import { penalizacionesDeLosRecibos, recibosDePenalizacionAnulada } from '../cobros/marcar-cobrado.ts';
import { anotarCobroMarcadoAMano, leerReciboAntesDeCobrar } from '../auditoria/cobro-manual.ts';
import { registrarAuditoriaServidor, type RegistrarAuditoria } from '../auditoria/registrar-servidor.ts';
import {
  emparejarLote, sePuedeEnlazar, type ContextoEmparejar, type Decision, type ReciboParaEmparejar, type SociaParaEmparejar,
} from './emparejar.ts';
import { huellaDeLote } from './idempotencia.ts';
import { nombreFicheroGuardable } from './texto.ts';
import {
  DESDE, MINUTOS_CERROJO, centimosDe, cobradoEnDe, desenlaceYaCobrado, fechaCobroExternoValida, importeEnTexto, jsonEstable,
  metodoCobroDe, posibleDuplicadoDe, puedeFecharCobroExterno, type MovimientoParaDuplicado,
} from './reglas.ts';
import type { EstadoMovimiento, Fuente, MotivoDescarte, MovimientoNormalizado, ResultadoLectura } from './tipos.ts';

/** La sesión de staff tal como la necesita la bandeja (`verificarSesionStaff`). */
export interface SesionBandeja { userId: string; studioId: string; rol: string; nombre: string | null }

export type ResultadoAccion =
  | { ok: true; estado: EstadoMovimiento; mensaje?: string }
  | {
      ok: false;
      codigo: 'NO_ENCONTRADO' | 'ESTADO' | 'OCUPADO' | 'NO_COBRABLE' | 'POSIBLE_DUPLICADO' | 'DATOS' | 'PERSISTENCIA';
      error: string;
    };

/** Lo que se inyecta: la ruta pasa lo real; los tests, dobles. */
export interface DependenciasBandeja {
  confirmarCobro: typeof confirmarCobroReal;
  aplicarEfectosCobro: typeof aplicarEfectosCobroReal;
  /**
   * La guarda de «Marcar cobrado» justo antes de cobrar ESE recibo: penalización
   * anulada, y enlace de pago o cobro del datáfono en marcha (que se cierran). La
   * pone la ruta, porque necesita Stripe.
   */
  antesDeCobrar: (p: { studioId: string; reciboId: string }) => Promise<{ ok: true; checkoutLeido: string | null } | { ok: false; mensaje: string }>;
  registrar: RegistrarAuditoria;
  ahora: () => Date;
}

const DEPENDENCIAS_POR_DEFECTO: Omit<DependenciasBandeja, 'antesDeCobrar'> = {
  confirmarCobro: confirmarCobroReal,
  aplicarEfectosCobro: aplicarEfectosCobroReal,
  registrar: registrarAuditoriaServidor,
  ahora: () => new Date(),
};

type Deps = Partial<DependenciasBandeja> & Pick<DependenciasBandeja, 'antesDeCobrar'>;
const conDefecto = (d: Deps): DependenciasBandeja => ({ ...DEPENDENCIAS_POR_DEFECTO, ...d });

/** Postgres: unique_violation (el índice de un recibo, un movimiento). */
const DUPLICADO = '23505';
const TROZO = 200;

function trozos<T>(xs: readonly T[], n = TROZO): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < xs.length; i += n) r.push(xs.slice(i, i + n));
  return r;
}

const recorta = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// ── Filas ────────────────────────────────────────────────────────────────────

const COLUMNAS_MOVIMIENTO = [
  'id', 'studio_id', 'lote_id', 'fuente', 'clave_idempotencia', 'id_externo', 'tipo', 'metodo', 'importe_centimos',
  'fecha_operacion', 'hora_operacion', 'fecha_valor', 'referencia', 'tarjeta_ultimos4', 'tarjeta_marca', 'terminal_ref',
  'pagador_nombre', 'concepto', 'estado', 'decision', 'posible_duplicado_de', 'recibo_id', 'socio_id', 'resuelto_como',
  'resuelto_por', 'resuelto_en', 'bloqueado_en', 'descartado_motivo', 'error_ultimo', 'creado_en',
].join(', ');

export type FilaMovimiento = Record<string, unknown> & { id: string; estado: EstadoMovimiento };

/** Una fila de `cobros_externos` como la ve el motor. `time` llega como 'HH:MM:SS'. */
export function movimientoDeFila(f: Record<string, unknown>): MovimientoNormalizado {
  const hora = (f.hora_operacion as string | null) ?? null;
  return {
    fuente: f.fuente as Fuente,
    claveIdempotencia: f.clave_idempotencia as string,
    idExterno: (f.id_externo as string | null) ?? null,
    tipo: f.tipo as MovimientoNormalizado['tipo'],
    metodo: f.metodo as MovimientoNormalizado['metodo'],
    importeCentimos: Number(f.importe_centimos),
    fechaOperacion: f.fecha_operacion as string,
    horaOperacion: hora ? hora.slice(0, 5) : null,
    fechaValor: (f.fecha_valor as string | null) ?? null,
    referencia: (f.referencia as string | null) ?? null,
    tarjetaUltimos4: (f.tarjeta_ultimos4 as string | null) ?? null,
    tarjetaMarca: (f.tarjeta_marca as string | null) ?? null,
    terminalRef: (f.terminal_ref as string | null) ?? null,
    pagadorNombre: (f.pagador_nombre as string | null) ?? null,
    concepto: (f.concepto as string | null) ?? null,
  };
}

const COLUMNAS_RECIBO = [
  'id', 'socio_id', 'suscripcion_id', 'importe', 'importe_devuelto', 'estado', 'fecha_vencimiento', 'fecha_cobro',
  'metodo_cobro', 'conciliado_por', 'stripe_payment_intent_id', 'sepa_estado', 'cobro_mostrador_pi', 'reembolso_stripe_id',
  'reembolso_solicitado_en', 'concepto',
].join(', ');

export function reciboDeFila(f: Record<string, unknown>, ligadoAMovimiento: boolean): ReciboParaEmparejar {
  return {
    id: f.id as string,
    socioId: (f.socio_id as string | null) ?? null,
    importeCentimos: centimosDe(f.importe) ?? -1,
    estado: f.estado as string,
    fechaVencimiento: (f.fecha_vencimiento as string | null) ?? null,
    fechaCobro: (f.fecha_cobro as string | null) ?? null,
    metodoCobro: (f.metodo_cobro as string | null) ?? null,
    conciliadoPor: (f.conciliado_por as string | null) ?? null,
    stripePaymentIntentId: (f.stripe_payment_intent_id as string | null) ?? null,
    sepaEstado: (f.sepa_estado as string | null) ?? null,
    cobroMostradorPi: (f.cobro_mostrador_pi as string | null) ?? null,
    importeDevueltoCentimos: centimosDe(f.importe_devuelto) ?? 0,
    conReembolso: !!f.reembolso_stripe_id || !!f.reembolso_solicitado_en,
    concepto: (f.concepto as string | null) ?? null,
    ligadoAMovimiento,
  };
}

// ── Contexto del motor ───────────────────────────────────────────────────────

/** Recibos que ya tienen un movimiento que los cobra, los va a cobrar o los enlaza. */
async function recibosLigados(admin: SupabaseClient, studioId: string, reciboIds: readonly string[], salvo?: string): Promise<Set<string>> {
  const ligados = new Set<string>();
  for (const ids of trozos(reciboIds)) {
    let q = admin.from('cobros_externos').select('id, recibo_id')
      .eq('studio_id', studioId).in('recibo_id', ids).in('estado', ['CONFIRMANDO', 'CONFIRMADO', 'ENLAZADO']);
    if (salvo) q = q.neq('id', salvo);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    for (const f of data ?? []) ligados.add(f.recibo_id as string);
  }
  return ligados;
}

/**
 * Todo lo que el motor necesita para un lote, cargado una vez: los recibos del
 * estudio con los importes del lote en su ventana de fechas, quiénes son, si
 * vinieron a clase esos días, qué tarjetas y pagos se les conocen y qué recibos
 * son de una penalización anulada.
 */
export async function cargarContexto(
  admin: SupabaseClient, studioId: string, movimientos: readonly MovimientoNormalizado[],
): Promise<ContextoEmparejar> {
  const cobros = movimientos.filter(m => m.tipo === 'COBRO');
  const vacio: ContextoEmparejar = { recibos: [], socias: new Map(), asistencias: [], historial: [], bloqueados: new Set() };
  if (cobros.length === 0) return vacio;

  const fechas = cobros.map(m => m.fechaOperacion).sort();
  const desde = fechas[0];
  const hasta = fechas[fechas.length - 1];
  const importes = [...new Set(cobros.map(m => importeEnTexto(m.importeCentimos)))];

  const filas: Record<string, unknown>[] = [];
  for (const imps of trozos(importes)) {
    // Para cobrar: vence entre 45 días después y 10 antes del pago (`sePuedeCobrar`).
    const porCobrar = await admin.from('recibos').select(COLUMNAS_RECIBO)
      .eq('studio_id', studioId).in('importe', imps).in('estado', ['PENDIENTE', 'FALLIDO', 'DEVUELTO'])
      .gte('fecha_vencimiento', masDias(desde, -10)).lte('fecha_vencimiento', masDias(hasta, 45)).limit(3000);
    if (porCobrar.error) throw new Error(porCobrar.error.message);
    // Ya cobrados cerca: para enlazar (±3 días) y para avisar de un doble cobro (±10).
    const cobrados = await admin.from('recibos').select(COLUMNAS_RECIBO)
      .eq('studio_id', studioId).in('importe', imps).eq('estado', 'COBRADO')
      .gte('fecha_cobro', masDias(desde, -10)).lte('fecha_cobro', masDias(hasta, 10)).limit(3000);
    if (cobrados.error) throw new Error(cobrados.error.message);
    filas.push(...((porCobrar.data ?? []) as unknown as Record<string, unknown>[]), ...((cobrados.data ?? []) as unknown as Record<string, unknown>[]));
  }

  const ligados = await recibosLigados(admin, studioId, filas.map(f => f.id as string));
  const recibos = filas.map(f => reciboDeFila(f, ligados.has(f.id as string)));
  const socioIds = [...new Set(recibos.map(r => r.socioId).filter((x): x is string => !!x))];

  const socias = new Map<string, SociaParaEmparejar>();
  for (const ids of trozos(socioIds)) {
    const { data, error } = await admin.from('socios').select('id, nombre, apellidos').eq('studio_id', studioId).in('id', ids);
    if (error) throw new Error(error.message);
    for (const s of data ?? []) {
      socias.set(s.id as string, { id: s.id as string, nombre: (s.nombre as string | null) ?? '', apellidos: (s.apellidos as string | null) ?? '' });
    }
  }

  // ¿Vino a clase ese día? Clases del estudio en el periodo del lote, y sus reservas de estas socias.
  const asistencias: ContextoEmparejar['asistencias'][number][] = [];
  if (socioIds.length > 0) {
    const { data: sesiones, error: errSes } = await admin.from('sesiones').select('id, inicio, fin')
      .eq('studio_id', studioId).gte('inicio', `${masDias(desde, -1)}T00:00:00Z`).lt('inicio', `${masDias(hasta, 2)}T00:00:00Z`).limit(5000);
    if (errSes) throw new Error(errSes.message);
    const porSesion = new Map((sesiones ?? []).map(s => [s.id as string, s]));
    const enLote = new Set(fechas);
    const sociasSet = new Set(socioIds);
    for (const ids of trozos([...porSesion.keys()])) {
      const { data, error } = await admin.from('reservas').select('sesion_id, socio_id, check_in_en, estado')
        .eq('studio_id', studioId).in('sesion_id', ids).neq('estado', 'CANCELADA');
      if (error) throw new Error(error.message);
      for (const r of data ?? []) {
        const socioId = r.socio_id as string | null;
        const ses = porSesion.get(r.sesion_id as string);
        if (!socioId || !sociasSet.has(socioId) || !ses) continue;
        const fecha = hoyEnEstudio(new Date(ses.inicio as string));
        if (!enLote.has(fecha)) continue;
        asistencias.push({
          socioId, fecha, inicio: horaEstudio(ses.inicio as string), fin: horaEstudio(ses.fin as string), checkIn: !!r.check_in_en,
        });
      }
    }
  }

  // Lo que ya se le cobró con un movimiento: sus tarjetas y su pago habitual.
  const historial: ContextoEmparejar['historial'][number][] = [];
  for (const ids of trozos(socioIds)) {
    const { data, error } = await admin.from('cobros_externos')
      .select('socio_id, fecha_operacion, importe_centimos, metodo, tarjeta_ultimos4, tarjeta_marca')
      .eq('studio_id', studioId).eq('estado', 'CONFIRMADO').in('socio_id', ids).gte('fecha_operacion', masDias(desde, -400));
    if (error) throw new Error(error.message);
    for (const h of data ?? []) {
      historial.push({
        socioId: h.socio_id as string, fecha: h.fecha_operacion as string, importeCentimos: Number(h.importe_centimos),
        metodo: h.metodo as string, tarjetaUltimos4: (h.tarjeta_ultimos4 as string | null) ?? null, tarjetaMarca: (h.tarjeta_marca as string | null) ?? null,
      });
    }
  }

  // Penalizaciones anuladas: no se proponen. Sin poder comprobarlo, tampoco (al
  // confirmar se vuelve a mirar en ese momento).
  const reciboIds = recibos.map(r => r.id);
  const penalizacionIds = penalizacionesDeLosRecibos(reciboIds);
  let estados: Map<string, string> | null = new Map();
  if (penalizacionIds.length > 0) {
    const { data, error } = await admin.from('penalizaciones').select('id, estado').eq('studio_id', studioId).in('id', penalizacionIds);
    if (error) estados = null;
    else for (const f of data ?? []) estados.set(f.id as string, f.estado as string);
  }
  const { bloqueados, sinComprobar } = recibosDePenalizacionAnulada(reciboIds, estados);
  for (const id of sinComprobar) bloqueados.add(id);

  return { recibos, socias, asistencias, historial, bloqueados };
}

// ── Subir un fichero ─────────────────────────────────────────────────────────

export interface ResumenLote {
  loteId: string;
  /** El mismo fichero ya se había subido: no se ha leído otra vez. */
  yaSubido: boolean;
  leidos: number;
  nuevos: number;
  yaImportados: number;
  noDeAlumnas: number;
  cargos: number;
  conError: number;
  /** Cuántos de los nuevos cobros salen con una candidata segura, dudosa o ninguna. */
  porNivel: Record<Decision['nivel'], number>;
  posiblesDuplicados: number;
}

const MAX_ERRORES_GUARDADOS = 50;

export async function importarLote(
  admin: SupabaseClient,
  p: { sesion: SesionBandeja; fuente: 'norma43' | 'csv' | 'excel'; nombreFichero: string | null; lectura: ResultadoLectura },
): Promise<{ ok: true; resumen: ResumenLote } | { ok: false; error: string }> {
  const { sesion, fuente, lectura } = p;
  const studioId = sesion.studioId;
  const claves = lectura.movimientos.map(m => m.claveIdempotencia);
  const huella = huellaDeLote({ fuente, cuentaFinal: lectura.cuentaFinal, periodoDesde: lectura.periodoDesde, periodoHasta: lectura.periodoHasta, claves });
  const porNivel: ResumenLote['porNivel'] = { REFERENCIA: 0, UNICA_CLARA: 0, DUDOSA: 0, NINGUNA: 0 };

  const yaSubido = async (): Promise<{ ok: true; resumen: ResumenLote } | { ok: false; error: string }> => {
    const { data, error } = await admin.from('cobros_externos_lotes')
      .select('id, leidos, nuevos, ya_importados, no_de_alumnas, cargos, con_error')
      .eq('studio_id', studioId).eq('huella_fichero', huella).maybeSingle();
    if (error || !data) return { ok: false, error: 'No se ha podido comprobar si este fichero ya se subió.' };
    return {
      ok: true,
      resumen: {
        loteId: data.id as string, yaSubido: true, leidos: data.leidos as number, nuevos: 0,
        yaImportados: data.leidos as number, noDeAlumnas: data.no_de_alumnas as number, cargos: data.cargos as number,
        conError: data.con_error as number, porNivel, posiblesDuplicados: 0,
      },
    };
  };

  // El mismo fichero dos veces: ni se lee.
  {
    const { data, error } = await admin.from('cobros_externos_lotes').select('id')
      .eq('studio_id', studioId).eq('huella_fichero', huella).maybeSingle();
    if (error) return { ok: false, error: 'No se ha podido guardar el fichero. Inténtalo otra vez.' };
    if (data) return yaSubido();
  }

  // Lo que ya entró con otro fichero que se solapa.
  const existentes = new Set<string>();
  for (const cs of trozos(claves)) {
    const { data, error } = await admin.from('cobros_externos').select('clave_idempotencia').eq('studio_id', studioId).in('clave_idempotencia', cs);
    if (error) return { ok: false, error: 'No se ha podido guardar el fichero. Inténtalo otra vez.' };
    for (const f of data ?? []) existentes.add(f.clave_idempotencia as string);
  }
  const nuevos = lectura.movimientos.filter(m => !existentes.has(m.claveIdempotencia));
  const cobros = nuevos.filter(m => m.tipo === 'COBRO');

  let decisiones: Decision[];
  let duplicados: (string | null)[];
  try {
    decisiones = emparejarLote(cobros, await cargarContexto(admin, studioId, cobros));
    duplicados = await buscarDuplicados(admin, studioId, cobros);
  } catch {
    return { ok: false, error: 'No se han podido buscar los recibos de estos movimientos. Inténtalo otra vez.' };
  }

  const loteId = `cexl-${uuidV4()}`;
  const noDeAlumnas = nuevos.length - cobros.length;
  {
    const { error } = await admin.from('cobros_externos_lotes').insert({
      id: loteId, studio_id: studioId, fuente, huella_fichero: huella,
      nombre_fichero: nombreFicheroGuardable(p.nombreFichero),
      cuenta_final: lectura.cuentaFinal, periodo_desde: lectura.periodoDesde, periodo_hasta: lectura.periodoHasta,
      leidos: lectura.movimientos.length, nuevos: 0, ya_importados: 0, no_de_alumnas: noDeAlumnas,
      cargos: lectura.cargos, con_error: lectura.errores.length,
      errores: lectura.errores.slice(0, MAX_ERRORES_GUARDADOS), subido_por: sesion.userId,
    });
    // Dos subidas del mismo fichero a la vez: la otra ganó.
    if (error?.code === DUPLICADO) return yaSubido();
    if (error) return { ok: false, error: 'No se ha podido guardar el fichero. Inténtalo otra vez.' };
  }

  const decisionDe = new Map(cobros.map((m, i) => [m.claveIdempotencia, decisiones[i]]));
  const duplicadoDe = new Map(cobros.map((m, i) => [m.claveIdempotencia, duplicados[i]]));
  const filas = nuevos.map(m => {
    const d = decisionDe.get(m.claveIdempotencia);
    if (d) porNivel[d.nivel]++;
    return {
      id: `cex-${uuidV4()}`, studio_id: studioId, lote_id: loteId, fuente: m.fuente, clave_idempotencia: m.claveIdempotencia,
      id_externo: m.idExterno, tipo: m.tipo, metodo: m.metodo, importe_centimos: m.importeCentimos,
      fecha_operacion: m.fechaOperacion, hora_operacion: m.horaOperacion, fecha_valor: m.fechaValor, referencia: m.referencia,
      tarjeta_ultimos4: m.tarjetaUltimos4, tarjeta_marca: m.tarjetaMarca, terminal_ref: m.terminalRef,
      pagador_nombre: m.pagadorNombre, concepto: m.concepto,
      // Lo que no es de una alumna (liquidación del datáfono, payouts…) se guarda
      // para el cuadre y no entra en la bandeja.
      estado: m.tipo === 'COBRO' ? 'POR_REVISAR' : 'IMPORTADO',
      decision: d ?? null, posible_duplicado_de: duplicadoDe.get(m.claveIdempotencia) ?? null,
    };
  });

  let insertados = 0;
  for (const t of trozos(filas, 500)) {
    const { data, error } = await admin.from('cobros_externos')
      .upsert(t, { onConflict: 'studio_id,clave_idempotencia', ignoreDuplicates: true }).select('id');
    if (error) {
      // Lo insertado se queda (cada movimiento tiene su clave): volver a subir el fichero añade lo que falte.
      await admin.from('cobros_externos_lotes').update({ nuevos: insertados }).eq('id', loteId).eq('studio_id', studioId);
      return { ok: false, error: 'Se ha guardado solo una parte del fichero. Vuelve a subirlo: lo que ya entró no se duplica.' };
    }
    insertados += data?.length ?? 0;
  }
  await admin.from('cobros_externos_lotes')
    .update({ nuevos: insertados, ya_importados: lectura.movimientos.length - insertados })
    .eq('id', loteId).eq('studio_id', studioId);

  // La marca, también en el que ya estaba: la bandeja enseña la pareja desde los dos lados.
  for (const f of filas) {
    if (!f.posible_duplicado_de) continue;
    await admin.from('cobros_externos').update({ posible_duplicado_de: f.id })
      .eq('id', f.posible_duplicado_de).eq('studio_id', studioId).eq('estado', 'POR_REVISAR').is('posible_duplicado_de', null);
  }

  return {
    ok: true,
    resumen: {
      loteId, yaSubido: false, leidos: lectura.movimientos.length, nuevos: insertados,
      yaImportados: lectura.movimientos.length - insertados, noDeAlumnas, cargos: lectura.cargos,
      conError: lectura.errores.length, porNivel, posiblesDuplicados: duplicados.filter(Boolean).length,
    },
  };
}

/** Para cada cobro nuevo, si ya entró el mismo por OTRA fuente (`posibleDuplicadoDe`). */
async function buscarDuplicados(admin: SupabaseClient, studioId: string, cobros: readonly MovimientoNormalizado[]): Promise<(string | null)[]> {
  if (cobros.length === 0) return [];
  const fechas = cobros.map(m => m.fechaOperacion).sort();
  const importes = [...new Set(cobros.map(m => m.importeCentimos))];
  const existentes: MovimientoParaDuplicado[] = [];
  for (const imps of trozos(importes)) {
    const { data, error } = await admin.from('cobros_externos')
      .select('id, fuente, estado, importe_centimos, fecha_operacion, hora_operacion, tarjeta_ultimos4, pagador_nombre')
      .eq('studio_id', studioId).eq('tipo', 'COBRO').in('importe_centimos', imps)
      .gte('fecha_operacion', fechas[0]).lte('fecha_operacion', fechas[fechas.length - 1]).limit(5000);
    if (error) throw new Error(error.message);
    for (const f of data ?? []) {
      existentes.push({
        id: f.id as string, fuente: f.fuente as Fuente, estado: f.estado as EstadoMovimiento,
        importeCentimos: Number(f.importe_centimos), fechaOperacion: f.fecha_operacion as string,
        horaOperacion: f.hora_operacion ? (f.hora_operacion as string).slice(0, 5) : null,
        tarjetaUltimos4: (f.tarjeta_ultimos4 as string | null) ?? null, pagadorNombre: (f.pagador_nombre as string | null) ?? null,
      });
    }
  }
  return cobros.map(m => posibleDuplicadoDe(m, existentes));
}

// ── Volver a emparejar ───────────────────────────────────────────────────────

/** Tope por pasada: la bandeja la llama al abrirse y no puede tardar. */
export const MAX_REEMPAREJAR = 300;

/**
 * Pasa otra vez el motor por lo que sigue en revisión: una transferencia que llegó
 * antes de que existiera su recibo (el de la renovación lo crea un cron) lo
 * encuentra ahora. Solo escribe las decisiones que cambian, y solo si el movimiento
 * sigue en revisión (compare-and-set). Devuelve cuántas cambió.
 */
export async function reemparejarPendientes(admin: SupabaseClient, studioId: string): Promise<number> {
  const { data, error } = await admin.from('cobros_externos').select(COLUMNAS_MOVIMIENTO)
    .eq('studio_id', studioId).eq('estado', 'POR_REVISAR').eq('tipo', 'COBRO')
    .order('fecha_operacion', { ascending: false }).limit(MAX_REEMPAREJAR);
  if (error) throw new Error(error.message);
  const filas = (data ?? []) as unknown as FilaMovimiento[];
  if (filas.length === 0) return 0;
  const movimientos = filas.map(movimientoDeFila);
  const decisiones = emparejarLote(movimientos, await cargarContexto(admin, studioId, movimientos));
  let cambiadas = 0;
  for (let i = 0; i < filas.length; i++) {
    if (jsonEstable(filas[i].decision ?? null) === jsonEstable(decisiones[i])) continue;
    const { error: e } = await admin.from('cobros_externos')
      .update({ decision: decisiones[i], actualizado_en: new Date().toISOString() })
      .eq('id', filas[i].id).eq('studio_id', studioId).eq('estado', 'POR_REVISAR');
    if (!e) cambiadas++;
  }
  return cambiadas;
}

// ── Lectura de un movimiento y de su recibo ──────────────────────────────────

async function leerMovimiento(admin: SupabaseClient, studioId: string, id: string): Promise<{ fila: FilaMovimiento | null; error: string | null }> {
  const { data, error } = await admin.from('cobros_externos').select(COLUMNAS_MOVIMIENTO).eq('id', id).eq('studio_id', studioId).maybeSingle();
  if (error) return { fila: null, error: error.message };
  return { fila: (data as unknown as FilaMovimiento | null) ?? null, error: null };
}

async function leerRecibo(admin: SupabaseClient, studioId: string, id: string): Promise<{ fila: Record<string, unknown> | null; error: string | null }> {
  const { data, error } = await admin.from('recibos').select(COLUMNAS_RECIBO).eq('id', id).eq('studio_id', studioId).maybeSingle();
  if (error) return { fila: null, error: error.message };
  return { fila: (data as unknown as Record<string, unknown> | null) ?? null, error: null };
}

const NO_SE_PUEDE_LEER: ResultadoAccion = { ok: false, codigo: 'PERSISTENCIA', error: 'No se ha podido leer el movimiento. Inténtalo otra vez.' };
const NO_EXISTE: ResultadoAccion = { ok: false, codigo: 'NO_ENCONTRADO', error: 'Ese movimiento no existe.' };

function estadoNoPermite(estado: EstadoMovimiento): ResultadoAccion {
  return { ok: false, codigo: 'ESTADO', error: `Este movimiento ya está resuelto (${estado.toLowerCase().replace('_', ' ')}).` };
}

// ── Libro ────────────────────────────────────────────────────────────────────

async function anotar(
  admin: SupabaseClient, deps: DependenciasBandeja, sesion: SesionBandeja,
  p: {
    movimientoId: string; accion: string; antes: EstadoMovimiento; despues: EstadoMovimiento; reciboId: string | null;
    socioId: string | null; importeCentimos: number; motivo?: string | null;
    /** Lo cerró la recuperación: quién lo había empezado. */
    recuperacion?: { iniciadoPor: string | null } | null;
  },
): Promise<void> {
  await deps.registrar(admin, {
    sesion,
    tabla: 'cobros_externos', filaId: p.movimientoId, operacion: 'UPDATE',
    socioId: p.socioId,
    antes: { estado: p.antes },
    despues: { estado: p.despues, recibo_id: p.reciboId },
    contexto: {
      accion: p.accion, importe: p.importeCentimos / 100, ...(p.reciboId ? { recibo_id: p.reciboId } : {}),
      ...(p.recuperacion ? { recuperado: true, iniciado_por: p.recuperacion.iniciadoPor } : {}),
    },
    motivo: p.motivo ?? null,
  });
}

// ── Confirmar ────────────────────────────────────────────────────────────────

/** Devuelve el movimiento a revisión, con el motivo. Solo si sigue en el cerrojo. */
async function soltar(admin: SupabaseClient, studioId: string, id: string, error: string): Promise<void> {
  await admin.from('cobros_externos').update({
    estado: 'POR_REVISAR', recibo_id: null, bloqueado_en: null, resuelto_por: null,
    error_ultimo: recorta(error, 300), actualizado_en: new Date().toISOString(),
  }).eq('id', id).eq('studio_id', studioId).eq('estado', 'CONFIRMANDO');
}

/**
 * Cobra un recibo con un movimiento. Ver la cabecera y la sección D del diseño.
 * Nunca lanza.
 */
export async function confirmarMovimiento(
  admin: SupabaseClient,
  p: {
    sesion: SesionBandeja; movimientoId: string; reciboId: string; avisarSocia: boolean;
    /** La persona dice que SÍ son dos pagos aunque se parezca a otro ya resuelto de otra fuente. */
    aunqueDuplicado?: boolean;
  },
  d: Deps,
): Promise<ResultadoAccion> {
  const deps = conDefecto(d);
  const { sesion, movimientoId, reciboId } = p;
  const studioId = sesion.studioId;

  const { fila: mov, error: errMov } = await leerMovimiento(admin, studioId, movimientoId);
  if (errMov) return NO_SE_PUEDE_LEER;
  if (!mov) return NO_EXISTE;
  // Pedirlo dos veces (dos clics, un reintento de red) no hace nada la segunda.
  if (mov.estado === 'CONFIRMADO' && mov.recibo_id === reciboId) return { ok: true, estado: 'CONFIRMADO', mensaje: 'Ya estaba confirmado.' };
  if (mov.tipo !== 'COBRO') return { ok: false, codigo: 'ESTADO', error: 'Este movimiento no es el pago de una alumna.' };
  if (!DESDE.confirmar.includes(mov.estado)) return estadoNoPermite(mov.estado);
  const m = movimientoDeFila(mov);

  const hoy = hoyEnEstudio(deps.ahora());
  if (!fechaCobroExternoValida(m.fechaOperacion, hoy)) {
    return { ok: false, codigo: 'DATOS', error: 'La fecha de este movimiento no vale para un cobro (es futura o de hace más de un año).' };
  }
  if (!puedeFecharCobroExterno(sesion.rol, m.fechaOperacion, hoy)) {
    return { ok: false, codigo: 'DATOS', error: 'Un cobro de antes del mes pasado lo confirma la propietaria: cambia los ingresos de un mes ya cerrado.' };
  }

  const { fila: rec, error: errRec } = await leerRecibo(admin, studioId, reciboId);
  if (errRec) return { ok: false, codigo: 'PERSISTENCIA', error: 'No se ha podido leer el recibo. Inténtalo otra vez.' };
  if (!rec) return { ok: false, codigo: 'NO_ENCONTRADO', error: 'Ese recibo no existe.' };
  if (centimosDe(rec.importe) !== m.importeCentimos) {
    return { ok: false, codigo: 'NO_COBRABLE', error: 'El importe del recibo no es el del movimiento: no se puede cobrar con él.' };
  }
  // Las citas se marcan pagadas desde su pantalla; por aquí quedaría sin pagar.
  if (reciboId.startsWith('rec-cita-')) {
    return { ok: false, codigo: 'NO_COBRABLE', error: 'Los recibos de citas se cobran desde la cita.' };
  }

  // El mismo pago visto por dos fuentes (el extracto del banco y la exportación del
  // datáfono): si el otro ya cobró o enlazó un recibo, este no salda otro sin que una
  // persona diga que de verdad son dos pagos. Se mira AHORA, no solo al importar: la
  // marca de `posible_duplicado_de` solo la lleva el que entró después.
  if (!p.aunqueDuplicado) {
    const dup = await duplicadoYaResuelto(admin, studioId, mov.id, m);
    if (dup === 'NO_SE_SABE') return { ok: false, codigo: 'PERSISTENCIA', error: 'No se ha podido comprobar si este pago ya entró por otro fichero. Inténtalo otra vez.' };
    if (dup) {
      return {
        ok: false, codigo: 'POSIBLE_DUPLICADO',
        error: 'Parece el mismo pago que otro movimiento ya resuelto de otro fichero (mismo importe y día, y la misma tarjeta o la misma persona). Si de verdad son dos pagos, confírmalo indicándolo.',
      };
    }
  }

  // El cerrojo, con el recibo en el MISMO UPDATE: el índice único para a otro
  // movimiento que quiera el mismo recibo antes de llamar a nada.
  const ahoraISO = deps.ahora().toISOString();
  const cerrojo = await admin.from('cobros_externos').update({
    estado: 'CONFIRMANDO', recibo_id: reciboId, bloqueado_en: ahoraISO, resuelto_por: sesion.userId,
    error_ultimo: null, actualizado_en: ahoraISO,
  }).eq('id', movimientoId).eq('studio_id', studioId).eq('estado', 'POR_REVISAR').select('id').maybeSingle();
  if (cerrojo.error?.code === DUPLICADO) {
    return { ok: false, codigo: 'OCUPADO', error: 'Este recibo ya lo ha cobrado o lo está cobrando otro movimiento.' };
  }
  if (cerrojo.error) return { ok: false, codigo: 'PERSISTENCIA', error: 'No se ha podido confirmar. Inténtalo otra vez.' };
  if (!cerrojo.data) return { ok: false, codigo: 'ESTADO', error: 'Otra persona acaba de resolver este movimiento.' };

  // En serie por suscripción: dos recibos de la misma suscripción cobrados a la vez
  // leerían la misma `fecha_fin` y la alumna perdería un mes.
  const suscripcionId = (rec.suscripcion_id as string | null) ?? null;
  if (suscripcionId) {
    const { data: otros, error: errOtros } = await admin.from('cobros_externos').select('recibo_id')
      .eq('studio_id', studioId).eq('estado', 'CONFIRMANDO').neq('id', movimientoId);
    let ocupada = !!errOtros;
    const ids = (otros ?? []).map(o => o.recibo_id as string).filter(Boolean);
    if (!ocupada && ids.length > 0) {
      const { data: misma, error: errMisma } = await admin.from('recibos').select('id')
        .eq('studio_id', studioId).in('id', ids).eq('suscripcion_id', suscripcionId).limit(1);
      ocupada = !!errMisma || (misma?.length ?? 0) > 0;
    }
    if (ocupada) {
      const mensaje = 'Se está confirmando otro cobro de esta misma suscripción. Inténtalo en un momento.';
      await soltar(admin, studioId, movimientoId, mensaje);
      return { ok: false, codigo: 'OCUPADO', error: mensaje };
    }
  }

  // Lo que pudiera cobrarse por otro lado (enlace de pago, datáfono) se cierra antes.
  let checkoutLeido: string | null;
  try {
    const guarda = await deps.antesDeCobrar({ studioId, reciboId });
    if (!guarda.ok) {
      await soltar(admin, studioId, movimientoId, guarda.mensaje);
      return { ok: false, codigo: 'NO_COBRABLE', error: guarda.mensaje };
    }
    checkoutLeido = guarda.checkoutLeido;
  } catch {
    const mensaje = 'No se ha podido comprobar si tiene un cobro en marcha. Inténtalo otra vez.';
    await soltar(admin, studioId, movimientoId, mensaje);
    return { ok: false, codigo: 'NO_COBRABLE', error: mensaje };
  }

  const antes = await leerReciboAntesDeCobrar(admin, studioId, reciboId);
  const cobradoEn = cobradoEnDe(m.fechaOperacion, m.horaOperacion);
  let r: Awaited<ReturnType<typeof confirmarCobroReal>>;
  try {
    r = await deps.confirmarCobro(admin, {
      studioId, reciboId,
      metodo: metodoCobroDe(m.metodo),
      origen: 'externo',
      paymentIntentId: null,
      avisarSocia: p.avisarSocia,
      facturaId: facturaIdExterno(reciboId),
      actor: { userId: sesion.userId, nombre: sesion.nombre },
      fechaCobro: m.fechaOperacion,
      importeEsperado: importeEnTexto(m.importeCentimos),
      ...(cobradoEn ? { cobradoEn } : {}),
      // Como «Marcar cobrado» uno a uno: si entre medias se abre un pago, no se cobra.
      sinCobroDeMostrador: true,
      checkoutLeido,
    });
  } catch {
    // No se sabe si el recibo cambió: se queda en el cerrojo y lo resuelve la
    // recuperación (`recuperarColgados`) mirando el recibo.
    return { ok: false, codigo: 'PERSISTENCIA', error: MENSAJE_A_MEDIAS };
  }
  // Lo mismo con un error de la base de datos: postgrest-js no lanza ante un 504 o
  // un corte de red, lo devuelve como error, y el UPDATE puede haber hecho commit.
  // Soltarlo dejaría un recibo cobrado por 'externo' sin efectos ni movimiento, y el
  // mismo pago libre para saldar OTRO recibo.
  if (!r.ok && r.codigo === 'PERSISTENCIA') return { ok: false, codigo: 'PERSISTENCIA', error: MENSAJE_A_MEDIAS };

  if (r.ok && r.transicion === 'aplicada') {
    await cerrarComoConfirmado(admin, studioId, movimientoId, rec, 'humano');
    await anotarCobroMarcadoAMano(admin, { sesion, reciboId, antes, externo: { movimientoId } });
    const avisos = [
      r.renovacionFallida ? 'El cobro está hecho, pero no se ha podido entregar el bono o renovar la cuota: revísalo en su ficha.' : null,
      !r.selladoOk ? 'La factura no se ha podido emitir ahora; se reintentará sola.' : null,
    ].filter(Boolean).join(' ');
    return { ok: true, estado: 'CONFIRMADO', ...(avisos ? { mensaje: avisos } : {}) };
  }

  if (r.ok && r.transicion === 'ya_estaba') {
    return resolverYaCobrado(admin, deps, sesion, mov, m, reciboId);
  }

  // El compare-and-set no cobró con el recibo aún por cobrar: entre la lectura y el
  // cobro se abrió un pago (enlace o datáfono) o cambió el recibo (importe, reembolso).
  const sigueCobrable = !r.ok && r.codigo === 'NO_COBRABLE' && ['PENDIENTE', 'FALLIDO', 'DEVUELTO'].includes(r.estado ?? '');
  const mensaje = r.ok
    ? 'El recibo está devuelto: no se puede cobrar con este movimiento.'
    : sigueCobrable ? 'Entre medias se ha abierto un pago de este recibo o ha cambiado: no se ha cobrado. Vuelve a intentarlo.' : r.error;
  await soltar(admin, studioId, movimientoId, mensaje);
  return { ok: false, codigo: !r.ok && r.codigo === 'NO_ENCONTRADO' ? 'NO_ENCONTRADO' : 'NO_COBRABLE', error: mensaje };
}

const MENSAJE_A_MEDIAS =
  'No se ha podido terminar. Se revisará solo la próxima vez que se abra la bandeja de cobros del banco; mientras, no lo cobres por otro lado.';

/** ¿Hay otro movimiento de OTRA fuente, ya resuelto, que parece este mismo pago? */
async function duplicadoYaResuelto(
  admin: SupabaseClient, studioId: string, movimientoId: string, m: MovimientoNormalizado,
): Promise<string | null | 'NO_SE_SABE'> {
  const { data, error } = await admin.from('cobros_externos')
    .select('id, fuente, estado, importe_centimos, fecha_operacion, hora_operacion, tarjeta_ultimos4, pagador_nombre')
    .eq('studio_id', studioId).eq('tipo', 'COBRO').eq('importe_centimos', m.importeCentimos).eq('fecha_operacion', m.fechaOperacion)
    .neq('fuente', m.fuente).neq('id', movimientoId).in('estado', ['CONFIRMANDO', 'CONFIRMADO', 'ENLAZADO']).limit(50);
  if (error) return 'NO_SE_SABE';
  const otros: MovimientoParaDuplicado[] = (data ?? []).map(f => ({
    id: f.id as string, fuente: f.fuente as Fuente, estado: f.estado as EstadoMovimiento,
    importeCentimos: Number(f.importe_centimos), fechaOperacion: f.fecha_operacion as string,
    horaOperacion: f.hora_operacion ? (f.hora_operacion as string).slice(0, 5) : null,
    tarjetaUltimos4: (f.tarjeta_ultimos4 as string | null) ?? null, pagadorNombre: (f.pagador_nombre as string | null) ?? null,
  }));
  return posibleDuplicadoDe(m, otros);
}

async function cerrarComoConfirmado(
  admin: SupabaseClient, studioId: string, movimientoId: string, rec: Record<string, unknown>, como: 'humano' | 'auto',
): Promise<boolean> {
  const ahora = new Date().toISOString();
  // Si esto falla, el movimiento se queda en el cerrojo con el recibo ya cobrado
  // por 'externo', y la recuperación lo cierra igual.
  const { data } = await admin.from('cobros_externos').update({
    estado: 'CONFIRMADO', socio_id: (rec.socio_id as string | null) ?? null, resuelto_como: como,
    resuelto_en: ahora, bloqueado_en: null, error_ultimo: null, actualizado_en: ahora,
  }).eq('id', movimientoId).eq('studio_id', studioId).eq('estado', 'CONFIRMANDO').select('id').maybeSingle();
  return !!data;
}

/**
 * Un cobro que ESTE movimiento escribió y no llegó a cerrarse: primero sus efectos
 * (idempotentes) y después el cierre. Al revés, una muerte entre medias dejaría el
 * movimiento cerrado y la renovación y la factura sin nadie que las recupere.
 */
async function terminarCobroPropio(
  admin: SupabaseClient, deps: DependenciasBandeja, studioId: string, movimientoId: string, rec: Record<string, unknown>,
): Promise<boolean> {
  const reciboId = rec.id as string;
  await deps.aplicarEfectosCobro(admin, {
    studioId, reciboId, metodo: (rec.metodo_cobro as string | null) ?? null, origen: 'externo',
    facturaId: facturaIdExterno(reciboId), avisarSocia: false, reparacion: true,
  });
  return cerrarComoConfirmado(admin, studioId, movimientoId, rec, 'humano');
}

/** El recibo estaba ya cobrado al llegar: enlazar, doble cobro o a revisión. */
async function resolverYaCobrado(
  admin: SupabaseClient, deps: DependenciasBandeja, sesion: SesionBandeja,
  mov: FilaMovimiento, m: MovimientoNormalizado, reciboId: string,
  /**
   * En la recuperación: quien abre la bandeja no es quien lo decidió. Se anota igual
   * (un hueco en el libro es peor), diciendo que fue la recuperación y quién lo empezó.
   */
  recuperacion: { iniciadoPor: string | null } | null = null,
): Promise<ResultadoAccion> {
  const studioId = sesion.studioId;
  const { fila: rec } = await leerRecibo(admin, studioId, reciboId);
  let ligado = true;
  try {
    ligado = (await recibosLigados(admin, studioId, [reciboId], mov.id)).has(reciboId);
  } catch { /* sin saberlo, a revisión */ }
  const desenlace = rec ? desenlaceYaCobrado(reciboDeFila(rec, false), m, ligado) : 'POR_REVISAR';
  const ahora = new Date().toISOString();
  const socioId = (rec?.socio_id as string | null) ?? null;

  if (desenlace === 'PROPIO' && rec) {
    // Lo escribió una confirmación anterior de este mismo pago que no llegó a cerrarse.
    const cerrado = await terminarCobroPropio(admin, deps, studioId, mov.id, rec);
    if (cerrado) {
      await anotarCobroMarcadoAMano(admin, {
        sesion, reciboId, antes: null,
        externo: { movimientoId: mov.id, ...(recuperacion ? { iniciadoPor: recuperacion.iniciadoPor } : {}) },
      });
    }
    return { ok: true, estado: 'CONFIRMADO' };
  }

  if (desenlace === 'ENLAZADO') {
    const { data } = await admin.from('cobros_externos').update({
      estado: 'ENLAZADO', socio_id: socioId, resuelto_como: 'humano', resuelto_en: ahora,
      bloqueado_en: null, error_ultimo: null, actualizado_en: ahora,
    }).eq('id', mov.id).eq('studio_id', studioId).eq('estado', 'CONFIRMANDO').select('id').maybeSingle();
    if (data) {
      await anotar(admin, deps, sesion, { movimientoId: mov.id, accion: 'COBRO_EXTERNO_ENLAZADO', antes: 'POR_REVISAR', despues: 'ENLAZADO', reciboId, socioId, importeCentimos: m.importeCentimos, recuperacion });
    }
    return { ok: true, estado: 'ENLAZADO', mensaje: 'Ya estaba apuntado como cobrado: se ha enlazado con ese cobro.' };
  }
  if (desenlace === 'DOBLE_COBRO') {
    const mensaje = 'Este recibo ya estaba cobrado por otro medio: la alumna puede haber pagado dos veces.';
    const { data } = await admin.from('cobros_externos').update({
      estado: 'DOBLE_COBRO', socio_id: socioId, bloqueado_en: null, error_ultimo: mensaje, actualizado_en: ahora,
    }).eq('id', mov.id).eq('studio_id', studioId).eq('estado', 'CONFIRMANDO').select('id').maybeSingle();
    if (data) {
      await anotar(admin, deps, sesion, { movimientoId: mov.id, accion: 'COBRO_EXTERNO_DOBLE_COBRO', antes: 'POR_REVISAR', despues: 'DOBLE_COBRO', reciboId, socioId, importeCentimos: m.importeCentimos, recuperacion });
    }
    return { ok: true, estado: 'DOBLE_COBRO', mensaje };
  }
  const mensaje = 'El recibo ya estaba cobrado por otro camino. Revisa si este pago es de otro recibo o si hay que devolverlo.';
  await soltar(admin, studioId, mov.id, mensaje);
  return { ok: false, codigo: 'NO_COBRABLE', error: mensaje };
}

// ── Recuperar lo que se quedó a medias ───────────────────────────────────────

/** Por pasada: corre al abrir la bandeja, dentro de una petición con tope de 60 s. */
export const MAX_RECUPERAR = 5;
const PRESUPUESTO_RECUPERAR_MS = 20_000;

/**
 * Quien empezó la confirmación (`resuelto_por`, puesto en el cerrojo) como actor del
 * libro: quien abre la bandeja después no es quien decidió cobrar. Su rol en ESTE
 * estudio, como lo resuelve la sesión de staff. Sin poder saberlo, nadie: no se
 * inventa un actor.
 */
async function sesionDeQuienEmpezo(admin: SupabaseClient, studioId: string, userId: string | null): Promise<SesionBandeja | null> {
  if (!userId) return null;
  const { data: estudio } = await admin.from('studios').select('owner_auth_user_id').eq('id', studioId).maybeSingle();
  if (estudio?.owner_auth_user_id === userId) return { userId, studioId, rol: 'PROPIETARIO', nombre: null };
  const { data: ficha } = await admin.from('instructores').select('rol').eq('studio_id', studioId).eq('auth_user_id', userId).maybeSingle();
  return ficha?.rol ? { userId, studioId, rol: ficha.rol as string, nombre: null } : null;
}

/** ¿Ya anotó el camino normal este cobro antes de morir? Para no duplicar la entrada. */
async function cobroYaAnotado(admin: SupabaseClient, studioId: string, reciboId: string, movimientoId: string): Promise<boolean> {
  const { data, error } = await admin.from('auditoria_estudio').select('id')
    .eq('studio_id', studioId).eq('tabla', 'recibos').eq('fila_id', reciboId)
    .contains('contexto', { movimiento_id: movimientoId }).limit(1);
  // Sin poder leerlo se anota: mejor una entrada repetida que un cobro sin ninguna.
  return !error && (data?.length ?? 0) > 0;
}

/**
 * Un `CONFIRMANDO` de hace más de `MINUTOS_CERROJO` es una confirmación que murió
 * a medias. Mirando el recibo se sabe qué pasó:
 *  · lo cobró 'externo' ese día por ese importe → el cobro se hizo (y solo este
 *    movimiento podía hacerlo: el índice único). Primero sus efectos, después el
 *    cierre, y su entrada en el libro a nombre de quien lo empezó;
 *  · lo cobró 'externo' y ya no está cobrado (se devolvió después) → se cierra sin
 *    efectos: el cobro existió y su devolución es otra historia;
 *  · cobrado por otro camino → como un `ya_estaba`;
 *  · aún cobrable → no llegó a cobrarse. Se suelta.
 * Pocos por pasada y con presupuesto de tiempo: cada uno puede sellar una factura.
 * Devuelve cuántos ha resuelto. Nunca lanza.
 */
export async function recuperarColgados(admin: SupabaseClient, sesion: SesionBandeja, d: Deps): Promise<number> {
  const deps = conDefecto(d);
  const studioId = sesion.studioId;
  const inicio = Date.now();
  const limite = new Date(deps.ahora().getTime() - MINUTOS_CERROJO * 60_000).toISOString();
  const { data, error } = await admin.from('cobros_externos').select(COLUMNAS_MOVIMIENTO)
    .eq('studio_id', studioId).eq('estado', 'CONFIRMANDO').lt('bloqueado_en', limite)
    .order('bloqueado_en', { ascending: true }).limit(MAX_RECUPERAR);
  if (error || !data) return 0;
  let resueltos = 0;
  for (const mov of data as unknown as FilaMovimiento[]) {
    if (Date.now() - inicio > PRESUPUESTO_RECUPERAR_MS) break;
    try {
      const reciboId = mov.recibo_id as string;
      const m = movimientoDeFila(mov);
      const { fila: rec, error: errRec } = await leerRecibo(admin, studioId, reciboId);
      if (errRec) continue;
      const suyo = !!rec && rec.conciliado_por === 'externo' && rec.fecha_cobro === m.fechaOperacion
        && centimosDe(rec.importe) === m.importeCentimos;
      if (rec && suyo && rec.estado === 'COBRADO') {
        if (await terminarCobroPropio(admin, deps, studioId, mov.id, rec) && !(await cobroYaAnotado(admin, studioId, reciboId, mov.id))) {
          // A nombre de quien lo empezó; si ya no se le encuentra (persona eliminada), de
          // quien ha abierto la bandeja, diciendo que fue la recuperación. Nunca sin entrada.
          const iniciadoPor = (mov.resuelto_por as string | null) ?? null;
          const actor = (await sesionDeQuienEmpezo(admin, studioId, iniciadoPor)) ?? sesion;
          await anotarCobroMarcadoAMano(admin, { sesion: actor, reciboId, antes: null, externo: { movimientoId: mov.id, iniciadoPor } });
        }
      } else if (rec && suyo) {
        await cerrarComoConfirmado(admin, studioId, mov.id, rec, 'humano');
      } else if (rec && rec.estado === 'COBRADO') {
        await resolverYaCobrado(admin, deps, sesion, mov, m, reciboId, { iniciadoPor: (mov.resuelto_por as string | null) ?? null });
      } else {
        await soltar(admin, studioId, mov.id, 'La confirmación se cortó a medias y no llegó a cobrarse. Vuelve a confirmarlo.');
      }
      resueltos++;
    } catch { /* el siguiente intento lo vuelve a mirar */ }
  }
  return resueltos;
}

// ── Enlazar, descartar, reabrir, doble cobro ─────────────────────────────────

/**
 * Este movimiento es el pago de un cobro que alguien YA apuntó a mano (sin Stripe).
 * No escribe en `recibos`. Desde `DOBLE_COBRO`, solo con el mismo recibo: la persona
 * ha comprobado que no era un pago doble.
 */
export async function enlazarMovimiento(
  admin: SupabaseClient, p: { sesion: SesionBandeja; movimientoId: string; reciboId: string }, d: Partial<DependenciasBandeja> = {},
): Promise<ResultadoAccion> {
  const deps = { ...DEPENDENCIAS_POR_DEFECTO, antesDeCobrar: async () => ({ ok: true as const, checkoutLeido: null }), ...d };
  const { sesion, movimientoId, reciboId } = p;
  const studioId = sesion.studioId;
  const { fila: mov, error } = await leerMovimiento(admin, studioId, movimientoId);
  if (error) return NO_SE_PUEDE_LEER;
  if (!mov) return NO_EXISTE;
  if (mov.estado === 'ENLAZADO' && mov.recibo_id === reciboId) return { ok: true, estado: 'ENLAZADO', mensaje: 'Ya estaba enlazado.' };
  if (mov.tipo !== 'COBRO') return { ok: false, codigo: 'ESTADO', error: 'Este movimiento no es el pago de una alumna.' };
  if (!DESDE.enlazar.includes(mov.estado)) return estadoNoPermite(mov.estado);

  const { fila: rec, error: errRec } = await leerRecibo(admin, studioId, reciboId);
  if (errRec) return { ok: false, codigo: 'PERSISTENCIA', error: 'No se ha podido leer el recibo. Inténtalo otra vez.' };
  if (!rec) return { ok: false, codigo: 'NO_ENCONTRADO', error: 'Ese recibo no existe.' };
  const m = movimientoDeFila(mov);

  if (mov.estado === 'DOBLE_COBRO') {
    if (mov.recibo_id !== reciboId) return { ok: false, codigo: 'DATOS', error: 'Un posible doble cobro solo se enlaza con su propio recibo.' };
    if (rec.estado !== 'COBRADO' || centimosDe(rec.importe) !== m.importeCentimos) {
      return { ok: false, codigo: 'NO_COBRABLE', error: 'El recibo ya no está cobrado por ese importe.' };
    }
  } else if (!sePuedeEnlazar(reciboDeFila(rec, false), m)) {
    return {
      ok: false, codigo: 'NO_COBRABLE',
      error: 'Solo se enlaza con un cobro apuntado a mano, sin pasar por Stripe, del mismo importe y método y de esos días.',
    };
  }

  const ahora = new Date().toISOString();
  const socioId = (rec.socio_id as string | null) ?? null;
  const { data, error: errUpd } = await admin.from('cobros_externos').update({
    estado: 'ENLAZADO', recibo_id: reciboId, socio_id: socioId, resuelto_como: 'humano', resuelto_por: sesion.userId,
    resuelto_en: ahora, error_ultimo: null, actualizado_en: ahora,
  }).eq('id', movimientoId).eq('studio_id', studioId).eq('estado', mov.estado).select('id').maybeSingle();
  if (errUpd?.code === DUPLICADO) return { ok: false, codigo: 'OCUPADO', error: 'Ese cobro ya está enlazado con otro movimiento.' };
  if (errUpd) return { ok: false, codigo: 'PERSISTENCIA', error: 'No se ha podido enlazar. Inténtalo otra vez.' };
  if (!data) return { ok: false, codigo: 'ESTADO', error: 'Otra persona acaba de resolver este movimiento.' };
  await anotar(admin, deps, sesion, { movimientoId, accion: 'COBRO_EXTERNO_ENLAZADO', antes: mov.estado, despues: 'ENLAZADO', reciboId, socioId, importeCentimos: m.importeCentimos });
  return { ok: true, estado: 'ENLAZADO' };
}

export async function descartarMovimiento(
  admin: SupabaseClient, p: { sesion: SesionBandeja; movimientoId: string; motivo: MotivoDescarte }, d: Partial<DependenciasBandeja> = {},
): Promise<ResultadoAccion> {
  const deps = { ...DEPENDENCIAS_POR_DEFECTO, antesDeCobrar: async () => ({ ok: true as const, checkoutLeido: null }), ...d };
  const { sesion, movimientoId, motivo } = p;
  const studioId = sesion.studioId;
  const { fila: mov, error } = await leerMovimiento(admin, studioId, movimientoId);
  if (error) return NO_SE_PUEDE_LEER;
  if (!mov) return NO_EXISTE;
  if (mov.estado === 'DESCARTADO') return { ok: true, estado: 'DESCARTADO', mensaje: 'Ya estaba descartado.' };
  if (!DESDE.descartar.includes(mov.estado)) return estadoNoPermite(mov.estado);

  const ahora = new Date().toISOString();
  // De un doble cobro se guarda de qué recibo era (la traza de la devolución).
  const reciboId = mov.estado === 'DOBLE_COBRO' ? (mov.recibo_id as string | null) : null;
  const { data, error: errUpd } = await admin.from('cobros_externos').update({
    estado: 'DESCARTADO', descartado_motivo: motivo, recibo_id: reciboId, resuelto_como: 'humano', resuelto_por: sesion.userId,
    resuelto_en: ahora, actualizado_en: ahora,
  }).eq('id', movimientoId).eq('studio_id', studioId).eq('estado', mov.estado).select('id').maybeSingle();
  if (errUpd) return { ok: false, codigo: 'PERSISTENCIA', error: 'No se ha podido descartar. Inténtalo otra vez.' };
  if (!data) return { ok: false, codigo: 'ESTADO', error: 'Otra persona acaba de resolver este movimiento.' };
  await anotar(admin, deps, sesion, {
    movimientoId, accion: 'COBRO_EXTERNO_DESCARTADO', antes: mov.estado, despues: 'DESCARTADO', reciboId,
    socioId: (mov.socio_id as string | null) ?? null, importeCentimos: Number(mov.importe_centimos), motivo,
  });
  return { ok: true, estado: 'DESCARTADO' };
}

export async function reabrirMovimiento(
  admin: SupabaseClient, p: { sesion: SesionBandeja; movimientoId: string }, d: Partial<DependenciasBandeja> = {},
): Promise<ResultadoAccion> {
  const deps = { ...DEPENDENCIAS_POR_DEFECTO, antesDeCobrar: async () => ({ ok: true as const, checkoutLeido: null }), ...d };
  const { sesion, movimientoId } = p;
  const studioId = sesion.studioId;
  const { fila: mov, error } = await leerMovimiento(admin, studioId, movimientoId);
  if (error) return NO_SE_PUEDE_LEER;
  if (!mov) return NO_EXISTE;
  if (mov.estado === 'POR_REVISAR') return { ok: true, estado: 'POR_REVISAR' };
  if (!DESDE.reabrir.includes(mov.estado)) return estadoNoPermite(mov.estado);
  if (mov.tipo !== 'COBRO') return { ok: false, codigo: 'ESTADO', error: 'Este movimiento no es el pago de una alumna.' };

  const { data, error: errUpd } = await admin.from('cobros_externos').update({
    estado: 'POR_REVISAR', descartado_motivo: null, recibo_id: null, socio_id: null, resuelto_como: null, resuelto_por: null,
    resuelto_en: null, error_ultimo: null, actualizado_en: new Date().toISOString(),
  }).eq('id', movimientoId).eq('studio_id', studioId).eq('estado', 'DESCARTADO').select('id').maybeSingle();
  if (errUpd) return { ok: false, codigo: 'PERSISTENCIA', error: 'No se ha podido reabrir. Inténtalo otra vez.' };
  if (!data) return { ok: false, codigo: 'ESTADO', error: 'Otra persona acaba de cambiar este movimiento.' };
  await anotar(admin, deps, sesion, {
    movimientoId, accion: 'COBRO_EXTERNO_REABIERTO', antes: 'DESCARTADO', despues: 'POR_REVISAR', reciboId: null,
    socioId: null, importeCentimos: Number(mov.importe_centimos),
  });
  return { ok: true, estado: 'POR_REVISAR' };
}

/** Una persona ve que este pago es una segunda vez de un recibo ya cobrado: hay que devolverlo. */
export async function marcarDobleCobro(
  admin: SupabaseClient, p: { sesion: SesionBandeja; movimientoId: string; reciboId: string }, d: Partial<DependenciasBandeja> = {},
): Promise<ResultadoAccion> {
  const deps = { ...DEPENDENCIAS_POR_DEFECTO, antesDeCobrar: async () => ({ ok: true as const, checkoutLeido: null }), ...d };
  const { sesion, movimientoId, reciboId } = p;
  const studioId = sesion.studioId;
  const { fila: mov, error } = await leerMovimiento(admin, studioId, movimientoId);
  if (error) return NO_SE_PUEDE_LEER;
  if (!mov) return NO_EXISTE;
  if (mov.estado === 'DOBLE_COBRO' && mov.recibo_id === reciboId) return { ok: true, estado: 'DOBLE_COBRO' };
  if (mov.tipo !== 'COBRO') return { ok: false, codigo: 'ESTADO', error: 'Este movimiento no es el pago de una alumna.' };
  if (!DESDE.doble_cobro.includes(mov.estado)) return estadoNoPermite(mov.estado);

  const { fila: rec, error: errRec } = await leerRecibo(admin, studioId, reciboId);
  if (errRec) return { ok: false, codigo: 'PERSISTENCIA', error: 'No se ha podido leer el recibo. Inténtalo otra vez.' };
  if (!rec) return { ok: false, codigo: 'NO_ENCONTRADO', error: 'Ese recibo no existe.' };
  if (rec.estado !== 'COBRADO') return { ok: false, codigo: 'NO_COBRABLE', error: 'Ese recibo no está cobrado: no puede ser un doble cobro.' };
  if (centimosDe(rec.importe) !== Number(mov.importe_centimos)) {
    return { ok: false, codigo: 'NO_COBRABLE', error: 'El importe del recibo no es el del movimiento.' };
  }

  const ahora = new Date().toISOString();
  const socioId = (rec.socio_id as string | null) ?? null;
  const { data, error: errUpd } = await admin.from('cobros_externos').update({
    estado: 'DOBLE_COBRO', recibo_id: reciboId, socio_id: socioId, resuelto_por: sesion.userId, actualizado_en: ahora,
    error_ultimo: 'Señalado como posible doble cobro: hay que devolver uno de los dos pagos.',
  }).eq('id', movimientoId).eq('studio_id', studioId).eq('estado', 'POR_REVISAR').select('id').maybeSingle();
  if (errUpd) return { ok: false, codigo: 'PERSISTENCIA', error: 'No se ha podido guardar. Inténtalo otra vez.' };
  if (!data) return { ok: false, codigo: 'ESTADO', error: 'Otra persona acaba de resolver este movimiento.' };
  await anotar(admin, deps, sesion, { movimientoId, accion: 'COBRO_EXTERNO_DOBLE_COBRO', antes: 'POR_REVISAR', despues: 'DOBLE_COBRO', reciboId, socioId, importeCentimos: Number(mov.importe_centimos) });
  return { ok: true, estado: 'DOBLE_COBRO' };
}

// ── Listar ───────────────────────────────────────────────────────────────────

export interface ListadoBandeja {
  movimientos: FilaMovimiento[];
  /** Los recibos que aparecen (candidatas, el ligado, los de doble cobro), para pintarlos con los datos de hoy. */
  recibos: Record<string, { id: string; socioId: string | null; concepto: string | null; importe: number | null; estado: string; fechaVencimiento: string | null; fechaCobro: string | null; metodoCobro: string | null }>;
  socias: Record<string, { id: string; nombre: string; apellidos: string }>;
}

export const MAX_LISTADO = 200;

export async function listarMovimientos(
  admin: SupabaseClient, studioId: string, estados: readonly EstadoMovimiento[],
): Promise<{ ok: true; listado: ListadoBandeja } | { ok: false; error: string }> {
  const { data, error } = await admin.from('cobros_externos').select(COLUMNAS_MOVIMIENTO)
    .eq('studio_id', studioId).eq('tipo', 'COBRO').in('estado', [...estados])
    .order('fecha_operacion', { ascending: false }).order('id').limit(MAX_LISTADO);
  if (error) return { ok: false, error: 'No se han podido leer los movimientos.' };
  const movimientos = (data ?? []) as unknown as FilaMovimiento[];

  const reciboIds = new Set<string>();
  for (const m of movimientos) {
    if (m.recibo_id) reciboIds.add(m.recibo_id as string);
    const dec = m.decision as Decision | null;
    for (const c of dec?.candidatas ?? []) reciboIds.add(c.reciboId);
    for (const id of dec?.dobleCobro ?? []) reciboIds.add(id);
  }
  const recibos: ListadoBandeja['recibos'] = {};
  for (const ids of trozos([...reciboIds])) {
    const r = await admin.from('recibos').select('id, socio_id, concepto, importe, estado, fecha_vencimiento, fecha_cobro, metodo_cobro')
      .eq('studio_id', studioId).in('id', ids);
    if (r.error) return { ok: false, error: 'No se han podido leer los recibos.' };
    for (const f of r.data ?? []) {
      recibos[f.id as string] = {
        id: f.id as string, socioId: (f.socio_id as string | null) ?? null, concepto: (f.concepto as string | null) ?? null,
        importe: f.importe == null ? null : Number(f.importe), estado: f.estado as string,
        fechaVencimiento: (f.fecha_vencimiento as string | null) ?? null, fechaCobro: (f.fecha_cobro as string | null) ?? null,
        metodoCobro: (f.metodo_cobro as string | null) ?? null,
      };
    }
  }
  const socioIds = new Set<string>();
  for (const r of Object.values(recibos)) if (r.socioId) socioIds.add(r.socioId);
  for (const m of movimientos) if (m.socio_id) socioIds.add(m.socio_id as string);
  const socias: ListadoBandeja['socias'] = {};
  for (const ids of trozos([...socioIds])) {
    const s = await admin.from('socios').select('id, nombre, apellidos').eq('studio_id', studioId).in('id', ids);
    if (s.error) return { ok: false, error: 'No se han podido leer las alumnas.' };
    for (const f of s.data ?? []) {
      socias[f.id as string] = { id: f.id as string, nombre: (f.nombre as string | null) ?? '', apellidos: (f.apellidos as string | null) ?? '' };
    }
  }
  return { ok: true, listado: { movimientos, recibos, socias } };
}
