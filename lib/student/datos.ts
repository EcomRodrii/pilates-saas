'use client';

import { catalogo } from '@/lib/student/catalogo';
import {
  proyectarAlumna, proyectarBonos, proyectarClases, proyectarInstructoras, proyectarPagos, proyectarReservas,
} from '@/lib/student/mapeo';
import type { Alumna, Bono, Clase, Instructora, Pago, Reserva } from '@/lib/student/tipos';

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

// `confirmarReserva` y `cancelarReserva` NO viven aquí: son escrituras contra
// `POST /api/public/reserva` y su traducción de errores es la máquina de
// estados del diseño. Entran en F4, con su propio fichero y sus propios tests.

/** La ficha de la alumna: nombre, apellidos, email, teléfono. */
export async function getAlumna(slug: string): Promise<Alumna | null> {
  const d = await catalogo(slug);
  return d ? proyectarAlumna(d) : null;
}
