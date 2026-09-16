// ─────────────────────────────────────────────────────────────────────────────
// Dónde empieza la semana del Calendario cuando algo te lleva a un día concreto
// (saltar a una clase, pinchar un día del mes, crear una clase, «ver la próxima»).
//
// La semana es PROGRESIVA: empieza el día que se le dice, no el lunes (ver
// `weekStart` en app/(dashboard)/calendario/page.tsx). Eso tenía una trampa: los
// cuatro sitios que llevan a un día hacían `setSemana(weekStart(ese día))` sin
// más, y saltar a una clase de mañana dejaba la semana empezando MAÑANA — hoy
// se caía de la vista. Lo vio la dueña: «hoy no aparece en el calendario».
//
// La regla, en orden:
//   1. Si el día ya se ve, la semana no se mueve: no hay nada que enseñar.
//   2. Si cae en los próximos 7 días desde hoy, la semana empieza HOY: se ve el
//      día pedido y hoy no desaparece.
//   3. Si está más lejos (o en el pasado), la semana empieza ese día.
//
// Se compara por día de calendario LOCAL (año-mes-día), no por milisegundos: una
// clase a las 20:00 y la medianoche del mismo día son el mismo día.
// ─────────────────────────────────────────────────────────────────────────────

const DIAS_SEMANA = 7;

function medianoche(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Días enteros de `desde` a `hasta`, por fecha local (no le afectan los cambios de hora). */
function diasEntre(desde: Date, hasta: Date): number {
  const a = medianoche(desde);
  const b = medianoche(hasta);
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86_400_000);
}

const dentroDe = (fecha: Date, inicio: Date) => {
  const n = diasEntre(inicio, fecha);
  return n >= 0 && n < DIAS_SEMANA;
};

export function semanaQueMuestra(fecha: Date, semanaActual: Date, hoy: Date): Date {
  if (dentroDe(fecha, semanaActual)) return semanaActual;
  if (dentroDe(fecha, hoy)) return medianoche(hoy);
  return medianoche(fecha);
}
