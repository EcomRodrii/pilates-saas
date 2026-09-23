'use client';

import { useEffect } from 'react';
import { capturarEvento } from '@/lib/posthog-cliente';
import { CLAVE_ORIGEN_ALTA, destinoDeEnlace, EVENTOS_LANDING, ubicacionDe, type MarcaAncestro } from '@/lib/landing/medicion';

// Medición mínima de la landing: qué botón lleva al alta, quién escribe por
// WhatsApp, quién llega a ver el precio y quién le da al vídeo. La lógica y el
// porqué viven en lib/landing/medicion.ts; esto solo engancha el DOM.
// No pinta nada. Todo pasa por `capturarEvento`, que ya decide si se puede
// medir aquí (lib/posthog-privacidad.ts) y es un no-op sin clave de PostHog.

function ancestrosDe(el: Element): MarcaAncestro[] {
  const lista: MarcaAncestro[] = [];
  for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
    lista.push({
      tag: n.tagName.toLowerCase(),
      id: n.id || undefined,
      clases: typeof n.className === 'string' ? n.className : undefined,
      rol: n.getAttribute('role'),
      ctaFinal: n.hasAttribute('data-cta-final'),
    });
  }
  return lista;
}

export function MedicionLanding() {
  useEffect(() => {
    // Captura, no burbuja: el popup y el FAB paran la propagación en algunos
    // de sus botones, y un enlace que abre pestaña nueva no deja otra ocasión.
    function alPulsar(e: MouseEvent) {
      const enlace = (e.target as Element | null)?.closest?.('a[href]');
      if (!enlace) return;
      const destino = destinoDeEnlace(enlace.getAttribute('href'), window.location.origin);
      if (!destino) return;
      const ubicacion = ubicacionDe(ancestrosDe(enlace));
      capturarEvento(destino === 'alta' ? EVENTOS_LANDING.clickAlta : EVENTOS_LANDING.clickWhatsapp, { ubicacion });
      // El alta sabrá de qué botón venía (lib/landing/medicion.ts, CLAVE_ORIGEN_ALTA).
      if (destino === 'alta') {
        try { window.sessionStorage.setItem(CLAVE_ORIGEN_ALTA, ubicacion); } catch { /* sin sessionStorage */ }
      }
    }
    document.addEventListener('click', alPulsar, true);

    // Precio: una vez por visita, cuando al menos un tercio de la sección está
    // en pantalla (llegar a verlo, no pasar de largo haciendo scroll rápido).
    let observador: IntersectionObserver | null = null;
    const precio = document.getElementById('precio');
    if (precio && 'IntersectionObserver' in window) {
      observador = new IntersectionObserver((entradas) => {
        if (entradas.some((x) => x.isIntersecting)) {
          capturarEvento(EVENTOS_LANDING.precioVisto);
          observador?.disconnect();
        }
      }, { threshold: 0.33 });
      observador.observe(precio);
    }

    // Vídeo del producto: el `play` no burbujea, pero sí se ve en captura.
    let videoContado = false;
    function alReproducir(e: Event) {
      if (videoContado) return;
      if (!(e.target instanceof HTMLVideoElement) || !e.target.closest('#producto')) return;
      videoContado = true;
      capturarEvento(EVENTOS_LANDING.videoReproducido);
    }
    document.addEventListener('play', alReproducir, true);

    return () => {
      document.removeEventListener('click', alPulsar, true);
      document.removeEventListener('play', alReproducir, true);
      observador?.disconnect();
    };
  }, []);

  return null;
}
