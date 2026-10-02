// ─────────────────────────────────────────────────────────────────────────────
// Una clase sembrada en el futuro cercano, que se pueda EDITAR desde el
// calendario. Vivía copiada en tres specs (calendario-momentos,
// calendario-tres-recortes, preparar-clase-ia); aquí una sola vez.
//
// En el futuro y no a las 09:00 fijas de «hoy»: `sesionYaEmpezada()`
// (calendario-estado.ts) deshabilita Editar en cuanto la clase ha empezado, y un
// runner que corriera por la tarde volvía «ya empezada» la clase del test.
//
// ⚠️ Nunca puede cruzar la medianoche EN HORA DEL ESTUDIO. El formulario de
// editar tiene UN solo campo `fecha` para inicio y fin, los extrae y recombina
// en hora del estudio (openEdit()/toISO(), desde RES-7-f) y compara las horas
// como texto HH:MM del mismo día (`horaInvalida`, app/(dashboard)/calendario/
// page.tsx). Una franja 23:54–00:49 de Madrid sale «La hora de fin debe ser
// posterior…» con «Guardar cambios» deshabilitado, y el test muere a los 30 s
// esperando el clic.
//
// La guarda solo miraba la medianoche UTC (6ee820b5c, cuando el formulario aún
// pintaba en la hora del navegador), y eso dejaba sin cubrir de 20:05 a 21:00 de
// Madrid: medido el 28-sep-2026, `calendario-momentos` rojo en `main` (run
// 36463284542) y en cualquier PR que corriera a esa hora.
//
// ⚠️ Y la fecha va con `+00:00` explícito (el formato en que PostgREST devuelve
// un timestamptz). Sin zona, el instante lo decidía el NAVEGADOR —UTC en CI,
// Madrid en un portátil de aquí—: la misma cadena eran dos clases distintas
// según dónde corriera, y ninguna comprobación hecha en el runner valía para
// las dos.
// ─────────────────────────────────────────────────────────────────────────────

const TZ_ESTUDIO = 'Europe/Madrid';

/** Fecha `YYYY-MM-DD` de un instante en hora del estudio. */
const diaEstudio = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ_ESTUDIO }).format(d);
/** La hora (0–23) de reloj de Madrid de un instante. */
const horaDeMadrid = (d: Date) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ_ESTUDIO, hour: '2-digit', hourCycle: 'h23' }).format(d));

/** El instante de las `h:m` de reloj de Madrid en esa fecha, con su desfase real (+1 h invierno, +2 h verano). */
function aLasDeMadrid(fecha: string, h: number, m = 0): Date {
  const [a, mes, dia] = fecha.split('-').map(Number);
  const supuesto = Date.UTC(a, mes - 1, dia, h, m);
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: TZ_ESTUDIO, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(supuesto)).map((p) => [p.type, p.value]));
  const comoMadrid = Date.UTC(+partes.year, +partes.month - 1, +partes.day, +partes.hour, +partes.minute);
  return new Date(supuesto - (comoMadrid - supuesto));
}

export function sesionFutura(offsetMinutos = 180, duracionMinutos = 55, ahora = Date.now()) {
  // Redondeado al minuto exacto: el formulario reconstruye la hora como
  // `${fecha}T${hora}:00` (toISO()) — con segundos sueltos, guardar sin tocar la
  // hora se detectaba como "cambioHora" (mismoInstante compara getTime()
  // exacto) y desviaba el test al diálogo equivocado.
  let inicio = new Date(ahora + offsetMinutos * 60_000);
  inicio.setUTCSeconds(0, 0);
  let fin = new Date(inicio.getTime() + duracionMinutos * 60_000);
  // Tiene que caber entera en un día de Madrid (ver arriba) y no de madrugada
  // (antes de las 04:00): ahí caen los cambios de hora, y la noche del 24 al
  // 25-oct una clase de 02:05 a 03:00 se lee en el formulario «02:05–02:00» y
  // tampoco se puede guardar. Si no, a las 10:00 de Madrid del día en que habría
  // acabado —mañana, casi siempre— (08:00 o 09:00 UTC): lejos de las dos
  // medianoches y dentro de la semana visible, que arranca HOY (weekStart).
  if (diaEstudio(inicio) !== diaEstudio(fin) || horaDeMadrid(inicio) < 4) {
    inicio = aLasDeMadrid(diaEstudio(fin), 10);
    fin = new Date(inicio.getTime() + duracionMinutos * 60_000);
  }
  const iso = (d: Date) => `${d.toISOString().slice(0, 19)}+00:00`;
  return { inicio: iso(inicio), fin: iso(fin) };
}

/**
 * La hora de reloj de Madrid (`HH:MM`) de `iso` más `minutos`: para MOVER la clase sembrada en un test, sin fijar una hora.
 * Con una fija (`18:30`) el test dependía de la hora a la que corriera: pasadas las 18:30 de Madrid ya es una hora pasada y
 * el aplazamiento no se guarda. Como la clase cabe entera en un día de Madrid (ver arriba), `inicio + 30 min` (menos que su
 * duración) cae siempre en ese mismo día y antes del fin.
 */
export function horaDeMadridMas(iso: string, minutos: number): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ_ESTUDIO, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(new Date(new Date(iso).getTime() + minutos * 60_000));
}
