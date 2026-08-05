'use client';

// Contador de avisos sin leer — solo el número, sin la bandeja.
//
// La campana del portal de la socia enseña un numeral y nada más, así que no
// puede reusar <NotificationBell> (components/notifications/notification-bell.tsx),
// que además de `unread` necesita `items` para desplegar la lista. Lo que sí
// comparte es la fuente: `fetchNotificaciones`, ya parametrizada por la función
// de cabeceras para servir a los tres roles.
//
// ⚠️ Antes de esto la campana del portal contaba lo suyo aparte (reservas y
// recibos derivados en el cliente, con el "leído hasta" en localStorage), de
// modo que el número no describía la lista que abría — y como la pantalla de
// Avisos marca leído contra el motor, el contador no bajaba nunca. Una sola
// fuente para el número y para la lista, o vuelve a pasar.

import { useEffect, useRef, useState } from 'react';
import { fetchNotificaciones } from './client.ts';

type Headers = () => Promise<Record<string, string>>;

/**
 * Avisos sin leer del usuario del JWT. `null` = **no se sabe** (aún cargando, o
 * la petición falló). Quien pinte el número decide qué enseñar en ese caso — un
 * `0` sería afirmar «estás al día» sin haberlo comprobado.
 *
 * `activo: false` deja el hook en `null` sin pedir nada. Lo usa el preview de
 * temas, que monta la misma vista dentro de un iframe del mismo origen: allí
 * hay token de socia en localStorage si la propietaria entró alguna vez a su
 * propio portal, y el contador saldría con datos reales dentro del editor.
 *
 * `getHeaders` se guarda en una ref: si el llamador pasara una lambda en línea,
 * tenerla como dependencia del efecto sería un bucle infinito de peticiones
 * (fetch → setState → render → función nueva → efecto → fetch). Hoy los dos
 * llamadores posibles (`portalAuthHeader`/`authHeader`) son funciones de módulo
 * estables, pero el hook es exportado y no puede depender de eso.
 */
export function useNotificacionesSinLeer(getHeaders: Headers, studioId: string | undefined, activo = true): number | null {
  const [sinLeer, setSinLeer] = useState<number | null>(null);
  const getHeadersRef = useRef(getHeaders);
  // La sincronización va en su propio efecto, no en el cuerpo: escribir una ref
  // durante el render está prohibido (react-hooks/refs). Declarado ANTES del
  // efecto de carga para que en cada render se actualice primero; en el primer
  // render ya vale lo correcto por el valor inicial de useRef.
  useEffect(() => { getHeadersRef.current = getHeaders; });

  useEffect(() => {
    // Sin estudio no se puede acotar la bandeja a este portal, y contar sin
    // acotar es lo que enseñaba a la propietaria sus avisos de panel en la
    // campana de socia. `studioId` llega del contexto un render después, de ahí
    // que esté en las dependencias: sin él, el contador se quedaría en `null`
    // para siempre.
    if (!activo || !studioId) return;
    let vivo = true;
    // Contador de secuencia: `visibilitychange` puede lanzar una segunda
    // petición antes de que vuelva la primera, y sin esto ganaría la que
    // respondiese la última, que puede ser la más vieja.
    let ultima = 0;
    const cargar = async () => {
      const mia = ++ultima;
      try {
        const { unread } = await fetchNotificaciones(getHeadersRef.current, { ambito: 'socia', studioId });
        if (vivo && mia === ultima) setSinLeer(unread);
      } catch {
        // Sin red (o `fetch` rechazado por lo que sea) no se sabe cuántos hay,
        // y decir «0» sería mentir. Se deja en `null` y se reintenta al volver
        // al primer plano. Sin este catch la promesa quedaba sin capturar.
        if (vivo && mia === ultima) setSinLeer(null);
      }
    };
    void cargar();

    // Sin intervalo, a diferencia de la campana del panel: aquí no hay bandeja
    // abierta que mantener fresca y la socia está en un móvil. Volver de Avisos
    // remonta la vista y vuelve a pedirlo.
    //
    // ⚠️ Carrera conocida, no cerrada: Avisos lanza su `read-all` sin esperarlo
    // (fire-and-forget, notificaciones/page.tsx), así que volver de inmediato
    // puede adelantar este GET al PATCH y dejar el contador viejo hasta el
    // siguiente primer plano. Cerrarlo de verdad pide coordinar las dos
    // pantallas; se documenta en vez de fingir que el remontaje basta.
    //
    // Lo que el montaje no cubre es el
    // portal instalado como PWA en iOS, donde un restore desde bfcache devuelve
    // el documento con el estado JS congelado — de ahí este oyente (mismo
    // patrón que `alPrimerPlano` en lib/studio-context.tsx).
    const alVolver = () => { if (document.visibilityState === 'visible') void cargar(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => { vivo = false; document.removeEventListener('visibilitychange', alVolver); };
  }, [activo, studioId]);

  return sinLeer;
}
