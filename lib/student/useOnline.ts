'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

/**
 * Estado de conexión + «reconectando» 1,5 s tras volver. Mismo contrato que
 * `hooks/useOnline.ts` del paquete de diseño, con otra implementación.
 *
 * El paquete lee `navigator.onLine` dentro de un `useEffect` y llama a
 * `setState`. Aquí eso no pasa el lint: la regla `react-hooks/set-state-in-effect`
 * está en error y CI corre con `--max-warnings 0`. Y la regla tiene razón — es
 * estado que vive FUERA de React, y para eso está `useSyncExternalStore`: da
 * el valor correcto en la primera pintura del cliente, sin el parpadeo del
 * banner que produce el patrón «montar y corregir».
 *
 * `getServerSnapshot` devuelve `true`: durante el SSR no hay navegador, y
 * suponer que hay conexión es lo único honesto — el banner es una corrección
 * hacia abajo, nunca al revés.
 *
 * ⚠️ `navigator.onLine` es SOLO una señal de UX, nunca una autorización: dice
 * que el dispositivo tiene interfaz de red, no que el servidor conteste. Lo
 * único que hace es enseñar el banner y deshabilitar botones; ninguna decisión
 * de reserva, cancelación o pago se toma con esto.
 */

function suscribir(alCambiar: () => void): () => void {
  window.addEventListener('online', alCambiar);
  window.addEventListener('offline', alCambiar);
  return () => {
    window.removeEventListener('online', alCambiar);
    window.removeEventListener('offline', alCambiar);
  };
}

const leer = () => navigator.onLine;
const leerEnServidor = () => true;

export function useOnline(): { online: boolean; reconectando: boolean } {
  const online = useSyncExternalStore(suscribir, leer, leerEnServidor);
  const [reconectando, setReconectando] = useState(false);

  // El «reconectando» sí es estado de React: nace de un EVENTO (volvió la red)
  // y se apaga solo a los 1,5 s. Se fija desde el manejador del evento, no
  // desde el cuerpo del efecto.
  const alVolver = useCallback(() => setReconectando(true), []);

  useEffect(() => {
    window.addEventListener('online', alVolver);
    return () => window.removeEventListener('online', alVolver);
  }, [alVolver]);

  useEffect(() => {
    if (!reconectando) return;
    const t = setTimeout(() => setReconectando(false), 1500);
    return () => clearTimeout(t);
  }, [reconectando]);

  return { online, reconectando };
}
