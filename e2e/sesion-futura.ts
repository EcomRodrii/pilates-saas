// ─────────────────────────────────────────────────────────────────────────────
// Una clase sembrada en el futuro cercano, para los specs del calendario que
// abren su formulario de Editar. Vivía copiada en tres specs
// (calendario-momentos, calendario-tres-recortes, preparar-clase-ia) y las tres
// copias tenían el mismo agujero: se saca aquí para arreglarlo una vez, mismo
// criterio que `socia-lista.ts` y `panel-sembrado.ts`.
//
// Por qué no a las 09:00 fijas de «hoy»: sesionYaEmpezada()
// (calendario-estado.ts) deshabilita Editar para cualquier clase cuyo inicio ya
// haya pasado, y un runner de CI que ejecutara después de las 09:00 volvía «ya
// empezada» la clase que el test necesitaba poder editar.
//
// Por qué NUNCA puede cruzar la medianoche DE MADRID: el formulario de editar
// tiene UN solo campo `fecha` compartido por horaInicio/horaFin, y desde RES-7-f
// los extrae y recombina en hora del ESTUDIO (openEdit()/toISO() en
// app/(dashboard)/calendario/page.tsx). `horaInvalida` compara las horas como
// cadenas HH:MM del mismo día, así que una clase de 23:15 a 00:10 en Madrid se
// marca —con razón, dado ese modelo— «La hora de fin debe ser posterior a la
// hora de inicio» y deja «Guardar cambios» deshabilitado. `Date.now() + 180 min`
// cae ahí si el runner arranca entre ~20:05 y ~21:00 de Madrid, y el spec
// fallaba según la hora del CI (28-sep-2026, run de main 36463284542).
//
// ⚠️ La versión anterior ya comprobaba esto, pero en UTC (`getUTCDate`), que es
// la medianoche que no le importa al formulario. Y serializaba SIN zona, así que
// el instante lo decidía el NAVEGADOR: UTC en CI, Madrid en un portátil de aquí
// — la misma cadena eran dos clases distintas según dónde corriera. Ahora va con
// `+00:00` explícito (el formato en que PostgREST devuelve un timestamptz), así
// que ni la zona del runner ni la de Chromium cambian nada.
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
