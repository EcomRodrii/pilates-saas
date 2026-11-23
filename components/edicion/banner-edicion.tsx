import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { EDICION, TEXTO_PILDORA } from '@/lib/edicion/invierno-26';
import { ArteRayos } from './arte-rayos';
import './edicion.css';

/**
 * El banner de «Tentare Edición · Invierno 26», con la forma del de Shopify Editions en su centro de ayuda (medido el 23-nov-2026):
 * fondo azul #051DAA con la parte de arriba aclarada, esquinas de 20 px, titular en Inter 500 de 49 px con la segunda línea al 50 %,
 * una etiqueta mono al lado, el logo a la derecha arriba y una píldora blanca abajo a la derecha. El arte se mueve despacio.
 */
export function BannerEdicion({ className = '' }: { className?: string }) {
  return (
    <Link href={EDICION.ruta} className={`ed-banner ${className}`} aria-label={`${EDICION.nombre} ${EDICION.temporada}: ${TEXTO_PILDORA.toLowerCase()}`}>
      <span className="ed-banner-arte"><ArteRayos /></span>
      <span className="ed-banner-brillo" aria-hidden="true" />
      <span className="ed-banner-logo"><LogoTentare formato="isotipo" tinta="blanco" alto={34} titulo="Tentare" /></span>
      <span className="ed-banner-titulo">
        <span className="ed-banner-l1">{EDICION.nombre}</span>
        <span className="ed-banner-l2">
          <span>{EDICION.temporada}</span>
          <span className="ed-banner-mono">{EDICION.etiquetaMono}</span>
        </span>
      </span>
      <span className="ed-banner-pildora">{TEXTO_PILDORA} <ArrowUpRight size={14} aria-hidden="true" /></span>
    </Link>
  );
}
