'use client';

// «Guardar esta y las siguientes»: lo que va a pasar, ANTES de que pase.
//
// Cambiar la hora de una serie avisa a cada alumna apuntada, mueve las plazas
// fijas y toca la lista de espera. Antes el botón ejecutaba al instante y eso
// solo se descubría después, en un toast — o en el buzón de las alumnas. Aquí se
// enseña qué cambia, a quién le afecta y a cuántas se avisará, y se guarda solo
// al confirmar.
//
// Solo pinta: todo lo que dice sale de `lib/series-impacto-edicion.ts` (que es
// también lo que decide a quién avisa el guardado). Se monta al abrir y se
// desmonta al cerrar, como el resto de diálogos del panel.

import { ArrowRight, AlertTriangle, Check } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { lineasDeImpacto, tituloDeEdicion, type ImpactoEdicionSerie } from '@/lib/series-impacto-edicion';

export interface CambioVisible {
  etiqueta: string;
  /** Vacío = un cambio sin «antes → después» (p. ej. las notas). */
  desde: string;
  a: string;
}

export function DialogoImpactoEdicion({ impacto, cambios, desdeTexto, guardando, onConfirm, onClose }: {
  impacto: ImpactoEdicionSerie;
  cambios: CambioVisible[];
  /** «jueves, 3 de noviembre»: va en mitad de una frase, en minúscula. */
  desdeTexto: string;
  guardando: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const lineas = lineasDeImpacto(impacto);
  return (
    <Dialog open onOpenChange={abierto => { if (!abierto && !guardando) onClose(); }}>
      <DialogContent className="max-w-md" showCloseButton={false} data-testid="dialogo-impacto-serie">
        <DialogHeader>
          <DialogTitle>{tituloDeEdicion(impacto.clases)}</DialogTitle>
          <DialogDescription>
            Desde el {desdeTexto} en adelante. Las clases anteriores de la serie no se tocan.
          </DialogDescription>
        </DialogHeader>

        {cambios.length > 0 && (
          <section aria-label="Qué cambia" className="space-y-1.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Qué cambia</h3>
            <ul className="space-y-1">
              {cambios.map(c => (
                <li key={c.etiqueta} className="flex flex-wrap items-center gap-x-2 text-sm text-foreground">
                  <span className="font-semibold">{c.etiqueta}:</span>
                  {c.desde ? (
                    <>
                      <span className="text-muted-foreground">{c.desde}</span>
                      <ArrowRight size={13} aria-label="pasa a" className="text-muted-foreground shrink-0" />
                      <span className="font-semibold">{c.a}</span>
                    </>
                  ) : (
                    <span>{c.a}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-label="A quién afecta" className="space-y-1.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">A quién afecta</h3>
          <ul className="space-y-1.5">
            {lineas.map(l => (
              <li
                key={l.texto}
                className={
                  l.tono === 'aviso'
                    ? 'flex gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning'
                    : l.tono === 'calma'
                      ? 'flex gap-2 text-sm text-muted-foreground'
                      : 'flex gap-2 text-sm text-foreground'
                }
              >
                {l.tono === 'aviso'
                  ? <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
                  : <Check size={14} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />}
                <span>{l.texto}</span>
              </li>
            ))}
          </ul>
        </section>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={guardando} />}>Volver</DialogClose>
          <Button onClick={onConfirm} disabled={guardando} data-testid="confirmar-serie">
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
