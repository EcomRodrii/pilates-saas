'use client';

// La casilla «Es la renovación de su plan» de los formularios de «Nuevo cobro».
//
// Al cobrar un recibo, el servidor solo entrega el plan (recarga el bono o extiende la
// cuota) si el recibo viene marcado como renovación. Sin marcar es una venta: no se enlaza
// a su plan (impagada, el reintento le cancelaría la cuota) y cobrarla no lo toca. Aquí lo
// dice quien lo crea. Se enseña solo si hay un plan activo que renovar; sin él no hay nada que
// marcar.
//
// Una sola casilla para los dos formularios (Cobros y la ficha de la clienta): dos copias de
// un texto que decide si se entrega un plan acaban diciendo cosas distintas.

export function CasillaRenovacion({ planNombre, marcada, onCambio, desactivada }: {
  planNombre: string;
  marcada: boolean;
  onCambio: (marcada: boolean) => void;
  /**
   * Por qué no se puede marcar (esa cuota ya tiene una renovación pendiente: un índice
   * único la rechazaría con un error genérico). Se enseña apagada y con el motivo.
   */
  desactivada?: string | null;
}) {
  return (
    <label className={`flex items-start gap-2.5 rounded-lg border border-border px-3 py-2.5 text-xs text-foreground${desactivada ? ' opacity-70' : ''}`}>
      <input
        type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary"
        checked={marcada && !desactivada}
        disabled={!!desactivada}
        onChange={e => onCambio(e.target.checked)}
      />
      <span>
        <span className="font-semibold">Es la renovación de su plan ({planNombre})</span>
        <span className="mt-0.5 block text-muted-foreground">
          {desactivada ?? 'Al cobrarlo se renueva el plan: se recarga el bono o se extiende la cuota. Déjalo sin marcar si es otra cosa (un producto, una clase suelta…): entonces solo se cobra.'}
        </span>
      </span>
    </label>
  );
}
