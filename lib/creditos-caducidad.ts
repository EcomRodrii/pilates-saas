// Cuándo un saldo de créditos sigue estando vivo.
//
// Sin imports ni `@/`, para poder probarlo con `node --test` (el alias no lo
// resuelve y varios tests de este repo dejaron de ejecutarse en silencio).
//
// El espejo de `saldo_vivo(int, date)` en SQL. Que existan los dos NO es
// duplicar la regla: el servidor la aplica porque es la última puerta y no
// puede fiarse de quien llame, y aquí se aplica porque la pantalla tiene que
// enseñar lo mismo que se podrá gastar. Si divergen, la clienta ve un saldo
// que el servidor le rechaza — y eso es peor que no enseñar saldo.

/** ¿Está vivo hoy? `null` = no caduca nunca. */
export function saldoEstaVivo(caducaEl: string | null | undefined, hoyISO: string): boolean {
  if (!caducaEl) return true;
  // Comparación de fechas ISO como TEXTO (YYYY-MM-DD): ordenan igual que las
  // fechas y así no se construye ningún `Date`, que arrastraría la zona
  // horaria del navegador. Caducar «hoy» todavía cuenta como vivo, igual que
  // en SQL (`caduca_el >= current_date`).
  return caducaEl >= hoyISO;
}

/** El saldo que de verdad se puede gastar hoy. */
export function saldoVivo(saldo: number, caducaEl: string | null | undefined, hoyISO: string): number {
  return saldoEstaVivo(caducaEl, hoyISO) ? saldo : 0;
}

/**
 * Días que faltan para caducar, o `null` si no caduca (o ya caducó).
 *
 * Sirve para decidir si avisar: un saldo que caduca dentro de ocho meses no
 * merece un aviso en pantalla, y uno que caduca la semana que viene sí.
 */
export function diasHastaCaducar(caducaEl: string | null | undefined, hoyISO: string): number | null {
  if (!caducaEl || !saldoEstaVivo(caducaEl, hoyISO)) return null;
  const ms = Date.parse(`${caducaEl}T00:00:00Z`) - Date.parse(`${hoyISO}T00:00:00Z`);
  return Number.isNaN(ms) ? null : Math.round(ms / 86_400_000);
}
