'use client';

import { useEffect } from 'react';

// Entrada al hacer scroll para las páginas interiores de la web pública (guías, funcionalidades, soluciones, comparativas, precios…):
// lo que está por debajo del pliegue se prepara (`w-rv-pre`: casi transparente y algo más abajo) y entra una vez (`w-rv-ok`) al acercarse
// a la pantalla. Es la misma idea que la de la home (components/home-nueva/revelar.tsx), con el mismo resorte, sobre las SECCIONES de
// primer nivel de la página en vez de sobre clases de una sola maqueta: cada familia de páginas nombra las suyas distinto.
//
// Reglas, y por qué:
//  · Lo que ya se ve al cargar NO se toca: nada parpadea ni se mueve en el primer pintado (LCP/CLS intactos: solo opacity y transform).
//  · Sin JS, con «reducir movimiento», con la página impresa o con un navegador automatizado (`navigator.webdriver`: los tests de
//    Playwright esperan a que un elemento deje de moverse antes de pulsarlo) no se esconde nada.
//  · Una sección más alta que ~1,8 pantallas no se anima entera (aparecería a medias y de golpe): entra su contenido por partes o nada.
//  · Al terminar se quitan las clases, para que lo que lleve su propio `transform` (hover, sticky) no choque con el de la entrada.
const TOP = 'section, article > figure, .art-body > figure';
const EXCLUIDOS = 'nav, footer, header, details, dialog, [role="dialog"], [data-sin-revelar]';

export function RevelarWeb() {
  useEffect(() => {
    if (navigator.webdriver || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
    const alto = window.innerHeight;
    const temporizadores: number[] = [];
    const io = new IntersectionObserver(
      entradas => {
        for (const e of entradas) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          io.unobserve(el);
          el.classList.add('w-rv-ok');
          temporizadores.push(window.setTimeout(() => { el.classList.remove('w-rv-pre', 'w-rv-ok'); el.style.removeProperty('--w-i'); }, 1400));
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    );
    const hermanos = new Map<Element, number>();
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(TOP))) {
      // Solo el primer nivel: una sección dentro de otra no se anima dos veces.
      if (el.parentElement?.closest('section') || el.closest(EXCLUIDOS)) continue;
      const r = el.getBoundingClientRect();
      if (r.top < alto * 0.92 || r.height > alto * 1.8 || r.height < 40) continue;
      const i = hermanos.get(el.parentElement!) ?? 0;
      hermanos.set(el.parentElement!, i + 1);
      // El retraso escalonado solo vale entre hermanos que entran a la vez; con muchas secciones apiladas, ninguno.
      el.style.setProperty('--w-i', String(Math.min(i % 3, 2)));
      el.classList.add('w-rv-pre');
      io.observe(el);
    }
    return () => { io.disconnect(); temporizadores.forEach(clearTimeout); };
  }, []);
  return null;
}
