'use client';

// ─────────────────────────────────────────────────────────────────────────────
// «¿Cómo lo has cobrado?» — el único camino para marcar un recibo como cobrado
// a mano.
//
// ⚠️ POR QUÉ ES COMÚN. Había tres botones «Cobrar»: el del panel de Cobros
// preguntaba el método; los de la ficha de la clienta y del dashboard llamaban
// a `marcarCobrado(id)` a pelo. Un clic y 120 € pasaban a COBRADO sin decir si
// fue efectivo, tarjeta o Bizum — con lo que el cierre de caja no cuadra — y
// sin ninguna confirmación que parara un clic por error. Lo vio una propietaria
// probando la app (evaluación del 13-sep). Con un solo componente, los tres
// sitios preguntan lo mismo y no pueden volver a divergir.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, type CSSProperties, type ReactNode } from 'react';
import { Banknote, CreditCard, Landmark, Smartphone } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { MetodoCobro } from '@/lib/types';

const METODOS: { metodo: MetodoCobro; etiqueta: string; Icono: typeof Banknote }[] = [
  { metodo: 'EFECTIVO', etiqueta: 'Efectivo', Icono: Banknote },
  { metodo: 'TARJETA', etiqueta: 'Tarjeta', Icono: CreditCard },
  { metodo: 'BIZUM', etiqueta: 'Bizum', Icono: Smartphone },
  { metodo: 'TRANSFERENCIA', etiqueta: 'Transferencia', Icono: Landmark },
];

export function DialogoMetodoCobro({
  abierto,
  detalle,
  onElegir,
  onCerrar,
}: {
  abierto: boolean;
  /** Quién y cuánto, para que se vea qué se está marcando: «Laura — 120,00 €». */
  detalle: ReactNode;
  /** `undefined` = «sin especificar», elegido a propósito. */
  onElegir: (metodo: MetodoCobro | undefined) => void;
  onCerrar: () => void;
}) {
  return (
    <Dialog open={abierto} onOpenChange={(open) => { if (!open) onCerrar(); }}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-foreground">¿Cómo lo has cobrado?</DialogTitle>
          <p className="text-sm text-muted-foreground">{detalle}</p>
        </DialogHeader>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {METODOS.map(({ metodo, etiqueta, Icono }) => (
            <button
              key={metodo}
              type="button"
              onClick={() => onElegir(metodo)}
              className="flex flex-col items-center gap-1 rounded-lg border border-border px-3 py-2.5 text-sm font-bold text-foreground transition-colors hover:bg-muted"
            >
              <Icono size={16} className="text-muted-foreground" aria-hidden />
              {etiqueta}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onElegir(undefined)}
          className="mt-3 w-full text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Marcar cobrado sin especificar
        </button>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Botón «Cobrar» que pregunta el método antes de marcar nada. `onCobrar` recibe
 * el método elegido; el botón no marca nada si se cierra el diálogo.
 */
export function BotonCobrarConMetodo({
  detalle,
  onCobrar,
  className,
  style,
  children = 'Cobrar',
}: {
  detalle: ReactNode;
  onCobrar: (metodo: MetodoCobro | undefined) => void | Promise<void>;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const [cobrando, setCobrando] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        disabled={cobrando}
        className={className}
        style={style}
      >
        {cobrando ? 'Cobrando…' : children}
      </button>
      <DialogoMetodoCobro
        abierto={abierto}
        detalle={detalle}
        onCerrar={() => setAbierto(false)}
        onElegir={(metodo) => {
          setAbierto(false);
          setCobrando(true);
          void Promise.resolve(onCobrar(metodo)).finally(() => setCobrando(false));
        }}
      />
    </>
  );
}
