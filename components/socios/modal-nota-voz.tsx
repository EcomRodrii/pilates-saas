'use client';

import { useState } from 'react';
import * as Sentry from '@sentry/nextjs';
import { Mic, Square, Loader2, CheckCircle2, Bot } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useStudio } from '@/lib/studio-context';
import { useSpeechToText } from '@/lib/hooks/use-speech-to-text';
import { estructurarNotaIA, type NotaIAEstructurada } from '@/lib/ai/instructor-note-client';

// Piloto de validación de captura por voz — entry point desde el calendario,
// justo al terminar la clase, con sesionId ya resuelto (es el que de verdad
// mide "tasa de captura real por clase" del informe estratégico ago-2026).

interface ModalNotaVozProps {
  socioId: string;
  nombreSocia: string;
  instructorId: string;
  sesionId: string;
  onClose: () => void;
}

export function ModalNotaVoz({ socioId, nombreSocia, instructorId, sesionId, onClose }: ModalNotaVozProps) {
  const { addNotaProgreso } = useStudio();
  const { disponible, grabando, transcripcion, error, iniciar, detener } = useSpeechToText();
  const [procesando, setProcesando] = useState(false);
  const [resultado, setResultado] = useState<NotaIAEstructurada | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);

  async function procesar() {
    if (!transcripcion.trim()) return;
    setProcesando(true);
    setErrorAccion(null);
    try {
      const r = await estructurarNotaIA({ texto: transcripcion, socioId, instructorId, sesionId });
      setResultado(r);
    } catch {
      setErrorAccion('No se pudo procesar la nota. Inténtalo de nuevo.');
      Sentry.captureMessage('piloto-voz: fallo al estructurar nota', { tags: { motivo: 'estructurar-ia' } });
    } finally {
      setProcesando(false);
    }
  }

  async function guardar() {
    if (!resultado) return;
    const res = await addNotaProgreso({
      socioId, instructorId, sesionId,
      textoLibre: transcripcion,
      progreso: resultado.progreso,
      alertas: resultado.alertas,
      planProximaSesion: resultado.planProximaSesion,
      ejerciciosCasa: resultado.ejerciciosCasa,
    });
    if (!res.ok) { setErrorAccion('No se ha podido guardar la nota. Inténtalo de nuevo.'); return; }
    onClose();
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nota de voz — {nombreSocia}</DialogTitle>
        </DialogHeader>

        {!disponible ? (
          <p className="text-sm text-muted-foreground">
            Grabación por voz no disponible en este navegador — usa el micrófono de tu teclado y escribe la nota desde la ficha de {nombreSocia}.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl border border-border p-3 min-h-20 text-sm text-foreground bg-muted">
              {transcripcion || (
                <span className="text-muted-foreground">
                  {grabando ? 'Escuchando…' : 'Pulsa grabar y cuenta cómo fue la sesión.'}
                </span>
              )}
            </div>
            {error && (
              <p className="text-xs text-destructive">
                No se ha podido grabar ({error}). Prueba de nuevo o usa el teclado.
              </p>
            )}
            <div className="flex gap-2">
              {!grabando ? (
                !resultado && (
                <button
                  onClick={iniciar}
                  className="flex items-center gap-1.5 px-4 py-2 bg-brand text-brand-foreground rounded-xl text-xs font-bold hover:brightness-95 transition-colors"
                >
                  <Mic size={14} /> Grabar
                </button>
                )
              ) : (
                <button
                  onClick={detener}
                  className="flex items-center gap-1.5 px-4 py-2 bg-destructive text-white rounded-xl text-xs font-bold hover:brightness-95 transition-colors"
                >
                  <Square size={14} /> Parar
                </button>
              )}
              {!grabando && transcripcion.trim() && !resultado && (
                <button
                  onClick={procesar}
                  disabled={procesando}
                  className="flex items-center gap-1.5 px-4 py-2 border border-border rounded-xl text-xs font-bold disabled:opacity-40 hover:bg-muted transition-colors"
                >
                  {procesando ? <Loader2 size={14} className="animate-spin" /> : <Bot size={14} />}
                  {procesando ? 'Procesando…' : 'Estructurar con IA'}
                </button>
              )}
            </div>
            {errorAccion && <p className="text-xs text-destructive">{errorAccion}</p>}
          </div>
        )}

        {resultado && (
          <div className="rounded-xl border border-border bg-brand/10 p-4 space-y-2 mt-2">
            {resultado.progreso && <p className="text-sm text-foreground"><span className="font-bold">Progreso: </span>{resultado.progreso}</p>}
            {resultado.alertas && <p className="text-sm text-foreground"><span className="font-bold">Alertas: </span>{resultado.alertas}</p>}
            {resultado.planProximaSesion && <p className="text-sm text-foreground"><span className="font-bold">Próxima sesión: </span>{resultado.planProximaSesion}</p>}
            {resultado.ejerciciosCasa && <p className="text-sm text-foreground"><span className="font-bold">Ejercicios casa: </span>{resultado.ejerciciosCasa}</p>}
            <div className="flex gap-2 pt-2 border-t border-border">
              <button onClick={guardar} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:brightness-95 transition-colors">
                <CheckCircle2 size={12} /> Guardar nota
              </button>
              <button onClick={() => setResultado(null)} className="px-3 py-1.5 border border-border text-foreground rounded-lg text-xs font-bold hover:bg-muted transition-colors">
                Descartar
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
