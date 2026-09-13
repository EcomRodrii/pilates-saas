// Exportación de los datos de UNA socia — derecho de acceso (art. 15 RGPD) y
// de portabilidad (art. 20).
//
// Lo usan dos puertas con la MISMA función, para que no puedan divergir:
//   · la alumna, desde su app  → GET /api/public/mis-datos (incluye su salud:
//     son sus datos);
//   · el estudio, desde la ficha → GET /api/socios/[id]/exportar (la salud
//     solo si el rol puede ver la ficha clínica Y la socia tiene el
//     consentimiento vigente — el mismo criterio que la RLS, que aquí no
//     protege porque se lee con service-role).
//
// No confundir con `app/api/exportar/mis-datos`: esa es la exportación del
// ESTUDIO entero (CSV por tabla, solo propietaria), no la de una interesada.
//
// Criterios:
//   · JSON VERSIONADO (`version`), legible por máquina y por una persona.
//   · Minimización de terceros: del personal solo sale el NOMBRE cuando forma
//     parte del hecho (quién dio la clase, quién escribió la nota de
//     progreso); nunca su email, teléfono, id de usuario ni quién tecleó algo.
//   · Todo o nada: si una sola lectura falla, se lanza. Un archivo al que le
//     falta media historia sin decirlo es peor que un error.
//   · Cada tabla del esquema con `socio_id` está en COBERTURA_TABLAS, dentro de
//     una sección o fuera con su motivo. El test falla si aparece una nueva sin
//     decidir.
//
// Sin imports de Next ni de `@/`: se prueba con node --test.

export const VERSION_EXPORTACION = 1;

export const SECCIONES = [
  'reservas', 'suscripciones', 'recibos', 'facturas', 'pagos', 'citas', 'plazasFijas', 'recuperaciones',
  'creditos', 'mensajesEnviados', 'valoraciones', 'consentimientos', 'preferencias', 'documentos', 'salud', 'otros',
] as const;
export type Seccion = (typeof SECCIONES)[number];

/**
 * Qué se hace con cada tabla que guarda `socio_id`. `seccion` = sale en esa
 * sección; `excluida` = no sale, y el motivo tiene que poder leerse en voz alta
 * delante de la socia.
 */
export const COBERTURA_TABLAS: Record<string, { seccion: Seccion } | { excluida: string }> = {
  reservas: { seccion: 'reservas' },
  suscripciones: { seccion: 'suscripciones' },
  recibos: { seccion: 'recibos' },
  pagos_historicos: { seccion: 'pagos' },
  ventas_pos: { seccion: 'pagos' },
  devoluciones: { seccion: 'pagos' },
  penalizaciones: { seccion: 'pagos' },
  mandatos_sepa: { seccion: 'pagos' },
  codigos_descuento_consumos: { seccion: 'pagos' },
  citas: { seccion: 'citas' },
  plazas_fijas: { seccion: 'plazasFijas' },
  recuperaciones: { seccion: 'recuperaciones' },
  member_credits: { seccion: 'creditos' },
  credit_transactions: { seccion: 'creditos' },
  reward_redemptions: { seccion: 'creditos' },
  reward_history: { seccion: 'creditos' },
  achievement_history: { seccion: 'creditos' },
  achievement_progress: { seccion: 'creditos' },
  challenge_history: { seccion: 'creditos' },
  challenge_progress: { seccion: 'creditos' },
  reto_participaciones: { seccion: 'creditos' },
  conversacion_participantes: { seccion: 'mensajesEnviados' },
  valoraciones: { seccion: 'valoraciones' },
  preferencias_socio: { seccion: 'preferencias' },
  favoritos_clase: { seccion: 'preferencias' },
  documentos_socio: { seccion: 'documentos' },
  condiciones_salud: { seccion: 'salud' },
  respuestas_cuestionario_salud: { seccion: 'salud' },
  respuestas_sesion: { seccion: 'salud' },
  valoraciones_iniciales: { seccion: 'salud' },
  valoraciones_iniciales_salud: { seccion: 'salud' },
  notas_progreso: { seccion: 'salud' },
  comunicaciones_socio: { seccion: 'otros' },
  socio_excepciones: { seccion: 'otros' },
  socio_tipos_clase_autorizados: { seccion: 'otros' },
  post_evento_asistentes: { seccion: 'otros' },
  solicitudes_derechos: { seccion: 'otros' },
  memoria_socio: { seccion: 'otros' },
  recomendaciones: { seccion: 'otros' },
  notas_internas: { excluida: 'Anotaciones internas del personal del estudio. Se entregan a petición, valorando caso a caso los derechos de terceros (art. 15.4 RGPD).' },
  tareas: { excluida: 'Tareas de trabajo del personal del estudio. Se entregan a petición, igual que las anotaciones internas.' },
  lecturas_ficha_salud: { excluida: 'Registro de quién del equipo abrió la ficha de salud: son datos de esas personas (nombre y rol). Se informa a petición.' },
  actividad_reciente: { excluida: 'Feed interno del panel redactado para el personal; repite hechos que ya salen en reservas y pagos.' },
  automation_logs: { excluida: 'Registro técnico de las automatizaciones del estudio; lo que llegó a la socia consta en otros.comunicacionesRecibidas.' },
  notification: { excluida: 'Copia de los avisos que ya recibió en su app; los hechos que los originan salen en sus secciones.' },
  avisos_hueco: { excluida: 'Registro técnico de avisos de plaza libre; no contiene nada aportado por ella.' },
  intentos_reserva_fallidos: { excluida: 'Registro técnico de errores al reservar; no contiene nada aportado por ella.' },
  recordatorio_envios: { excluida: 'Registro técnico de recordatorios enviados (clase, canal y hora).' },
  reward_actions: { excluida: 'Registro técnico que origina los créditos; el resultado sale en creditos.movimientos.' },
  widget_eventos: { excluida: 'Evento analítico del widget de reservas, sin contenido aportado por ella.' },
};

// ── Cliente de lectura mínimo ───────────────────────────────────────────────
// La forma justa del query builder de supabase-js que se usa aquí. Las rutas
// pasan el cliente service-role; el test, un doble que registra los filtros.

export interface ResultadoLectura { data: unknown[] | null; error: { message: string } | null }
export interface ConsultaBd extends PromiseLike<ResultadoLectura> {
  eq(columna: string, valor: unknown): ConsultaBd;
  in(columna: string, valores: readonly unknown[]): ConsultaBd;
  is(columna: string, valor: null): ConsultaBd;
  order(columna: string, opciones?: { ascending?: boolean }): ConsultaBd;
  range(desde: number, hasta: number): ConsultaBd;
}
export interface LectorBd { from(tabla: string): { select(columnas: string): ConsultaBd } }

export class ErrorExportacion extends Error {
  readonly tabla: string;
  constructor(tabla: string, detalle: string) {
    super(`No se pudo leer ${tabla}: ${detalle}`);
    this.tabla = tabla;
  }
}

type Fila = Record<string, unknown>;
type Filtro = readonly ['eq', string, unknown] | readonly ['in', string, readonly unknown[]] | readonly ['is', string, null];

const PAGINA = 1000;
const LOTE_IN = 100;

async function leer(db: LectorBd, tabla: string, columnas: string, filtros: readonly Filtro[], orden: string): Promise<Fila[]> {
  const filas: Fila[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    let q = db.from(tabla).select(columnas);
    for (const f of filtros) {
      if (f[0] === 'eq') q = q.eq(f[1], f[2]);
      else if (f[0] === 'in') q = q.in(f[1], f[2]);
      else q = q.is(f[1], f[2]);
    }
    const { data, error } = await q.order(orden, { ascending: true }).range(desde, desde + PAGINA - 1);
    if (error) throw new ErrorExportacion(tabla, error.message);
    const lote = (data ?? []) as Fila[];
    filas.push(...lote);
    if (lote.length < PAGINA) return filas;
  }
}

/** Lookup por ids, siempre acotado al estudio y en lotes (URL finita). */
async function leerPorIds(
  db: LectorBd, tabla: string, columnas: string, studioId: string, columnaId: string,
  ids: readonly unknown[], extra: readonly Filtro[] = [],
): Promise<Fila[]> {
  const unicos = [...new Set(ids.filter((x): x is string => typeof x === 'string' && x.length > 0))];
  const out: Fila[] = [];
  for (let i = 0; i < unicos.length; i += LOTE_IN) {
    out.push(...await leer(db, tabla, columnas,
      [['eq', 'studio_id', studioId], ['in', columnaId, unicos.slice(i, i + LOTE_IN)], ...extra], columnaId));
  }
  return out;
}

const str = (v: unknown): string | null => (v == null ? null : String(v));
const num = (v: unknown): number | null => (v == null || v === '' ? null : Number(v));
const bool = (v: unknown): boolean | null => (v == null ? null : Boolean(v));
const porId = (filas: Fila[], clave = 'id') => new Map(filas.map(f => [String(f[clave]), f]));
const porFecha = <T extends Fila>(filas: T[], clave: string) =>
  [...filas].sort((a, b) => String(a[clave] ?? '').localeCompare(String(b[clave] ?? '')));

/** Nunca el IBAN entero en un archivo que viaja: basta para reconocerlo. */
export function enmascararIban(iban: unknown): string | null {
  const limpio = typeof iban === 'string' ? iban.replace(/\s+/g, '') : '';
  if (!limpio) return null;
  return `${limpio.slice(0, 2)}·· ···· ${limpio.slice(-4)}`;
}

export function consentimientoSaludVigente(socia: Fila): boolean {
  return !!socia.consentimiento_salud_fecha && !socia.consentimiento_salud_revocado_en;
}

/** `mis-datos-pilates-luz-2026-09-13.json` — sin tildes ni espacios: va en una cabecera HTTP. */
export function nombreArchivoExportacion(etiqueta: string, ahora: Date): string {
  const limpio = etiqueta.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'datos';
  return `${limpio}-${ahora.toISOString().slice(0, 10)}.json`;
}

const COLUMNAS_SOCIA = [
  'id', 'auth_user_id', 'nombre', 'apellidos', 'email', 'telefono', 'nif', 'fecha_nacimiento', 'direccion', 'usuario',
  'fecha_alta', 'activo', 'foto_url', 'tags', 'origen_lead', 'campos_extra', 'metodo_pago_preferido',
  'tarjeta_marca', 'tarjeta_ultimos4', 'tarjeta_exp_mes', 'tarjeta_exp_anio',
  'aceptacion_fecha', 'aceptacion_origen', 'aceptacion_firma', 'aceptacion_version',
  'consentimiento_salud_fecha', 'consentimiento_salud_revocado_en', 'consentimiento_salud_texto',
  'consentimiento_marketing_en', 'consentimiento_marketing_texto',
  'visible_en_clase', 'objetivo_clases_mes', 'excluir_de_perfilado', 'borrado_en',
].join(', ');

export interface OpcionesExportacion {
  studioId: string;
  socioId: string;
  /** ¿Puede quien descarga ver datos de salud? La alumna, siempre. */
  incluirSalud: boolean;
  /**
   * Además, exigir el consentimiento de salud vigente (panel). Espejo de la RLS
   * de las tablas de salud para el personal clínico.
   */
  saludSoloConConsentimiento: boolean;
  ahora: Date;
}

export interface ExportacionSocia {
  version: number;
  generadoEn: string;
  estudio: { nombre: string };
  socia: Record<string, unknown>;
  secciones: Record<Seccion, unknown>;
  notas: string[];
}

export async function exportarDatosSocia(db: LectorBd, o: OpcionesExportacion): Promise<ExportacionSocia | null> {
  const { studioId, socioId } = o;
  const delSocia: Filtro[] = [['eq', 'studio_id', studioId], ['eq', 'socio_id', socioId]];
  const tabla = (nombre: string, columnas: string, orden = 'id', extra: Filtro[] = []) =>
    leer(db, nombre, columnas, [...delSocia, ...extra], orden);

  const [sociaFilas, estudioFilas] = await Promise.all([
    leer(db, 'socios', COLUMNAS_SOCIA, [['eq', 'studio_id', studioId], ['eq', 'id', socioId]], 'id'),
    leer(db, 'studios', 'id, nombre', [['eq', 'id', studioId]], 'id'),
  ]);
  const s = sociaFilas[0];
  if (!s) return null;
  const authUserId = str(s.auth_user_id);
  const conSalud = o.incluirSalud && (!o.saludSoloConConsentimiento || consentimientoSaludVigente(s));
  const sinFilas = Promise.resolve([] as Fila[]);

  const [
    reservas, suscripciones, recibos, pagosHistoricos, ventas, devoluciones, penalizaciones, mandatos, codigos,
    citas, plazasFijas, recuperaciones,
    saldo, movimientos, canjes, recompensas, logros, progresoLogros, retos, progresoRetos, participacionesRetos,
    participaciones, valoraciones, preferenciasClase, favoritos, documentos,
    comunicaciones, excepciones, autorizadas, eventos, solicitudes, memoria, recomendaciones,
    avisos, camposPersonalizados,
    valoracionesIniciales, valoracionesInicialesSalud, condiciones, respuestasCuestionario, respuestasSesion, notasProgreso,
  ] = await Promise.all([
    tabla('reservas', 'id, sesion_id, estado, posicion_espera, check_in_en, creado_en, cancelada_tardia, valoracion_experiencia'),
    tabla('suscripciones', 'id, plan_id, estado, fecha_inicio, fecha_fin, sesiones_restantes'),
    tabla('recibos', 'id, suscripcion_id, concepto, importe, estado, fecha_vencimiento, fecha_cobro, fecha_devolucion, metodo_cobro, importe_devuelto, terminos_aceptados_en'),
    tabla('pagos_historicos', 'id, fecha, concepto, importe, medio_pago'),
    tabla('ventas_pos', 'id, numero, items, subtotal, descuento, total, metodo_pago, estado, realizada_en, devuelta_en, importe_devuelto, anulada_en'),
    tabla('devoluciones', 'id, recibo_id, importe_cobrado, importe_devuelto, estado, detectada_en, resuelta_en'),
    tabla('penalizaciones', 'id, reserva_id, tipo, importe, estado, detectada_en, procesada_en'),
    tabla('mandatos_sepa', 'id, iban, ref_mandato, fecha_firma, estado, creada_en'),
    // Sin `studio_id` en la tabla: se acota por la socia (ids globales únicos).
    leer(db, 'codigos_descuento_consumos', 'recibo_id, consumido_en', [['eq', 'socio_id', socioId]], 'consumido_en'),
    tabla('citas', 'id, instructor_id, tipo, inicio, fin, estado, precio, pagada, notas'),
    tabla('plazas_fijas', 'id, dia_semana, hora_inicio, sala_id, tipo_clase_id, vigencia_desde, vigencia_hasta, estado, creada_en'),
    tabla('recuperaciones', 'id, motivo, caduca_el, estado, creada_en'),
    tabla('member_credits', 'saldo, total_ganado, total_canjeado, caduca_el, actualizado_en', 'socio_id'),
    tabla('credit_transactions', 'id, tipo, creditos, descripcion, creado_en'),
    tabla('reward_redemptions', 'id, creditos_gastados, estado, codigo, creado_en, entregado_en'),
    tabla('reward_history', 'id, creditos, descripcion, creado_en'),
    tabla('achievement_history', 'id, nombre, creado_en'),
    tabla('achievement_progress', 'id, achievement_id, progreso_actual, completado, completado_en'),
    tabla('challenge_history', 'id, nombre, creado_en'),
    tabla('challenge_progress', 'id, challenge_id, progreso_actual, completado, completado_en'),
    tabla('reto_participaciones', 'id, reto_key, created_at'),
    leer(db, 'conversacion_participantes', 'conversacion_id', [['eq', 'socio_id', socioId]], 'conversacion_id'),
    tabla('valoraciones', 'id, sesion_id, instructor_id, puntuacion, comentario, creado_en'),
    tabla('preferencias_socio', 'disponibilidad, instructor_favorito_id, tipo_clase_favorita, duracion_preferida, nivel, notif_email, notif_whatsapp, actualizado_en', 'socio_id'),
    tabla('favoritos_clase', 'id, tipo_clase_id, created_at'),
    tabla('documentos_socio', 'id, categoria, titulo, caduca_en, creado_en', 'id', [['is', 'borrado_en', null]]),
    tabla('comunicaciones_socio', 'id, tipo, asunto, estado, creado_en'),
    tabla('socio_excepciones', 'id, tipo, motivo, creada_en'),
    tabla('socio_tipos_clase_autorizados', 'tipo_clase_id, autorizada_en', 'tipo_clase_id'),
    leer(db, 'post_evento_asistentes', 'post_id, creado_en', [['eq', 'socio_id', socioId]], 'post_id'),
    tabla('solicitudes_derechos', 'id, tipo, estado, solicitada_en, plazo_hasta, resuelta_en, nota'),
    tabla('memoria_socio', 'id, clave, origen, evidencia, activa, creado_en, expira_en'),
    tabla('recomendaciones', 'id, tipo, titulo, motivo, estado, creado_en'),
    authUserId
      ? leer(db, 'notification_preference', 'category, inapp, push, email', [['eq', 'studio_id', studioId], ['eq', 'user_id', authUserId]], 'category')
      : sinFilas,
    leer(db, 'campos_personalizados', 'id, etiqueta', [['eq', 'studio_id', studioId]], 'id'),
    conSalud ? tabla('valoraciones_iniciales', 'id, estado, objetivos, objetivo_principal, experiencia, nivel, actividad_habitual, frecuencia, expectativas, creado_en, actualizado_en, completada_en') : sinFilas,
    conSalud ? tabla('valoraciones_iniciales_salud', 'valoracion_id, tiene_molestias, zonas, detalle, estado_cuerpo, creado_en', 'valoracion_id') : sinFilas,
    conSalud ? tabla('condiciones_salud', 'id, categoria, etiqueta, zona, restricciones, severidad, estado, inicio, fin, revisar_en, notas, creado_en, actualizado_en') : sinFilas,
    conSalud ? tabla('respuestas_cuestionario_salud', 'id, pregunta_id, respuesta, creado_en, actualizado_en') : sinFilas,
    conSalud ? tabla('respuestas_sesion', 'id, sesion_id, respuesta, nota, creado_en') : sinFilas,
    conSalud ? tabla('notas_progreso', 'id, instructor_id, sesion_id, progreso, alertas, plan_proxima_sesion, ejercicios_casa, texto_libre, creada_en') : sinFilas,
  ]);

  // ── Segunda ola: lo que da nombre a los ids ──
  const idsSesion = [...reservas, ...valoraciones, ...respuestasSesion, ...notasProgreso].map(f => f.sesion_id);
  const [sesiones, planes, facturas, mensajes, preguntas] = await Promise.all([
    leerPorIds(db, 'sesiones', 'id, tipo_clase_id, sala_id, instructor_id, inicio, fin, cancelada', studioId, 'id', idsSesion),
    leerPorIds(db, 'planes_tarifa', 'id, nombre', studioId, 'id', suscripciones.map(f => f.plan_id)),
    Promise.all([
      leerPorIds(db, 'facturas', COLUMNAS_FACTURA, studioId, 'recibo_id', recibos.map(f => f.id)),
      leerPorIds(db, 'facturas', COLUMNAS_FACTURA, studioId, 'venta_pos_id', ventas.map(f => f.id)),
    ]).then(([a, b]) => [...porId([...a, ...b]).values()]),
    // Solo lo que ELLA escribió: los mensajes del personal son de otras personas.
    authUserId
      ? leerPorIds(db, 'mensajes', 'id, conversacion_id, cuerpo, creado_en', studioId, 'conversacion_id',
        participaciones.map(f => f.conversacion_id), [['eq', 'remitente_auth_user_id', authUserId]])
      : sinFilas,
    leerPorIds(db, 'plantillas_cuestionario_salud', 'id, pregunta', studioId, 'id', respuestasCuestionario.map(f => f.pregunta_id)),
  ]);
  const [tipos, salas, instructoras] = await Promise.all([
    leerPorIds(db, 'tipos_clase', 'id, nombre', studioId, 'id',
      [...sesiones, ...plazasFijas, ...favoritos, ...autorizadas].map(f => f.tipo_clase_id)),
    leerPorIds(db, 'salas', 'id, nombre', studioId, 'id', [...sesiones, ...plazasFijas].map(f => f.sala_id)),
    // Del personal, solo el NOMBRE (minimización de datos de terceros).
    leerPorIds(db, 'instructores', 'id, nombre', studioId, 'id',
      [...sesiones, ...citas, ...valoraciones, ...notasProgreso, ...preferenciasClase].map(f => f.instructor_id ?? f.instructor_favorito_id)),
  ]);

  const mSesion = porId(sesiones), mTipo = porId(tipos), mSala = porId(salas), mInstr = porId(instructoras);
  const mPlan = porId(planes), mPregunta = porId(preguntas), mCampo = porId(camposPersonalizados);
  const nombre = (m: Map<string, Fila>, id: unknown) => (id == null ? null : str(m.get(String(id))?.nombre));
  const clase = (sesionId: unknown) => {
    const ses = sesionId == null ? undefined : mSesion.get(String(sesionId));
    if (!ses) return null;
    return {
      clase: nombre(mTipo, ses.tipo_clase_id), inicio: str(ses.inicio), fin: str(ses.fin),
      sala: nombre(mSala, ses.sala_id), instructora: nombre(mInstr, ses.instructor_id), cancelada: bool(ses.cancelada),
    };
  };

  const valoracionInicial = valoracionesIniciales[0];
  const saludValoracion = valoracionInicial
    ? valoracionesInicialesSalud.find(v => v.valoracion_id === valoracionInicial.id)
    : undefined;
  const camposExtra = (s.campos_extra && typeof s.campos_extra === 'object' ? s.campos_extra : {}) as Record<string, unknown>;

  const notas: string[] = [
    'No incluye las anotaciones internas del personal ni registros técnicos del sistema. Puedes pedírselos al estudio.',
  ];
  if (!o.incluirSalud) {
    notas.push('Sin la sección de salud: quien ha generado este archivo no tiene permiso para ver la ficha clínica.');
  } else if (!conSalud) {
    notas.push('Sin la sección de salud: la clienta no tiene vigente el consentimiento para tratar datos de salud.');
  }

  return {
    version: VERSION_EXPORTACION,
    generadoEn: o.ahora.toISOString(),
    estudio: { nombre: str(estudioFilas[0]?.nombre) ?? '' },
    socia: {
      nombre: str(s.nombre), apellidos: str(s.apellidos), email: str(s.email), telefono: str(s.telefono),
      nif: str(s.nif), fechaNacimiento: str(s.fecha_nacimiento), direccion: str(s.direccion), usuario: str(s.usuario),
      fechaAlta: str(s.fecha_alta), activa: bool(s.activo), fotoUrl: str(s.foto_url),
      etiquetas: Array.isArray(s.tags) ? s.tags : [], origen: str(s.origen_lead),
      // `campos_personalizados` nombra con `etiqueta`, no con `nombre`.
      camposPersonalizados: Object.entries(camposExtra).map(([id, valor]) => ({ campo: str(mCampo.get(id)?.etiqueta) ?? id, valor })),
      metodoPagoPreferido: str(s.metodo_pago_preferido),
      tarjeta: s.tarjeta_ultimos4
        ? { marca: str(s.tarjeta_marca), ultimos4: str(s.tarjeta_ultimos4), caducidad: s.tarjeta_exp_mes ? `${String(s.tarjeta_exp_mes).padStart(2, '0')}/${s.tarjeta_exp_anio}` : null }
        : null,
      eliminadaEn: str(s.borrado_en),
    },
    secciones: {
      reservas: porFecha(reservas, 'creado_en').map(r => ({
        ...clase(r.sesion_id), estado: str(r.estado), reservadaEn: str(r.creado_en), posicionEspera: num(r.posicion_espera),
        asistenciaRegistradaEn: str(r.check_in_en), cancelacionTardia: bool(r.cancelada_tardia), valoracion: num(r.valoracion_experiencia),
      })),
      suscripciones: suscripciones.map(x => ({
        plan: nombre(mPlan, x.plan_id), estado: str(x.estado), desde: str(x.fecha_inicio), hasta: str(x.fecha_fin), sesionesRestantes: num(x.sesiones_restantes),
      })),
      recibos: porFecha(recibos, 'fecha_vencimiento').map(r => ({
        concepto: str(r.concepto), importe: num(r.importe), estado: str(r.estado), vencimiento: str(r.fecha_vencimiento),
        cobradoEl: str(r.fecha_cobro), devueltoEl: str(r.fecha_devolucion), metodo: str(r.metodo_cobro),
        importeDevuelto: num(r.importe_devuelto), terminosAceptadosEn: str(r.terminos_aceptados_en),
      })),
      facturas: porFecha(facturas, 'fecha_emision').map(f => ({
        numero: str(f.numero_completo), serie: str(f.serie), tipo: str(f.tipo), fecha: str(f.fecha_emision), concepto: str(f.concepto),
        receptor: { nombre: str(f.receptor_nombre), nif: str(f.receptor_nif) },
        base: num(f.base_imponible), tipoIva: num(f.tipo_iva), cuotaIva: num(f.cuota_iva), total: num(f.total),
        rectificaA: str(f.rectifica_a), verifactu: { estado: str(f.verifactu_estado), qr: str(f.verifactu_qr_url) },
      })),
      pagos: {
        historicos: porFecha(pagosHistoricos, 'fecha').map(p => ({ fecha: str(p.fecha), concepto: str(p.concepto), importe: num(p.importe), medio: str(p.medio_pago) })),
        ventasMostrador: porFecha(ventas, 'realizada_en').map(v => ({
          numero: num(v.numero), fecha: str(v.realizada_en), productos: v.items ?? [], subtotal: num(v.subtotal), descuento: num(v.descuento),
          total: num(v.total), metodo: str(v.metodo_pago), estado: str(v.estado), devueltaEn: str(v.devuelta_en),
          importeDevuelto: num(v.importe_devuelto), anuladaEn: str(v.anulada_en),
        })),
        devoluciones: devoluciones.map(d => ({ importeCobrado: num(d.importe_cobrado), importeDevuelto: num(d.importe_devuelto), estado: str(d.estado), detectadaEn: str(d.detectada_en), resueltaEn: str(d.resuelta_en) })),
        penalizaciones: penalizaciones.map(p => ({ tipo: str(p.tipo), importe: num(p.importe), estado: str(p.estado), detectadaEn: str(p.detectada_en), procesadaEn: str(p.procesada_en) })),
        mandatosSepa: mandatos.map(m => ({ iban: enmascararIban(m.iban), referencia: str(m.ref_mandato), firmadoEl: str(m.fecha_firma), estado: str(m.estado) })),
        codigosDescuentoUsados: codigos.map(c => ({ usadoEn: str(c.consumido_en) })),
      },
      citas: porFecha(citas, 'inicio').map(c => ({
        tipo: str(c.tipo), inicio: str(c.inicio), fin: str(c.fin), estado: str(c.estado), precio: num(c.precio), pagada: bool(c.pagada),
        instructora: nombre(mInstr, c.instructor_id), notas: str(c.notas),
      })),
      plazasFijas: plazasFijas.map(p => ({
        diaSemana: num(p.dia_semana), hora: str(p.hora_inicio), clase: nombre(mTipo, p.tipo_clase_id), sala: nombre(mSala, p.sala_id),
        desde: str(p.vigencia_desde), hasta: str(p.vigencia_hasta), estado: str(p.estado),
      })),
      recuperaciones: recuperaciones.map(r => ({ motivo: str(r.motivo), caduca: str(r.caduca_el), estado: str(r.estado), creadaEn: str(r.creada_en) })),
      creditos: {
        saldo: saldo[0] ? { saldo: num(saldo[0].saldo), ganados: num(saldo[0].total_ganado), canjeados: num(saldo[0].total_canjeado), caducan: str(saldo[0].caduca_el) } : null,
        movimientos: porFecha(movimientos, 'creado_en').map(m => ({ tipo: str(m.tipo), creditos: num(m.creditos), descripcion: str(m.descripcion), fecha: str(m.creado_en) })),
        canjes: canjes.map(c => ({ creditos: num(c.creditos_gastados), estado: str(c.estado), codigo: str(c.codigo), fecha: str(c.creado_en), entregadoEn: str(c.entregado_en) })),
        recompensas: recompensas.map(r => ({ creditos: num(r.creditos), descripcion: str(r.descripcion), fecha: str(r.creado_en) })),
        logros: logros.map(l => ({ nombre: str(l.nombre), fecha: str(l.creado_en) })),
        progresoLogros: progresoLogros.map(p => ({ progreso: num(p.progreso_actual), completado: bool(p.completado), completadoEn: str(p.completado_en) })),
        retos: retos.map(r => ({ nombre: str(r.nombre), fecha: str(r.creado_en) })),
        progresoRetos: progresoRetos.map(p => ({ progreso: num(p.progreso_actual), completado: bool(p.completado), completadoEn: str(p.completado_en) })),
        participacionesRetos: participacionesRetos.map(p => ({ reto: str(p.reto_key), fecha: str(p.created_at) })),
      },
      mensajesEnviados: porFecha(mensajes, 'creado_en').map(m => ({ fecha: str(m.creado_en), texto: str(m.cuerpo) })),
      valoraciones: valoraciones.map(v => ({
        ...clase(v.sesion_id), instructora: nombre(mInstr, v.instructor_id), puntuacion: num(v.puntuacion), comentario: str(v.comentario), fecha: str(v.creado_en),
      })),
      consentimientos: {
        contrato: s.aceptacion_fecha
          ? { fecha: str(s.aceptacion_fecha), via: str(s.aceptacion_origen), firma: str(s.aceptacion_firma), textoAceptado: str(s.aceptacion_version) }
          : null,
        salud: s.consentimiento_salud_fecha
          ? { fecha: str(s.consentimiento_salud_fecha), revocadoEn: str(s.consentimiento_salud_revocado_en), textoAceptado: str(s.consentimiento_salud_texto) }
          : null,
        marketing: s.consentimiento_marketing_en
          ? { fecha: str(s.consentimiento_marketing_en), textoAceptado: str(s.consentimiento_marketing_texto) }
          : null,
      },
      preferencias: {
        noUsarParaRecomendacionesAutomaticas: s.excluir_de_perfilado === true,
        visibleParaOtrasAlumnasEnClase: s.visible_en_clase === true,
        objetivoClasesMes: num(s.objetivo_clases_mes),
        clases: preferenciasClase[0]
          ? {
            disponibilidad: preferenciasClase[0].disponibilidad ?? null, instructoraFavorita: nombre(mInstr, preferenciasClase[0].instructor_favorito_id),
            tipoClaseFavorita: str(preferenciasClase[0].tipo_clase_favorita), duracionPreferida: num(preferenciasClase[0].duracion_preferida),
            nivel: str(preferenciasClase[0].nivel), avisosEmail: bool(preferenciasClase[0].notif_email), avisosWhatsapp: bool(preferenciasClase[0].notif_whatsapp),
          }
          : null,
        avisos: avisos.map(a => ({ categoria: str(a.category), app: bool(a.inapp), push: bool(a.push), email: bool(a.email) })),
        clasesFavoritas: favoritos.map(f => nombre(mTipo, f.tipo_clase_id)).filter(Boolean),
      },
      documentos: documentos.map(d => ({ categoria: str(d.categoria), titulo: str(d.titulo), subidoEn: str(d.creado_en), caduca: str(d.caduca_en) })),
      salud: conSalud
        ? {
          condiciones: condiciones.map(c => ({
            categoria: str(c.categoria), etiqueta: str(c.etiqueta), zona: str(c.zona), restricciones: c.restricciones ?? [],
            severidad: str(c.severidad), estado: str(c.estado), desde: str(c.inicio), hasta: str(c.fin), revisarEl: str(c.revisar_en),
            notas: str(c.notas), registradaEn: str(c.creado_en), actualizadaEn: str(c.actualizado_en),
          })),
          respuestasCuestionario: respuestasCuestionario.map(r => ({
            pregunta: nombreDePregunta(mPregunta, r.pregunta_id), respuesta: str(r.respuesta), fecha: str(r.actualizado_en ?? r.creado_en),
          })),
          respuestasTrasClase: respuestasSesion.map(r => ({ ...clase(r.sesion_id), respuesta: str(r.respuesta), nota: str(r.nota), fecha: str(r.creado_en) })),
          valoracionInicial: valoracionInicial
            ? {
              estado: str(valoracionInicial.estado), objetivos: valoracionInicial.objetivos ?? [], objetivoPrincipal: str(valoracionInicial.objetivo_principal),
              experiencia: str(valoracionInicial.experiencia), nivel: str(valoracionInicial.nivel), actividadHabitual: str(valoracionInicial.actividad_habitual),
              frecuencia: str(valoracionInicial.frecuencia), expectativas: str(valoracionInicial.expectativas),
              completadaEn: str(valoracionInicial.completada_en),
              salud: saludValoracion
                ? { tieneMolestias: bool(saludValoracion.tiene_molestias), zonas: saludValoracion.zonas ?? [], detalle: str(saludValoracion.detalle), estadoDelCuerpo: str(saludValoracion.estado_cuerpo) }
                : null,
            }
            : null,
          notasProgreso: porFecha(notasProgreso, 'creada_en').map(n => ({
            fecha: str(n.creada_en), instructora: nombre(mInstr, n.instructor_id), clase: clase(n.sesion_id)?.clase ?? null,
            progreso: str(n.progreso), alertas: str(n.alertas), planProximaSesion: str(n.plan_proxima_sesion),
            ejerciciosEnCasa: str(n.ejercicios_casa), texto: str(n.texto_libre),
          })),
        }
        : null,
      otros: {
        comunicacionesRecibidas: porFecha(comunicaciones, 'creado_en').map(c => ({ canal: str(c.tipo), asunto: str(c.asunto), estado: str(c.estado), fecha: str(c.creado_en) })),
        excepciones: excepciones.map(e => ({ tipo: str(e.tipo), motivo: str(e.motivo), fecha: str(e.creada_en) })),
        clasesAutorizadas: autorizadas.map(a => ({ clase: nombre(mTipo, a.tipo_clase_id), desde: str(a.autorizada_en) })),
        eventosAsistidos: eventos.map(e => ({ fecha: str(e.creado_en) })),
        solicitudesDerechos: solicitudes.map(x => ({
          tipo: str(x.tipo), estado: str(x.estado), solicitadaEn: str(x.solicitada_en), plazoHasta: str(x.plazo_hasta), resueltaEn: str(x.resuelta_en), nota: str(x.nota),
        })),
        perfilado: {
          hechos: memoria.map(m => ({ clave: str(m.clave), origen: str(m.origen), evidencia: str(m.evidencia), activo: bool(m.activa), fecha: str(m.creado_en), caduca: str(m.expira_en) })),
          recomendaciones: recomendaciones.map(r => ({ tipo: str(r.tipo), titulo: str(r.titulo), motivo: str(r.motivo), estado: str(r.estado), fecha: str(r.creado_en) })),
        },
      },
    },
    notas,
  };
}

const COLUMNAS_FACTURA = 'id, recibo_id, venta_pos_id, numero_completo, serie, tipo, fecha_emision, concepto, receptor_nombre, receptor_nif, base_imponible, tipo_iva, cuota_iva, total, rectifica_a, verifactu_estado, verifactu_qr_url';

function nombreDePregunta(m: Map<string, Fila>, id: unknown): string | null {
  return id == null ? null : str(m.get(String(id))?.pregunta);
}
