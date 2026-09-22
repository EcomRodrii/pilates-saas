'use client';

import { catalogo, refrescarAforo } from '@/lib/student/catalogo';
import {
  proyectarAlumna, proyectarBonos, proyectarClases, proyectarInstructoras, proyectarPagos, proyectarPlazasFijas, proyectarRecuperaciones, proyectarReservas,
} from '@/lib/student/mapeo';
import { horaAhora, hoyISO } from '@/lib/student/formato';
import { pedirCatalogoClasesFijas } from '@/lib/student/clases-fijas-datos';
import { proyectarClasesFijas, type ClaseFijaVista } from '@/lib/student/clases-fijas';
import { hoyEnEstudio } from '@/lib/utils';
import { tarjetasDescubre, type TarjetaDescubre } from '@/lib/student/descubre';
import type { Alumna, Bono, Clase, Instructora, Pago, PlazaFijaVista, RecuperacionesVista, Reserva } from '@/lib/student/tipos';

// ────────────────────────────────────────────────────────────────────────────
// ADAPTADOR: las nueve funciones del contrato del paquete de diseño
// (`lib/data/index.ts`), implementadas contra el backend real.
//
// Deliberadamente delgado: cada función es «pide el payload y proyéctalo». La
// traducción de verdad vive en `mapeo.ts`, que es puro y por tanto probable con
// el runner de Node contra un payload REAL — que es lo único que demuestra que
// los nombres de campo son los que el servidor manda y no los que uno supone.
// Ese reparto ya cazó un fallo silencioso: el backend dice `PRINCIPIANTE` y el
// diseño `Iniciación`, así que las cuatro clases se habrían pintado como
// «Todos» sin que nada avisara.
//
// Diferencia con el paquete: todas las funciones llevan `slug`. En el paquete
// el estudio es una constante global; aquí depende de la URL.
//
// ⚠️ Ninguna función de aquí DECIDE nada. No dice si una plaza está libre, si un
// bono cubre una clase o si una cancelación devuelve la sesión: eso lo resuelve
// el servidor. Aquí solo se traduce.
// ────────────────────────────────────────────────────────────────────────────

export async function getClases(slug: string, fecha?: string): Promise<Clase[]> {
  const d = await catalogo(slug);
  return d ? proyectarClases(d, fecha) : [];
}

/**
 * Como `getClases`, pero con el aforo recién leído de `/api/public/aforo`
 * (ligero, sin PII): para el horario y la hoja de clase, donde las plazas se
 * miran de verdad. El payload pesado sigue viniendo de la caché de 60 s.
 */
export async function getClasesFrescas(slug: string, fecha?: string): Promise<Clase[]> {
  const d = await catalogo(slug);
  if (!d) return [];
  const fresco = await refrescarAforo(slug);
  return proyectarClases(fresco ?? d, fecha);
}

/**
 * «Descubre» — las tarjetas con foto del estudio, del MISMO payload que todo lo
 * demás: ni una petición más por enseñarlas.
 */
export async function getDescubre(slug: string, hoy: string): Promise<TarjetaDescubre[]> {
  const d = await catalogo(slug);
  return d ? tarjetasDescubre(d.bannersPortal, hoy) : [];
}

/** Sale del mismo payload: no hay endpoint por id de clase. */
export async function getClase(slug: string, id: string): Promise<Clase | null> {
  const d = await catalogo(slug);
  return d ? proyectarClases(d).find((c) => c.id === id) ?? null : null;
}

export async function getInstructoras(slug: string): Promise<Instructora[]> {
  const d = await catalogo(slug);
  return d ? proyectarInstructoras(d) : [];
}

export async function getReservas(slug: string): Promise<Reserva[]> {
  const d = await catalogo(slug);
  return d ? proyectarReservas(d) : [];
}

export async function getBonos(slug: string): Promise<Bono[]> {
  const d = await catalogo(slug);
  return d ? proyectarBonos(d, Date.now()) : [];
}

export async function getPagos(slug: string): Promise<Pago[]> {
  const d = await catalogo(slug);
  return d ? proyectarPagos(d) : [];
}

/** Sus plazas fijas (todas) y recuperaciones (F2). Del mismo payload. */
export async function getPlazaFija(slug: string): Promise<{ plazas: PlazaFijaVista[]; recuperaciones: RecuperacionesVista }> {
  const d = await catalogo(slug);
  const ahora = new Date();
  // La hora EN LA ZONA DEL ESTUDIO: `plazas_fijas.hora_inicio` es el horario
  // del estudio, así que compararlo con la hora del móvil desplazaba la
  // «próxima» plaza fija un día entero para quien no esté en hora peninsular.
  const hora = horaAhora(ahora);
  if (!d) return { plazas: [], recuperaciones: { disponibles: 0, proximaCaducidad: null, detalle: [] } };
  return { plazas: proyectarPlazasFijas(d, hoyISO(ahora), hora), recuperaciones: proyectarRecuperaciones(d, hoyISO(ahora)) };
}

/**
 * Cuántas clases por semana mantienen la racha en ESTE estudio.
 *
 * Sale del mismo payload cacheado que todo lo demás, así que no añade una
 * petición. `1` cuando el estudio no lo ha decidido: es lo que hacía el código
 * antes de que fuera configurable.
 */
export async function getMinimoRacha(slug: string): Promise<number> {
  const d = await catalogo(slug);
  const n = d?.studio?.rachaClasesSemana;
  return typeof n === 'number' && n >= 1 ? Math.floor(n) : 1;
}

// `confirmarReserva` y `cancelarReserva` NO viven aquí: son escrituras contra
// `POST /api/public/reserva` y su traducción de errores es la máquina de
// estados del diseño. Entran en F4, con su propio fichero y sus propios tests.

/** La ficha de la alumna: nombre, apellidos, email, teléfono. */
export async function getAlumna(slug: string): Promise<Alumna | null> {
  const d = await catalogo(slug);
  return d ? proyectarAlumna(d) : null;
}

/**
 * Las clases fijas que ofrece el estudio, con lo que la alumna ya tiene, lo que ha
 * pedido y si su cuota las cubre. `null` = no se ha podido saber (la pantalla dice
 * que no ha cargado, no «no hay»). Las ofertas salen de `/api/public/clases-fijas`;
 * su cuota y sus plazas, del catálogo que la app ya tiene en memoria.
 */
export async function getClasesFijas(slug: string): Promise<ClaseFijaVista[] | null> {
  const [cat, d] = await Promise.all([pedirCatalogoClasesFijas(slug), catalogo(slug)]);
  if (!cat) return null;
  const socia = d?.socia
    ? { suscripciones: d.socia.suscripciones ?? [], plazasFijas: d.socia.plazasFijas ?? [] }
    : null;
  return proyectarClasesFijas(cat, socia, d?.planesTarifa ?? [], hoyEnEstudio());
}
