'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';
import { BannerEdicion } from './banner-edicion';
import { EDICION } from '@/lib/edicion/invierno-26';

// El aviso de «hay panel nuevo» (24-nov-2026: «no hay mensaje al panel de que ha habido actualización»). Sale UNA vez, arriba del Inicio, con
// el banner de la edición, y se queda cerrado cuando se pulsa la X (se recuerda en el navegador). Es lo que hace Shopify con sus Editions:
// se anuncian dentro del producto, sin bloquear nada ni abrir un diálogo.
const CLAVE = `tentare:aviso-edicion:${EDICION.slug}`;

export function AvisoEdicion() {
  const enInicio = usePathname() === '/dashboard';
  const [cerrado, setCerrado] = useState<boolean | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- lo recordado solo se puede leer en el navegador
  useEffect(() => { try { setCerrado(localStorage.getItem(CLAVE) === '1'); } catch { setCerrado(false); } }, []);
  if (!enInicio || cerrado !== false) return null;
  return (
    <section aria-label={`Novedad: ${EDICION.nombre} ${EDICION.temporada}`} className="relative mb-4">
      <p className="mb-2 text-[13px] text-muted-foreground">Hemos estrenado panel nuevo. Mira todo lo que ha cambiado:</p>
      <BannerEdicion className="ed-banner--aviso" />
      <button
        type="button"
        aria-label="Cerrar este aviso"
        onClick={() => { try { localStorage.setItem(CLAVE, '1'); } catch { /* se cierra solo esta vez */ } setCerrado(true); }}
        className="absolute right-3 top-9 z-10 grid size-7 place-items-center rounded-full bg-white/90 text-[#101010] shadow-sm transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </section>
  );
}
