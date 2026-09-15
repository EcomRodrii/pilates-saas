import type { ReactNode } from 'react';
import { AlertTriangle, Check, CircleDashed, Clock, PenLine, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// La pastilla de estado de Configuración. UNA, para que «Conectado», «No
// conectado», «Como viene de fábrica» o «Se guarda al momento» se lean como lo
// que son —un estado— y no como otra línea de ayuda. Cada tarjeta pintaba la
// suya: a 10-11 px, en negrita, en mayúsculas o en negro, y casi todas sobre un
// `bg-muted` a 1,09:1 de la tarjeta (se veía el texto, no la pastilla).
//
// Reglas:
//   · color + ICONO + texto, nunca solo color (WCAG 1.4.1);
//   · 12 px, sin mayúsculas, texto ≥ 4,5:1 sobre su fondo en claro y en oscuro
//     (e2e/configuracion-contraste.spec.ts);
//   · UN estado por cosa: si hace falta otra frase que lo contradiga, el estado
//     está mal elegido (Stripe decía «No conectado» y debajo «Todavía no
//     disponible»);
//   · verde, ocre y terracota solo para estados de verdad —va bien, falta algo,
//     falla—; lo que no le pide nada a la propietaria va en neutro.
// ─────────────────────────────────────────────────────────────────────────────

export type TonoEstado = 'activo' | 'pendiente' | 'problema' | 'neutro' | 'personalizado';

const TONOS: Record<TonoEstado, { clase: string; Icono: LucideIcon }> = {
  activo: { clase: 'border-transparent bg-success/12 text-success', Icono: Check },
  pendiente: { clase: 'border-transparent bg-warning/12 text-warning', Icono: Clock },
  problema: { clase: 'border-transparent bg-destructive/10 text-destructive', Icono: AlertTriangle },
  neutro: { clase: 'border-muted-foreground/50 text-muted-foreground', Icono: CircleDashed },
  personalizado: { clase: 'border-foreground/60 text-foreground', Icono: PenLine },
};

export function EstadoAjuste({ tono, icono, title, className, children }: {
  tono: TonoEstado;
  /** Otro icono cuando el del tono no cuenta lo que es («Se guarda al momento»). */
  icono?: LucideIcon;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  const { clase, Icono: IconoDelTono } = TONOS[tono];
  const Icono = icono ?? IconoDelTono;
  return (
    <span
      data-estado-ajuste={tono}
      title={title}
      className={cn(
        'inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium leading-4',
        clase,
        className,
      )}
    >
      <Icono aria-hidden className="size-3.5 shrink-0" strokeWidth={2.25} />
      {children}
    </span>
  );
}
