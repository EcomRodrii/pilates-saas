// ─────────────────────────────────────────────────────────────────────────────
// Una clase sembrada en el futuro cercano, que se pueda EDITAR desde el
// calendario. Vivía copiada en tres specs; aquí una sola vez.
//
// En el futuro y no a las 09:00 fijas de «hoy»: `sesionYaEmpezada()`
// (calendario-estado.ts) deshabilita Editar en cuanto la clase ha empezado, y un
// runner que corriera por la tarde volvía «ya empezada» la clase del test.
//
// ⚠️ Nunca puede cruzar la medianoche EN HORA DEL ESTUDIO. El formulario de
// editar tiene UN solo campo `fecha` para inicio y fin y compara las horas como
// texto HH:MM del mismo día (`horaInvalida`, app/(dashboard)/calendario/page.tsx),
// y pinta en hora del estudio (Europe/Madrid), no en la del navegador. Una
// franja 23:54–00:49 sale «La hora de fin debe ser posterior…» con «Guardar
// cambios» deshabilitado, y el test muere a los 30 s esperando el clic.
//
// La guarda solo miraba la medianoche UTC (6ee820b5c, cuando el formulario aún
// pintaba en la hora del navegador). Con el calendario en hora del estudio eso
// dejaba sin cubrir de 20:05 a 21:00 de Madrid en verano: medido el 28-sep-2026,
// `calendario-momentos` rojo en `main` y en cualquier PR que corriera en esa
// hora, con el formulario diciendo 23:54–00:49 sobre las 21:54 UTC. Se miran
// las DOS: la de UTC se queda para no mover lo que ya funcionaba en su franja.
// ─────────────────────────────────────────────────────────────────────────────

const TZ_ESTUDIO = 'Europe/Madrid';
const diaEnEstudio = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ_ESTUDIO }).format(d);

export function sesionFutura(offsetMinutos = 180, duracionMinutos = 55) {
  // Redondeado al minuto: el formulario reconstruye la hora como
  // `${fecha}T${hora}:00`, y con segundos sueltos guardar sin tocar la hora se
  // detectaba como «cambioHora» y desviaba el test al diálogo equivocado.
  let inicio = new Date(Date.now() + offsetMinutos * 60_000);
  inicio.setSeconds(0, 0);
  let fin = new Date(inicio.getTime() + duracionMinutos * 60_000);
  if (diaEnEstudio(inicio) !== diaEnEstudio(fin) || inicio.getUTCDate() !== fin.getUTCDate()) {
    // Mañana a las 10:00 UTC (las 11:00 o 12:00 del estudio): lejos de
    // cualquier medianoche, en UTC y en Madrid, y dentro del horario sembrado.
    inicio = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth(), inicio.getUTCDate() + 1, 10, 0, 0));
    fin = new Date(inicio.getTime() + duracionMinutos * 60_000);
  }
  const iso = (d: Date) => d.toISOString().slice(0, 19); // sin milisegundos ni 'Z'
  return { inicio: iso(inicio), fin: iso(fin) };
}
