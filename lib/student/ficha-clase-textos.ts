// Las frases de la ficha de una clase (P10). Puras, sin nada nativo (ficha-clase-textos.test.ts).

import { etiquetaDia, horaFin } from './formato.ts';

const NIVEL: Record<string, string> = {
  Todos: 'Todos los niveles',
  Iniciación: 'Nivel iniciación',
  Medio: 'Nivel medio',
  Avanzado: 'Nivel avanzado',
};

/**
 * El antetítulo bajo la foto: solo el nivel. Antes era «Reformer · nivel todos», y `clase.tipo` y `clase.nombre` son el
 * MISMO campo (`proyectarClases`): el nombre salía dos veces, una encima de la otra.
 */
export function antetituloClase(nivel: string): string {
  return NIVEL[nivel] ?? NIVEL.Todos;
}

/** «Hoy · 10:00 – 10:50 · 50 min»: cuándo, de un vistazo, en la fila del calendario. */
export function textoCuando(c: { fecha: string; hora: string; duracionMin: number }, hoy: string): string {
  return `${etiquetaDia(c.fecha, hoy)} · ${c.hora} – ${horaFin(c.hora, c.duracionMin)} · ${c.duracionMin} min`;
}

/**
 * Dónde: la sala en la primera línea («Sala 1 · Estudio Alma») y la dirección debajo. Sin sala, solo el estudio; sin
 * dirección, sin segunda línea (y sin «Cómo llegar»: no hay a dónde llevarla).
 */
export function textoDonde(estudio: { nombre: string; direccion?: string | null }, sala: string): { linea: string; sub: string | null } {
  const direccion = (estudio.direccion ?? '').trim();
  return { linea: sala.trim() ? `${sala.trim()} · ${estudio.nombre}` : estudio.nombre, sub: direccion || null };
}

/**
 * Lo que se busca en Mapas: «Calle Larios 1, Marbella». Con la ciudad, una calle que se repite en media España no lleva
 * a otra ciudad. Lo usan la ficha y la tarjeta de Inicio, con la MISMA regla.
 */
export function consultaMapa(direccion: string | null | undefined, ciudad: string | null | undefined): string {
  return [direccion, ciudad].map((s) => (s ?? '').trim()).filter(Boolean).join(', ');
}

/**
 * «10 plazas · 3 libres». Con la clase empezada o terminada (`cerrada`), solo el aforo: las libres ya no se pueden coger
 * (el servidor rechaza una clase empezada), así que anunciarlas sería ofrecer algo que no hay (RES-11).
 */
export function textoPlazas(capacidad: number, libres: number, cerrada: boolean): string {
  const plazas = `${capacidad} ${capacidad === 1 ? 'plaza' : 'plazas'}`;
  return cerrada ? plazas : `${plazas} · ${libres} ${libres === 1 ? 'libre' : 'libres'}`;
}

/**
 * La política de cancelación de ESTA clase, con la ventana ya resuelta (tipo ?? estudio). «Cancelación gratis hasta N h
 * antes» es verdad: antes de esa ventana no se detecta ninguna penalización. El importe por cancelar tarde lo cuenta
 * Mis clases al cancelar (decisión: la ficha no habla de dinero en este bloque).
 */
export function textoCancelacion(aviso: { devolveriaCredito: boolean; horasVentana: number }, opciones: { gastaSesion?: boolean } = {}): string {
  if (aviso.devolveriaCredito) return `Cancelación gratis hasta ${aviso.horasVentana} h antes`;
  // A quien viene con su cuota (o con su clase fija) no se le gasta ninguna sesión: «no se devuelve la sesión» le hablaba
  // de algo que no tiene. Lo que sí es verdad es que cancelar ya es tarde.
  return opciones.gastaSesion === false
    ? `Quedan menos de ${aviso.horasVentana} h: cancelar ahora ya es tarde`
    : 'Ya no se devuelve la sesión si cancelas';
}

/** «+10 créditos al asistir», con el nombre que el estudio da a sus créditos (ya resuelto). */
export function textoCreditosAlAsistir(n: number, nombreCreditos: string): string {
  return `+${n} ${nombreCreditos} al asistir`;
}
