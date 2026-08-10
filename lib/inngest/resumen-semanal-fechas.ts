// Lógica pura de fechas del resumen semanal, separada de
// lib/inngest/resumen-semanal.ts (que importa @/lib/db/supabase-admin y
// otros módulos con efectos) para que node --test pueda importarla sin
// arrastrar imports con alias @/ que el runtime de node no resuelve sin
// loader — mismo criterio que lib/decision/director.ts/tipos.ts, que solo
// usan `import type` para cruzar el alias @/.
//
// Lunes–domingo de la semana ANTERIOR a `hoy` (YYYY-MM-DD, UTC — mismo
// criterio que el resto del pipeline del Umbral, que ya trabaja en fechas
// UTC de calendario). `hoy` es lunes cuando corre el cron; la semana que
// acaba de cerrar es [hoy-7, hoy-1].
export function semanaAnterior(hoy: Date): { lunes: string; domingo: string; rangoTexto: string } {
  const domingo = new Date(hoy);
  domingo.setUTCDate(domingo.getUTCDate() - 1);
  const lunes = new Date(domingo);
  lunes.setUTCDate(lunes.getUTCDate() - 6);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const rangoTexto = `${lunes.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', timeZone: 'UTC' })} – ${domingo.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', timeZone: 'UTC' })}`;
  return { lunes: iso(lunes), domingo: iso(domingo), rangoTexto };
}
