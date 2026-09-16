import { ANCHOS_PORTADA, ANCHO_MAX_PORTADA, altoPortada, rutaPortada, type FormatoPortada, type PortadaRecursos as Portada } from '@/lib/recursos/guias';

// La portada de una guía de /recursos, servida tal cual la dejó
// scripts/portadas-recursos.mjs: AVIF con WebP de respaldo, sin next/image (la
// cuota de optimización de Vercel Hobby es de 5.000 transformaciones al mes y
// estas ya vienen a su tamaño). Mismo criterio que FotoLanding en la home.
//
// ⚠️ Los originales miden ~500 px: quien la pinte no debe darle más de
// ANCHO_MAX_PORTADA (480 px) de ancho CSS, o se ampliaría. `sizes` tiene que
// decir lo que mide de verdad.

const srcSet = (p: Portada, formato: FormatoPortada) =>
  ANCHOS_PORTADA.map((a) => `${rutaPortada(p, a, formato)} ${a}w`).join(', ');

export function PortadaRecursos({
  portada,
  sizes,
  prioritaria = false,
  className,
}: {
  portada: Portada;
  sizes: string;
  /** Solo la que está en el primer pantallazo: `eager` + `fetchpriority=high`. */
  prioritaria?: boolean;
  className?: string;
}) {
  return (
    <picture>
      <source type="image/avif" srcSet={srcSet(portada, 'avif')} sizes={sizes} />
      <img
        src={rutaPortada(portada, ANCHO_MAX_PORTADA, 'webp')}
        srcSet={srcSet(portada, 'webp')}
        sizes={sizes}
        width={ANCHO_MAX_PORTADA}
        height={altoPortada(portada, ANCHO_MAX_PORTADA)}
        alt={portada.alt}
        className={className}
        loading={prioritaria ? 'eager' : 'lazy'}
        fetchPriority={prioritaria ? 'high' : undefined}
        decoding={prioritaria ? undefined : 'async'}
      />
    </picture>
  );
}
