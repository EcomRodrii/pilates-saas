// Reglas puras de la hoja de instructora. Sin imports ni `@/` (ver push-estado.ts).

export interface ClaseMin { id: string; fecha: string; hora: string; instructoraId: string; plazasLibres: number }

/**
 * Las próximas clases que da esta instructora, en orden, de ahora en adelante.
 * Sale del mismo payload que el horario: cero peticiones nuevas.
 *
 * `horaAhora` (HH:mm) deja fuera las de HOY que ya han empezado: a las 17:00,
 * «Hoy · 13:00» no es una próxima clase.
 */
export function proximasClasesDe<T extends ClaseMin>(clases: T[], instructoraId: string, hoyISO: string, horaAhora = '00:00', max = 5): T[] {
  return clases
    .filter((c) => c.instructoraId === instructoraId && (c.fecha > hoyISO || (c.fecha === hoyISO && c.hora >= horaAhora)))
    .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora))
    .slice(0, max);
}

/** «4,8 · 23 valoraciones». `null` sin nota publicable (menos de 5 votos). */
export function notaTexto(rating: number | undefined, total: number | undefined): string | null {
  if (rating == null) return null;
  const n = rating.toFixed(1).replace('.', ',');
  if (!total) return n;
  return `${n} · ${total} ${total === 1 ? 'valoración' : 'valoraciones'}`;
}
