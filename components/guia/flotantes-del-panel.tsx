'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Lo que flota en la esquina del panel: el botón de ayuda (con el WhatsApp de
// soporte dentro de su pestaña Mensajes) y el botón del asistente. Y, con el alta nueva (PR-5), el recorrido rápido.
//
//   · El botón de ayuda flota siempre, en los dos paneles, y el del asistente sube
//     encima (`solo` en falso). Antes el panel nuevo lo escondía en cuanto la lista
//     «Pon en marcha tu estudio» estaba terminada (se amontonaban el WhatsApp, el
//     asistente y la visita); con el WhatsApp dentro del panel de ayuda ya no hay
//     tres cosas, hay dos botones. Solo se esconde en /asistente.
//
// Lee solo `useCore()` y la respuesta del servidor (el estado del alta trae ya
// las cinco tareas contadas en la base de datos): esto se pinta en todas las
// pantallas y no puede suscribirse al god-context.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { AyudaDelPanel } from '@/components/ayuda/ayuda-del-panel';
import { AsistenteFlotante } from '@/components/asistente/asistente-flotante';
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
  // El botón de ayuda flota SIEMPRE (10-nov-2026, el fundador: «sigue igual» al ver el panel nuevo sin
  // él): el WhatsApp ya no es un botón más, es una pestaña de su panel, y el asistente sube encima.
  // Lo único que se esconde es en /asistente, donde el chat ocupa la pantalla.
  const conLanzador = pathname !== '/asistente';
  const solo = !conLanzador;
  // El mismo elemento mientras `solo` no cambie: React no vuelve a pintar el
  // botón del asistente (y su Tenti) cada vez que cambia el estado del alta.
  const asistente = useMemo(() => <AsistenteFlotante solo={solo} />, [solo]);

  return (
    <>
      {/* Siempre montado: el panel se abre también desde el menú de perfil y desde el botón de la esquina. */}
      <AyudaDelPanel conLanzador={conLanzador} />
      {asistente}
      {alta.activo === true && alta.studioId && estado && listaPendiente && (
        <RecorridoRapido studioId={alta.studioId} puedeEmpezarSolo={!estado.recorridoVisto} />
      )}
    </>
  );
}
