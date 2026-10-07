// Aforo fresco sobre el payload cacheado. Sin imports ni `@/` (ver push-estado.ts).
//
// `GET /api/public/aforo` trae SOLO las reservas de las clases próximas
// (ventana AFORO_VENTANA_DIAS), anónimas y cacheadas 5 s en CDN. Igual que
// `fusionarAforo` (lib/portal-aforo.ts): es un REEMPLAZO PARCIAL — se retiran
// las filas de las sesiones que la ventana cubre y se dejan intactas las demás
// (pasadas), porque sustituir la lista entera vaciaría el histórico.

export interface FilaAforoMin { sesion_id: string; estado: string }

export function aplicarAforo<T extends FilaAforoMin>(previas: T[], sesionIds: string[], frescas: T[]): T[] {
  const enVentana = new Set(sesionIds);
  const fuera = previas.filter((r) => !enVentana.has(r.sesion_id));
  return [...fuera, ...frescas];
}

/**
 * Lo mismo para las plazas apartadas para ClassPass (`aforoApartadas`): las de la
 * ventana se sustituyen por las frescas (una que se ha liberado desaparece), las
 * de fuera se quedan.
 */
export function aplicarApartadas<T extends { sesion_id: string }>(previas: T[], sesionIds: string[], frescas: T[]): T[] {
  return aplicarAforo(previas as unknown as (T & FilaAforoMin)[], sesionIds, frescas as unknown as (T & FilaAforoMin)[]) as unknown as T[];
}
