'use client';

import { useSyncExternalStore } from 'react';
import { authHeader } from '@/lib/api-client';
import { hoyEnEstudio } from '@/lib/utils';
import { lectorNdjson } from '@/lib/asistente/protocolo';
import {
  ERROR_DE_RED, ESTADO_INICIAL, enVuelo, errorDeRespuesta, reducirAsistente,
  type AccionAsistente, type ErrorUI, type EstadoAsistente, type Referencia,
} from '@/lib/asistente/estado-ui';
import type { BloqueAsistente } from '@/lib/asistente/tipos';

// La conversación del chat, en un almacén de MÓDULO (no en el componente):
// salir de /asistente desmonta la vista (y con ella Tenti y cualquier
// temporizador), pero la conversación sigue ahí al volver. Este fichero viaja en
// el chunk de /asistente, nunca en el del panel entero.
//
// El stream se lee con UN solo lector y se corta al parar, al salir de la vista
// o al empezar otra conversación: cancelar la lectura corta la petición, y el
// servidor deja de pagar a Anthropic (`cancel()` de su ReadableStream).

export interface SaldoAsistente {
  enPrueba: boolean;
  cuota: number;
  usadas: number;
  disponibles: number;
  renuevaEl: string | null;
}

export interface ConversacionListada { id: string; titulo: string; ultimaEn: string }

interface Almacen {
  estado: EstadoAsistente;
  saldo: SaldoAsistente | null;
  /** La columna izquierda: null mientras no ha llegado. */
  conversaciones: ConversacionListada[] | null;
}

let almacen: Almacen = { estado: ESTADO_INICIAL, saldo: null, conversaciones: null };
const oyentes = new Set<() => void>();
let corte: AbortController | null = null;
let studioActual: string | null = null;

function emitir() { for (const o of oyentes) o(); }
function despachar(a: AccionAsistente) {
  almacen = { ...almacen, estado: reducirAsistente(almacen.estado, a) };
  emitir();
}
function suscribir(o: () => void) { oyentes.add(o); return () => { oyentes.delete(o); }; }

export function useAlmacenAsistente(): Almacen {
  return useSyncExternalStore(suscribir, () => almacen, () => almacen);
}

/** Si cambia el estudio (cambio de sede), se empieza de cero: una conversación es de UNA sede. */
export function prepararEstudio(studioId: string) {
  if (studioActual === studioId) return;
  corte?.abort();
  corte = null;
  studioActual = studioId;
  almacen = { estado: ESTADO_INICIAL, saldo: null, conversaciones: null };
  emitir();
}

/** La lista de conversaciones (al abrir la vista, y al terminar una pregunta que crea una nueva). */
export async function cargarConversaciones(): Promise<void> {
  try {
    const res = await fetch('/api/asistente/conversaciones', { headers: await authHeader(), cache: 'no-store' });
    if (!res.ok) { if (!almacen.conversaciones) { almacen = { ...almacen, conversaciones: [] }; emitir(); } return; }
    const d = await res.json() as { conversaciones?: ConversacionListada[] };
    almacen = { ...almacen, conversaciones: Array.isArray(d.conversaciones) ? d.conversaciones : [] };
    emitir();
  } catch { /* la lista se queda como estaba */ }
}

/** Abre una conversación anterior de la lista. */
export async function abrirConversacion(id: string): Promise<void> {
  if (almacen.estado.conversacionId === id) return;
  corte?.abort();
  corte = null;
  try {
    const res = await fetch(`/api/asistente/conversaciones/${encodeURIComponent(id)}`, { headers: await authHeader(), cache: 'no-store' });
    if (!res.ok) return;
    const c = await res.json() as {
      id: string;
      turnos: { pregunta: string; texto: string; bloques: BloqueAsistente[] }[];
      referencias: Record<string, Referencia>;
    };
    if (!Array.isArray(c.turnos)) return;
    despachar({ tipo: 'cargar', conversacionId: c.id, turnos: c.turnos, referencias: c.referencias ?? {} });
  } catch { /* se queda donde estaba */ }
}

/** El botón de parar: corta la respuesta en vuelo. Lo que ya llegó se queda. */
export function parar() {
  if (!corte) return;
  corte.abort();
  corte = null;
  if (enVuelo(almacen.estado)) despachar({ tipo: 'cortado', error: null });
}

/** El saldo, al abrir el panel (una petición por apertura; después lo traen los eventos). */
export async function cargarSaldo(): Promise<void> {
  try {
    const res = await fetch('/api/asistente/saldo', { headers: await authHeader(), cache: 'no-store' });
    if (!res.ok) return;
    const s = await res.json() as SaldoAsistente;
    if (typeof s?.disponibles !== 'number') return;
    almacen = { ...almacen, saldo: s };
    despachar({ tipo: 'saldo', disponibles: s.disponibles });
  } catch { /* sin saldo se pinta sin la cifra; nada más */ }
}

export function nuevaConversacion() {
  corte?.abort();
  corte = null;
  despachar({ tipo: 'nueva' });
}

let vistas = 0;
/**
 * La vista se monta: devuelve su desmontaje. Al desmontarse la ÚLTIMA se corta
 * lo que esté en vuelo, en la siguiente vuelta del bucle y no en el acto: el
 * StrictMode de desarrollo desmonta y vuelve a montar en el mismo instante, y
 * eso no es salir.
 */
export function montarVista(): () => void {
  vistas++;
  return () => {
    vistas--;
    setTimeout(() => { if (vistas === 0) cortarAlSalir(); }, 0);
  };
}

/** Salir de la vista corta la pregunta en vuelo (y se deja de pagar). Lo que ya llegó se queda. */
export function cortarAlSalir() {
  if (!corte) return;
  corte.abort();
  corte = null;
  if (enVuelo(almacen.estado)) {
    despachar({ tipo: 'cortado', error: { codigo: 'RED', mensaje: 'Saliste antes de que terminara la respuesta.', reintentar: true, nueva: false } });
  }
}

export function volverAReposo() { despachar({ tipo: 'reposo' }); }

let siguienteId = 0;

export async function preguntar(texto: string): Promise<void> {
  const pregunta = texto.trim().slice(0, 500);
  if (!pregunta || enVuelo(almacen.estado)) return;
  const controlador = new AbortController();
  corte = controlador;
  despachar({ tipo: 'preguntar', id: `t${++siguienteId}`, pregunta });
  const fallar = (e: ErrorUI) => { if (corte === controlador) { corte = null; despachar({ tipo: 'fallo', error: e }); } };

  let res: Response;
  try {
    res = await fetch('/api/asistente', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ pregunta, ...(almacen.estado.conversacionId ? { conversacionId: almacen.estado.conversacionId } : {}) }),
      signal: controlador.signal,
    });
  } catch {
    if (!controlador.signal.aborted) fallar(ERROR_DE_RED);
    return;
  }
  if (!res.ok || !res.body) {
    const cuerpo = await res.json().catch(() => null) as { codigo?: string } | null;
    fallar(errorDeRespuesta(res.status, cuerpo, hoyEnEstudio(), almacen.saldo));
    return;
  }

  const lector = res.body.getReader();
  const nd = lectorNdjson();
  const decodificador = new TextDecoder();
  let cerrado = false;
  const aplicar = (eventos: ReturnType<typeof nd.empujar>) => {
    for (const e of eventos) {
      if (corte !== controlador) return;
      if (e.t === 'fin' || e.t === 'error') cerrado = true;
      despachar({ tipo: 'evento', e });
      if (e.t === 'fin' && almacen.saldo) almacen = { ...almacen, saldo: { ...almacen.saldo, disponibles: e.disponibles } };
    }
  };
  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      aplicar(nd.empujar(decodificador.decode(value, { stream: true })));
    }
    aplicar(nd.terminar());
  } catch {
    // Cancelado al cerrar (ya se anotó en cortarAlCerrar) o la red se cayó a medias.
  } finally {
    try { lector.releaseLock(); } catch { /* ya suelto */ }
  }
  if (corte === controlador) corte = null;
  if (!cerrado && !controlador.signal.aborted) despachar({ tipo: 'cortado', error: ERROR_DE_RED });
  // Una conversación nueva (o la última que se movió arriba): la lista se pone al día.
  if (cerrado) void cargarConversaciones();
}
