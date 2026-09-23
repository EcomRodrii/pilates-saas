// Dónde cae un instante en la rejilla del calendario: día y minuto DEL ESTUDIO.
//
// RES-2 (auditoría 23-sep). El calendario colocaba cada clase con
// `new Date(iso).getHours()` y la agrupaba por día con `localDate()` — los dos
// en la zona del NAVEGADOR — mientras que la etiqueta de la tarjeta
// (`horaEstudio`) y todo lo que se escribe (`toISO`, R-3) van en Europe/Madrid.
// Con un navegador fuera de Madrid, una clase de las 10:00 se pintaba en la
// fila de las 01:00 (o del día anterior) rotulada «10:00», y soltarla donde
// estaba la movía el desfase de zona completo.
//
// Un solo formateador cacheado, no `fechaLocalDe` + `franjaLocalDe` por
// separado: `fechaLocalDe` construye un `Intl.DateTimeFormat` en cada llamada y
// aquí se llama por cada clase visible en cada recálculo del calendario.
//
// `hourCycle: 'h23'` y no `hour12: false`: este último devuelve «24» a
// medianoche en algunas versiones de ICU.

import { TZ_ESTUDIO } from './utils.ts';

const FORMATO = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ_ESTUDIO, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
});

export interface InstanteEnEstudio {
  /** 'YYYY-MM-DD' del día del estudio. Vacío si el instante no es una fecha válida. */
  dia: string;
  /** Minutos desde las 00:00 del estudio (0–1439). NaN si el instante no es válido. */
  minutos: number;
}

export function enEstudio(instante: Date | string | number): InstanteEnEstudio {
  const d = instante instanceof Date ? instante : new Date(instante);
  // Sin esto `formatToParts` lanza RangeError en pleno render; el código de
  // antes (`getHours()`) devolvía NaN sin romper nada, y se conserva eso.
  if (Number.isNaN(d.getTime())) return { dia: '', minutos: NaN };
  const p: Record<string, string> = {};
  for (const parte of FORMATO.formatToParts(d)) p[parte.type] = parte.value;
  return {
    dia: `${p.year}-${p.month}-${p.day}`,
    minutos: Number(p.hour) * 60 + Number(p.minute),
  };
}

export function minutosEnEstudio(instante: Date | string | number): number {
  return enEstudio(instante).minutos;
}

export function diaEnEstudio(instante: Date | string | number): string {
  return enEstudio(instante).dia;
}
