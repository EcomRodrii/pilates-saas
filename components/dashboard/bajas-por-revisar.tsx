'use client';

import { useEffect, useState } from 'react';
import { CalendarX } from 'lucide-react';
import { listarBajasPorRevisar, revisarBajaInstructora, type BajaPorRevisar } from '@/lib/api-client';
import { ANCLA_DECIDIR, invalidarEstadoEstudio } from '@/lib/estado-estudio-cliente';
import { MAX_NOTA_ESTUDIO, textoAntelacion, type DecisionEstudio } from '@/lib/student/baja-instructora';
import { TZ_ESTUDIO } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// Bajas de última hora del equipo (la instructora avisó con menos de 24 h) que
// esperan que el estudio las revise. Mismo alcance que `PenalizacionesPendientes`:
// una lista y dos botones, dentro de la bandeja. Se oculta sola si no hay nada.
//
// Decisión del fundador (14-sep-2026): «Todo en orden» / «Lo hablamos», con una
// nota que ella ve en su app. Solo queda anotado: no descuenta nada ni cambia su
// tarifa, y la pantalla lo dice. Hechos sin adjetivos («avisó con 3 h»).
//
// Solo se monta si `puedeGestionarEquipo` (el mismo gate que el servidor): el
// motivo puede hablar de su salud.

const fmtClase = new Intl.DateTimeFormat('es-ES', {
  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ_ESTUDIO,
});

function cuando(inicio: string | null): string {
  if (!inicio) return '';
  const d = new Date(inicio);
  return Number.isNaN(d.getTime()) ? '' : fmtClase.format(d);
}

export function BajasPorRevisar({ onToast }: { onToast: (m: string) => void }) {
  const [items, setItems] = useState<BajaPorRevisar[] | null>(null);
  const [notas, setNotas] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void listarBajasPorRevisar().then((r) => { if (vivo) setItems(r); });
    return () => { vivo = false; };
  }, []);

  const quitar = (id: string) => {
    setItems((prev) => (prev ?? []).filter((b) => b.id !== id));
    invalidarEstadoEstudio();
  };

  async function decidir(b: BajaPorRevisar, decision: DecisionEstudio) {
    if (enviando) return;
    setEnviando(b.id);
    const r = await revisarBajaInstructora(b.id, decision, notas[b.id] ?? '');
    setEnviando(null);
    if ('error' in r) {
      // Ya la revisó otra persona: la fila sobra, pero se dice por qué se va.
      if (r.status === 409) quitar(b.id);
      onToast(r.error);
      return;
    }
    quitar(b.id);
    onToast(decision === 'EN_ORDEN' ? 'Anotado: todo en orden' : 'Anotado: lo habláis');
  }

  if (!items?.length) return null;

  return (
    // Sin marco propio: vive dentro de la bandeja (EstadoDelEstudio), que ya lo pone.
    <div id={ANCLA_DECIDIR.bajasPorRevisar} tabIndex={-1} data-testid="bajas-por-revisar"
      className="scroll-mt-20 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
      <div className="mb-1 flex items-center gap-2">
        <CalendarX className="size-4 text-muted-foreground" />
        <p className="text-[13px] font-medium text-foreground">
          {items.length === 1 ? 'Una baja de última hora por revisar' : `${items.length} bajas de última hora por revisar`}
        </p>
      </div>
      <p className="mb-3 text-[11px] text-muted-foreground">
        Solo queda anotado: no descuenta nada ni cambia su tarifa. La instructora verá lo que decidas y tu nota.
      </p>

      <div className="flex flex-col gap-2">
        {items.map((b) => (
          <div key={b.id} className="flex flex-col gap-2 rounded-lg bg-muted/40 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-[13px] text-foreground">{b.instructora} · {b.clase}</p>
              <p className="text-[11px] text-muted-foreground">
                {[cuando(b.inicio), textoAntelacion(b.antelacionMinutos)].filter(Boolean).join(' · ')}
              </p>
              {b.motivo && <p className="mt-0.5 text-[12px] italic text-foreground/80">{b.motivo}</p>}
            </div>
            <input
              value={notas[b.id] ?? ''}
              onChange={(e) => setNotas((prev) => ({ ...prev, [b.id]: e.target.value }))}
              maxLength={MAX_NOTA_ESTUDIO}
              disabled={enviando === b.id}
              placeholder="Nota para la instructora (opcional)"
              aria-label={`Nota para la instructora (opcional): ${b.instructora}`}
              className="h-9 min-w-0 rounded-lg border border-border bg-background px-3 text-[13px] placeholder:text-muted-foreground"
            />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" disabled={enviando !== null} onClick={() => void decidir(b, 'LO_HABLAMOS')}>
                Lo hablamos
              </Button>
              <Button size="sm" disabled={enviando !== null} onClick={() => void decidir(b, 'EN_ORDEN')}>
                {enviando === b.id ? 'Guardando…' : 'Todo en orden'}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
