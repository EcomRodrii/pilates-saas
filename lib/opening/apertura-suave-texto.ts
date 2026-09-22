import { inicioDelDiaEstudio } from '../utils.ts';

// Textos de la apertura suave, sin nada de servidor: los usan la API (al
// rechazar) y las pantallas públicas (para avisar antes de intentarlo).

const diaDe = (fechaApertura: string) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', timeZone: 'UTC' })
  .format(new Date(`${fechaApertura}T00:00:00Z`));

export const MENSAJE_APERTURA_SUAVE = (fechaApertura: string) =>
  `Esta clase es de la apertura suave, solo para fundadoras e invitadas. Abrimos a todas el ${diaDe(fechaApertura)}.`;

/**
 * La etiqueta que ve cualquiera en una clase de la apertura suave. Solo avisa:
 * quién puede reservarla lo decide el servidor (una fundadora sí puede).
 * `aperturaSuaveHasta`: la fecha de apertura si el estudio tiene la apertura
 * suave puesta; null si no.
 */
export function etiquetaAperturaSuave(inicioClaseISO: string, aperturaSuaveHasta: string | null | undefined): string | null {
  if (!aperturaSuaveHasta) return null;
  if (new Date(inicioClaseISO).getTime() >= new Date(inicioDelDiaEstudio(aperturaSuaveHasta)).getTime()) return null;
  return `Apertura suave · solo fundadoras e invitadas. Abrimos a todas el ${diaDe(aperturaSuaveHasta)}.`;
}
