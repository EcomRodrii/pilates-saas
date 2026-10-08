// Tarjeta regalo — lo que viaja en la sesión de Checkout y cómo se lee de vuelta.
// Puro (sin `@/`, sin Stripe): el webhook, la página de vuelta y los tests usan lo mismo.
// La metadata la escribe SOLO nuestro servidor al crear la sesión; aun así, al volver se
// revalida todo (importe contra lo cobrado, rangos, emails), porque un evento mal formado
// no puede acuñar saldo.
import { EMAIL_VALIDO, MAX_MENSAJE, MAX_NOMBRE } from './reglas.ts';

export const ORIGEN_REGALO = 'regalo';

export interface DatosSesionRegalo {
  studioId: string; importeEur: number; caducidadMeses: number;
  compradorNombre: string; compradorEmail: string;
  destinatarioNombre: string; destinatarioEmail: string; mensaje: string;
}

export function metadataDeRegalo(d: DatosSesionRegalo): Record<string, string> {
  return {
    origen: ORIGEN_REGALO, studioId: d.studioId, importeEur: String(d.importeEur), caducidadMeses: String(d.caducidadMeses),
    compradorNombre: d.compradorNombre, compradorEmail: d.compradorEmail,
    destinatarioNombre: d.destinatarioNombre, destinatarioEmail: d.destinatarioEmail, mensaje: d.mensaje,
  };
}

export const esSesionDeRegalo = (m: Record<string, string> | null | undefined): boolean => m?.origen === ORIGEN_REGALO;

/** Lee y revalida la metadata contra lo que Stripe dice que cobró (céntimos, EUR). */
export function leerSesionDeRegalo(
  m: Record<string, string> | null | undefined,
  cobro: { amountTotal: number | null; currency: string | null; pagado: boolean },
): { ok: true; datos: DatosSesionRegalo } | { ok: false; motivo: string } {
  if (!m || m.origen !== ORIGEN_REGALO) return { ok: false, motivo: 'no-es-regalo' };
  if (!cobro.pagado) return { ok: false, motivo: 'sin-pagar' };
  const importeEur = Number(m.importeEur);
  const caducidadMeses = Number(m.caducidadMeses);
  if (!Number.isInteger(importeEur) || importeEur <= 0 || importeEur > 2000) return { ok: false, motivo: 'importe-invalido' };
  if (!Number.isInteger(caducidadMeses) || caducidadMeses < 1 || caducidadMeses > 60) return { ok: false, motivo: 'caducidad-invalida' };
  if (cobro.currency?.toLowerCase() !== 'eur' || cobro.amountTotal !== importeEur * 100) return { ok: false, motivo: 'importe-no-coincide' };
  if (!m.studioId) return { ok: false, motivo: 'sin-estudio' };
  const nombreOk = (s?: string) => !!s && s.length <= MAX_NOMBRE;
  if (!nombreOk(m.compradorNombre) || !nombreOk(m.destinatarioNombre)) return { ok: false, motivo: 'nombres-invalidos' };
  if (!EMAIL_VALIDO.test(m.compradorEmail ?? '') || !EMAIL_VALIDO.test(m.destinatarioEmail ?? '')) return { ok: false, motivo: 'emails-invalidos' };
  const mensaje = (m.mensaje ?? '').slice(0, MAX_MENSAJE);
  return { ok: true, datos: {
    studioId: m.studioId, importeEur, caducidadMeses, compradorNombre: m.compradorNombre,
    compradorEmail: m.compradorEmail, destinatarioNombre: m.destinatarioNombre, destinatarioEmail: m.destinatarioEmail, mensaje,
  } };
}
