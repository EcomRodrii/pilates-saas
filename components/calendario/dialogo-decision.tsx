'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// Rediseño del Calendario — punto 4: cada acción de la franja de decisiones
// confirma antes de ejecutar (nunca un fetch directo desde el botón). Un solo
// componente para las 6 acciones en vez de 6 diálogos casi idénticos — mismo
// principio que BloqueClase (una fuente visual, no una por caso).
export interface DialogoDecisionProps {
  abierto: boolean;
  titulo: string;
  cuerpo: React.ReactNode;
  /** null cuando la acción está bloqueada (p.ej. ajustar aforo dejaría gente
   *  fuera) — se muestra el motivo pero no hay botón de confirmar. */
  onConfirmar: (() => void) | null;
  textoConfirmar?: string;
  onCerrar: () => void;
}

export function DialogoDecision({
  abierto, titulo, cuerpo, onConfirmar, textoConfirmar = 'Confirmar', onCerrar,
}: DialogoDecisionProps) {
  return (
    <Dialog open={abierto} onOpenChange={open => !open && onCerrar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold text-foreground">{titulo}</DialogTitle>
        </DialogHeader>
        <div className="text-[13px] text-muted-foreground mt-2">{cuerpo}</div>
        <div className="flex gap-2 mt-4">
          <button
            type="button"
            className="flex-1 justify-center py-2.5 rounded-xl border border-border text-[13px] font-medium text-foreground hover:bg-muted transition-colors"
            onClick={onCerrar}
          >
            Cancelar
          </button>
          {onConfirmar && (
            <button
              type="button"
              className="flex-1 justify-center py-2.5 rounded-xl bg-brand text-brand-foreground text-[13px] font-bold hover:opacity-90 transition-opacity"
              onClick={() => { onConfirmar(); onCerrar(); }}
            >
              {textoConfirmar}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
