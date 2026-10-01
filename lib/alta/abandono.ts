// ─────────────────────────────────────────────────────────────────────────────
// Altas de estudio sin terminar — lógica pura (sin red ni Supabase), para que
// `abandono.test.ts` pruebe exactamente lo que corre en el cron y en /interno.
//
// De dónde salen los datos: `public.altas_estudio` (una fila por cuenta que
// empezó un alta de estudio; ver la migración 20261001195938) cruzada por
// `altas_estudio_detalle()` con `auth.users` (¿confirmó el email?) y `studios`
// (¿llegó a tener estudio?). El PASO no se guarda: se deriva aquí, de una sola
// forma, para que el correo y la lista del fundador no puedan contar dos
// historias distintas sobre la misma persona.
//
// Quién recibe el correo no se adivina por exclusión («cuenta sin estudio»):
// una cuenta sin estudio puede ser una socia del portal o una instructora
// invitada. Solo existe fila para quien empezó el alta EN /crear-estudio, y
// aun así el correo exige además intención (llegó a crear la cuenta, o con
// sesión pasó del primer paso).
// ─────────────────────────────────────────────────────────────────────────────

import { TRIAL_DIAS } from '../billing/trial.ts';

export type OrigenAlta = 'registro' | 'con_sesion';

/** Dónde está cada alta, en el orden en que se recorre el alta. */
export const PASOS_ABANDONO = [
  'formulario_estudio', // con sesión, en el paso 1: aún no ha escrito el nombre
  'formulario_plan', // con sesión, pasó al paso del plan y no pulsó «Empezar»
  'email_sin_confirmar', // cuenta creada, el código de 6 cifras sin escribir
  'estudio_sin_crear', // email confirmado, el estudio no llegó a montarse
  'error_estudio', // pulsó para montarlo y falló
  'terminada', // tiene estudio
] as const;
export type PasoAbandono = (typeof PASOS_ABANDONO)[number];

export const ETIQUETA_PASO: Record<PasoAbandono, string> = {
  formulario_estudio: 'Paso 1: nombre del estudio',
  formulario_plan: 'Paso 2: elegir plan',
  email_sin_confirmar: 'Código del email sin escribir',
  estudio_sin_crear: 'Email confirmado, estudio sin montar',
  error_estudio: 'Falló al montar el estudio',
  terminada: 'Terminada',
};

/** Una fila de `altas_estudio_detalle()`, ya en camelCase. */
export interface AltaEstudio {
  authUserId: string;
  email: string | null;
  origen: OrigenAlta;
  estudioNombre: string | null;
  iniciadaEn: string;
  emailConfirmadoEn: string | null;
  planEn: string | null;
  errorEstudioEn: string | null;
  errorEstudioIntentos: number;
  estudioCreadoEn: string | null;
  esEquipo: boolean;
  avisadoAntes: boolean;
  recordatorioReclamadoEn: string | null;
  recordatorioEnviadoEn: string | null;
  recordatorioPaso: string | null;
  recordatorioIntentos: number;
  recordatorioDescartado: string | null;
}

/** El último paso alcanzado y desde cuándo está ahí. */
export function pasoDeAlta(a: AltaEstudio): { paso: PasoAbandono; desde: string } {
  if (a.estudioCreadoEn) return { paso: 'terminada', desde: a.estudioCreadoEn };
  if (a.errorEstudioEn) return { paso: 'error_estudio', desde: a.errorEstudioEn };
  if (a.origen === 'registro') {
    return a.emailConfirmadoEn
      ? { paso: 'estudio_sin_crear', desde: a.emailConfirmadoEn }
      : { paso: 'email_sin_confirmar', desde: a.iniciadaEn };
  }
  return a.planEn
    ? { paso: 'formulario_plan', desde: a.planEn }
    : { paso: 'formulario_estudio', desde: a.iniciadaEn };
}

const HORA_MS = 3_600_000;
/** «Cuando pase 1 día sin haber creado el estudio.» */
export const HORAS_HASTA_RECORDATORIO = 24;
/**
 * Pasada una semana ya no se escribe: un «te falta un paso» de hace un mes se
 * lee como spam, y el plazo cubre de sobra un cron caído un día entero.
 */
export const DIAS_MAXIMO_RECORDATORIO = 7;
/** Envíos fallidos antes de dejarlo estar (cada intento es una pasada horaria). */
export const MAX_INTENTOS_RECORDATORIO = 3;

export type MotivoSinRecordatorio =
  | 'ya_enviado'
  | 'aviso_antiguo'
  | 'terminada'
  | 'es_equipo'
  | 'sin_email'
  | 'fuera_de_plazo'
  | 'envio_fallido'
  // No definitivos: puede cambiar en la siguiente pasada.
  | 'aun_no'
  | 'sin_intencion';

export type DecisionRecordatorio =
  | { enviar: true; paso: Exclude<PasoAbandono, 'terminada' | 'formulario_estudio'> }
  | { enviar: false; motivo: MotivoSinRecordatorio; definitivo: boolean };

/**
 * ¿Se le manda el correo ahora? Un solo correo por persona: cualquier rastro de
 * envío (hecho o en curso) lo descarta. `definitivo` = el cron lo apunta y no
 * vuelve a mirar esta fila nunca más.
 */
export function decidirRecordatorio(a: AltaEstudio, ahoraMs: number): DecisionRecordatorio {
  const no = (motivo: MotivoSinRecordatorio, definitivo = true): DecisionRecordatorio =>
    ({ enviar: false, motivo, definitivo });

  if (a.recordatorioEnviadoEn || a.recordatorioReclamadoEn) return no('ya_enviado');
  if (a.recordatorioDescartado) return no(a.recordatorioDescartado as MotivoSinRecordatorio);
  if (a.avisadoAntes) return no('aviso_antiguo');
  if (a.recordatorioIntentos >= MAX_INTENTOS_RECORDATORIO) return no('envio_fallido');

  const { paso } = pasoDeAlta(a);
  if (paso === 'terminada') return no('terminada');
  // Ya trabaja en un estudio (la invitaron mientras tanto): no es un alta.
  if (a.esEquipo) return no('es_equipo');
  // Un dominio de ejemplo (example.com…) lo descarta quien envía, igual que
  // el resto de correos del repo (`esDominioReservado`).
  if (!a.email) return no('sin_email');

  const horas = (ahoraMs - Date.parse(a.iniciadaEn)) / HORA_MS;
  if (!Number.isFinite(horas)) return no('fuera_de_plazo');
  if (horas > DIAS_MAXIMO_RECORDATORIO * 24) return no('fuera_de_plazo');
  if (horas < HORAS_HASTA_RECORDATORIO) return no('aun_no', false);
  // Con sesión y sin haber escrito ni el nombre: /login la mandó aquí al entrar
  // con Google, pero no ha dicho que quiera montar un estudio. Ni una palabra.
  if (paso === 'formulario_estudio') return no('sin_intencion', false);

  return { enviar: true, paso };
}

/** Clave de idempotencia de Resend: la misma persona, el mismo correo, siempre. */
export function claveIdempotenciaRecordatorio(authUserId: string): string {
  return `alta-sin-terminar/${authUserId}`;
}

// ── El texto, según dónde se quedó ──────────────────────────────────────────

export interface ContenidoRecordatorio {
  asunto: string;
  preheader: string;
  titular: string;
  parrafos: string[];
  boton: { href: string; texto: string };
  nota: string;
}

/**
 * Todos los botones van a /login, y es a propósito: es la única puerta que
 * retoma el alta en CUALQUIER dispositivo. Con el email sin confirmar enseña
 * la pantalla del código con «Reenviar código» (el de ayer caducó a los
 * minutos); confirmado, monta el estudio solo con `pending_studio`; y sin
 * estudio ni `pending_studio` (Google) manda a /crear-estudio con la sesión
 * abierta. /crear-estudio a pelo obligaría a rellenar todo otra vez en otro
 * móvil, y una contraseña nueva ahí NO cambia la de una cuenta sin confirmar.
 */
export function contenidoRecordatorio(
  paso: Exclude<PasoAbandono, 'terminada' | 'formulario_estudio'>,
  alta: Pick<AltaEstudio, 'estudioNombre' | 'origen'>,
  baseUrl: string,
): ContenidoRecordatorio {
  const estudio = alta.estudioNombre?.trim() || 'tu estudio';
  const href = `${baseUrl.replace(/\/+$/, '')}/login`;
  const nota = 'Es el único correo que te mandamos sobre esto. Si no fuiste tú, ignóralo.';

  switch (paso) {
    case 'email_sin_confirmar':
      return {
        asunto: `Te falta un código para abrir ${estudio}`,
        preheader: 'Pide un código nuevo y tu estudio queda montado con lo que ya nos contaste.',
        titular: 'Te falta confirmar tu email',
        parrafos: [
          `Empezaste a dar de alta ${estudio} en Tentare y te mandamos un código de 6 cifras para confirmar tu email. Ese código caduca a los pocos minutos, así que lo más fácil es pedir uno nuevo.`,
          'Entra con tu email y la contraseña que elegiste, pulsa «Reenviar código» y, al escribirlo, montamos tu estudio con lo que ya nos contaste. No tienes que rellenar nada otra vez.',
        ],
        boton: { href, texto: 'Pedir un código nuevo' },
        nota: 'Es el único correo que te mandamos sobre esto. Si no fuiste tú, ignóralo: sin el código, la cuenta no se activa.',
      };
    case 'estudio_sin_crear':
      return {
        asunto: `${estudio} está a un paso de estar listo`,
        preheader: 'Tu email ya está confirmado: entra y lo terminamos solos.',
        titular: 'Tu estudio está a un paso',
        parrafos: [
          `Confirmaste tu email, pero ${estudio} no llegó a montarse.`,
          'Entra con tu cuenta y lo terminamos solos, con lo que ya nos contaste: no tienes que rellenar nada otra vez.',
        ],
        boton: { href, texto: 'Entrar y terminarlo' },
        nota,
      };
    case 'error_estudio':
      return {
        asunto: `No pudimos montar ${estudio}: ya puedes terminarlo`,
        preheader: 'Fue un fallo nuestro, no tuyo. Entra y lo terminamos.',
        titular: 'Algo falló al montar tu estudio',
        parrafos: [
          `Pulsaste para montar ${estudio} y algo falló de nuestro lado. Fue un fallo nuestro, no tuyo.`,
          alta.origen === 'registro'
            ? 'Entra con tu cuenta y lo intentamos de nuevo solos, con lo que ya nos contaste: no tienes que rellenar nada otra vez.'
            : 'Entra con tu cuenta y te llevamos al alta: son dos pasos, el nombre y el plan.',
        ],
        boton: { href, texto: 'Entrar y terminarlo' },
        nota,
      };
    case 'formulario_plan':
      return {
        asunto: `Te falta elegir plan para ${estudio}`,
        preheader: `Son ${TRIAL_DIAS} días gratis, sin tarjeta.`,
        titular: 'Te falta elegir tu plan',
        parrafos: [
          `Empezaste a montar ${estudio} en Tentare, pero no llegaste a elegir el plan de prueba.`,
          `Son ${TRIAL_DIAS} días gratis, sin tarjeta y sin permanencia, y puedes cambiar de plan cuando quieras. Entra con tu cuenta y te llevamos al alta: son dos pasos, el nombre y el plan.`,
        ],
        boton: { href, texto: 'Elegir mi plan' },
        nota,
      };
  }
}

// ── Lo que manda la pantalla de alta a /api/alta/progreso ──────────────────

export type EventoProgreso = 'inicio' | 'plan' | 'error_estudio';

/** Valida el cuerpo de `/api/alta/progreso`. Nada de PII: un evento y, si acaso, el nombre del estudio. */
export function leerEventoProgreso(cuerpo: unknown): { evento: EventoProgreso; estudio: string | null } | null {
  if (!cuerpo || typeof cuerpo !== 'object') return null;
  const { evento, estudio } = cuerpo as { evento?: unknown; estudio?: unknown };
  if (evento !== 'inicio' && evento !== 'plan' && evento !== 'error_estudio') return null;
  const nombre = typeof estudio === 'string' ? estudio.trim().slice(0, 120) : '';
  return { evento, estudio: nombre || null };
}

// ── Para /interno ───────────────────────────────────────────────────────────

export interface FilaAltaInterno {
  authUserId: string;
  email: string | null;
  estudio: string | null;
  origen: OrigenAlta;
  iniciadaEn: string;
  paso: PasoAbandono;
  pasoDesde: string;
  correoEnviadoEn: string | null;
  correoPaso: string | null;
  correoNoSeEnvia: string | null;
  terminoTrasCorreo: boolean;
}

export function filaParaInterno(a: AltaEstudio): FilaAltaInterno {
  const { paso, desde } = pasoDeAlta(a);
  return {
    authUserId: a.authUserId,
    email: a.email,
    estudio: a.estudioNombre,
    origen: a.origen,
    iniciadaEn: a.iniciadaEn,
    paso,
    pasoDesde: desde,
    correoEnviadoEn: a.recordatorioEnviadoEn,
    correoPaso: a.recordatorioPaso,
    correoNoSeEnvia: a.recordatorioEnviadoEn ? null : a.recordatorioDescartado,
    terminoTrasCorreo: !!(a.estudioCreadoEn && a.recordatorioEnviadoEn
      && Date.parse(a.estudioCreadoEn) > Date.parse(a.recordatorioEnviadoEn)),
  };
}

/** Cuántas hay en cada paso, y cuántas terminaron después del correo. */
export function resumirAltas(filas: readonly FilaAltaInterno[]) {
  const porPaso = Object.fromEntries(PASOS_ABANDONO.map((p) => [p, 0])) as Record<PasoAbandono, number>;
  let correos = 0;
  let terminaronTrasCorreo = 0;
  for (const f of filas) {
    porPaso[f.paso] += 1;
    if (f.correoEnviadoEn) correos += 1;
    if (f.terminoTrasCorreo) terminaronTrasCorreo += 1;
  }
  return { total: filas.length, porPaso, correos, terminaronTrasCorreo };
}

/** De la fila cruda de la RPC (snake_case) al tipo de aquí. */
export function altaDesdeFila(f: Record<string, unknown>): AltaEstudio {
  const s = (v: unknown) => (typeof v === 'string' && v ? v : null);
  return {
    authUserId: String(f.auth_user_id),
    email: s(f.email),
    origen: f.origen === 'con_sesion' ? 'con_sesion' : 'registro',
    estudioNombre: s(f.estudio_nombre),
    iniciadaEn: String(f.iniciada_en),
    emailConfirmadoEn: s(f.email_confirmado_en),
    planEn: s(f.plan_en),
    errorEstudioEn: s(f.error_estudio_en),
    errorEstudioIntentos: Number(f.error_estudio_intentos ?? 0),
    estudioCreadoEn: s(f.estudio_creado_en),
    esEquipo: f.es_equipo === true,
    avisadoAntes: f.avisado_antes === true,
    recordatorioReclamadoEn: s(f.recordatorio_reclamado_en),
    recordatorioEnviadoEn: s(f.recordatorio_enviado_en),
    recordatorioPaso: s(f.recordatorio_paso),
    recordatorioIntentos: Number(f.recordatorio_intentos ?? 0),
    recordatorioDescartado: s(f.recordatorio_descartado),
  };
}
