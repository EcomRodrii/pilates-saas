import { supabase } from '@/lib/supabase';

const STUDIO_ID = 'studio-1';

// ─── Global DB error reporting ───────────────────────────────────────────────
// Write helpers are fire-and-forget; when a write fails we log to console AND
// notify any registered listener (the UI) so the failure is visible to the user
// instead of silently lost.
type DbErrorListener = (tag: string, error: unknown) => void;
let dbErrorListener: DbErrorListener | null = null;

export function setDbErrorListener(fn: DbErrorListener | null) {
  dbErrorListener = fn;
}

function reportDbError(tag: string, error: unknown) {
  console.error(tag, error);
  try {
    dbErrorListener?.(tag, error);
  } catch {
    /* never let the listener break a write */
  }
}

// ─── Mappers: DB (snake_case) → TS (camelCase) ───────────────────────────────

function mapStudio(r: any) {
  return {
    id: r.id,
    nombre: r.nombre,
    nif: r.nif,
    razonSocial: r.razon_social,
    direccion: r.direccion,
    ciudad: r.ciudad,
    codigoPostal: r.codigo_postal,
    email: r.email,
    telefono: r.telefono,
    colorPrimario: r.color_primario,
    plan: r.plan,
    avatarAdmin: r.avatar_admin ?? null,
    creadoEn: r.creado_en,
  };
}

function mapUsuario(r: any) {
  return {
    id: r.id,
    studioId: r.studio_id,
    rol: r.rol,
    nombre: r.nombre,
    email: r.email,
    telefono: r.telefono ?? null,
    avatarUrl: r.avatar_url ?? null,
  };
}

function mapSocio(r: any) {
  const aceptacionContrato =
    r.aceptacion_fecha
      ? {
          fecha: r.aceptacion_fecha,
          firma: r.aceptacion_firma ?? '',
          versionTexto: r.aceptacion_version ?? '',
        }
      : undefined;

  return {
    id: r.id,
    studioId: r.studio_id,
    nombre: r.nombre,
    apellidos: r.apellidos,
    email: r.email,
    telefono: r.telefono ?? null,
    nif: r.nif ?? null,
    fechaAlta: r.fecha_alta,
    activo: r.activo,
    leadStage: r.lead_stage ?? undefined,
    tags: r.tags ?? undefined,
    aceptacionContrato,
    avatar: r.avatar ?? null,
  };
}

function mapPlanTarifa(r: any) {
  return {
    id: r.id,
    studioId: r.studio_id,
    nombre: r.nombre,
    descripcion: r.descripcion ?? null,
    precio: r.precio,
    tipo: r.tipo,
    sesiones: r.sesiones ?? null,
    activo: r.activo,
  };
}

function mapSuscripcion(r: any) {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    planId: r.plan_id,
    estado: r.estado,
    fechaInicio: r.fecha_inicio,
    fechaFin: r.fecha_fin ?? null,
    sesionesRestantes: r.sesiones_restantes ?? null,
    stripeSubscriptionId: r.stripe_subscription_id ?? null,
  };
}

function mapSala(r: any) {
  return {
    id: r.id,
    studioId: r.studio_id,
    nombre: r.nombre,
    capacidad: r.capacidad,
    color: r.color,
  };
}

function mapSpot(r: any) {
  return {
    id: r.id,
    salaId: r.sala_id,
    studioId: r.studio_id,
    numero: r.numero,
    nombre: r.nombre,
    fila: r.fila,
    columna: r.columna,
    tipo: r.tipo,
    activo: r.activo,
  };
}

function mapTipoClase(r: any) {
  return {
    id: r.id,
    studioId: r.studio_id,
    nombre: r.nombre,
    color: r.color,
    duracionMinutos: r.duracion_minutos,
    descripcion: r.descripcion ?? null,
    nivel: r.nivel,
  };
}

function mapInstructor(r: any) {
  return {
    id: r.id,
    studioId: r.studio_id,
    nombre: r.nombre,
    email: r.email ?? null,
    telefono: r.telefono ?? null,
    color: r.color,
    activo: r.activo,
    avatar: r.avatar ?? null,
  };
}

function mapSesion(r: any) {
  return {
    id: r.id,
    studioId: r.studio_id,
    tipoClaseId: r.tipo_clase_id,
    salaId: r.sala_id,
    instructorId: r.instructor_id,
    inicio: r.inicio,
    fin: r.fin,
    aforoMaximo: r.aforo_maximo,
    cancelada: r.cancelada,
    notas: r.notas ?? null,
    precioPuntual: r.precio_puntual ?? null,
  };
}

function mapReserva(r: any) {
  return {
    id: r.id,
    studioId: r.studio_id,
    sesionId: r.sesion_id,
    socioId: r.socio_id,
    estado: r.estado,
    spotId: r.spot_id ?? null,
    posicionEspera: r.posicion_espera ?? null,
    checkInEn: r.check_in_en ?? null,
    creadoEn: r.creado_en,
  };
}

function mapRecibo(r: any) {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    suscripcionId: r.suscripcion_id ?? null,
    concepto: r.concepto,
    importe: r.importe,
    estado: r.estado,
    fechaVencimiento: r.fecha_vencimiento,
    fechaCobro: r.fecha_cobro ?? null,
    fechaDevolucion: r.fecha_devolucion ?? null,
    intentosReintento: r.intentos_reintento,
  };
}

function mapFactura(r: any) {
  return {
    id: r.id,
    studioId: r.studio_id,
    reciboId: r.recibo_id,
    numeroCompleto: r.numero_completo,
    fechaEmision: r.fecha_emision,
    receptorNombre: r.receptor_nombre,
    receptorNIF: r.receptor_nif ?? null,
    baseImponible: r.base_imponible,
    tipoIVA: r.tipo_iva,
    cuotaIVA: r.cuota_iva,
    total: r.total,
    verifactuHash: r.verifactu_hash ?? null,
  };
}

function mapCita(r: any) {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    instructorId: r.instructor_id,
    tipo: r.tipo,
    inicio: r.inicio,
    fin: r.fin,
    notas: r.notas ?? null,
    estado: r.estado,
    precio: r.precio ?? null,
    creadoEn: r.creado_en,
  };
}

function mapProductoPOS(r: any) {
  return {
    id: r.id,
    studioId: r.studio_id,
    nombre: r.nombre,
    categoria: r.categoria,
    precio: r.precio,
    activo: r.activo,
  };
}

function mapVentaPOS(r: any) {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id ?? null,
    items: r.items ?? [],
    subtotal: r.subtotal,
    descuento: r.descuento,
    total: r.total,
    metodoPago: r.metodo_pago,
    notas: r.notas ?? null,
    realizadaEn: r.realizada_en,
  };
}

function mapIntegracion(r: any) {
  return {
    id: r.id,
    studioId: r.studio_id,
    tipo: r.tipo,
    activo: r.activo,
    config: r.config ?? {},
    actualizadoEn: r.actualizado_en,
  };
}

function mapCampana(r: any) {
  return {
    id: r.id,
    studioId: r.studio_id,
    nombre: r.nombre,
    tipo: r.tipo,
    asunto: r.asunto,
    contenido: r.contenido,
    estado: r.estado,
    destinatarios: r.destinatarios,
    enviados: r.enviados,
    abiertos: r.abiertos,
    clics: r.clics,
    creadaEn: r.creada_en,
    enviadaEn: r.enviada_en ?? null,
    programadaEn: r.programada_en ?? null,
  };
}

function mapAutomatizacion(r: any) {
  return {
    id: r.id,
    studioId: r.studio_id,
    nombre: r.nombre,
    trigger: r.trigger,
    accion: r.accion,
    asunto: r.asunto,
    mensaje: r.mensaje,
    activa: r.activa,
    ejecutadas: r.ejecutadas,
    creadaEn: r.creada_en,
  };
}

function mapAutomationRule(r: any) {
  return {
    id: r.id,
    studioId: r.studio_id,
    nombre: r.nombre,
    descripcion: r.descripcion,
    icono: r.icono,
    trigger: r.trigger,
    condicion: r.condicion ?? {},
    pasos: r.pasos ?? [],
    activa: r.activa,
    ejecutadaVeces: r.ejecutada_veces,
    ultimaEjecucion: r.ultima_ejecucion ?? null,
    creadaEn: r.creada_en,
  };
}

function mapAutomationLog(r: any) {
  return {
    id: r.id,
    studioId: r.studio_id,
    ruleId: r.rule_id,
    ruleName: r.rule_name,
    socioId: r.socio_id ?? null,
    socioNombre: r.socio_nombre ?? null,
    pasoIndex: r.paso_index,
    accion: r.accion,
    resultado: r.resultado,
    detalle: r.detalle,
    ejecutadoEn: r.ejecutado_en,
    proximaAccionEn: r.proxima_accion_en ?? null,
  };
}

function mapNotaProgreso(r: any) {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    instructorId: r.instructor_id,
    sesionId: r.sesion_id ?? null,
    textoLibre: r.texto_libre,
    progreso: r.progreso ?? null,
    alertas: r.alertas ?? null,
    planProximaSesion: r.plan_proxima_sesion ?? null,
    ejerciciosCasa: r.ejercicios_casa ?? null,
    creadaEn: r.creada_en,
  };
}

function mapCodigoDescuento(r: any) {
  return {
    id: r.id,
    studioId: r.studio_id,
    codigo: r.codigo,
    descripcion: r.descripcion,
    tipo: r.tipo,
    valor: r.valor,
    usos: r.usos,
    usosMax: r.usos_max ?? null,
    expira: r.expira ?? null,
    activo: r.activo,
    creadoEn: r.creado_en,
  };
}

function mapActividadReciente(r: any) {
  return {
    id: r.id,
    studioId: r.studio_id,
    tipo: r.tipo,
    texto: r.texto,
    socioId: r.socio_id ?? null,
    enlace: r.enlace ?? null,
    creadoEn: r.creado_en,
  };
}

function mapNotificacion(r: any) {
  return {
    id: r.id,
    studioId: r.studio_id,
    titulo: r.titulo,
    texto: r.texto,
    leida: r.leida,
    tipo: r.tipo,
    enlace: r.enlace ?? null,
    creadaEn: r.creada_en,
  };
}

function mapVideoOnDemand(r: any) {
  return {
    id: r.id,
    studioId: r.studio_id,
    titulo: r.titulo,
    descripcion: r.descripcion ?? null,
    categoria: r.categoria,
    duracionMinutos: r.duracion_minutos,
    nivel: r.nivel,
    instructorId: r.instructor_id,
    vistas: r.vistas,
    likes: r.likes,
    activo: r.activo,
    creadoEn: r.creado_en,
  };
}

function mapPostComunidad(r: any) {
  return {
    id: r.id,
    studioId: r.studio_id,
    autorId: r.autor_id ?? null,
    autorNombre: r.autor_nombre,
    autorInicial: r.autor_inicial,
    texto: r.texto,
    likes: r.likes,
    comentariosCount: r.comentarios_count,
    fijado: r.fijado,
    creadoEn: r.creado_en,
  };
}

function mapNotaInterna(r: any) {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    texto: r.texto,
    tipo: r.tipo,
    creadoEn: r.creado_en,
  };
}

// ─── Fetch all studio data in parallel ───────────────────────────────────────

export async function fetchAllStudioData() {
  const [
    studioRes,
    usuariosRes,
    sociosRes,
    planesTarifaRes,
    suscripcionesRes,
    salasRes,
    spotsRes,
    tiposClaseRes,
    instructoresRes,
    sesionesRes,
    reservasRes,
    recibosRes,
    facturasRes,
    citasRes,
    productosPOSRes,
    ventasPOSRes,
    campanasRes,
    automatizacionesRes,
    automationRulesRes,
    automationLogsRes,
    notasProgresoRes,
    codigosDescuentoRes,
    actividadRecienteRes,
    notificacionesRes,
    videosOnDemandRes,
    postsComunidadRes,
    notasInternasRes,
    integracionesRes,
  ] = await Promise.all([
    supabase.from('studios').select('*').eq('id', STUDIO_ID).single(),
    supabase.from('usuarios').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('socios').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('planes_tarifa').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('suscripciones').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('salas').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('spots').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('tipos_clase').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('instructores').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('sesiones').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('reservas').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('recibos').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('facturas').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('citas').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('productos_pos').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('ventas_pos').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('campanas').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('automatizaciones').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('automation_rules').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('automation_logs').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('notas_progreso').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('codigos_descuento').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('actividad_reciente').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('notificaciones').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('videos_on_demand').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('posts_comunidad').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('notas_internas').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('integraciones').select('*').eq('studio_id', STUDIO_ID),
  ]);

  return {
    studio: studioRes.data ? mapStudio(studioRes.data) : null,
    usuarios: (usuariosRes.data ?? []).map(mapUsuario),
    socios: (sociosRes.data ?? []).map(mapSocio),
    planesTarifa: (planesTarifaRes.data ?? []).map(mapPlanTarifa),
    suscripciones: (suscripcionesRes.data ?? []).map(mapSuscripcion),
    salas: (salasRes.data ?? []).map(mapSala),
    spots: (spotsRes.data ?? []).map(mapSpot),
    tiposClase: (tiposClaseRes.data ?? []).map(mapTipoClase),
    instructores: (instructoresRes.data ?? []).map(mapInstructor),
    sesiones: (sesionesRes.data ?? []).map(mapSesion),
    reservas: (reservasRes.data ?? []).map(mapReserva),
    recibos: (recibosRes.data ?? []).map(mapRecibo),
    facturas: (facturasRes.data ?? []).map(mapFactura),
    citas: (citasRes.data ?? []).map(mapCita),
    productosPOS: (productosPOSRes.data ?? []).map(mapProductoPOS),
    ventasPOS: (ventasPOSRes.data ?? []).map(mapVentaPOS),
    campanas: (campanasRes.data ?? []).map(mapCampana),
    automatizaciones: (automatizacionesRes.data ?? []).map(mapAutomatizacion),
    automationRules: (automationRulesRes.data ?? []).map(mapAutomationRule),
    automationLogs: (automationLogsRes.data ?? []).map(mapAutomationLog),
    notasProgreso: (notasProgresoRes.data ?? []).map(mapNotaProgreso),
    codigosDescuento: (codigosDescuentoRes.data ?? []).map(mapCodigoDescuento),
    actividadReciente: (actividadRecienteRes.data ?? []).map(mapActividadReciente),
    notificaciones: (notificacionesRes.data ?? []).map(mapNotificacion),
    videosOnDemand: (videosOnDemandRes.data ?? []).map(mapVideoOnDemand),
    postsComunidad: (postsComunidadRes.data ?? []).map(mapPostComunidad),
    notasInternas: (notasInternasRes.data ?? []).map(mapNotaInterna),
    integraciones: (integracionesRes.data ?? []).map(mapIntegracion),
  };
}

// ─── Mappers: TS (camelCase) → DB (snake_case) ───────────────────────────────

function socioToDb(socio: any) {
  const { aceptacionContrato, studioId, fechaAlta, leadStage, ...rest } = socio;
  return {
    ...rest,
    studio_id: studioId ?? STUDIO_ID,
    fecha_alta: fechaAlta,
    lead_stage: leadStage ?? null,
    aceptacion_fecha: aceptacionContrato?.fecha ?? null,
    aceptacion_firma: aceptacionContrato?.firma ?? null,
    aceptacion_version: aceptacionContrato?.versionTexto ?? null,
  };
}

function suscripcionToDb(sus: any) {
  return {
    id: sus.id,
    studio_id: sus.studioId ?? STUDIO_ID,
    socio_id: sus.socioId,
    plan_id: sus.planId,
    estado: sus.estado,
    fecha_inicio: sus.fechaInicio,
    fecha_fin: sus.fechaFin ?? null,
    sesiones_restantes: sus.sesionesRestantes ?? null,
    stripe_subscription_id: sus.stripeSubscriptionId ?? null,
  };
}

function sesionToDb(ses: any) {
  return {
    id: ses.id,
    studio_id: ses.studioId ?? STUDIO_ID,
    tipo_clase_id: ses.tipoClaseId,
    sala_id: ses.salaId,
    instructor_id: ses.instructorId,
    inicio: ses.inicio,
    fin: ses.fin,
    aforo_maximo: ses.aforoMaximo,
    cancelada: ses.cancelada,
    notas: ses.notas ?? null,
    precio_puntual: ses.precioPuntual ?? null,
  };
}

function reservaToDb(res: any) {
  return {
    id: res.id,
    studio_id: res.studioId ?? STUDIO_ID,
    sesion_id: res.sesionId,
    socio_id: res.socioId,
    estado: res.estado,
    spot_id: res.spotId ?? null,
    posicion_espera: res.posicionEspera ?? null,
    check_in_en: res.checkInEn ?? null,
    creado_en: res.creadoEn,
  };
}

function reciboToDb(rec: any) {
  return {
    id: rec.id,
    studio_id: rec.studioId ?? STUDIO_ID,
    socio_id: rec.socioId,
    suscripcion_id: rec.suscripcionId ?? null,
    concepto: rec.concepto,
    importe: rec.importe,
    estado: rec.estado,
    fecha_vencimiento: rec.fechaVencimiento,
    fecha_cobro: rec.fechaCobro ?? null,
    fecha_devolucion: rec.fechaDevolucion ?? null,
    intentos_reintento: rec.intentosReintento,
  };
}

function facturaToDb(fac: any) {
  return {
    id: fac.id,
    studio_id: fac.studioId ?? STUDIO_ID,
    recibo_id: fac.reciboId,
    numero_completo: fac.numeroCompleto,
    fecha_emision: fac.fechaEmision,
    receptor_nombre: fac.receptorNombre,
    receptor_nif: fac.receptorNIF ?? null,
    base_imponible: fac.baseImponible,
    tipo_iva: fac.tipoIVA,
    cuota_iva: fac.cuotaIVA,
    total: fac.total,
    verifactu_hash: fac.verifactuHash ?? null,
  };
}

function citaToDb(cita: any) {
  return {
    id: cita.id,
    studio_id: cita.studioId ?? STUDIO_ID,
    socio_id: cita.socioId,
    instructor_id: cita.instructorId,
    tipo: cita.tipo,
    inicio: cita.inicio,
    fin: cita.fin,
    notas: cita.notas ?? null,
    estado: cita.estado,
    precio: cita.precio ?? null,
    creado_en: cita.creadoEn,
  };
}

function ventaPOSToDb(venta: any) {
  return {
    id: venta.id,
    studio_id: venta.studioId ?? STUDIO_ID,
    socio_id: venta.socioId ?? null,
    items: venta.items ?? [],
    subtotal: venta.subtotal,
    descuento: venta.descuento,
    total: venta.total,
    metodo_pago: venta.metodoPago,
    notas: venta.notas ?? null,
    realizada_en: venta.realizadaEn,
  };
}

function actividadRecienteToDb(act: any) {
  return {
    id: act.id,
    studio_id: act.studioId ?? STUDIO_ID,
    tipo: act.tipo,
    texto: act.texto,
    socio_id: act.socioId ?? null,
    enlace: act.enlace ?? null,
    creado_en: act.creadoEn,
  };
}

function notaInternaToDb(nota: any) {
  return {
    id: nota.id,
    studio_id: nota.studioId ?? STUDIO_ID,
    socio_id: nota.socioId,
    texto: nota.texto,
    tipo: nota.tipo,
    creado_en: nota.creadoEn,
  };
}

function campanaToDb(c: any) {
  return {
    id: c.id,
    studio_id: c.studioId ?? STUDIO_ID,
    nombre: c.nombre,
    tipo: c.tipo,
    asunto: c.asunto,
    contenido: c.contenido,
    estado: c.estado,
    destinatarios: c.destinatarios,
    enviados: c.enviados,
    abiertos: c.abiertos,
    clics: c.clics,
    creada_en: c.creadaEn,
    enviada_en: c.enviadaEn ?? null,
    programada_en: c.programadaEn ?? null,
  };
}

function automatizacionToDb(a: any) {
  return {
    id: a.id,
    studio_id: a.studioId ?? STUDIO_ID,
    nombre: a.nombre,
    trigger: a.trigger,
    accion: a.accion,
    asunto: a.asunto ?? null,
    mensaje: a.mensaje,
    activa: a.activa,
    ejecutadas: a.ejecutadas,
    creada_en: a.creadaEn,
  };
}

function videoOnDemandToDb(v: any) {
  return {
    id: v.id,
    studio_id: v.studioId ?? STUDIO_ID,
    titulo: v.titulo,
    descripcion: v.descripcion ?? null,
    categoria: v.categoria,
    duracion_minutos: v.duracionMinutos,
    nivel: v.nivel,
    instructor_id: v.instructorId,
    vistas: v.vistas,
    likes: v.likes,
    activo: v.activo,
    creado_en: v.creadoEn,
  };
}

function postComunidadToDb(p: any) {
  return {
    id: p.id,
    studio_id: p.studioId ?? STUDIO_ID,
    autor_id: p.autorId ?? null,
    autor_nombre: p.autorNombre,
    autor_inicial: p.autorInicial,
    texto: p.texto,
    likes: p.likes,
    comentarios_count: p.comentariosCount,
    fijado: p.fijado,
    creado_en: p.creadoEn,
  };
}

// ─── Write functions (fire-and-forget, errors logged to console) ──────────────

export async function dbInsertSocio(socio: any) {
  const { error } = await supabase.from('socios').insert(socioToDb(socio));
  if (error) reportDbError('[dbInsertSocio]', error);
}

export async function dbUpdateSocio(id: string, changes: any) {
  const db: any = {};
  if ('studioId' in changes) db.studio_id = changes.studioId;
  if ('nombre' in changes) db.nombre = changes.nombre;
  if ('apellidos' in changes) db.apellidos = changes.apellidos;
  if ('email' in changes) db.email = changes.email;
  if ('telefono' in changes) db.telefono = changes.telefono;
  if ('nif' in changes) db.nif = changes.nif;
  if ('fechaAlta' in changes) db.fecha_alta = changes.fechaAlta;
  if ('activo' in changes) db.activo = changes.activo;
  if ('leadStage' in changes) db.lead_stage = changes.leadStage;
  if ('tags' in changes) db.tags = changes.tags;
  if ('avatar' in changes) db.avatar = changes.avatar;
  if ('aceptacionContrato' in changes) {
    db.aceptacion_fecha = changes.aceptacionContrato?.fecha ?? null;
    db.aceptacion_firma = changes.aceptacionContrato?.firma ?? null;
    db.aceptacion_version = changes.aceptacionContrato?.versionTexto ?? null;
  }
  const { error } = await supabase.from('socios').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateSocio]', error);
}

export async function dbDeleteSocio(id: string) {
  const { error } = await supabase.from('socios').delete().eq('id', id);
  if (error) reportDbError('[dbDeleteSocio]', error);
}

export async function dbInsertSuscripcion(sus: any) {
  const { error } = await supabase.from('suscripciones').insert(suscripcionToDb(sus));
  if (error) reportDbError('[dbInsertSuscripcion]', error);
}

export async function dbUpdateSuscripcion(id: string, changes: any) {
  const db: any = {};
  if ('socioId' in changes) db.socio_id = changes.socioId;
  if ('planId' in changes) db.plan_id = changes.planId;
  if ('estado' in changes) db.estado = changes.estado;
  if ('fechaInicio' in changes) db.fecha_inicio = changes.fechaInicio;
  if ('fechaFin' in changes) db.fecha_fin = changes.fechaFin;
  if ('sesionesRestantes' in changes) db.sesiones_restantes = changes.sesionesRestantes;
  if ('stripeSubscriptionId' in changes) db.stripe_subscription_id = changes.stripeSubscriptionId;
  const { error } = await supabase.from('suscripciones').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateSuscripcion]', error);
}

export async function dbInsertSesion(ses: any) {
  const { error } = await supabase.from('sesiones').insert(sesionToDb(ses));
  if (error) reportDbError('[dbInsertSesion]', error);
}

export async function dbUpdateSesion(id: string, changes: any) {
  const db: any = {};
  if ('tipoClaseId' in changes) db.tipo_clase_id = changes.tipoClaseId;
  if ('salaId' in changes) db.sala_id = changes.salaId;
  if ('instructorId' in changes) db.instructor_id = changes.instructorId;
  if ('inicio' in changes) db.inicio = changes.inicio;
  if ('fin' in changes) db.fin = changes.fin;
  if ('aforoMaximo' in changes) db.aforo_maximo = changes.aforoMaximo;
  if ('cancelada' in changes) db.cancelada = changes.cancelada;
  if ('notas' in changes) db.notas = changes.notas;
  if ('precioPuntual' in changes) db.precio_puntual = changes.precioPuntual;
  const { error } = await supabase.from('sesiones').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateSesion]', error);
}

export async function dbDeleteSesion(id: string) {
  const { error } = await supabase.from('sesiones').delete().eq('id', id);
  if (error) reportDbError('[dbDeleteSesion]', error);
}

export async function dbInsertReserva(res: any) {
  const { error } = await supabase.from('reservas').insert(reservaToDb(res));
  if (error) reportDbError('[dbInsertReserva]', error);
}

export async function dbUpdateReserva(id: string, changes: any) {
  const db: any = {};
  if ('sesionId' in changes) db.sesion_id = changes.sesionId;
  if ('socioId' in changes) db.socio_id = changes.socioId;
  if ('estado' in changes) db.estado = changes.estado;
  if ('spotId' in changes) db.spot_id = changes.spotId;
  if ('posicionEspera' in changes) db.posicion_espera = changes.posicionEspera;
  if ('checkInEn' in changes) db.check_in_en = changes.checkInEn;
  const { error } = await supabase.from('reservas').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateReserva]', error);
}

export async function dbInsertRecibo(rec: any) {
  const { error } = await supabase.from('recibos').insert(reciboToDb(rec));
  if (error) reportDbError('[dbInsertRecibo]', error);
}

export async function dbUpdateRecibo(id: string, changes: any) {
  const db: any = {};
  if ('socioId' in changes) db.socio_id = changes.socioId;
  if ('suscripcionId' in changes) db.suscripcion_id = changes.suscripcionId;
  if ('concepto' in changes) db.concepto = changes.concepto;
  if ('importe' in changes) db.importe = changes.importe;
  if ('estado' in changes) db.estado = changes.estado;
  if ('fechaVencimiento' in changes) db.fecha_vencimiento = changes.fechaVencimiento;
  if ('fechaCobro' in changes) db.fecha_cobro = changes.fechaCobro;
  if ('fechaDevolucion' in changes) db.fecha_devolucion = changes.fechaDevolucion;
  if ('intentosReintento' in changes) db.intentos_reintento = changes.intentosReintento;
  const { error } = await supabase.from('recibos').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateRecibo]', error);
}

export async function dbDeleteRecibo(id: string) {
  const { error } = await supabase.from('recibos').delete().eq('id', id);
  if (error) reportDbError('[dbDeleteRecibo]', error);
}

export async function dbInsertFactura(fac: any) {
  const { error } = await supabase.from('facturas').insert(facturaToDb(fac));
  if (error) reportDbError('[dbInsertFactura]', error);
}

export async function dbInsertCita(cita: any) {
  const { error } = await supabase.from('citas').insert(citaToDb(cita));
  if (error) reportDbError('[dbInsertCita]', error);
}

export async function dbUpdateCita(id: string, changes: any) {
  const db: any = {};
  if ('socioId' in changes) db.socio_id = changes.socioId;
  if ('instructorId' in changes) db.instructor_id = changes.instructorId;
  if ('tipo' in changes) db.tipo = changes.tipo;
  if ('inicio' in changes) db.inicio = changes.inicio;
  if ('fin' in changes) db.fin = changes.fin;
  if ('notas' in changes) db.notas = changes.notas;
  if ('estado' in changes) db.estado = changes.estado;
  if ('precio' in changes) db.precio = changes.precio;
  const { error } = await supabase.from('citas').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateCita]', error);
}

export async function dbInsertVentaPOS(venta: any) {
  const { error } = await supabase.from('ventas_pos').insert(ventaPOSToDb(venta));
  if (error) reportDbError('[dbInsertVentaPOS]', error);
}

export async function dbInsertActividadReciente(act: any) {
  const { error } = await supabase.from('actividad_reciente').insert(actividadRecienteToDb(act));
  if (error) reportDbError('[dbInsertActividadReciente]', error);
}

export async function dbInsertNotaInterna(nota: any) {
  const { error } = await supabase.from('notas_internas').insert(notaInternaToDb(nota));
  if (error) reportDbError('[dbInsertNotaInterna]', error);
}

export async function dbDeleteNotaInterna(id: string) {
  const { error } = await supabase.from('notas_internas').delete().eq('id', id);
  if (error) reportDbError('[dbDeleteNotaInterna]', error);
}

export async function dbInsertCampana(c: any) {
  const { error } = await supabase.from('campanas').insert(campanaToDb(c));
  if (error) reportDbError('[dbInsertCampana]', error);
}

export async function dbUpdateCampana(id: string, changes: any) {
  const db: any = {};
  if ('nombre' in changes) db.nombre = changes.nombre;
  if ('tipo' in changes) db.tipo = changes.tipo;
  if ('asunto' in changes) db.asunto = changes.asunto;
  if ('contenido' in changes) db.contenido = changes.contenido;
  if ('estado' in changes) db.estado = changes.estado;
  if ('destinatarios' in changes) db.destinatarios = changes.destinatarios;
  if ('enviados' in changes) db.enviados = changes.enviados;
  if ('abiertos' in changes) db.abiertos = changes.abiertos;
  if ('clics' in changes) db.clics = changes.clics;
  if ('enviadaEn' in changes) db.enviada_en = changes.enviadaEn;
  if ('programadaEn' in changes) db.programada_en = changes.programadaEn;
  const { error } = await supabase.from('campanas').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateCampana]', error);
}

export async function dbDeleteCampana(id: string) {
  const { error } = await supabase.from('campanas').delete().eq('id', id);
  if (error) reportDbError('[dbDeleteCampana]', error);
}

export async function dbInsertAutomatizacion(a: any) {
  const { error } = await supabase.from('automatizaciones').insert(automatizacionToDb(a));
  if (error) reportDbError('[dbInsertAutomatizacion]', error);
}

export async function dbUpdateAutomatizacion(id: string, changes: any) {
  const db: any = {};
  if ('nombre' in changes) db.nombre = changes.nombre;
  if ('trigger' in changes) db.trigger = changes.trigger;
  if ('accion' in changes) db.accion = changes.accion;
  if ('asunto' in changes) db.asunto = changes.asunto;
  if ('mensaje' in changes) db.mensaje = changes.mensaje;
  if ('activa' in changes) db.activa = changes.activa;
  if ('ejecutadas' in changes) db.ejecutadas = changes.ejecutadas;
  const { error } = await supabase.from('automatizaciones').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateAutomatizacion]', error);
}

export async function dbDeleteAutomatizacion(id: string) {
  const { error } = await supabase.from('automatizaciones').delete().eq('id', id);
  if (error) reportDbError('[dbDeleteAutomatizacion]', error);
}

export async function dbInsertVideoOnDemand(v: any) {
  const { error } = await supabase.from('videos_on_demand').insert(videoOnDemandToDb(v));
  if (error) reportDbError('[dbInsertVideoOnDemand]', error);
}

export async function dbUpdateVideoOnDemand(id: string, changes: any) {
  const db: any = {};
  if ('titulo' in changes) db.titulo = changes.titulo;
  if ('descripcion' in changes) db.descripcion = changes.descripcion;
  if ('categoria' in changes) db.categoria = changes.categoria;
  if ('duracionMinutos' in changes) db.duracion_minutos = changes.duracionMinutos;
  if ('nivel' in changes) db.nivel = changes.nivel;
  if ('instructorId' in changes) db.instructor_id = changes.instructorId;
  if ('vistas' in changes) db.vistas = changes.vistas;
  if ('likes' in changes) db.likes = changes.likes;
  if ('activo' in changes) db.activo = changes.activo;
  const { error } = await supabase.from('videos_on_demand').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateVideoOnDemand]', error);
}

export async function dbDeleteVideoOnDemand(id: string) {
  const { error } = await supabase.from('videos_on_demand').delete().eq('id', id);
  if (error) reportDbError('[dbDeleteVideoOnDemand]', error);
}

export async function dbInsertPostComunidad(p: any) {
  const { error } = await supabase.from('posts_comunidad').insert(postComunidadToDb(p));
  if (error) reportDbError('[dbInsertPostComunidad]', error);
}

export async function dbUpdatePostComunidad(id: string, changes: any) {
  const db: any = {};
  if ('texto' in changes) db.texto = changes.texto;
  if ('likes' in changes) db.likes = changes.likes;
  if ('comentariosCount' in changes) db.comentarios_count = changes.comentariosCount;
  if ('fijado' in changes) db.fijado = changes.fijado;
  const { error } = await supabase.from('posts_comunidad').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdatePostComunidad]', error);
}

export async function dbDeletePostComunidad(id: string) {
  const { error } = await supabase.from('posts_comunidad').delete().eq('id', id);
  if (error) reportDbError('[dbDeletePostComunidad]', error);
}

export async function dbUpsertIntegracion(intg: any) {
  const row = {
    id: intg.id,
    studio_id: intg.studioId ?? STUDIO_ID,
    tipo: intg.tipo,
    activo: intg.activo,
    config: intg.config ?? {},
    actualizado_en: intg.actualizadoEn,
  };
  const { error } = await supabase.from('integraciones').upsert(row, { onConflict: 'studio_id,tipo' });
  if (error) reportDbError('[dbUpsertIntegracion]', error);
}

export async function dbInsertInstructor(i: any) {
  const row = {
    id: i.id,
    studio_id: i.studioId ?? STUDIO_ID,
    nombre: i.nombre,
    email: i.email ?? null,
    telefono: i.telefono ?? null,
    color: i.color,
    activo: i.activo,
    avatar: i.avatar ?? null,
  };
  const { error } = await supabase.from('instructores').insert(row);
  if (error) reportDbError('[dbInsertInstructor]', error);
}

export async function dbUpdateInstructor(id: string, changes: any) {
  const db: any = {};
  if ('nombre' in changes) db.nombre = changes.nombre;
  if ('email' in changes) db.email = changes.email;
  if ('telefono' in changes) db.telefono = changes.telefono;
  if ('color' in changes) db.color = changes.color;
  if ('activo' in changes) db.activo = changes.activo;
  if ('avatar' in changes) db.avatar = changes.avatar;
  const { error } = await supabase.from('instructores').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateInstructor]', error);
}

export async function dbUpdateStudioAvatar(avatarId: string | null) {
  const { error } = await supabase.from('studios').update({ avatar_admin: avatarId }).eq('id', STUDIO_ID);
  if (error) reportDbError('[dbUpdateStudioAvatar]', error);
}

export async function dbDeleteInstructor(id: string) {
  const { error } = await supabase.from('instructores').delete().eq('id', id);
  if (error) reportDbError('[dbDeleteInstructor]', error);
}
