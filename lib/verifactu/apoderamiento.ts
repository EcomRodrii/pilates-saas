// Veri*Factu — el poder IZ860 de cada estudio: qué es, cómo se acredita y
// cuándo deja transmitir.
//
// Lógica pura. El poder REAL lo otorga el estudio en la sede de la AEAT; aquí
// solo está lo que Tentare guarda como evidencia y las reglas de su ciclo de
// vida. Fuentes en la migración 20260930020000.

import type { Habilitacion } from './habilitacion.ts';

/** El trámite del Registro de apoderamientos (relación oficial de trámites apoderables). */
export const TRAMITE_IZ860 = {
  codigo: 'IZ860',
  nombre: 'Remisión y consulta de registros de facturación por servicio web',
} as const;

/** Dónde se otorga el poder. La propietaria entra con su certificado o Cl@ve. */
export const URL_REGISTRO_APODERAMIENTOS = 'https://sede.agenciatributaria.gob.es/Sede/colaborar-agencia-tributaria/registro-apoderamientos.html';
/** Ayuda oficial paso a paso («Alta de poder para trámites tributarios»). */
export const URL_AYUDA_ALTA_PODER = 'https://sede.agenciatributaria.gob.es/Sede/ayuda/consultas-informaticas/otros-servicios-ayuda-tecnica/alta-poder-tramites-tributarios.html';

/** Vigencia máxima de un poder del Registro (Registro de apoderamientos, «Prórroga»). */
export const VIGENCIA_MAXIMA_ANOS = 5;
/** Con cuánta antelación se avisa de que caduca. La prórroga solo se puede hacer en los 2 meses previos. */
export const AVISO_CADUCIDAD_DIAS = 60;

export type TipoEmisor = 'persona_fisica' | 'sociedad' | 'otra';
export type CargoOtorgante = 'titular' | 'representante_legal' | 'apoderado_con_poder_suficiente';
export type TramitePoder = 'IZ860' | 'GENERAL_46_2';

export type EstadoEstudioVerifactu =
  | 'SIN_CONFIGURAR' | 'PENDIENTE_AUTORIZACION' | 'AUTORIZACION_EN_REVISION'
  | 'VERIFICADO' | 'PRODUCCION' | 'PAUSADO' | 'SUSPENDIDO_AEAT';

export type EstadoRepresentacion =
  | 'EN_REVISION' | 'VERIFICADA' | 'RECHAZADA_REVISION' | 'REVOCADA' | 'CADUCADA' | 'RENUNCIADA' | 'SIN_PODER_AEAT';

// ── El apoderado ─────────────────────────────────────────────────────────────

export interface Apoderado { nombre: string; nif: string }

type Env = Record<string, string | undefined>;

/**
 * La persona a la que los estudios apoderan: la titular del certificado con el
 * que se remite. Por defecto, el productor del SIF (misma persona en Tentare);
 * `VERIFACTU_APODERADO_*` lo separa si algún día no lo son.
 */
export function apoderadoDeEntorno(env: Env): Apoderado | null {
  const nombre = (env.VERIFACTU_APODERADO_NOMBRE ?? env.VERIFACTU_PRODUCTOR_NOMBRE ?? '').trim();
  const nif = (env.VERIFACTU_APODERADO_NIF ?? env.VERIFACTU_PRODUCTOR_NIF ?? '').trim().toUpperCase();
  return nombre && nif.length === 9 ? { nombre, nif } : null;
}

// ── El mandato privado (evidencia adicional, no la autorización) ─────────────

/**
 * Versión del texto. Si cambia el texto, cambia la versión: cada aceptación
 * guarda versión y huella del texto EXACTO que se aceptó.
 *
 * Versión .2 (30-sep-2026), tras la revisión del asesor fiscal:
 *   · el punto de datos personales ya no «autoriza» nada: remite al acuerdo de
 *     encargo de tratamiento (art. 28 RGPD), que es donde debe regularse;
 *   · dice expresamente que este mandato no es el apoderamiento ante la AEAT;
 *   · añade duración y qué pasa si termina el servicio. La revocación del poder
 *     se hace en la AEAT, nunca aquí.
 * ⚠️ TODO(fundador): el punto 6 remite a un acuerdo de encargo de tratamiento
 * que hoy es solo una frase de /terminos (§5). El asesor pide un DPA completo
 * (art. 28) antes del primer estudio real.
 */
export const MANDATO_VERSION = '2026-09-30.2';

export function textoMandato(p: {
  estudio: { nombreFiscal: string; nif: string };
  apoderado: Apoderado;
  tramite: TramitePoder;
}): string {
  const alcance = p.tramite === 'IZ860'
    ? `el trámite ${TRAMITE_IZ860.codigo} («${TRAMITE_IZ860.nombre}»)`
    : 'los trámites del artículo 46.2 de la Ley General Tributaria (poder general)';
  return [
    `MANDATO PARA LA REMISIÓN DE REGISTROS DE FACTURACIÓN (versión ${MANDATO_VERSION})`,
    '',
    `${p.estudio.nombreFiscal}, con NIF ${p.estudio.nif} (en adelante, el obligado tributario), usuario del sistema de facturación Tentare:`,
    '',
    `1. Declara que ha otorgado en el Registro de apoderamientos de la Agencia Estatal de Administración Tributaria un poder a favor de ${p.apoderado.nombre}, con NIF ${p.apoderado.nif}, para ${alcance}, y que los datos de ese poder que comunica a Tentare son ciertos.`,
    '2. Encarga al apoderado que, con su propio certificado electrónico cualificado, remita a la sede electrónica de la AEAT los registros de facturación que genera Tentare para el obligado tributario, y que consulte su estado, exclusivamente a esos efectos.',
    '3. Este mandato no constituye por sí mismo un apoderamiento ante la Agencia Estatal de Administración Tributaria ni sustituye al poder inscrito en su Registro de Apoderamientos.',
    '4. Sabe que el poder real es el inscrito en la AEAT; que puede revocarlo en cualquier momento en la sede electrónica, con efecto desde que la AEAT lo recibe; y que debe comunicarlo a Tentare para que deje de remitir.',
    '5. Sabe que el apoderamiento no le exime de su responsabilidad como obligado a expedir facturas.',
    '6. Declara que el tratamiento de datos personales realizado por Tentare en el marco de este servicio queda sujeto al acuerdo de encargo de tratamiento aplicable entre las partes.',
    '7. El presente mandato permanecerá vigente mientras se mantenga el servicio de remisión de registros de facturación y no sea revocado por el obligado tributario, sin perjuicio de que el poder otorgado ante la AEAT se regirá exclusivamente por las condiciones y efectos establecidos por la propia AEAT.',
    '8. En caso de terminación del servicio, Tentare dejará de realizar nuevas remisiones y pondrá a disposición del obligado tributario la información necesaria para la continuidad de sus obligaciones de facturación, sin perjuicio de los efectos y obligaciones derivados del poder inscrito ante la AEAT.',
  ].join('\n');
}

// ── Validación de la evidencia que entrega la propietaria ────────────────────

export interface AutorizacionEntrante {
  csv: string;
  /** aaaa-mm-dd */
  otorgadoEn: string;
  /** aaaa-mm-dd */
  vigenteHasta: string;
  tramite: TramitePoder;
  otorgante: { nombre: string; nif: string; cargo: CargoOtorgante };
  aceptaMandato: boolean;
  mandatoVersion: string;
}

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function fechaIso(s: string): Date | null {
  if (!FECHA_ISO.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : d;
}

/**
 * Errores de la evidencia, en cristiano. Vacío = se puede guardar para revisión.
 * ⚠️ El formato exacto del CSV de un apoderamiento NO está documentado: se
 * admite alfanumérico de 8 a 40 caracteres y se coteja a mano en la sede.
 */
export function erroresAutorizacion(
  a: AutorizacionEntrante,
  estudio: { tipoEmisor: TipoEmisor },
  hoy: Date,
): string[] {
  const e: string[] = [];
  const csv = a.csv.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9]{8,40}$/.test(csv)) e.push('El CSV del apoderamiento no tiene el formato esperado (letras y números).');
  const otorgado = fechaIso(a.otorgadoEn);
  const vigente = fechaIso(a.vigenteHasta);
  if (!otorgado) e.push('La fecha en que se otorgó el poder no es válida.');
  if (!vigente) e.push('La fecha de fin del poder no es válida.');
  if (otorgado && otorgado.getTime() > hoy.getTime()) e.push('La fecha de otorgamiento no puede ser futura.');
  if (otorgado && vigente) {
    if (vigente.getTime() <= otorgado.getTime()) e.push('El poder tiene que terminar después de otorgarse.');
    const maximo = new Date(otorgado);
    maximo.setUTCFullYear(maximo.getUTCFullYear() + VIGENCIA_MAXIMA_ANOS);
    if (vigente.getTime() > maximo.getTime()) e.push(`Un poder del Registro dura como máximo ${VIGENCIA_MAXIMA_ANOS} años.`);
    if (vigente.getTime() < hoy.getTime()) e.push('Ese poder ya ha caducado.');
  }
  if (a.tramite !== 'IZ860' && a.tramite !== 'GENERAL_46_2') e.push('El trámite tiene que ser el IZ860 o el poder general.');
  if (!a.otorgante.nombre.trim()) e.push('Falta el nombre de quien otorgó el poder.');
  if (a.otorgante.nif.trim().length !== 9) e.push('El NIF de quien otorgó el poder debe tener 9 caracteres.');
  if (estudio.tipoEmisor === 'persona_fisica' && a.otorgante.cargo !== 'titular') {
    e.push('Si facturas como persona física, el poder lo otorgas tú como titular.');
  }
  if (estudio.tipoEmisor === 'sociedad' && a.otorgante.cargo === 'titular') {
    e.push('En una sociedad, el poder lo otorga su representante legal (o alguien con poder suficiente).');
  }
  if (!a.aceptaMandato) e.push('Falta aceptar el mandato.');
  if (a.mandatoVersion !== MANDATO_VERSION) e.push('El texto del mandato ha cambiado: vuelve a leerlo.');
  return e;
}

// ── Ciclo de vida del estudio ────────────────────────────────────────────────

export type AccionEstudio =
  | 'CONFIGURAR' | 'ENVIAR_AUTORIZACION' | 'VERIFICAR' | 'RECHAZAR_REVISION'
  | 'ACTIVAR_PRODUCCION' | 'PAUSAR' | 'REANUDAR' | 'SUSPENDER_AEAT' | 'REVOCAR' | 'CADUCAR';

const DESTINO: Record<AccionEstudio, { desde: readonly EstadoEstudioVerifactu[]; a: EstadoEstudioVerifactu }> = {
  // (Re)configurar datos fiscales vuelve a pedir autorización: el poder es de un NIF.
  CONFIGURAR: { desde: ['SIN_CONFIGURAR', 'PENDIENTE_AUTORIZACION', 'AUTORIZACION_EN_REVISION', 'VERIFICADO', 'PAUSADO'], a: 'PENDIENTE_AUTORIZACION' },
  ENVIAR_AUTORIZACION: { desde: ['PENDIENTE_AUTORIZACION'], a: 'AUTORIZACION_EN_REVISION' },
  VERIFICAR: { desde: ['AUTORIZACION_EN_REVISION'], a: 'VERIFICADO' },
  RECHAZAR_REVISION: { desde: ['AUTORIZACION_EN_REVISION'], a: 'PENDIENTE_AUTORIZACION' },
  // Producción solo desde VERIFICADO: lo activa Tentare, a mano.
  ACTIVAR_PRODUCCION: { desde: ['VERIFICADO'], a: 'PRODUCCION' },
  PAUSAR: { desde: ['PRODUCCION', 'VERIFICADO'], a: 'PAUSADO' },
  // Reanudar no salta a producción: vuelve a VERIFICADO y se reactiva a mano.
  REANUDAR: { desde: ['PAUSADO', 'SUSPENDIDO_AEAT'], a: 'VERIFICADO' },
  SUSPENDER_AEAT: { desde: ['PRODUCCION'], a: 'SUSPENDIDO_AEAT' },
  REVOCAR: { desde: ['AUTORIZACION_EN_REVISION', 'VERIFICADO', 'PRODUCCION', 'PAUSADO', 'SUSPENDIDO_AEAT'], a: 'PENDIENTE_AUTORIZACION' },
  CADUCAR: { desde: ['VERIFICADO', 'PRODUCCION', 'PAUSADO', 'SUSPENDIDO_AEAT'], a: 'PENDIENTE_AUTORIZACION' },
};

export function siguienteEstadoEstudio(de: EstadoEstudioVerifactu, accion: AccionEstudio): EstadoEstudioVerifactu | null {
  const t = DESTINO[accion];
  return t.desde.includes(de) ? t.a : null;
}

// ── ¿Puede transmitir? ───────────────────────────────────────────────────────

export interface SituacionEstudio {
  estudio: { estado: EstadoEstudioVerifactu; nif: string } | null;
  representacion: { estado: EstadoRepresentacion; vigenteHasta: string; nifRepresentado: string; apoderadoNif: string } | null;
  esDemo: boolean;
  /** El NIF que tiene HOY el estudio (studios.nif). */
  nifActual: string;
  /** El NIF del certificado con el que se remite (el apoderado configurado). */
  apoderadoNif: string | null;
  hoy: Date;
}

/**
 * El bloqueo duro. Todo tiene que cuadrar: estudio en PRODUCCIÓN, poder
 * VERIFICADO y vigente, para ESTE NIF y para ESTE apoderado, y no es el estudio
 * de demostración (sus facturas no son reales).
 */
export function habilitacionDe(s: SituacionEstudio): Habilitacion {
  if (s.esDemo) return { habilitado: false, motivo: 'ESTUDIO_DE_DEMOSTRACION' };
  if (!s.estudio || !s.representacion || s.representacion.estado !== 'VERIFICADA') {
    return { habilitado: false, motivo: 'SIN_AUTORIZACION_VERIFICADA' };
  }
  if (s.estudio.estado === 'PAUSADO') return { habilitado: false, motivo: 'PAUSADO' };
  if (s.estudio.estado === 'SUSPENDIDO_AEAT') return { habilitado: false, motivo: 'SUSPENDIDO_AEAT' };
  if (s.estudio.estado !== 'PRODUCCION') return { habilitado: false, motivo: 'NO_EN_PRODUCCION' };
  const nif = s.nifActual.trim().toUpperCase();
  if (nif !== s.estudio.nif || nif !== s.representacion.nifRepresentado) return { habilitado: false, motivo: 'SIN_AUTORIZACION_VERIFICADA' };
  if (!s.apoderadoNif || s.apoderadoNif !== s.representacion.apoderadoNif) return { habilitado: false, motivo: 'SIN_AUTORIZACION_VERIFICADA' };
  const hoy = s.hoy.toISOString().slice(0, 10);
  if (s.representacion.vigenteHasta < hoy) return { habilitado: false, motivo: 'PODER_CADUCADO' };
  return { habilitado: true };
}

/** Qué hacer hoy con una representación verificada, según su fecha de fin. */
export function revisionCaducidad(r: { vigenteHasta: string; avisoCaducidadEn: string | null }, hoy: Date): 'CADUCADA' | 'AVISAR' | null {
  const hoyIso = hoy.toISOString().slice(0, 10);
  if (r.vigenteHasta < hoyIso) return 'CADUCADA';
  const limite = new Date(hoy.getTime() + AVISO_CADUCIDAD_DIAS * 86_400_000).toISOString().slice(0, 10);
  if (r.vigenteHasta <= limite && !r.avisoCaducidadEn) return 'AVISAR';
  return null;
}
