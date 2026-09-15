'use client';

import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// El interruptor del panel. UNO. Solo en Configuración había cuatro dibujos
// (el `Toggle` de estilos, el de correos automáticos, el de «Avisar a las
// alumnas» y el de recompensas) con tres colores distintos de «encendido»
// —`--primary`, oliva y tinta— y un apagado a 1,75:1 que parecía un hueco.
//
// Se lee igual en claro y en oscuro (medido en e2e/configuracion-contraste.spec.ts):
//   · encendido: pista rellena de TINTA (`--foreground`) y bola del color de la
//     tarjeta. Ni `--primary` —cuando se escribió, `.dark` no lo redefinía y el
//     encendido quedaba a 1,12:1, más apagado que el apagado; hoy sí, pero un
//     interruptor no tiene por qué seguir a la acción principal— ni la marca: con marca blanca puede
//     ser un pastel, y en oscuro `panel-theme` deja el oliva en línea sobre un
//     fondo casi negro (1,5:1).
//   · apagado: pista del color de la tarjeta con CONTORNO de 2 px en
//     `--muted-foreground` y bola del mismo gris. Un relleno gris claro, como el
//     de antes, no llega a 3:1 sin empezar a parecer encendido.
//
// `role="switch"` + `aria-checked`: un lector de pantalla dice «activado» y la
// barra espaciadora lo cambia. El dibujo mide 24×44; con el dedo se toca un
// `::before` de 48×68, sin deformar la pista (`config-tactil` excluye los
// interruptores del mínimo de 44 px por eso).
// ─────────────────────────────────────────────────────────────────────────────

export function Interruptor({ on, onChange, ariaLabel, title, disabled, ocupado, className }: {
  on: boolean;
  onChange: (valor: boolean) => void;
  /** Sin él, el nombre lo tiene que poner un <label> que lo envuelva. */
  ariaLabel?: string;
  title?: string;
  disabled?: boolean;
  /** Guardando: `aria-busy` y no se deja tocar. */
  ocupado?: boolean;
  className?: string;
}) {
  const bloqueado = !!(disabled || ocupado);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      aria-busy={ocupado || undefined}
      title={title}
      disabled={bloqueado}
      onClick={() => { if (!bloqueado) onChange(!on); }}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 transition-colors duration-200',
        'before:absolute before:-inset-3.5',
        'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        'disabled:cursor-not-allowed disabled:opacity-50',
        on ? 'border-foreground bg-foreground' : 'border-muted-foreground bg-card',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none block size-4 rounded-full transition-transform duration-200',
          // En rem, como la pista: con un desplazamiento en px, un zoom o una
          // letra base distinta dejaban la bola asomando por el borde.
          on ? 'translate-x-[1.375rem] bg-card' : 'translate-x-0.5 bg-muted-foreground',
        )}
      />
    </button>
  );
}
