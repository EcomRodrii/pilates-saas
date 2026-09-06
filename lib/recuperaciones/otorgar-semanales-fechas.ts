// Fechas del barrido semanal, aparte del módulo que hace IO.
//
// ⚠️ Vive en su propio fichero porque `otorgar-semanales.ts` importa con alias
// `@/lib/...`, y un test de `node --test` que arrastre un alias no falla: se cae
// entero y desaparece del recuento sin que nadie lo note.
/** El lunes y el domingo de la semana ANTERIOR a `hoy`, en días del estudio. */
export function semanaCerrada(hoy: Date): { desde: string; hasta: string } {
  // getUTCDay: 0=domingo. Se lleva a 0=lunes para restar limpio.
  const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()));
  const diaLunes0 = (d.getUTCDay() + 6) % 7;
  const lunesDeEsta = new Date(d.getTime() - diaLunes0 * 86_400_000);
  const lunes = new Date(lunesDeEsta.getTime() - 7 * 86_400_000);
  const domingo = new Date(lunes.getTime() + 6 * 86_400_000);
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  return { desde: iso(lunes), hasta: iso(domingo) };
}
