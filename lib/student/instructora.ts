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

/**
 * HH:mm del reloj local, el mismo con el que `hoyISO()` decide qué día es.
 *
 * Vive aquí y no dentro de una pantalla porque lo necesitan DOS: la hoja de la
 * instructora y la lista de «Conoce al equipo». Tenerlo dos veces es tenerlo
 * mal una vez: basta con que una de las copias se olvide del `padStart` para
 * que a las 9:05 una clase de las 10:00 deje de ser «próxima» (porque '9:05'
 * es mayor que '10:00' comparando cadenas).
 */
export function horaLocalAhora(d = new Date()): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** «4,8 · 23 valoraciones». `null` sin nota publicable (menos de 5 votos). */
export function notaTexto(rating: number | undefined, total: number | undefined): string | null {
  if (rating == null) return null;
  const n = rating.toFixed(1).replace('.', ',');
  if (!total) return n;
  return `${n} · ${total} ${total === 1 ? 'valoración' : 'valoraciones'}`;
}
