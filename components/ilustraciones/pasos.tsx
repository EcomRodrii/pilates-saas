import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { rutaIlustracion } from '@/lib/ilustraciones/manifiesto';

// ─────────────────────────────────────────────────────────────────────────────
// Ilustraciones ORIGINALES de las tarjetas de «siguiente paso» del Resumen (18-nov-2026, marco a
// sangre). Una escena por paso de la lista de arranque (`listaDeArranque`, ids de
// `lib/onboarding.ts`), en el lienzo de 286 × 140 de la tarjeta: dos o tres objetos planos sobre el
// fondo gris suave, con los tonos de `brand/` (Ink, lienzo y los dos acentos en pequeño).
// El formato de la tarjeta —imagen arriba con bisel interior— es una convención de UI; los dibujos
// no reproducen los de nadie. Decorativas (`aria-hidden`): el título y el texto de la tarjeta dicen
// lo que toca. Sin degradados ni emojis; colores solo con `var(--t-*)`.
// ─────────────────────────────────────────────────────────────────────────────

const TINTA = 'var(--t-text-primary)';
const TARJETA = 'var(--t-surface-raised)';
const HUECO = 'var(--t-surface-sunken)';
const LINEA = 'var(--t-border-default)';
const AZUL = 'var(--t-blue-500)';
const AZUL_SUAVE = 'var(--t-blue-100)';
const MAGENTA = 'var(--t-magenta-500)';
const MAGENTA_SUAVE = 'var(--t-magenta-100)';
const trazo = { stroke: TINTA, strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

const Salas = () => (<>
  <rect x="96" y="30" width="94" height="86" rx="8" fill={TARJETA} {...trazo} />
  <rect x="114" y="52" width="26" height="64" rx="3" fill={AZUL_SUAVE} {...trazo} />
  <circle cx="134" cy="86" r="2.2" fill={TINTA} />
  <rect x="152" y="52" width="26" height="22" rx="3" fill={HUECO} {...trazo} />
  <path d="M84 116h118" {...trazo} />
</>);
const Instructor = () => (<>
  <circle cx="143" cy="58" r="20" fill={AZUL_SUAVE} {...trazo} />
  <path d="M104 116c4-22 20-32 39-32s35 10 39 32z" fill={TARJETA} {...trazo} />
  <circle cx="176" cy="40" r="11" fill={MAGENTA_SUAVE} {...trazo} />
  <path d="M171 40l3.5 3.5L181 36" {...trazo} stroke={MAGENTA} fill="none" />
</>);
const Clase = () => (<>
  <rect x="78" y="32" width="130" height="78" rx="10" fill={TARJETA} {...trazo} />
  <rect x="92" y="46" width="50" height="8" rx="4" fill={AZUL} />
  <rect x="92" y="62" width="102" height="6" rx="3" fill={HUECO} />
  <rect x="92" y="74" width="80" height="6" rx="3" fill={HUECO} />
  <rect x="92" y="90" width="34" height="12" rx="6" fill={AZUL_SUAVE} {...trazo} strokeWidth={1} />
  <rect x="132" y="90" width="34" height="12" rx="6" fill={MAGENTA_SUAVE} {...trazo} strokeWidth={1} />
</>);
const Horario = () => (<>
  <rect x="70" y="28" width="146" height="88" rx="10" fill={TARJETA} {...trazo} />
  <path d="M70 48h146M118 48v68M166 48v68" stroke={LINEA} strokeWidth="1" />
  <rect x="78" y="56" width="32" height="14" rx="4" fill={AZUL_SUAVE} />
  <rect x="126" y="76" width="32" height="14" rx="4" fill={MAGENTA_SUAVE} />
  <rect x="174" y="56" width="32" height="14" rx="4" fill={AZUL} fillOpacity="0.6" />
  <rect x="78" y="94" width="32" height="14" rx="4" fill={HUECO} />
</>);
const Reservas = () => (<>
  <rect x="82" y="40" width="122" height="60" rx="12" fill={TARJETA} {...trazo} />
  <rect x="96" y="58" width="46" height="24" rx="12" fill={AZUL} {...trazo} />
  <circle cx="130" cy="70" r="8" fill={TARJETA} />
  <rect x="152" y="62" width="40" height="6" rx="3" fill={HUECO} />
  <rect x="152" y="74" width="28" height="6" rx="3" fill={HUECO} />
</>);
const PrimeraReserva = () => (<>
  <rect x="86" y="34" width="114" height="72" rx="10" fill={TARJETA} {...trazo} />
  <path d="M86 70h114" stroke={LINEA} strokeWidth="1.5" strokeDasharray="1 5" strokeLinecap="round" />
  <circle cx="143" cy="52" r="12" fill={MAGENTA_SUAVE} {...trazo} />
  <path d="M137 52l4.5 4.5L149 47" {...trazo} stroke={MAGENTA} fill="none" />
  <rect x="104" y="82" width="78" height="6" rx="3" fill={HUECO} />
  <rect x="120" y="94" width="46" height="5" rx="2.5" fill={HUECO} />
</>);
const Bonos = () => (<>
  <rect x="74" y="42" width="138" height="62" rx="10" fill={TARJETA} {...trazo} />
  <path d="M168 42v62" stroke={LINEA} strokeWidth="1.5" strokeDasharray="1 5" strokeLinecap="round" />
  <rect x="90" y="58" width="56" height="8" rx="4" fill={AZUL} />
  <rect x="90" y="74" width="40" height="6" rx="3" fill={HUECO} />
  <circle cx="190" cy="73" r="11" fill={AZUL_SUAVE} {...trazo} />
  <path d="M185 73h10M190 68v10" {...trazo} stroke={AZUL} />
</>);
const Stripe = () => (<>
  <rect x="78" y="38" width="130" height="74" rx="12" fill={AZUL_SUAVE} {...trazo} />
  <path d="M78 58h130" {...trazo} />
  <rect x="92" y="84" width="34" height="8" rx="4" fill={TARJETA} {...trazo} strokeWidth={1} />
  <circle cx="186" cy="90" r="7" fill={MAGENTA_SUAVE} {...trazo} strokeWidth={1} />
  <circle cx="176" cy="90" r="7" fill={TARJETA} {...trazo} strokeWidth={1} />
</>);
const Clientes = () => (<>
  <rect x="68" y="50" width="76" height="62" rx="10" fill={TARJETA} {...trazo} />
  <circle cx="106" cy="72" r="9" fill={AZUL_SUAVE} {...trazo} />
  <path d="M88 100c3-10 11-14 18-14s15 4 18 14" fill="none" {...trazo} />
  <rect x="124" y="32" width="76" height="62" rx="10" fill={TARJETA} {...trazo} />
  <circle cx="162" cy="54" r="9" fill={MAGENTA_SUAVE} {...trazo} />
  <path d="M144 82c3-10 11-14 18-14s15 4 18 14" fill="none" {...trazo} />
</>);
const Generico = () => (<>
  <rect x="80" y="34" width="126" height="72" rx="10" fill={TARJETA} {...trazo} />
  <rect x="96" y="50" width="40" height="8" rx="4" fill={AZUL} />
  <rect x="96" y="66" width="94" height="6" rx="3" fill={HUECO} />
  <rect x="96" y="78" width="70" height="6" rx="3" fill={HUECO} />
</>);

const ESCENAS: Record<string, () => ReactNode> = {
  salas: Salas, instructor: Instructor, clase: Clase, horario: Horario, reservas: Reservas,
  'primera-reserva': PrimeraReserva, bonos: Bonos, stripe: Stripe, clientes: Clientes,
  // Los ids de «Pon en marcha tu estudio» (`lib/guia/primeros-pasos.ts`) comparten escena con su paso de la guía.
  'primera-clase': Clase, alumnas: Clientes, compartir: Reservas, cuenta: Instructor,
};

/** La imagen de una tarjeta de paso: fondo gris suave, escena y el bisel interior de la tarjeta. */
export function IlustracionPaso({ id, className }: { id: string; className?: string }) {
  const Dibujo = ESCENAS[id] ?? Generico;
  const externa = rutaIlustracion(`paso-${id}`);
  if (externa) {
    return (
      <div className={cn('relative aspect-[286/140] w-full overflow-hidden rounded-xl bg-[var(--t-surface-sunken)]', className)} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG decorativo local. */}
        <img src={externa} alt="" className="absolute inset-0 size-full object-cover" data-paso={id} />
        <span className="pointer-events-none absolute inset-0 rounded-xl shadow-[inset_0_0_0_1px_#14181c17,inset_0_1px_0_#ffffffe0,inset_1px_0_0_#ffffff85,inset_0_-1px_0_#14181c14,inset_-1px_0_0_#14181c0d]" />
      </div>
    );
  }
  return (
    <div className={cn('relative aspect-[286/140] w-full overflow-hidden rounded-xl bg-[var(--t-surface-sunken)]', className)} aria-hidden="true">
      <svg viewBox="0 0 286 140" className="absolute inset-0 size-full" focusable="false" data-paso={id}>
        <Dibujo />
      </svg>
      {/* Bisel interior: aro, filo superior claro y sombras inferior/derecha, como las imágenes de las tarjetas de Shopify. */}
      <span className="pointer-events-none absolute inset-0 rounded-xl shadow-[inset_0_0_0_1px_#14181c17,inset_0_1px_0_#ffffffe0,inset_1px_0_0_#ffffff85,inset_0_-1px_0_#14181c14,inset_-1px_0_0_#14181c0d]" />
    </div>
  );
}
