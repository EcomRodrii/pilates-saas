'use client';

import { catalogo, refrescarAforo } from '@/lib/student/catalogo';
import {
  proyectarAlumna, proyectarBonos, proyectarClases, proyectarInstructoras, proyectarPagos, proyectarPlazaFija, proyectarRecuperaciones, proyectarReservas,
} from '@/lib/student/mapeo';
import { hoyISO } from '@/lib/student/formato';
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

/** Plaza fija y recuperaciones (F2). Del mismo payload. */
export async function getPlazaFija(slug: string): Promise<{ plaza: PlazaFijaVista | null; recuperaciones: RecuperacionesVista }> {
  const d = await catalogo(slug);
  const ahora = new Date();
  const hora = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
  if (!d) return { plaza: null, recuperaciones: { disponibles: 0, proximaCaducidad: null } };
  return { plaza: proyectarPlazaFija(d, hoyISO(ahora), hora), recuperaciones: proyectarRecuperaciones(d, hoyISO(ahora)) };
}

// `confirmarReserva` y `cancelarReserva` NO viven aquí: son escrituras contra
// `POST /api/public/reserva` y su traducción de errores es la máquina de
// estados del diseño. Entran en F4, con su propio fichero y sus propios tests.

/** La ficha de la alumna: nombre, apellidos, email, teléfono. */
export async function getAlumna(slug: string): Promise<Alumna | null> {
  const d = await catalogo(slug);
  return d ? proyectarAlumna(d) : null;
}
