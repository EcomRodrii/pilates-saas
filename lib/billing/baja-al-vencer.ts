// Baja programada a fin de periodo: qué hace el cron con cada cuota vencida, y
// cuándo se puede programar. Puro, para poder probar la regla de dinero sin
// Inngest ni base de datos (migr 20260913231500).

/** Lo mínimo de una suscripción vencida que el cron necesita para decidir. */
export interface SuscripcionVencida {
  id: string;
  baja_al_vencer?: boolean | null;
}

/**
 * Reparte las cuotas vencidas: las marcadas con baja se CANCELAN (y no se les
 * genera recibo); el resto se renueva como siempre. Una suscripción nunca cae
 * en las dos listas.
 */
export function repartirVencidas<T extends SuscripcionVencida>(vencidas: readonly T[]): { renovar: T[]; cancelar: T[] } {
  const renovar: T[] = [];
  const cancelar: T[] = [];
  for (const s of vencidas) (s.baja_al_vencer === true ? cancelar : renovar).push(s);
  return { renovar, cancelar };
}

/**
 * Se puede programar la baja a fin de periodo solo en una cuota (MENSUAL)
 * ACTIVA con fecha de fin: un bono no se renueva solo, y sin fecha de fin no
 * hay «final del periodo» al que esperar.
 *
 * `hoyISO` ('YYYY-MM-DD', en hora del estudio): además, la fecha de fin no puede
 * haber pasado. Una cuota ya vencida puede tener generado su recibo de
 * renovación, y el dunning lo cobraría igual aunque la baja se programe
 * después: ahí lo honesto es «Cancelar ahora», no prometer que no se cobra.
 */
export function puedeProgramarBaja(
  sus: { estado: string; fechaFin: string | null },
  plan: { tipo: string } | null | undefined,
  hoyISO?: string,
): boolean {
  if (!plan || plan.tipo !== 'MENSUAL' || sus.estado !== 'ACTIVA' || !sus.fechaFin) return false;
  return hoyISO === undefined || sus.fechaFin.slice(0, 10) >= hoyISO;
}
