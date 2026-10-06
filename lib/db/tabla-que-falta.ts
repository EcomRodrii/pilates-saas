// ¿El error dice que la TABLA no existe (todavía)? Para el código que va desplegado antes
// que su migración y tiene que seguir como antes mientras tanto (pagos_clase, P06).
//
// ⚠️ Dos códigos, no uno: Postgres contesta `42P01` («relation does not exist»), pero
// PostgREST, que es por donde pasa supabase-js, contesta `PGRST205` cuando la tabla no
// está en su caché de esquema, sin llegar a Postgres. Mirar solo `42P01` dejaba el
// respaldo «sin tabla» sin efecto con el PostgREST actual (revisión del 6-oct-2026).
//
// Puro, sin `@/`.

export const CODIGOS_TABLA_QUE_FALTA = ['42P01', 'PGRST205'] as const;

export function esTablaQueFalta(error: { code?: string | null } | null | undefined): boolean {
  return !!error?.code && (CODIGOS_TABLA_QUE_FALTA as readonly string[]).includes(error.code);
}
