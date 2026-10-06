'use client';

import { useEffect, type RefObject } from 'react';
import { ESTADO_INICIAL, siguienteEstado } from '@/lib/landing/isla-scroll';

// El oyente de la «isla»: pone `data-compacta` en la barra al bajar y lo quita
// al subir (reglas en lib/landing/isla-scroll.ts).
//
// Va por atributo en el DOM y no por estado de React a propósito: un setState
// por cada tick de scroll re-renderizaría la cabecera entera. Aquí el oyente es
// pasivo, se despacha una vez por fotograma (requestAnimationFrame) y solo
// escribe cuando el estado CAMBIA — dos veces por gesto, no por píxel.
//
// Quien navega con teclado nunca debe tropezar con enlaces escondidos: al
// pulsar Tab o enfocar algo dentro de la isla, se alarga.
export function useIslaCompacta(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const nav = ref.current;
    if (!nav) return;

    let estado = { ...ESTADO_INICIAL, y: window.scrollY };
    let pendiente = false;

    const poner = (compacta: boolean) => {
      if (compacta) nav.setAttribute('data-compacta', '');
      else nav.removeAttribute('data-compacta');
    };

    const procesar = () => {
      pendiente = false;
      const previo = estado.compacta;
      estado = siguienteEstado(estado, window.scrollY);
      if (estado.compacta !== previo) poner(estado.compacta);
    };
    const alScroll = () => {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(procesar);
    };
    const alargar = () => {
      estado = { ...estado, compacta: false, acumulado: 0 };
      poner(false);
    };
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Tab') alargar(); };

    poner(false);
    window.addEventListener('scroll', alScroll, { passive: true });
    document.addEventListener('keydown', alTeclear);
    nav.addEventListener('focusin', alargar);
    return () => {
      window.removeEventListener('scroll', alScroll);
      document.removeEventListener('keydown', alTeclear);
      nav.removeEventListener('focusin', alargar);
    };
  }, [ref]);
}
