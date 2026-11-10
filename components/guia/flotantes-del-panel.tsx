'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Lo que flota en la esquina del panel: UN botón de ayuda (con el asistente de Tentare y
// el WhatsApp de soporte dentro de su panel) y, con el alta nueva (PR-5), el recorrido
// rápido. Antes eran dos botones apilados (el de Tenti y el de ayuda): el fundador quiso
// uno solo (11-nov-2026). Solo se esconde en /asistente, donde el chat ocupa la pantalla.
//
// Lee solo `useCore()` y la respuesta del servidor (el estado del alta trae ya
// las cinco tareas contadas en la base de datos): esto se pinta en todas las
// pantallas y no puede suscribirse al god-context.
// ─────────────────────────────────────────────────────────────────────────────

import { usePathname } from 'next/navigation';
import { AyudaDelPanel } from '@/components/ayuda/ayuda-del-panel';
import { RecorridoRapido } from './recorrido-rapido';
import { useAltaNuevaPropia } from './use-pon-en-marcha';
import type { EstadoAlta } from '@/lib/alta/estado';

/** Las cinco tareas hechas, contadas por el servidor (la cuenta está hecha siempre). */
export function listaTerminadaEnServidor(e: EstadoAlta): boolean {
  return e.claseReservable && e.enlaceCompartido && e.alumnas && e.primeraReserva;
}

export function FlotantesDelPanel() {
  const pathname = usePathname();
  const alta = useAltaNuevaPropia();
  const estado = alta.estado;
  // Mientras no se sabe (`undefined`/`null`), con el alta nueva SÍ: mejor una
  // persona a mano de más que dejarla sola el primer minuto.
  const listaPendiente = alta.activo === true && !(estado && listaTerminadaEnServidor(estado));
  // UN solo botón en la esquina (fundador, 11-nov-2026: «no deben de estar los 2 separados»): el de
  // ayuda, con el asistente de Tentare dentro como pestaña. Solo se esconde en /asistente, donde el
  // chat ocupa la pantalla.
  const conLanzador = pathname !== '/asistente';

  return (
    <>
      {/* Siempre montado: el panel se abre también desde el menú de perfil y desde el botón de la esquina. */}
      <AyudaDelPanel conLanzador={conLanzador} />
      {alta.activo === true && alta.studioId && estado && listaPendiente && (
        <RecorridoRapido studioId={alta.studioId} puedeEmpezarSolo={!estado.recorridoVisto} />
      )}
    </>
  );
}
