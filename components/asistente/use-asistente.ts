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

// La conversación del panel, en un almacén de MÓDULO (no en el componente):
// cerrar el panel desmonta su contenido (y con él Tenti y cualquier
// temporizador), pero la conversación sigue ahí al volver a abrirlo. Este
// fichero viaja en el chunk diferido del panel, nunca en el del panel entero.
//
// El stream se lee con UN solo lector y se cancela al cerrar (o al empezar una
// conversación nueva): cancelar la lectura corta la petición, y el servidor
// deja de pagar a Anthropic (`cancel()` de su ReadableStream).

export interface SaldoAsistente {
  enPrueba: boolean;
  cuota: number;
  usadas: number;
  disponibles: number;
  renuevaEl: string | null;
}

interface Almacen {
  estado: EstadoAsistente;
  saldo: SaldoAsistente | null;
}

let almacen: Almacen = { estado: ESTADO_INICIAL, saldo: null };
const oyentes = new Set<() => void>();
let corte: AbortController | null = null;
let studioActual: string | null = null;
let reabierta = false;

function emitir() { for (const o of oyentes) o(); }
function despachar(a: AccionAsistente) {
  almacen = { ...almacen, estado: reducirAsistente(almacen.estado, a) };
  emitir();
}
function suscribir(o: () => void) { oyentes.add(o); return () => { oyentes.delete(o); }; }

export function useAlmacenAsistente(): Almacen {
  return useSyncExternalStore(suscribir, () => almacen, () => almacen);
}

const CLAVE_CONVERSACION = (studioId: string) => `tentare-asistente-conversacion:${studioId}`;
function recordar(studioId: string, id: string | null) {
  try {
    if (id) localStorage.setItem(CLAVE_CONVERSACION(studioId), id);
    else localStorage.removeItem(CLAVE_CONVERSACION(studioId));
  } catch { /* sin almacenamiento: no se reabre, nada más */ }
}

/** Si cambia el estudio (cambio de sede), se empieza de cero: una conversación es de UNA sede. */
export function prepararEstudio(studioId: string) {
  if (studioActual === studioId) return;
  corte?.abort();
  corte = null;
  studioActual = studioId;
  reabierta = false;
  almacen = { estado: ESTADO_INICIAL, saldo: null };
  emitir();
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

/** La última conversación de esta persona en este estudio, al abrir por primera vez en esta carga. */
export async function reabrirUltima(studioId: string): Promise<void> {
  if (reabierta || almacen.estado.turnos.length) return;
  reabierta = true;
  let id: string | null = null;
  try { id = localStorage.getItem(CLAVE_CONVERSACION(studioId)); } catch { return; }
  if (!id) return;
  try {
    const res = await fetch(`/api/asistente/conversaciones/${encodeURIComponent(id)}`, { headers: await authHeader(), cache: 'no-store' });
    if (res.status === 404) { recordar(studioId, null); return; }
    if (!res.ok) return;
    const c = await res.json() as {
      id: string; llena?: boolean;
      turnos: { pregunta: string; texto: string; bloques: BloqueAsistente[] }[];
      referencias: Record<string, Referencia>;
    };
    // Si mientras tanto ya ha preguntado algo, no se pisa.
    if (almacen.estado.turnos.length || !Array.isArray(c.turnos) || c.llena) return;
    despachar({ tipo: 'cargar', conversacionId: c.id, turnos: c.turnos, referencias: c.referencias ?? {} });
  } catch { /* se queda en blanco: puede preguntar igual */ }
}

export function nuevaConversacion(studioId: string) {
  corte?.abort();
  corte = null;
  recordar(studioId, null);
  despachar({ tipo: 'nueva' });
}

/** Cerrar el panel corta la pregunta en vuelo (y se deja de pagar). Lo que ya llegó se queda. */
export function cortarAlCerrar() {
  if (!corte) return;
  corte.abort();
  corte = null;
  if (enVuelo(almacen.estado)) {
    despachar({ tipo: 'cortado', error: { codigo: 'RED', mensaje: 'Has cerrado el panel antes de que terminara la respuesta.', reintentar: true, nueva: false } });
  }
}

export function volverAReposo() { despachar({ tipo: 'reposo' }); }

let siguienteId = 0;

export async function preguntar(studioId: string, texto: string): Promise<void> {
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
      if (e.t === 'inicio') recordar(studioId, e.conversacionId);
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
}
