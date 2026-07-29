// Las dos frases que la pantalla de Avisos escribe con datos: el subtítulo que
// cuenta lo que hay sin leer, y el sello temporal de cada aviso.
//
// Están aquí y no en el JSX porque son lenguaje, no maquetación: el diseño pone
// "Dos cosas nuevas." y "HACE 2 H", no "2 nuevas" ni "hace 2 horas". Escribir el
// número en letra hasta nueve es lo que separa una app de un panel de control.

const NUMEROS = ['cero', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/**
 * El subtítulo bajo el título. `sinLeer` es lo NUEVO, no el total: una bandeja
 * con veinte avisos ya leídos no tiene nada que contar.
 */
export function resumenAvisos(sinLeer: number): string {
  if (sinLeer <= 0) return 'Nada nuevo.';
  if (sinLeer === 1) return 'Una cosa nueva.';
  const cantidad = sinLeer < NUMEROS.length ? NUMEROS[sinLeer] : String(sinLeer);
  return `${cantidad[0].toUpperCase()}${cantidad.slice(1)} cosas nuevas.`;
}

/** Mismo día natural (en la hora del navegador, no en UTC). */
function mismoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

/**
 * El sello de cada aviso. Se devuelve en minúscula: quien lo pinta le aplica
 * versalitas por CSS, así que aquí no hay que gritar.
 *
 * Hoy → "hace 2 h" · ayer → "ayer" · antes → "27 de julio" (con año si no es
 * este). El corte por DÍA NATURAL, no por 24 horas: un aviso de las 22:00 visto
 * a la 01:00 es de ayer, aunque solo hayan pasado tres horas.
 */
export function selloTemporal(iso: string, ahora: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';

  const horas = Math.floor((ahora.getTime() - d.getTime()) / 3_600_000);
  if (horas < 1 && mismoDia(d, ahora)) return 'ahora mismo';
  if (mismoDia(d, ahora)) return `hace ${horas} h`;

  const ayer = new Date(ahora);
  ayer.setDate(ayer.getDate() - 1);
  if (mismoDia(d, ayer)) return 'ayer';

  const fecha = `${d.getDate()} de ${MESES[d.getMonth()]}`;
  return d.getFullYear() === ahora.getFullYear() ? fecha : `${fecha} de ${d.getFullYear()}`;
}
