'use client';

import { useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { frasesImpactoArchivar, type ImpactoArchivar } from '@/lib/tipos-clase/orden-y-archivo';
import type { ResultadoEscritura } from '@/lib/errores';

/**
 * Archivar un tipo de clase: qué pasa, contado con cifras, ANTES de pulsar.
 *
 * No es `ConfirmDialog`: ese se cierra al confirmar y no espera a la base de
 * datos. Aquí el diálogo se queda abierto hasta que la escritura vuelve, y si
 * falla (sin permiso, sin red) lo dice dentro, sin fingir que se archivó.
 */
export function DialogoArchivarTipo({ archivando, onArchivar, onCerrar }: {
  /** El tipo que se va a archivar y lo que le pasa; `null` = cerrado. */
  archivando: { nombre: string; impacto: ImpactoArchivar } | null;
  onArchivar: () => Promise<ResultadoEscritura>;
  onCerrar: () => void;
}) {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Corta el doble toque antes de que React repinte el botón apagado.
  const enCurso = useRef(false);

  async function archivar() {
    if (enCurso.current) return;
    enCurso.current = true;
    setGuardando(true);
    setError(null);
    const res = await onArchivar();
    enCurso.current = false;
    setGuardando(false);
    if (!res.ok) { setError(res.error); return; }
    onCerrar();
  }

  const frases = archivando ? frasesImpactoArchivar(archivando.impacto) : [];

  return (
    <Dialog
      open={!!archivando}
      onOpenChange={open => { if (!open && !enCurso.current) { setError(null); onCerrar(); } }}
    >
      <DialogContent className="max-w-[min(calc(100%-2rem),28rem)]" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Archivar «{archivando?.nombre}»</DialogTitle>
          <DialogDescription className="text-pretty">
            No podrás programar más clases de este tipo hasta que lo recuperes.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2 text-[13px] text-foreground">
          {frases.map(f => (
            <li key={f} className="flex gap-2 text-pretty">
              <span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-full bg-muted-foreground/60" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
        <p className="text-[12.5px] text-muted-foreground text-pretty">
          Su historial (asistencias, informes, cobros) no se toca. Puedes recuperarlo cuando quieras desde «Archivados».
        </p>
        {error && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-destructive">{error}</p>
        )}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={guardando} />}>Volver</DialogClose>
          <Button onClick={() => void archivar()} disabled={guardando}>
            {guardando && <Loader2 className="animate-spin" aria-hidden />}
            {guardando ? 'Archivando…' : 'Archivar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
