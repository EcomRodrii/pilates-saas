'use client';

import { useEffect } from 'react';
import { capturarEvento } from '@/lib/posthog-cliente';
import { CLAVE_ORIGEN_ALTA, destinoDeEnlace, EVENTOS_LANDING } from '@/lib/landing/medicion';

// Qué página pública (guía, comparativa, funcionalidad, solución…) trae cada
// alta. La landing tiene su propia medición (MedicionLanding) por secciones;
// el resto de páginas públicas no medía nada: una propietaria que llegaba de
// Google a una guía y se daba de alta no dejaba rastro de qué guía la trajo.
//
// Mismos eventos que la landing, con `ubicacion: 'pagina'` y la ruta en
// `pagina`, y la ruta como origen del alta (`alta_estudio_iniciada { desde }`).
// Así el embudo SEO se lee entero: consulta (Search Console) → página →
// clic al alta → estudio creado.
export function MedicionPaginasPublicas() {
  useEffect(() => {
    function alPulsar(e: MouseEvent) {
      const enlace = (e.target as Element | null)?.closest?.('a[href]');
      if (!enlace) return;
      const destino = destinoDeEnlace(enlace.getAttribute('href'), window.location.origin);
      if (!destino) return;
      const pagina = window.location.pathname;
      capturarEvento(destino === 'alta' ? EVENTOS_LANDING.clickAlta : EVENTOS_LANDING.clickWhatsapp, { ubicacion: 'pagina', pagina });
      if (destino === 'alta') {
        try { window.sessionStorage.setItem(CLAVE_ORIGEN_ALTA, pagina); } catch { /* sin sessionStorage */ }
      }
    }
    // Captura: un enlace que abre pestaña nueva no deja otra ocasión.
    document.addEventListener('click', alPulsar, true);
    return () => document.removeEventListener('click', alPulsar, true);
  }, []);
  return null;
}
