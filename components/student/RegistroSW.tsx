'use client';

import { useEffect } from 'react';
import { renovarSuscripcionPush } from '@/lib/student/push';

/**
 * Registra el service worker para la app de la alumna.
 *
 * Hasta ahora `/sw.js` solo se registraba dentro de `activarPush()`
 * (lib/notifications/push-client.ts:45), y su único llamador es la pantalla de
 * preferencias del PANEL: una alumna nunca llegaba a registrarlo, así que ni
 * había caché ni podía recibir avisos aunque los tuviera concedidos.
 *
 * Aquí se registra sin pedir permiso de notificaciones — son dos cosas
 * distintas y mezclarlas es lo que hace que las apps pidan permiso nada más
 * abrir. El permiso se pide cuando la alumna active los avisos, y `activarPush`
 * reutiliza este mismo registro.
 *
 * `scope` acotado a la app del estudio: sin eso el SW controlaría también el
 * panel y la landing, que no lo esperan.
 */
export function RegistroSW({ slug, studioId }: { slug: string; studioId: string }) {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // En desarrollo el SW cachea el HTML de Next y las recargas dejan de
    // reflejar los cambios; no aporta nada y confunde mucho.
    if (process.env.NODE_ENV !== 'production') return;
    // Dentro de la vista previa de «Apariencia de tu app» (un iframe del panel)
    // no: registraría la app en el navegador de la propietaria y su caché
    // podría servirle la versión de antes mientras prueba estilos.
    if (window.self !== window.top) return;

    const scope = `/portal/${encodeURIComponent(slug)}/`;
    navigator.serviceWorker.register('/sw.js', { scope })
      // Con el SW listo, se renueva la suscripción de este dispositivo si
      // la tiene (lib/student/push.ts). Vale para la alumna y la instructora:
      // las dos usan esta misma app.
      .then(() => renovarSuscripcionPush(studioId, slug))
      .catch(() => {
        // Un registro fallido no puede tumbar la app: sin SW simplemente no hay
        // caché ni push, y todo lo demás sigue funcionando contra la red.
      });
  }, [slug, studioId]);

  return null;
}
