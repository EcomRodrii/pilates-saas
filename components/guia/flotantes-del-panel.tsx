'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Lo que flota en la esquina del panel: el WhatsApp de soporte y el botón del
// asistente. Y, con el alta nueva (PR-5), el recorrido rápido.
//
//   · Panel de siempre: los dos, como siempre.
//   · Panel nuevo: el WhatsApp no flota (se amontonaban WhatsApp, el asistente y
//     la visita: el soporte va en el menú de ayuda)… SALVO con el alta nueva
//     mientras «Pon en marcha tu estudio» no esté terminada (decisión D5 del
//     fundador: «una persona, por WhatsApp, a la vista mientras la lista no esté
//     terminada»). Entonces el asistente sube encima de él (`solo` en falso),
//     como en el panel de siempre, y no se tapan.
//   · Terminada la lista, el WhatsApp se va y el asistente baja a la esquina.
//
// Lee solo `useCore()` y la respuesta del servidor (el estado del alta trae ya
// las cinco tareas contadas en la base de datos): esto se pinta en todas las
// pantallas y no puede suscribirse al god-context.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { WhatsAppFab } from '@/components/layout/whatsapp-fab';
import { AsistenteFlotante } from '@/components/asistente/asistente-flotante';
import { RecorridoRapido } from './recorrido-rapido';
import { useAltaNuevaPropia } from './use-pon-en-marcha';
import type { EstadoAlta } from '@/lib/alta/estado';

/** Las cinco tareas hechas, contadas por el servidor (la cuenta está hecha siempre). */
export function listaTerminadaEnServidor(e: EstadoAlta): boolean {
  return e.claseReservable && e.enlaceCompartido && e.alumnas && e.primeraReserva;
}

export function FlotantesDelPanel({ panelNuevo }: { panelNuevo: boolean }) {
  const pathname = usePathname();
  const alta = useAltaNuevaPropia();
  const estado = alta.estado;
  // Mientras no se sabe (`undefined`/`null`), con el alta nueva SÍ: mejor una
  // persona a mano de más que dejarla sola el primer minuto.
  const listaPendiente = alta.activo === true && !(estado && listaTerminadaEnServidor(estado));
  const conWhatsApp = pathname !== '/asistente' && (!panelNuevo || listaPendiente);
  const solo = panelNuevo && !conWhatsApp;
  // El mismo elemento mientras `solo` no cambie: React no vuelve a pintar el
  // botón del asistente (y su Tenti) cada vez que cambia el estado del alta.
  const asistente = useMemo(() => <AsistenteFlotante solo={solo} />, [solo]);

  return (
    <>
      {conWhatsApp && <WhatsAppFab />}
      {asistente}
      {alta.activo === true && alta.studioId && estado && listaPendiente && (
        <RecorridoRapido studioId={alta.studioId} puedeEmpezarSolo={!estado.recorridoVisto} />
      )}
    </>
  );
}
