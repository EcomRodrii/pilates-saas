'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CalendarX, CheckCircle2 } from 'lucide-react';
import { crearBaja } from '@/lib/api-client';

// "No puedo asistir a esta clase" — la instructora la marca desde su propio
// panel (calendario o dashboard) y a partir de ahí el motor de sustituciones
// (lib/sustituciones/baja.ts) hace el resto solo: busca candidatas, las
// contacta (o espera el visto bueno de la propietaria, según el modo de
// autonomía del estudio) y avisa a quien haga falta. Ella no gestiona nada más
// — por eso este diálogo no lista candidatas ni tiene más acción que confirmar.
//
// Mismo motivo opcional y mismo texto de cierre que app/no-puedo/[token]
// (el enlace público sin login): es la misma acción, solo que ya logueada.

interface NoPuedoAsistirDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sesion: { id: string; tipoClase: { nombre: string }; inicio: string } | null;
}

export function NoPuedoAsistirDialog({ open, onOpenChange, sesion }: NoPuedoAsistirDialogProps) {
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState(false);

  function cerrar(next: boolean) {
    if (!next) {
      // Reset al cerrar, tanto si canceló como si acabó de confirmar.
      setMotivo('');
      setError(null);
      setHecho(false);
    }
    onOpenChange(next);
  }

  async function confirmar() {
    if (!sesion) return;
    setEnviando(true);
    setError(null);
    const r = await crearBaja(sesion.id, motivo.trim() || undefined);
    setEnviando(false);
    if ('error' in r) { setError(r.error); return; }
    setHecho(true);
  }

  if (!sesion) return null;

  const cuando = new Date(sesion.inicio).toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  });

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="max-w-md">
        {hecho ? (
          <div className="py-4 text-center">
            <div className="mx-auto mb-3 w-12 h-12 rounded-2xl bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] flex items-center justify-center">
              <CheckCircle2 size={22} className="text-brand" />
            </div>
            <h2 className="text-[15px] font-semibold text-foreground">Avisado</h2>
            <p className="mt-2 text-[13px] text-muted-foreground">
              Ya lo sabemos. Nos encargamos de buscar quién cubra tu clase — no tienes que hacer nada más.
            </p>
            <button
              onClick={() => cerrar(false)}
              className="mt-5 w-full py-2.5 rounded-lg text-[13px] font-semibold bg-brand text-brand-foreground hover:brightness-95 transition-colors"
            >
              Entendido
            </button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
                <CalendarX size={16} />No puedo asistir
              </DialogTitle>
            </DialogHeader>
            <div className="rounded-xl border border-border bg-muted/50 p-3 -mt-1">
              <p className="text-[13px] font-medium text-foreground">{sesion.tipoClase.nombre}</p>
              <p className="text-[12px] text-muted-foreground capitalize">{cuando}</p>
            </div>
            <label htmlFor="motivo-baja" className="block text-[12px] font-medium text-foreground mt-1">
              Motivo <span className="font-normal text-muted-foreground">(opcional)</span>
            </label>
            <textarea
              id="motivo-baja"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Estoy enferma, tengo médico…"
              className="w-full resize-none rounded-xl border border-border p-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-brand bg-background"
            />
            <button
              onClick={confirmar}
              disabled={enviando}
              className="w-full py-2.5 rounded-lg text-[13px] font-semibold bg-brand text-brand-foreground hover:brightness-95 transition-colors disabled:opacity-60"
            >
              {enviando ? 'Avisando…' : 'Sí, no puedo dar esta clase'}
            </button>
            {error && <p className="text-[12px] text-destructive text-center">{error}</p>}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
