'use client';

// Llamadas del panel para el aviso de festivos. Nada optimista: lo que se pinta
// es lo que devuelve el servidor, y un cuerpo con otra forma se trata como
// fallo (o como «no disponible» al listar: sin datos fiables, no hay tarjeta).

import { authHeader } from '@/lib/api-client';
import { motivoDelCierre, type FestivoConClases } from './textos';
import { textoTrasCerrar } from '@/lib/cierres/dias-de-cierre';

export interface ListaFestivos {
  /** «Cataluña», o null si no sabemos su comunidad. */
  zona: string | null;
  hoy: string;
  festivos: FestivoConClases[];
}

const SIN_RED = 'No se ha podido conectar. Inténtalo de nuevo.';

function esFestivo(x: unknown): x is FestivoConClases {
  const f = x as Record<string, unknown> | null;
  return !!f && typeof f.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f.fecha) && typeof f.nombre === 'string'
    && typeof f.clases === 'number' && (f.reservas === null || typeof f.reservas === 'number');
}

/** null = apagado o sin datos fiables (no se enseña nada). */
export async function listarFestivos(alcance: 'aviso' | 'todos'): Promise<ListaFestivos | null> {
  const res = await fetch(`/api/festivos${alcance === 'todos' ? '?alcance=todos' : ''}`, { headers: await authHeader() }).catch(() => null);
  if (!res?.ok) return null;
  const d = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!d || d.disponible !== true || !Array.isArray(d.festivos) || typeof d.hoy !== 'string') return null;
  if (!d.festivos.every(esFestivo)) return null;
  return { zona: typeof d.zona === 'string' ? d.zona : null, hoy: d.hoy, festivos: d.festivos };
}

export async function abrirFestivo(fecha: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch('/api/festivos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ accion: 'abrir', fecha }),
  }).catch(() => null);
  if (!res) return { ok: false, error: SIN_RED };
  const d = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (res.ok && d?.ok === true) return { ok: true };
  return { ok: false, error: typeof d?.error === 'string' ? d.error : 'No se ha podido guardar. Inténtalo de nuevo.' };
}

/**
 * «Cerrar ese día»: el POST /api/cierres de siempre, con desde = hasta. Mismo
 * resultado que «Cerrar el centro» por construcción (cancelar avisando,
 * devolver la sesión según el estudio, prorrogar), y mismo texto de resumen.
 */
export async function cerrarFestivo(f: Pick<FestivoConClases, 'fecha' | 'nombre'>): Promise<{ ok: true; texto: string } | { ok: false; error: string }> {
  const res = await fetch('/api/cierres', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ desde: f.fecha, hasta: f.fecha, motivo: motivoDelCierre(f) }),
  }).catch(() => null);
  if (!res) return { ok: false, error: SIN_RED };
  const d = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) return { ok: false, error: typeof d?.error === 'string' ? d.error : 'No se ha podido cerrar ese día.' };
  // Hecho aunque la respuesta no se pueda leer: no se dice que falló.
  if (!d || typeof d.dias !== 'number') return { ok: true, texto: 'Día cerrado' };
  return { ok: true, texto: textoTrasCerrar(d as Parameters<typeof textoTrasCerrar>[0]) };
}
