// El evento de calendario de una clase, en iCalendar (RFC 5545).
//
// Vive aquí y no dentro de una pantalla porque lo piden DOS: la página pública
// de reservas (`app/reservar/[slug]/page.tsx`) y el portal de la alumna. Dos
// generadores del mismo formato es como se acaba con un `.ics` que Outlook
// acepta en un sitio y rechaza en el otro.
//
// Puro a propósito: devuelve el texto. Descargarlo es cosa del navegador y de
// quien lo llama, y así esto se puede probar con `node --test`.

export interface EventoCalendario {
  /** Id de la sesión. Va al UID, así que reimportar ACTUALIZA en vez de duplicar. */
  id: string;
  /** Instante real en ISO, no la hora de pared: un `.ics` sin zona miente. */
  inicio: string;
  fin: string;
  titulo: string;
  instructora?: string;
  sala?: string;
  estudioNombre: string;
  estudioDireccion?: string;
}

/** ISO → el formato UTC de iCalendar (`20260904T160000Z`). */
export function aFechaCal(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Escapa lo que iCalendar trata como sintaxis.
 *
 * ⚠️ No es cosmético: una coma sin escapar en «Carrer de la Pau, 12» PARTE el
 * campo en dos valores y el evento entra con la dirección a medias. El punto y
 * coma y la barra igual, y un salto de línea rompe la línea entera.
 */
function esc(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Un slug estable para el dominio del UID. */
function slugDe(nombre: string): string {
  return nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'estudio';
}

/**
 * El `.ics` de una clase.
 *
 * `ahora` entra por parámetro (no `new Date()` dentro) para que el DTSTAMP sea
 * comprobable en un test — mismo criterio que el resto de `lib/`.
 */
export function eventoIcs(e: EventoCalendario, ahora: Date): string {
  // UID y DTSTAMP son OBLIGATORIOS en RFC 5545: sin ellos Outlook puede
  // rechazar el evento sin decir por qué.
  const detalle = [
    e.instructora ? `Instructora: ${e.instructora}` : '',
    e.sala ? `Sala: ${e.sala}` : '',
  ].filter(Boolean).join(' · ');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${esc(e.estudioNombre)}//Reservas//ES`,
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${e.id}@${slugDe(e.estudioNombre)}`,
    `DTSTAMP:${aFechaCal(ahora.toISOString())}`,
    `DTSTART:${aFechaCal(e.inicio)}`,
    `DTEND:${aFechaCal(e.fin)}`,
    `SUMMARY:${esc(e.titulo)}`,
    `LOCATION:${esc([e.estudioNombre, e.estudioDireccion].filter(Boolean).join(', '))}`,
    ...(detalle ? [`DESCRIPTION:${esc(detalle)}`] : []),
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
    // RFC 5545 pide CRLF entre líneas, no `\n`.
  ].join('\r\n');
}

/** El nombre del fichero: `reformer-suave-2026-09-04.ics`. */
export function nombreIcs(titulo: string, inicio: string): string {
  const base = titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'clase';
  return `${base}-${inicio.slice(0, 10)}.ics`;
}
