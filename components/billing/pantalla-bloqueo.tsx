'use client';

import type { ReactNode } from 'react';

/**
 * Pantalla de bloqueo de /suscripcion (prueba terminada), con la forma de la de
 * Shopify medida en su admin (22-nov-2026): una sola tarjeta centrada y partida —
 * a la izquierda el titular, una frase, dos píldoras y «Ver todos los planes»;
 * a la derecha un panel blanco. Es solo el MARCO: lo que va dentro del panel
 * (selector de plan, aviso, botón de pago) lo pone la página tal cual y una sola
 * vez, así que cada control sigue existiendo una única vez, con su nombre y su
 * orden de siempre.
 */
interface Props {
  titulo: string;
  frase: string;
  pildoras: string[];
  /** Ancla de la lista de planes que sigue debajo. */
  anclaPlanes: string;
  children: ReactNode;
}

export function PantallaBloqueo({ titulo, frase, pildoras, anclaPlanes, children }: Props) {
  return (
    <section
      data-pantalla-bloqueo
      className="mx-auto mb-8 grid w-full max-w-[920px] overflow-hidden rounded-[24px] bg-[#0b1314] md:min-h-[490px] md:grid-cols-[1fr_1.05fr]"
      style={{ backgroundImage: 'radial-gradient(120% 90% at 0% 0%, #17302f 0%, #0b1314 62%)' }}
    >
      <div className="flex flex-col justify-between gap-8 p-7 text-white sm:p-9">
        <div className="my-auto">
          <h1 className="text-[30px] font-normal leading-[1.1] tracking-[-0.03em] text-balance sm:text-[34px]">{titulo}</h1>
          <p className="mt-3 max-w-[28ch] text-[17px] leading-snug tracking-[-0.02em] text-white/70 text-pretty">{frase}</p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {pildoras.map(p => (
              <li key={p} className="rounded-full border border-white/20 px-3 py-1 text-[11px] leading-4 text-white/70">{p}</li>
            ))}
          </ul>
        </div>
        <a
          href={`#${anclaPlanes}`}
          className="inline-flex h-9 w-fit items-center rounded-lg bg-[#283133] px-4 text-[13px] font-medium text-[#fafcfc] transition-colors hover:bg-[#344043] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Ver todos los planes
        </a>
      </div>
      <div className="m-2 flex flex-col gap-4 rounded-[18px] bg-white p-5 text-[#101010] sm:p-6 [&_[role=radiogroup]]:!grid-cols-1">{children}</div>
    </section>
  );
}
