// Lo que se lee en la tarjeta del resultado de un escaneo. Un solo sitio para
// el panel y la app de la instructora, para que la misma situación no se cuente
// de dos maneras. Puro: se prueba con `node --test`.

import { TZ_ESTUDIO } from '../utils.ts';
import type { MotivoAcceso, TipoAcceso, Veredicto } from './evaluar-acceso.ts';

export type MotivoVisible = MotivoAcceso | 'ESTADO_A_REVISAR';

export const TITULO_VEREDICTO: Record<Veredicto, string> = {
  PERMITIDO: 'Acceso permitido',
  REVISAR: 'Revisar',
  DENEGADO: 'Acceso denegado',
};

export const ETIQUETA_TIPO_ACCESO: Record<TipoAcceso, string> = {
  PLAZA_FIJA: 'Plaza fija',
  RESERVA: 'Reserva',
  RECUPERACION: 'Recuperación',
  CLASE_DE_PRUEBA: 'Clase de prueba',
};

const ETIQUETA_ESTADO: Record<string, string> = {
  CONFIRMADA: 'Confirmada',
  ASISTIDA: 'Asistida',
  CANCELADA: 'Cancelada',
  LISTA_ESPERA: 'En lista de espera',
  PENDIENTE_APROBACION: 'Pendiente de aprobación',
  NO_ASISTIO: 'Marcada como que no vino',
};

export function etiquetaEstadoReserva(estado: string | null): string {
  if (!estado) return 'Sin reserva';
  return ETIQUETA_ESTADO[estado] ?? estado;
}

const fmtHora = new Intl.DateTimeFormat('es-ES', { timeZone: TZ_ESTUDIO, hour: '2-digit', minute: '2-digit' });
const fmtFecha = new Intl.DateTimeFormat('es-ES', { timeZone: TZ_ESTUDIO, weekday: 'long', day: 'numeric', month: 'long' });

export const horaAcceso = (iso: string) => fmtHora.format(new Date(iso));
export const fechaAcceso = (iso: string) => fmtFecha.format(new Date(iso));

/** «30 de junio de 2027», desde un YYYY-MM-DD (sin zona: es una fecha, no un instante). */
export function fechaVigencia(ymd: string): string {
  const [a, m, d] = ymd.split('-').map(Number);
  return new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(Date.UTC(a, m - 1, d)));
}

export interface DatosTexto {
  clase: { nombre: string; inicio: string; sala: string | null } | null;
  otraClase: { nombre: string; inicio: string; sala: string | null } | null;
  plazaFija: { hasta: string | null } | null;
  yaEntroEn: string | null;
  avisos: ('CLIENTA_DESACTIVADA' | 'IMPAGO')[];
  /** La clase ya ha empezado (solo importa con una reserva pendiente). */
  claseEmpezada?: boolean;
}

const donde = (c: { nombre: string; inicio: string; sala: string | null }) =>
  [c.nombre, horaAcceso(c.inicio), c.sala].filter(Boolean).join(' · ');

/** La frase principal: por qué entra, por qué no, o qué hay que mirar. */
export function explicacionAcceso(motivo: MotivoVisible, d: DatosTexto): string {
  switch (motivo) {
    case 'RESERVA_CONFIRMADA': return 'Reserva confirmada.';
    case 'PLAZA_FIJA': return 'Clase fija confirmada.';
    case 'YA_ENTRO':
      return d.yaEntroEn
        ? `Ya había entrado a las ${horaAcceso(d.yaEntroEn)}. Si no es ella, alguien puede estar usando su QR.`
        : 'Ya había entrado a esta clase.';
    case 'PENDIENTE_APROBACION': return 'Esta reserva está pendiente de aprobación.';
    case 'CLIENTA_DESACTIVADA':
    case 'IMPAGO':
    case 'ESTADO_A_REVISAR':
      return 'Esta alumna tiene un estado que requiere revisión.';
    case 'VARIAS_CLASES': return 'Tiene reserva en más de una clase de ahora. ¿A cuál entra?';
    case 'SIN_RESERVA':
      return d.clase ? 'No tiene una reserva para esta clase.' : 'No tiene reserva en ninguna de las clases de ahora.';
    case 'RESERVA_CANCELADA': return 'Esta reserva fue cancelada.';
    case 'LISTA_ESPERA': return 'Está en lista de espera: no tiene plaza en esta clase.';
    case 'NO_ASISTIO': return 'Su reserva está marcada como que no vino. Si ha venido, corrígelo en la lista de la clase.';
    case 'RESERVA_OTRA_CLASE':
      return d.otraClase ? `Su reserva es para otra clase: ${donde(d.otraClase)}.` : 'Su reserva es para otra clase.';
    case 'CLASE_CANCELADA': return 'Esta clase está cancelada.';
    case 'CLASE_TERMINADA': return 'Esta clase ya ha terminado.';
    case 'CLASE_NO_EMPEZADA': return 'Esta clase todavía no empieza: el acceso se abre una hora antes.';
    case 'SIN_CLASE_AHORA': return 'No hay ninguna clase ahora ni en la próxima hora.';
    case 'QR_NO_RECONOCIDO': return 'No reconocemos este QR. Pídele que abra Perfil → QR de acceso en su app.';
    case 'QR_SUSTITUIDO': return 'Este QR ya no vale: lo cambió por uno nuevo. Pídele que abra el de su app.';
    case 'QR_OTRO_ESTUDIO': return 'Este QR es de otro estudio.';
    case 'APROBADA_SIN_PLAZA': return 'Aprobada, pero la clase está llena: queda en lista de espera.';
    case 'CLASE_YA_EMPEZADA': return 'La clase ya había empezado: una reserva pendiente no se puede aprobar después del inicio.';
    case 'NO_PERMITIDO': return 'No se le ha permitido el acceso.';
  }
}

/** Las líneas de detalle que acompañan a un 🟠 o a un 🟢 (vigencia, avisos). */
export function detallesAcceso(motivo: MotivoVisible, d: DatosTexto): string[] {
  const out: string[] = [];
  if (motivo === 'PLAZA_FIJA' || d.plazaFija) {
    if (d.plazaFija?.hasta) out.push(`Tiene una plaza fija hasta el ${fechaVigencia(d.plazaFija.hasta)}.`);
    else if (d.plazaFija) out.push('Tiene una plaza fija sin fecha de fin.');
  }
  if (d.avisos.includes('CLIENTA_DESACTIVADA')) out.push('Su ficha está desactivada en el estudio.');
  if (d.avisos.includes('IMPAGO')) out.push('Tiene un recibo impagado.');
  if (motivo === 'ESTADO_A_REVISAR') out.push('Si tienes dudas, avisa al estudio antes de dejarla pasar.');
  if (motivo === 'PENDIENTE_APROBACION' && d.claseEmpezada) {
    out.push('La clase ya ha empezado: una reserva pendiente no se puede aprobar después del inicio.');
  }
  return out;
}

/** Una línea por escaneo en el historial de accesos: qué pasó, en tres o cuatro palabras. */
export const MOTIVO_CORTO: Record<MotivoAcceso, string> = {
  RESERVA_CONFIRMADA: 'Reserva confirmada',
  PLAZA_FIJA: 'Plaza fija',
  YA_ENTRO: 'Ya había entrado',
  PENDIENTE_APROBACION: 'Pendiente de aprobación',
  CLIENTA_DESACTIVADA: 'Ficha desactivada',
  IMPAGO: 'Recibo impagado',
  VARIAS_CLASES: 'Reserva en varias clases',
  SIN_RESERVA: 'Sin reserva',
  RESERVA_CANCELADA: 'Reserva cancelada',
  LISTA_ESPERA: 'En lista de espera',
  NO_ASISTIO: 'Marcada como que no vino',
  RESERVA_OTRA_CLASE: 'Reserva de otra clase',
  CLASE_CANCELADA: 'Clase cancelada',
  CLASE_TERMINADA: 'Clase ya terminada',
  CLASE_NO_EMPEZADA: 'La clase aún no empezaba',
  SIN_CLASE_AHORA: 'Sin clase a esa hora',
  QR_NO_RECONOCIDO: 'QR no reconocido',
  QR_SUSTITUIDO: 'QR ya sustituido',
  QR_OTRO_ESTUDIO: 'QR de otro estudio',
  APROBADA_SIN_PLAZA: 'Aprobada, sin plaza libre',
  CLASE_YA_EMPEZADA: 'No se pudo aprobar: clase empezada',
  NO_PERMITIDO: 'No se le dejó pasar',
};

/** La decisión tomada tras un 🟠, dicha por quien la tomó. */
export const DECISION_LEGIBLE: Record<'DEJAR_PASAR' | 'APROBAR' | 'NO_PERMITIR', string> = {
  APROBAR: 'aprobó y dejó pasar',
  DEJAR_PASAR: 'dejó pasar',
  NO_PERMITIR: 'no permitió el acceso',
};
