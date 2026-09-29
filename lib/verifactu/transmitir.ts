// Veri*Factu — el trabajo de mandar a la AEAT lo que está en cola.
//
// SOLO SERVIDOR (service-role). Lo dispara un cron, nunca una petición de
// usuario: la AEAT impone control de flujo entre envíos y eso no cabe dentro de
// un cobro.
//
// Lo que DECIDE vive aparte y es lógica pura con tests:
//   · qué lote sale y en qué orden ........ pendientes.ts  (decidirLote)
//   · qué significa cada respuesta ........ procesar.ts    (planificarResultado)
//   · la máquina de estados ................ estado.ts
//   · lo no confirmado por la AEAT ......... politica-cadena.ts
// Aquí solo está lo que toca la base de datos y la red.
//
// Garantías:
//   · El XML se congela al preparar y se reenvía byte a byte (`xml_registro`).
//   · Un registro se RECLAMA (compare-and-set LISTO/REINTENTAR → ENVIANDO) y se
//     anota en `verifactu_envios` ANTES de abrir la conexión. Si el proceso muere
//     a mitad, queda ENVIANDO con su envío abierto y la siguiente pasada lo pasa
//     a INCIERTO: nunca se reenvía sin preguntar antes a la AEAT.
//   · Solo se transmite en PRODUCCIÓN y solo para estudios habilitados
//     (habilitacion.ts). En preproducción el cron no manda nada de estudios: las
//     pruebas se hacen con `scripts/verifactu-preproduccion.ts` y el NIF propio.

import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import {
  certificadoDeEntorno, destinoDeEntorno, entornoTransmision, productor as productorDeConfig,
  queFaltaParaTransmitir,
} from './config.ts';
import { llamarAeat, huellaCredencial, sha256Texto, type CertificadoCliente } from './envio.ts';
import { endpointVerifactu, type DestinoAeat } from './endpoints.ts';
import { sobreSoapRegFactu, sobreSoapConsulta, periodoDeFecha, type SistemaInformatico } from './xml.ts';
import { numeroInstalacionDeEstudio, sistemaInformaticoParaEstudio, SIF, type Productor } from './sif.ts';
import { declaracionVigente } from './declaracion.ts';
import { decidirLote, type RegistroCola } from './pendientes.ts';
import { planificarResultado } from './procesar.ts';
import { parsearRespuestaConsulta } from './respuesta.ts';
import { resolverConsulta, estadoParaFactura, type EstadoRegistroVerifactu } from './estado.ts';
import { estudioHabilitado, pausarEstudio, suspenderPorAeat, revisarCaducidades } from './habilitacion.ts';
import { prepararRegistros, completarReservasHuerfanas, nombreFiscalDeEstudio, COLS_REGISTRO, type FilaRegistro } from './registros.ts';

export interface ResumenTransmision {
  estudios: number;
  enviadas: number;
  registradas: number;
  rechazadas: number;
  inciertas: number;
  pendientes: number;
  saltados: string[];
  motivo?: string;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 50ª pasada de auditoría, H-1: cerrojo de una sola fila (compare-and-set),
// no pg_advisory_lock — ver el comentario de la migración
// 20260910110000_verifactu_lock_transmision.sql para el porqué. Un cerrojo
// huérfano (ejecución anterior que murió sin liberar) se considera libre
// pasados 6 minutos: el cron corre cada 10 con maxDuration de 5.
const CERROJO_HUERFANO_MS = 6 * 60 * 1000;

async function adquirirCerrojo(admin: SupabaseClient): Promise<boolean> {
  const huerfanoAntesDe = new Date(Date.now() - CERROJO_HUERFANO_MS).toISOString();
  const ahora = new Date().toISOString();
  const { data } = await admin
    .from('verifactu_transmision_lock')
    .update({ en_curso: true, iniciado_en: ahora, actualizado_en: ahora })
    .eq('id', 'global')
    .or(`en_curso.eq.false,iniciado_en.lt.${huerfanoAntesDe}`)
    .select('id')
    .maybeSingle();
  return !!data;
}

async function liberarCerrojo(admin: SupabaseClient): Promise<void> {
  await admin
    .from('verifactu_transmision_lock')
    .update({ en_curso: false, actualizado_en: new Date().toISOString() })
    .eq('id', 'global');
}

// Deja margen sobre maxDuration=300s del endpoint (app/api/cron/
// verifactu-transmitir/route.ts) para que el cron termine solo, sin que
// Vercel lo mate a mitad de un envío — un estudio que no llegue a tiempo se
// queda en cola, sin tocar nada, y lo coge el siguiente cron (10 min).
const PRESUPUESTO_MS = 260_000;

/** Un ENVIANDO más viejo que esto es de una ejecución que murió: pasa a INCIERTO. */
const ENVIANDO_HUERFANO_MS = CERROJO_HUERFANO_MS;

const ACTIVOS = ['RESERVADO', 'PENDIENTE', 'LISTO', 'ENVIANDO', 'REINTENTAR', 'INCIERTO'];

/** El resumen de la factura sigue al registro vigente de su alta o subsanación. */
async function sincronizarFactura(admin: SupabaseClient, facturaId: string, estado: EstadoRegistroVerifactu, csv: string | null) {
  const resumen = estadoParaFactura(estado);
  if (!resumen) return;
  const campos: Record<string, unknown> = { verifactu_estado: resumen };
  if (csv) campos.verifactu_csv = csv;
  await admin.from('facturas').update(campos).eq('id', facturaId);
}

interface Contexto {
  admin: SupabaseClient;
  certificado: CertificadoCliente;
  destino: DestinoAeat;
  productor: Productor;
  resumen: ResumenTransmision;
  /** Control de flujo GLOBAL: ver pendientes.ts (ámbito NO CONFIRMADO). */
  esperaMs: number;
  inicio: number;
}

export async function transmitirPendientes(): Promise<ResumenTransmision> {
  const resumen: ResumenTransmision = { estudios: 0, enviadas: 0, registradas: 0, rechazadas: 0, inciertas: 0, pendientes: 0, saltados: [] };

  // Los poderes caducan con o sin transmisión configurada: se revisan siempre.
  const adminCaducidades = getSupabaseAdmin();
  if (adminCaducidades) {
    try { await revisarCaducidades(adminCaducidades); } catch (e) {
      Sentry.captureException(e, { tags: { area: 'verifactu', paso: 'caducidades' } });
    }
  }

  const falta = queFaltaParaTransmitir();
  if (falta.length > 0) {
    // No es un error: es el estado normal hasta que haya certificado. Las
    // facturas siguen numeradas, encadenadas y con su registro; solo esperan.
    return { ...resumen, motivo: `Sin configurar: falta ${falta.join(', ')}` };
  }
  if (entornoTransmision() !== 'produccion') {
    return { ...resumen, motivo: 'Preproducción: el cron no manda registros de estudios. Las pruebas van con scripts/verifactu-preproduccion.ts y el NIF propio del apoderado.' };
  }

  const admin = getSupabaseAdmin();
  if (!admin) return { ...resumen, motivo: 'Service role no configurada' };
  const certificado = certificadoDeEntorno();
  const destino = destinoDeEntorno();
  const productor = productorDeConfig();
  if (!certificado || !destino || !productor) return { ...resumen, motivo: 'Sin certificado, destino o productor' };

  // RD 1007/2023 art. 13: el sistema tiene que estar certificado por su
  // productor en ESTA versión. Sin declaración suscrita, no sale nada.
  if (!(await declaracionVigente(admin, SIF.version))) {
    return { ...resumen, motivo: `Declaración responsable sin suscribir para la versión ${SIF.version} (/interno/verifactu)` };
  }

  if (!(await adquirirCerrojo(admin))) return { ...resumen, motivo: 'Ya hay una transmisión en curso' };

  const ctx: Contexto = { admin, certificado, destino, productor, resumen, esperaMs: 0, inicio: Date.now() };
  try {
    const { data: activos, error } = await admin.from('verifactu_registros')
      .select('studio_id').in('estado', ACTIVOS).limit(5000);
    if (error) {
      Sentry.captureException(error, { tags: { area: 'verifactu', paso: 'leer-cola' } });
      return { ...resumen, motivo: 'No se pudo leer la cola' };
    }
    const estudios = [...new Set((activos ?? []).map(r => r.studio_id as string))];
    resumen.estudios = estudios.length;

    for (const studioId of estudios) {
      if (Date.now() - ctx.inicio + ctx.esperaMs > PRESUPUESTO_MS) {
        resumen.saltados.push(`${studioId}: sin tiempo en este cron, queda para el siguiente`);
        continue;
      }
      const hab = await estudioHabilitado(admin, studioId);
      if (!hab.habilitado) {
        resumen.saltados.push(`${studioId}: no habilitado (${hab.motivo})`);
        continue;
      }
      const seguir = await procesarEstudio(ctx, studioId);
      if (seguir === 'PARAR_TODO') break;
    }
    return resumen;
  } finally {
    await liberarCerrojo(admin);
  }
}

/**
 * Cuántas «facturaciones» tiene en Tentare la propietaria de este estudio:
 * estudios suyos que facturan (tienen al menos un registro). Es lo que decide
 * `IndicadorMultiplesOT` (FAQ de desarrolladores de la AEAT, §4: por usuario
 * del SaaS, sin mirar el estado de cada facturación).
 */
export async function contarFacturaciones(admin: SupabaseClient, studioId: string): Promise<number> {
  const { data: estudio } = await admin.from('studios').select('owner_auth_user_id').eq('id', studioId).maybeSingle();
  const owner = estudio?.owner_auth_user_id as string | null | undefined;
  if (!owner) return 1;
  const { data: suyos } = await admin.from('studios').select('id').eq('owner_auth_user_id', owner);
  const ids = (suyos ?? []).map(s => s.id as string);
  // Una facturación «creada» = un estudio suyo dado de alta en Veri*Factu o con
  // algún registro, esté como esté (la FAQ dice «independientemente del estado»).
  const { data: altas } = await admin.from('verifactu_estudios').select('studio_id').in('studio_id', ids);
  const conAlta = new Set((altas ?? []).map(a => a.studio_id as string));
  let n = 0;
  for (const id of ids) {
    if (id === studioId || conAlta.has(id)) { n += 1; continue; }
    const { count } = await admin.from('verifactu_registros').select('id', { count: 'exact', head: true }).eq('studio_id', id);
    if ((count ?? 0) > 0) n += 1;
  }
  return n;
}

/** El bloque SistemaInformatico de los registros de UN estudio. */
async function sistemaDeEstudio(admin: SupabaseClient, productor: Productor, studioId: string): Promise<SistemaInformatico> {
  // El número de instalación se guardó al dar de alta el estudio y no se
  // recalcula: es parte de la identidad del SIF ante la AEAT.
  const { data: vf } = await admin.from('verifactu_estudios').select('numero_instalacion').eq('studio_id', studioId).maybeSingle();
  const instalacion = (vf?.numero_instalacion as string | null) ?? numeroInstalacionDeEstudio(studioId);
  return sistemaInformaticoParaEstudio(productor, instalacion, await contarFacturaciones(admin, studioId));
}

async function procesarEstudio(ctx: Contexto, studioId: string): Promise<'SEGUIR' | 'PARAR_TODO'> {
  const { admin, resumen } = ctx;

  await completarReservasHuerfanas(admin, studioId);

  // ENVIANDO de una ejecución que murió: no sabemos si llegó → INCIERTO.
  const huerfanoAntes = new Date(Date.now() - ENVIANDO_HUERFANO_MS).toISOString();
  await admin.from('verifactu_registros')
    .update({ estado: 'INCIERTO', codigo_error: 'ENVIO_INTERRUMPIDO', actualizado_en: new Date().toISOString() })
    .eq('studio_id', studioId).eq('estado', 'ENVIANDO').lt('actualizado_en', huerfanoAntes);

  const sistema = await sistemaDeEstudio(admin, ctx.productor, studioId);
  const prep = await prepararRegistros(admin, studioId, sistema);
  for (const r of prep.rechazados) {
    resumen.rechazadas += 1;
    Sentry.captureMessage('Veri*Factu: registro inválido en local, no se envía', {
      level: 'warning', tags: { area: 'verifactu', studio: studioId }, extra: { registro: r.id, numero: r.numSerie, motivo: r.motivo },
    });
  }

  const { data: cadena } = await admin.from('verifactu_registros')
    .select('id, seq, tipo, estado, num_serie, fecha_expedicion, proximo_intento_en')
    .eq('studio_id', studioId).order('seq', { ascending: true }).limit(20000);
  const cola: RegistroCola[] = (cadena ?? []).map(r => ({
    id: r.id as string, seq: Number(r.seq), tipo: r.tipo as RegistroCola['tipo'], estado: r.estado as EstadoRegistroVerifactu,
    numSerieFactura: r.num_serie as string, fechaExpedicion: r.fecha_expedicion as string,
    proximoIntentoEn: (r.proximo_intento_en as string | null) ?? null,
  }));

  const decision = decidirLote(cola);
  if (decision.tipo === 'NADA') return 'SEGUIR';
  if (decision.tipo === 'ESPERAR') {
    resumen.saltados.push(`${studioId}: espera (${decision.motivo})`);
    return 'SEGUIR';
  }

  const nombreObligado = await nombreFiscalDeEstudio(admin, studioId);

  if (ctx.esperaMs > 0) await sleep(ctx.esperaMs);

  if (decision.tipo === 'CONCILIAR') {
    return conciliar(ctx, studioId, decision.registro.id, nombreObligado);
  }

  // ── ENVIAR ────────────────────────────────────────────────────────────────
  const ids = decision.lote.map(r => r.id);
  const { data: filas } = await admin.from('verifactu_registros').select(COLS_REGISTRO).in('id', ids);
  const porId = new Map(((filas ?? []) as unknown as FilaRegistro[]).map(f => [f.id, f]));
  const lote = decision.lote.map(r => porId.get(r.id)).filter((f): f is FilaRegistro => !!f && !!f.xml_registro);
  if (lote.length !== decision.lote.length) {
    resumen.saltados.push(`${studioId}: lote incompleto (falta XML), se reintenta`);
    return 'SEGUIR';
  }
  // Un sobre = un obligado: el emisor de los registros (no el NIF de hoy del estudio).
  const nifObligado = lote[0].id_emisor;
  if (lote.some(r => r.id_emisor !== nifObligado)) {
    resumen.saltados.push(`${studioId}: registros con distinto emisor en la cadena; se envía solo el primero`);
    lote.splice(1);
  }

  const sobre = sobreSoapRegFactu({ obligado: { nombreRazon: nombreObligado, nif: nifObligado }, registros: lote.map(r => r.xml_registro as string) });

  // 1) El envío queda anotado ANTES de la conexión.
  const { data: envio, error: eEnvio } = await admin.from('verifactu_envios').insert({
    studio_id: studioId, nif_obligado: nifObligado, operacion: 'REG_FACTU', entorno: ctx.destino.entorno,
    endpoint: endpointVerifactu(ctx.destino), certificado_sha256: huellaCredencial(ctx.certificado),
    n_registros: lote.length, request_xml: sobre, request_sha256: sha256Texto(sobre),
  }).select('id').single();
  if (eEnvio || !envio) {
    Sentry.captureException(eEnvio ?? new Error('sin envío'), { tags: { area: 'verifactu', paso: 'anotar-envio' } });
    return 'SEGUIR';
  }
  const envioId = envio.id as string;

  // 2) Reclamo atómico: solo lo que siga LISTO/REINTENTAR pasa a ENVIANDO.
  const intentosPrevios = new Map(lote.map(r => [r.id, r.intentos]));
  const reclamados: string[] = [];
  for (const r of lote) {
    const { data: ok } = await admin.from('verifactu_registros')
      .update({ estado: 'ENVIANDO', envio_id: envioId, intentos: r.intentos + 1, actualizado_en: new Date().toISOString() })
      .eq('id', r.id).in('estado', ['LISTO', 'REINTENTAR']).select('id');
    if (ok?.length) reclamados.push(r.id);
  }
  if (reclamados.length !== lote.length) {
    // Alguien más tocó el lote (no debería: hay cerrojo). No se manda nada; lo
    // reclamado vuelve a LISTO, que es seguro porque no salió.
    if (reclamados.length) {
      await admin.from('verifactu_registros').update({ estado: 'LISTO', envio_id: null }).in('id', reclamados).eq('envio_id', envioId);
    }
    await admin.from('verifactu_envios').update({ terminado_en: new Date().toISOString(), error: 'Reclamo incompleto: no se envió' }).eq('id', envioId);
    resumen.saltados.push(`${studioId}: no se pudo reclamar el lote entero`);
    return 'SEGUIR';
  }

  // 3) La llamada.
  const llamada = await llamarAeat(sobre, ctx.certificado, ctx.destino);
  const plan = planificarResultado(
    lote.map(r => ({ id: r.id, numSerieFactura: r.num_serie, tipo: r.tipo, intentos: intentosPrevios.get(r.id) ?? 0 })),
    llamada,
  );
  resumen.enviadas += lote.length;
  ctx.esperaMs = plan.esperaMs;

  await admin.from('verifactu_envios').update({
    terminado_en: llamada.terminadoEn.toISOString(), http_status: plan.envio.httpStatus,
    fallo_transporte: plan.envio.falloTransporte, estado_envio: plan.envio.estadoEnvio, fault_codigo: plan.envio.faultCodigo,
    respuesta_xml: llamada.cuerpo || null, csv: plan.envio.csv, tiempo_espera_s: plan.envio.tiempoEsperaS, error: plan.envio.error,
  }).eq('id', envioId);

  // 4) Aplicar: compare-and-set sobre ENVIANDO de ESTE envío.
  for (const c of plan.registros) {
    const fila = porId.get(c.id);
    const campos: Record<string, unknown> = {
      estado: c.estado, codigo_error: c.codigoError, descripcion_error: c.descripcionError,
      estado_duplicado: c.estadoDuplicado, proximo_intento_en: c.proximoIntentoEn?.toISOString() ?? null,
      actualizado_en: new Date().toISOString(),
    };
    if (c.csv) campos.csv = c.csv;
    // LISTO (sin poder / suspensión) suelta el envío para poder reclamarlo otra vez.
    if (c.estado === 'LISTO') campos.envio_id = null;
    await admin.from('verifactu_registros').update(campos).eq('id', c.id).eq('estado', 'ENVIANDO').eq('envio_id', envioId);
    if (fila && fila.tipo !== 'ANULACION') await sincronizarFactura(admin, fila.factura_id, c.estado, c.csv);
    if (fila && fila.tipo === 'ANULACION' && (c.estado === 'REGISTRADA' || c.estado === 'ACEPTADA_CON_ERRORES')) {
      await admin.from('facturas').update({ verifactu_estado: 'ANULADA' }).eq('id', fila.factura_id);
    }

    if (c.estado === 'REGISTRADA' || c.estado === 'ACEPTADA_CON_ERRORES' || c.estado === 'ANULADA_EN_AEAT') resumen.registradas += 1;
    else if (c.estado === 'RECHAZADA') {
      resumen.rechazadas += 1;
      Sentry.captureMessage('Veri*Factu: registro rechazado por la AEAT', {
        level: 'warning', tags: { area: 'verifactu', studio: studioId },
        extra: { registro: c.id, numero: fila?.num_serie, codigo: c.codigoError },
      });
      if (fila) {
        const { emitirFacturaRechazadaAeat } = await import('@/lib/notifications/emit');
        await emitirFacturaRechazadaAeat(admin, {
          studioId, facturaId: fila.factura_id, numero: fila.num_serie,
          motivo: [c.codigoError, c.descripcionError].filter(Boolean).join(' · ') || null,
        });
      }
    } else if (c.estado === 'INCIERTO') resumen.inciertas += 1;
    else resumen.pendientes += 1;
  }

  if (plan.pausarEstudio) {
    Sentry.captureMessage('Veri*Factu: estudio pausado por la AEAT', {
      level: 'error', tags: { area: 'verifactu', studio: studioId }, extra: { fault: plan.envio.faultCodigo, clase: plan.claseFault },
    });
    await pausarEstudio(admin, studioId, `${plan.claseFault ?? 'FAULT'} ${plan.envio.faultCodigo ?? ''}`.trim(), { sinPoder: plan.claseFault === 'SIN_PODER' });
  }
  if (plan.suspenderTodo) {
    await suspenderPorAeat(admin, `AEAT ${plan.envio.faultCodigo ?? ''}: ${plan.envio.error ?? ''}`.trim());
    Sentry.captureMessage('Veri*Factu: la AEAT ha suspendido o no habilita el acceso; se para toda la transmisión', {
      level: 'fatal', tags: { area: 'verifactu' }, extra: { fault: plan.envio.faultCodigo },
    });
    return 'PARAR_TODO';
  }
  return 'SEGUIR';
}

/** INCIERTO → preguntar a la AEAT si lo tiene, en vez de reenviar a ciegas. */
async function conciliar(ctx: Contexto, studioId: string, registroId: string, nombreObligado: string): Promise<'SEGUIR' | 'PARAR_TODO'> {
  const { admin, resumen } = ctx;
  const { data } = await admin.from('verifactu_registros').select(COLS_REGISTRO).eq('id', registroId).maybeSingle();
  if (!data) return 'SEGUIR';
  const r = data as unknown as FilaRegistro;
  const { ejercicio, periodo } = periodoDeFecha(r.fecha_expedicion);
  const sobre = sobreSoapConsulta({ obligado: { nombreRazon: nombreObligado, nif: r.id_emisor }, ejercicio, periodo, numSerieFactura: r.num_serie });

  const { data: envio } = await admin.from('verifactu_envios').insert({
    studio_id: studioId, nif_obligado: r.id_emisor, operacion: 'CONSULTA', entorno: ctx.destino.entorno,
    endpoint: endpointVerifactu(ctx.destino), certificado_sha256: huellaCredencial(ctx.certificado),
    n_registros: 0, request_xml: sobre, request_sha256: sha256Texto(sobre),
  }).select('id').single();

  const llamada = await llamarAeat(sobre, ctx.certificado, ctx.destino);
  // La consulta también cuenta para el control de flujo (ámbito NO CONFIRMADO: prudencia).
  ctx.esperaMs = 60_000;
  const respuesta = llamada.fallo ? null : parsearRespuestaConsulta(llamada.cuerpo);
  if (envio) {
    await admin.from('verifactu_envios').update({
      terminado_en: llamada.terminadoEn.toISOString(), http_status: llamada.status, fallo_transporte: llamada.fallo,
      estado_envio: respuesta?.fault ? 'FAULT' : null, fault_codigo: respuesta?.faultCodigo ?? null,
      respuesta_xml: llamada.cuerpo || null, error: llamada.error ?? respuesta?.faultMensaje ?? null,
    }).eq('id', envio.id);
  }
  if (!respuesta) {
    resumen.inciertas += 1;
    return 'SEGUIR';
  }
  const res = resolverConsulta({ tipo: r.tipo, numSerieFactura: r.num_serie, huella: r.huella ?? '' }, respuesta);
  await admin.from('verifactu_registros').update({
    estado: res.estado, revision_manual: res.revisionManual, descripcion_error: res.motivo,
    envio_id: res.estado === 'LISTO' ? null : r.envio_id, actualizado_en: new Date().toISOString(),
  }).eq('id', registroId).eq('estado', 'INCIERTO');
  if (r.tipo !== 'ANULACION') await sincronizarFactura(admin, r.factura_id, res.estado, null);
  if (res.estado === 'INCIERTO') resumen.inciertas += 1;
  else if (res.estado === 'LISTO') resumen.pendientes += 1;
  else resumen.registradas += 1;
  if (respuesta.fault && (respuesta.faultCodigo === '4141' || respuesta.faultCodigo === '4139')) {
    await suspenderPorAeat(admin, `AEAT ${respuesta.faultCodigo}: ${respuesta.faultMensaje ?? ''}`.trim());
    return 'PARAR_TODO';
  }
  if (respuesta.fault && (respuesta.faultCodigo === '4112' || respuesta.faultCodigo === '4140' || respuesta.faultCodigo === '4132')) {
    await pausarEstudio(admin, studioId, `SIN_PODER ${respuesta.faultCodigo}`, { sinPoder: true });
  }
  return 'SEGUIR';
}
