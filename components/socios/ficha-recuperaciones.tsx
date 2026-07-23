'use client';

// F2 (B2.3) — Recuperaciones: sección de la ficha para que la dueña conceda y
// gestione las "clases a recuperar" de la socia (dueña-first). Caducan por fecha.

import { useMemo, useState } from 'react';
import { useStudio } from '@/lib/studio-context';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { Plus, X, Ticket } from 'lucide-react';
import type { Recuperacion } from '@/lib/types';

function isoHoy(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}
function fechaCorta(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

// Viva = DISPONIBLE y no vencida. El resto (usada/anulada/caducada o disponible
// pasada de fecha) se muestra atenuado como histórico.
function estadoRecup(r: Recuperacion, hoy: string): { label: string; viva: boolean } {
  if (r.estado === 'USADA') return { label: 'Usada', viva: false };
  if (r.estado === 'ANULADA') return { label: 'Anulada', viva: false };
  if (r.estado === 'CADUCADA' || r.caducaEl < hoy) return { label: 'Caducada', viva: false };
  return { label: `Disponible · caduca ${fechaCorta(r.caducaEl)}`, viva: true };
}

const inputCls = 'w-full text-sm rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring';
const labelCls = 'text-xs font-semibold text-muted-foreground mb-1.5 block';

export function FichaRecuperaciones({ socioId }: { socioId: string }) {
  const { recuperaciones, darRecuperacion, anularRecuperacion } = useStudio();
  const hoy = isoHoy();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const mias = useMemo(
    () => recuperaciones.filter(r => r.socioId === socioId).sort((a, b) => b.creadaEn.localeCompare(a.creadaEn)),
    [recuperaciones, socioId],
  );
  const vivas = mias.filter(r => estadoRecup(r, hoy).viva).length;

  async function dar() {
    setGuardando(true);
    setAviso(null);
    const r = await darRecuperacion(socioId, motivo.trim() || null);
    setGuardando(false);
    if (r === 'TOPE') { setAviso('Ya tiene 4 recuperaciones vivas (el máximo).'); return; }
    if (r === 'ERROR') { setAviso('No se pudo crear. Inténtalo de nuevo.'); return; }
    setMotivo('');
    setDialogOpen(false);
  }

  return (
    <div className="border border-border rounded-xl p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground flex items-center gap-1.5">
            <Ticket size={15} className="text-muted-foreground shrink-0" /> Recuperaciones
          </p>
          <p className="text-xs text-muted-foreground">Clases a recuperar que le has concedido. {vivas} viva(s).</p>
        </div>
        <button
          onClick={() => { setMotivo(''); setAviso(null); setDialogOpen(true); }}
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg text-primary-foreground bg-primary hover:brightness-95 transition-colors shrink-0"
        >
          <Plus size={13} /> Dar recuperación
        </button>
      </div>

      {mias.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">Sin recuperaciones. Concédele una si un día no pudo venir.</p>
      ) : (
        <div className="space-y-2">
          {mias.map(r => {
            const st = estadoRecup(r, hoy);
            return (
              <div key={r.id} className={cn('flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5', st.viva ? 'border-border bg-card' : 'border-dashed border-border bg-muted/30')}>
                <div className="min-w-0">
                  <p className={cn('text-sm font-semibold', st.viva ? 'text-foreground' : 'text-muted-foreground')}>{st.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{r.motivo || 'Sin motivo'} · concedida {fechaCorta(r.creadaEn)}</p>
                </div>
                {st.viva && (
                  <button onClick={() => anularRecuperacion(r.id)} title="Anular recuperación" className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-muted shrink-0">
                    <X size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={o => !o && setDialogOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Dar recuperación</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Le concedes una clase a recuperar. Caduca según la política del estudio (por defecto, fin del mes siguiente).</p>
            <div>
              <label htmlFor="recup-motivo" className={labelCls}>Motivo (opcional)</label>
              <input id="recup-motivo" className={inputCls} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej: avisó que el martes no podía" />
            </div>
            {aviso && <p className="text-xs font-medium text-amber-600">{aviso}</p>}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setDialogOpen(false)} className="text-xs font-semibold px-4 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground">Cancelar</button>
            <button disabled={guardando} onClick={dar} className="text-xs font-bold px-4 py-2 rounded-lg text-primary-foreground bg-primary hover:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed">
              {guardando ? 'Concediendo…' : 'Dar recuperación'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
