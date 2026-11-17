// ─────────────────────────────────────────────────────────────────────────────
// Estudios atascados: quién empezó el alta y lleva días sin avanzar — lógica
// pura (sin red ni Supabase), para que `atascados.test.ts` pruebe exactamente
// lo que pinta /interno.
//
// De dónde salen los datos: `estudios_atascados_detalle()` (migración
// 20261116121549), una fila por cuenta que empezó un alta, con las marcas que ya
// existían (código del correo, estudio, primera clase, clase reservable, primera
// reserva, accesos) y el último movimiento del seguimiento que hace el fundador
// (`estudios_atascados_seguimiento`, solo inserción).
//
// Reglas que mandan en todo el fichero:
//   · «Activado» = el estudio ya puede recibir reservas (`claseReservable`, el
//     mismo «sí» que /api/onboarding/puede-reservar) o ya recibió una. Quien está
//     activado no genera alerta, pase lo que pase en el seguimiento.
//   · Una alerta por cuenta, nunca dos: la clave es la cuenta, no el estudio.
//   · El motivo probable sale SOLO de hechos medidos. Si no se puede saber,
//     `null`: mejor sin motivo que uno inventado.
//   · Nada se manda solo. Esto decide a quién mirar; el contacto es de una
//     persona (el fundador) y queda anotado.
// ─────────────────────────────────────────────────────────────────────────────

/** Días sin ningún movimiento relevante a partir de los cuales hay alerta. */
export const UMBRAL_DIAS_ATASCO = 3;
/** Pasado este plazo desde un contacto sin que la persona haya avanzado, vuelve a la lista. */
export const REVISAR_TRAS_CONTACTO_DIAS = 7;
/** Posponer más de esto no tiene sentido: es cerrar. */
export const MAX_POSPONER_DIAS = 30;
export const MAX_NOTA = 500;

export const ACCIONES_SEGUIMIENTO = ['contactado', 'pospuesta', 'cerrada', 'reabierta'] as const;
export type AccionSeguimiento = (typeof ACCIONES_SEGUIMIENTO)[number];

/** Dónde está cada cuenta, en el orden en que se recorre el alta. */
export const ESTADOS_ATASCO = ['sin_confirmar', 'sin_estudio', 'sin_clase', 'sin_enlace', 'activado'] as const;
export type EstadoAtasco = (typeof ESTADOS_ATASCO)[number];

export const ETIQUETA_ESTADO: Record<EstadoAtasco, string> = {
  sin_confirmar: 'Código del correo sin escribir',
  sin_estudio: 'Correo confirmado, estudio sin crear',
  sin_clase: 'Estudio creado, sin primera clase',
  sin_enlace: 'Con clase, aún no puede recibir reservas',
  activado: 'Activado',
};

export interface UltimoSeguimiento {
  accion: AccionSeguimiento;
  creadoEn: string;
  /** Solo con `pospuesta`: día (Madrid) hasta el que no molesta. */
  hasta: string | null;
  nota: string | null;
}

/** Una fila de `estudios_atascados_detalle()`, ya en camelCase. */
export interface FilaAtascada {
  /** `auth.users.id` de la propietaria: una alerta por cuenta. */
  clave: string;
  studioId: string | null;
  nombre: string | null;
  email: string | null;
  altaEn: string;
  emailConfirmadoEn: string | null;
  estudioCreadoEn: string | null;
  ultimoAccesoEn: string | null;
  ultimaActividadEn: string | null;
  tieneTipoClase: boolean;
  tieneClase: boolean;
  tieneTarifaActiva: boolean;
  claseReservable: boolean;
  tieneReserva: boolean;
  errorEstudioEn: string | null;
  version: string;
  seguimiento: UltimoSeguimiento | null;
}

export function estadoAtasco(f: FilaAtascada): EstadoAtasco {
  if (f.claseReservable || f.tieneReserva) return 'activado';
  if (f.estudioCreadoEn) return f.tieneClase ? 'sin_enlace' : 'sin_clase';
  return f.emailConfirmadoEn ? 'sin_estudio' : 'sin_confirmar';
}

/** El último paso que SÍ completó, dicho para quien va a escribirle. */
export function ultimoPasoCompletado(f: FilaAtascada): string {
  if (f.claseReservable || f.tieneReserva) return 'Su estudio ya puede recibir reservas';
  if (f.tieneClase) return 'Creó su primera clase';
  if (f.tieneTipoClase) return 'Creó su primera actividad';
  if (f.estudioCreadoEn) return 'Creó su estudio';
  if (f.emailConfirmadoEn) return 'Confirmó su correo';
  return 'Creó su cuenta';
}

/** Un día de Madrid (`YYYY-MM-DD`) a partir de un instante ISO. */
function diaDeMadrid(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date(iso));
}

/** Días enteros entre dos días `YYYY-MM-DD` (b − a). */
export function diasEntreDias(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** El último movimiento conocido: lo mayor entre lo que mide la base y los accesos. */
export function ultimaActividad(f: FilaAtascada): string {
  const candidatos = [f.ultimaActividadEn, f.ultimoAccesoEn, f.errorEstudioEn, f.estudioCreadoEn, f.emailConfirmadoEn, f.altaEn]
    .filter((x): x is string => !!x && !Number.isNaN(Date.parse(x)));
  return candidatos.reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a), f.altaEn);
}

/** Días (de Madrid) sin movimiento, a fecha de `hoy` (`YYYY-MM-DD`, el de Madrid). */
export function diasSinActividad(f: FilaAtascada, hoy: string): number {
  return Math.max(0, diasEntreDias(diaDeMadrid(ultimaActividad(f)), hoy));
}

/**
 * Por qué se habrá quedado, SOLO con hechos medidos. `null` si no se sabe.
 * Nunca una hipótesis sobre la persona: lo que la base de datos ve.
 */
export function motivoProbable(f: FilaAtascada): string | null {
  const estado = estadoAtasco(f);
  if (f.errorEstudioEn && !f.estudioCreadoEn) return 'Falló al montar su estudio: es un fallo nuestro, escríbele cuanto antes.';
  switch (estado) {
    case 'sin_confirmar':
      return 'No ha escrito el código de 6 cifras: puede que el correo no le haya llegado o que haya ido a spam.';
    case 'sin_estudio':
      return 'Confirmó el correo pero no llegó a crear el estudio.';
    case 'sin_clase':
      return f.ultimoAccesoEn && f.estudioCreadoEn && Date.parse(f.ultimoAccesoEn) > Date.parse(f.estudioCreadoEn) + 60 * 60_000
        ? 'Volvió al panel después de crear el estudio, pero no creó ninguna clase.'
        : 'Creó el estudio y no ha vuelto al panel.';
    case 'sin_enlace':
      return f.tieneTarifaActiva
        ? 'Tiene clase y tarifa, pero su estudio aún no puede recibir reservas: revisa su configuración.'
        : 'Tiene clase pero ninguna tarifa activa con precio (y no marcó la clase como gratis).';
    default:
      return null;
  }
}

export type SituacionAlerta = 'pendiente' | 'contactada' | 'pospuesta' | 'cerrada';

export interface AlertaAtascada {
  fila: FilaAtascada;
  estado: EstadoAtasco;
  situacion: SituacionAlerta;
  diasSinActividad: number;
  ultimaActividad: string;
  ultimoPaso: string;
  motivo: string | null;
}

/**
 * ¿Qué hace el seguimiento con esta alerta, a fecha de `hoy`?
 *   · cerrada → no sale.
 *   · pospuesta con día futuro → no sale hasta ese día.
 *   · contactada → sale como «contactada»; vuelve a pendiente si la persona no
 *     ha avanzado desde el contacto y han pasado `REVISAR_TRAS_CONTACTO_DIAS`.
 *   · reabierta o sin seguimiento → pendiente.
 */
export function situacionDeAlerta(f: FilaAtascada, hoy: string): SituacionAlerta {
  const s = f.seguimiento;
  if (!s || s.accion === 'reabierta') return 'pendiente';
  if (s.accion === 'cerrada') return 'cerrada';
  if (s.accion === 'pospuesta') return s.hasta && s.hasta > hoy ? 'pospuesta' : 'pendiente';
  // contactado
  const diaContacto = diaDeMadrid(s.creadoEn);
  const avanzoDespues = Date.parse(ultimaActividad(f)) > Date.parse(s.creadoEn);
  if (!avanzoDespues && diasEntreDias(diaContacto, hoy) >= REVISAR_TRAS_CONTACTO_DIAS) return 'pendiente';
  return 'contactada';
}

/**
 * Las alertas de hoy: una por cuenta, solo de quien NO está activado y lleva
 * `UMBRAL_DIAS_ATASCO` o más días sin movimiento. De más días a menos, y las
 * pendientes antes que las ya contactadas o aparcadas.
 */
export function alertasAtascadas(filas: readonly FilaAtascada[], hoy: string): AlertaAtascada[] {
  const vistas = new Set<string>();
  const salida: AlertaAtascada[] = [];
  for (const fila of filas) {
    if (vistas.has(fila.clave)) continue; // una alerta por cuenta, nunca dos
    vistas.add(fila.clave);
    const estado = estadoAtasco(fila);
    if (estado === 'activado') continue;
    const dias = diasSinActividad(fila, hoy);
    if (dias < UMBRAL_DIAS_ATASCO) continue;
    salida.push({
      fila,
      estado,
      situacion: situacionDeAlerta(fila, hoy),
      diasSinActividad: dias,
      ultimaActividad: ultimaActividad(fila),
      ultimoPaso: ultimoPasoCompletado(fila),
      motivo: motivoProbable(fila),
    });
  }
  const peso: Record<SituacionAlerta, number> = { pendiente: 0, contactada: 1, pospuesta: 2, cerrada: 3 };
  return salida.sort((a, b) => peso[a.situacion] - peso[b.situacion] || b.diasSinActividad - a.diasSinActividad);
}

export interface ResumenAtascados {
  pendientes: number;
  contactadas: number;
  pospuestas: number;
  cerradas: number;
}

export function resumirAtascados(alertas: readonly AlertaAtascada[]): ResumenAtascados {
  const r: ResumenAtascados = { pendientes: 0, contactadas: 0, pospuestas: 0, cerradas: 0 };
  for (const a of alertas) {
    if (a.situacion === 'pendiente') r.pendientes++;
    else if (a.situacion === 'contactada') r.contactadas++;
    else if (a.situacion === 'pospuesta') r.pospuestas++;
    else r.cerradas++;
  }
  return r;
}

// ── Lo que viaja de la base de datos y al seguimiento ───────────────────────

const str = (x: unknown): string | null => (typeof x === 'string' && x !== '' ? x : null);

/** Una fila cruda de la RPC → `FilaAtascada`, o `null` si no es una fila válida. */
export function filaAtascadaDesdeBd(r: unknown): FilaAtascada | null {
  if (!r || typeof r !== 'object') return null;
  const o = r as Record<string, unknown>;
  const clave = str(o.clave);
  const altaEn = str(o.alta_en);
  if (!clave || !altaEn) return null;
  const accion = str(o.seg_accion);
  const seguimiento: UltimoSeguimiento | null =
    accion && (ACCIONES_SEGUIMIENTO as readonly string[]).includes(accion) && str(o.seg_creado_en)
      ? { accion: accion as AccionSeguimiento, creadoEn: str(o.seg_creado_en)!, hasta: str(o.seg_hasta), nota: str(o.seg_nota) }
      : null;
  return {
    clave,
    studioId: str(o.studio_id),
    nombre: str(o.nombre),
    email: str(o.email),
    altaEn,
    emailConfirmadoEn: str(o.email_confirmado_en),
    estudioCreadoEn: str(o.estudio_creado_en),
    ultimoAccesoEn: str(o.ultimo_acceso_en),
    ultimaActividadEn: str(o.ultima_actividad_en),
    tieneTipoClase: o.tiene_tipo_clase === true,
    tieneClase: o.tiene_clase === true,
    tieneTarifaActiva: o.tiene_tarifa_activa === true,
    claseReservable: o.clase_reservable === true,
    tieneReserva: o.tiene_reserva === true,
    errorEstudioEn: str(o.error_estudio_en),
    version: str(o.version) ?? 'v1',
    seguimiento,
  };
}

export interface PeticionSeguimiento {
  clave: string;
  accion: AccionSeguimiento;
  /** Solo con `pospuesta`: días a partir de hoy. */
  dias?: number;
  nota?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valida lo que manda el navegador. Devuelve el motivo del rechazo, dicho para quien lo lee. */
export function validarPeticionSeguimiento(x: unknown): { ok: true; v: PeticionSeguimiento } | { ok: false; error: string } {
  if (!x || typeof x !== 'object') return { ok: false, error: 'Petición no válida' };
  const o = x as Record<string, unknown>;
  if (typeof o.clave !== 'string' || !UUID.test(o.clave)) return { ok: false, error: 'Cuenta no válida' };
  if (typeof o.accion !== 'string' || !(ACCIONES_SEGUIMIENTO as readonly string[]).includes(o.accion)) {
    return { ok: false, error: 'Acción no válida' };
  }
  const accion = o.accion as AccionSeguimiento;
  let dias: number | undefined;
  if (accion === 'pospuesta') {
    if (typeof o.dias !== 'number' || !Number.isInteger(o.dias) || o.dias < 1 || o.dias > MAX_POSPONER_DIAS) {
      return { ok: false, error: `Los días deben ser entre 1 y ${MAX_POSPONER_DIAS}` };
    }
    dias = o.dias;
  }
  let nota: string | undefined;
  if (o.nota !== undefined && o.nota !== null && o.nota !== '') {
    if (typeof o.nota !== 'string' || o.nota.length > MAX_NOTA) return { ok: false, error: `La nota no puede pasar de ${MAX_NOTA} caracteres` };
    nota = o.nota.trim() || undefined;
  }
  return { ok: true, v: { clave: o.clave.toLowerCase(), accion, dias, nota } };
}

/**
 * El correo personal que se abre con un clic. Es un mensaje de ayuda de una
 * persona (servicio, no una oferta): no lleva nada comercial y no se envía solo.
 * `mailto:` lo abre el correo del fundador; Tentare no manda nada.
 */
export function mailtoContacto(a: AlertaAtascada): string | null {
  const email = a.fila.email;
  if (!email) return null;
  const estudio = a.fila.nombre?.trim() || 'tu estudio';
  const asunto = `¿Te echo una mano con ${estudio} en Tentare?`;
  const cuerpo = [
    'Hola,',
    '',
    `Te escribo del equipo de Tentare. He visto que empezaste a montar ${estudio} y quería saber si te has atascado en algo o si puedo ayudarte a dejarlo listo.`,
    '',
    'Si te viene mejor, dime un hueco y lo hacemos juntos en 10 minutos.',
    '',
    'Un abrazo,',
    'El equipo de Tentare',
  ].join('\n');
  return `mailto:${encodeURIComponent(email).replace(/%40/g, '@')}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
}
