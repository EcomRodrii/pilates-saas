'use client';

import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

// Confirmación accesible para acciones destructivas, en lugar del `confirm()`
// nativo del navegador. El nativo no se puede estilar, no respeta el tema, en
// móvil aparece como un diálogo del sistema fácil de aceptar sin leer, y algunos
// navegadores lo suprimen si la pestaña no tiene foco — con lo que la acción
// simplemente no ocurre y el usuario no sabe por qué.
//
// Se apoya en components/ui/dialog (Base UI), que ya aporta foco atrapado,
// `aria-modal`, cierre con Escape y portal. Ese primitivo estaba en el repo sin
// que lo importara nadie.
export function ConfirmDialog({
  open,
  onOpenChange,
  titulo,
  descripcion,
  textoConfirmar = 'Confirmar',
  textoCancelar = 'Volver',
  destructivo = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  titulo: string;
  descripcion?: string;
  textoConfirmar?: string;
  textoCancelar?: string;
  destructivo?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {descripcion ? <DialogDescription>{descripcion}</DialogDescription> : null}
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{textoCancelar}</DialogClose>
          <Button
            variant={destructivo ? 'destructive' : 'default'}
            onClick={() => { onOpenChange(false); onConfirm(); }}
          >
            {textoConfirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
