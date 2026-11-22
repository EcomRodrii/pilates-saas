'use client';

import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Pantalla de bloqueo de /suscripcion (prueba terminada o límite del plan gratis
 * pasado), con la forma de la de Shopify medida en su admin (22-nov-2026): una
 * sola tarjeta centrada y partida — a la izquierda el titular, una frase, dos
 * píldoras y «Ver todos los planes»; a la derecha el panel blanco donde se elige
 * y se paga. Es presentación pura: el cobro, el plan elegido y los estados son de
 * la página, que se los pasa ya resueltos. Nada de lo que dice aquí se inventa.
 */

export interface OpcionPlanBloqueo {
  id: string;
  nombre: string;
  /** Ya formateado, p. ej. «29 €/mes». */
  precio: string;
  descripcion: string;
}

interface Props {
  titulo: string;
  frase: string;
  pildoras: string[];
  planes: OpcionPlanBloqueo[];
  elegido: string;
  onElegir: (id: string) => void;
  /** Texto del botón de pago, ya con plan y precio. */
  textoBoton: string;
  onPagar: () => void;
  pagando: boolean;
  puedePagar: boolean;
  esPropietaria: boolean;
  notaPie: string;
  /** Ancla de la lista completa de planes que sigue debajo. */
  anclaPlanes: string;
}

export function PantallaBloqueo({
  titulo, frase, pildoras, planes, elegido, onElegir, textoBoton, onPagar,
  pagando, puedePagar, esPropietaria, notaPie, anclaPlanes,
}: Props) {
  return (
    <section
      aria-label={titulo}
      data-pantalla-bloqueo
      className="mx-auto mb-8 grid w-full max-w-[920px] overflow-hidden rounded-[24px] bg-[#0b1314] md:min-h-[490px] md:grid-cols-[1fr_1.05fr]"
      style={{ backgroundImage: 'radial-gradient(120% 90% at 0% 0%, #17302f 0%, #0b1314 62%)' }}
    >
      {/* Izquierda: lo que pasa y lo que sigue intacto */}
      <div className="flex flex-col justify-between gap-8 p-7 text-white sm:p-9">
        <div className="my-auto">
          <h2 className="text-[30px] font-normal leading-[1.1] tracking-[-0.03em] text-balance sm:text-[34px]">{titulo}</h2>
          <p className="mt-3 max-w-[28ch] text-[17px] leading-snug tracking-[-0.02em] text-white/70 text-pretty">{frase}</p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {pildoras.map(p => (
              <li key={p} className="rounded-full border border-white/20 px-3 py-1 text-[11px] leading-4 text-white/70">
                {p}
              </li>
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

      {/* Derecha: elegir y pagar */}
      <div className="m-2 flex flex-col rounded-[18px] bg-white p-5 text-[#101010] sm:p-6">
        <div role="radiogroup" aria-label="Plan" className="flex flex-col gap-2.5">
          {planes.map(p => {
            const activo = elegido === p.id;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={activo}
                onClick={() => onElegir(p.id)}
                className={cn(
                  'rounded-[14px] border px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#101010]',
                  activo ? 'border-[#101010] bg-[#f7f7f7]' : 'border-[#e3e3e3] hover:bg-[#fafafa]',
                )}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-[14px] font-semibold">
                    <span
                      aria-hidden="true"
                      className={cn('flex size-4 items-center justify-center rounded-full border', activo ? 'border-[#101010] bg-[#101010] text-white' : 'border-[#c9c9c9]')}
                    >
                      {activo && <Check size={10} strokeWidth={3.5} />}
                    </span>
                    {p.nombre}
                  </span>
                  <span className="text-[14px] font-semibold tabular-nums">{p.precio}</span>
                </span>
                <span className="mt-1 block pl-6 text-[12.5px] leading-snug text-[#616161]">{p.descripcion}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-auto pt-5">
          {esPropietaria ? (
            <>
              <button
                type="button"
                onClick={onPagar}
                disabled={pagando || !puedePagar}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#101010] px-5 text-[14px] font-medium text-white transition-colors hover:bg-[#2a2a2a] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#101010]"
              >
                {pagando && <Loader2 size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                {pagando ? 'Redirigiendo a Stripe…' : textoBoton}
              </button>
              <p className="mt-2.5 text-center text-[12px] leading-snug text-[#616161]">{notaPie}</p>
            </>
          ) : (
            <p className="rounded-xl bg-[#f7f7f7] px-4 py-3 text-center text-[13px] text-[#616161]">
              Solo la propietaria puede contratar el plan.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
