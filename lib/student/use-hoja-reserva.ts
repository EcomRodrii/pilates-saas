'use client';

import { useCallback, useRef, useState } from 'react';
import { confirmarReserva } from '@/lib/student/reservar';
import { transicionValida } from '@/lib/student/maquina-reserva';
import { desenlaceDeLaHoja, type DesenlaceHoja } from '@/lib/student/desenlace-hoja';
import { vibrar } from '@/lib/nativo/puente';
import type { BookingState } from '@/lib/student/tipos';

/** Reservar una plaza o apuntarse a la lista de espera. */
export type ModoHoja = 'reservar' | 'espera';

/**
 * La máquina de la hoja de reserva: la de la ficha de la clase, sacada para que la fila del horario abra LA MISMA hoja
 * y vaya por el mismo POST (`confirmarReserva` → /api/public/reserva), sin un camino propio.
 *
 * ⚠️ Lo que NO hace, igual que antes: decidir si hay plaza, ni pintar «confirmada» antes de que el servidor lo diga.
 *
 * Lo que cambia respecto a la ficha de antes, a propósito:
 *  · Tras confirmar se releen los datos con `onCambio` (el `refrescar` de la pantalla, sin esqueleto). La ficha usaba
 *    `reintentar`, que pasa por `loading`: el esqueleto desmontaba la hoja a mitad de la celebración.
 *  · Una referencia evita el doble envío además del botón deshabilitado: dos toques seguidos antes de que React pinte el
 *    `loading` mandaban dos POST.
 *  · `modoEnviado`: mientras envía, la hoja no pasa de «Confirma tu plaza» a «Clase llena» porque el aforo en vivo traiga
 *    su propia reserva.
 */
export function useHojaReserva({ slug, studioId, online, onCambio, alCambiarDeEstado, abiertaAlEmpezar = false }: {
  slug: string;
  studioId: string;
  online: boolean;
  /** Relee los datos de la pantalla en silencio (sin esqueleto). Se llama cuando algo ha cambiado de verdad. */
  onCambio?: () => unknown;
  /** Para cerrar otra hoja (la de la instructora) al abrir esta: una hoja a la vez. */
  alCambiarDeEstado?: () => void;
  /**
   * La hoja nace abierta («Confirma tu plaza»): la vuelta desde la tienda tras comprar el bono PARA esta clase
   * (`?reservar=1`, solo cuando el servidor ya ha confirmado la compra). No reserva nada sola: abre la hoja, y
   * confirmar sigue siendo un toque suyo.
   */
  abiertaAlEmpezar?: boolean;
}) {
  const [bk, setBk] = useState<BookingState>(abiertaAlEmpezar ? 'reviewing' : 'idle');
  const [desenlace, setDesenlace] = useState<DesenlaceHoja | null>(null);
  const [modoEnviado, setModoEnviado] = useState<ModoHoja | null>(null);
  const enviando = useRef(false);

  /** Cambia de estado solo si la máquina lo permite. El mensaje pertenece a la respuesta que lo trajo. */
  const ir = useCallback((a: BookingState) => {
    alCambiarDeEstado?.();
    setDesenlace(null);
    setBk((de) => (transicionValida(de, a) ? a : de));
  }, [alCambiarDeEstado]);

  const abrir = useCallback(() => ir('reviewing'), [ir]);

  const confirmar = useCallback(async (claseId: string, spotId: string | null, modo: ModoHoja) => {
    if (enviando.current) return;
    if (!online) { ir('offline'); return; }
    enviando.current = true;
    setModoEnviado(modo);
    ir('submitting');
    try {
      // `confirmarReserva` no lanza nunca: traduce cualquier fallo a un estado que la hoja sabe pintar.
      const r = await confirmarReserva(slug, claseId, studioId, { online, spotId });
      setBk(r.state);
      // El toque de «hecho», SOLO cuando el servidor ha dicho que sí.
      if (r.state === 'confirmed') void vibrar('exito');
      setDesenlace(desenlaceDeLaHoja(r, spotId));
      // Los datos han cambiado (una plaza menos, una reserva más, o ya no hay sitio): sin releer, volver atrás enseña
      // lo de antes.
      if (r.state === 'confirmed' || r.state === 'waitlisted' || r.state === 'full') void onCambio?.();
    } finally {
      enviando.current = false;
    }
  }, [online, slug, studioId, ir, onCambio]);

  /** Durante el envío la hoja no se cierra: dejaría a la alumna sin saber en qué acabó. */
  const cerrar = useCallback(() => {
    if (bk === 'submitting') return;
    setDesenlace(null);
    setModoEnviado(null);
    setBk('idle');
  }, [bk]);

  return { bk, desenlace, modoEnviado, abrir, confirmar, cerrar, volverARevisar: abrir };
}

export type HojaReservaControl = ReturnType<typeof useHojaReserva>;
