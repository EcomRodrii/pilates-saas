'use client';

import { useEffect, useRef } from 'react';

// Imagen de marca del hero de /network sin ninguna instructora destacada
// todavía (red nueva, sin fotos reales que mostrar) — sustituye al panel
// sólido con el isotipo. El desplazamiento es sutil y se calcula a partir de
// la posición del contenedor en el viewport, nunca de `scrollY` a secas (eso
// desincroniza el efecto en cuanto la sección no arranca en el top de la
// página). Respeta `prefers-reduced-motion`: sin él, la imagen se queda fija.
export function HeroParallax({ src, alt }: { src: string; alt: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let raf = 0;
    const OFFSET_MAX = 28;

    const actualizar = () => {
      const wrap = wrapRef.current;
      const img = imgRef.current;
      if (!wrap || !img) return;
      const rect = wrap.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      // 0 cuando el hero entra por abajo, 1 cuando sale por arriba.
      const progreso = (vh - rect.top) / (vh + rect.height);
      const clamped = Math.min(1, Math.max(0, progreso));
      const offset = (clamped - 0.5) * 2 * OFFSET_MAX;
      img.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0)`;
    };

    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(actualizar);
    };

    actualizar();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={wrapRef} className="relative overflow-hidden rounded-[26px]" style={{ aspectRatio: '1 / 1.08' }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- asset de marca fijo, no gestionado por el CMS de imágenes */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        className="absolute left-0 w-full object-cover"
        style={{ top: -30, height: 'calc(100% + 60px)', willChange: 'transform' }}
        loading="eager"
        fetchPriority="high"
        decoding="async"
      />
    </div>
  );
}
