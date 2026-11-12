'use client';

import { useEffect } from 'react';

// Entrada al hacer scroll: lo que está por debajo del pliegue se prepara (`lf-rv-pre`: transparente y algo más abajo) y entra una vez
// (`lf-rv-ok`) al acercarse a la pantalla, escalonado entre hermanos. Al terminar se quitan las clases, para que el hover de tarjetas y
// planes use su propio `transform`. Lo que ya se ve al cargar no se toca, y sin JS o con «reducir movimiento» no se esconde nada.
const OBJETIVOS = '.lf-confianza, .lf-cabeza, .lf-tarjeta, .lf-beneficios-foto, .lf-beneficios-texto, .lf-cta, .lf-plan, .lf-faq-izq, .lf-faq-lista details, .lf-contacto-texto, .lf-form, .lf-pie-rejilla';

export function Revelar() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
    const alto = window.innerHeight;
    const temporizadores: number[] = [];
    const io = new IntersectionObserver(
      entradas => {
        for (const e of entradas) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          el.classList.add('lf-rv-ok');
          io.unobserve(el);
          temporizadores.push(window.setTimeout(() => { el.classList.remove('lf-rv-pre', 'lf-rv-ok'); el.style.removeProperty('--i'); }, 1500 + Number(el.style.getPropertyValue('--i') || 0) * 90));
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.06 },
    );
    const hermanos = new Map<Element, number>();
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(OBJETIVOS))) {
      if (el.getBoundingClientRect().top < alto * 0.92) continue;
      const i = (hermanos.get(el.parentElement!) ?? 0);
      hermanos.set(el.parentElement!, i + 1);
      el.style.setProperty('--i', String(Math.min(i, 4)));
      el.classList.add('lf-rv-pre');
      io.observe(el);
    }
    return () => { io.disconnect(); temporizadores.forEach(clearTimeout); };
  }, []);
  return null;
}
