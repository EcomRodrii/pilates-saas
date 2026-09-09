'use client';

import { useEffect, useState } from 'react';
import { Gift } from 'lucide-react';
import { dbListarCanjesPendientes, dbEntregarCanje, getCurrentStudioId, type CanjePendiente } from '@/lib/supabase-data';
import { nombreCreditos } from '@/lib/creditos-nombre';
import { useStudio } from '@/lib/studio-context';
import { Button } from '@/components/ui/button';

// Canjes que una socia ya ha pagado con sus créditos y espera recoger.
//
// ── Por qué está en la home y no en Ajustes ──────────────────────────────────
// Vivían SOLO en Configuración → Gamificación → Canjes. Tres niveles dentro de
// Ajustes no es donde se mira cada día, así que quien atendía el mostrador no
// sabía que alguien venía a por algo hasta que se lo decían. El encargo lo puso
// con todas las letras: la propietaria no debería tener que esperar a que la
// alumna llegue con un código para descubrir que ha hecho un canje.
//
// Mismo alcance que `PenalizacionesPendientes`: una lista y un botón, no una
// pantalla nueva. Se oculta sola cuando no hay nada pendiente.
//
// ⚠️ NO es una sección de `HOME_SECCIONES`. Un id nuevo ahí se le colocaría al
// FINAL a todo estudio que ya tenga la home personalizada (`aplicarLayout`), y
// esto es justamente lo que no puede quedar enterrado.
export function CanjesPendientes({ onToast }: { onToast: (m: string) => void }) {
  const { studio } = useStudio();
  const moneda = nombreCreditos(studio?.creditosNombre);
  const [items, setItems] = useState<CanjePendiente[] | null>(null);
  const [entregando, setEntregando] = useState<string | null>(null);
  const [codigo, setCodigo] = useState('');
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    let vivo = true;
    void dbListarCanjesPendientes().then(r => { if (vivo) setItems(r); });
    return () => { vivo = false; };
  }, []);

  function mensajeDeError(error: string): string {
    return error === 'YA_ENTREGADO' ? 'Ese código ya se ha utilizado.'
      : error === 'CANJE_CANCELADO' ? 'Ese canje está cancelado.'
        : error === 'CANJE_NO_ENCONTRADO' ? 'No encontramos ningún canje con ese código.'
          : error === 'NO_AUTORIZADO' ? 'Tu rol no puede entregar recompensas.'
            : 'No se ha podido entregar.';
  }

  // Entregar SIN código: la propietaria reconoce a la clienta y le da la
  // botella. El encargo insiste en que el código no puede ser una barrera.
  async function entregar(c: CanjePendiente) {
    setEntregando(c.id);
    const r = await dbEntregarCanje(getCurrentStudioId(), { redemptionId: c.id });
    setEntregando(null);
    if ('error' in r) { onToast(mensajeDeError(r.error)); return; }
    setItems(prev => (prev ?? []).filter(x => x.id !== c.id));
    onToast(`Entregada: ${c.recompensa}`);
  }

  // Y CON código, para cuando no se la reconoce o hay cola. La RPC acepta las
  // dos vías; aquí solo cambia por dónde se entra.
  async function entregarPorCodigo() {
    const limpio = codigo.trim();
    if (!limpio) return;
    setBuscando(true);
    const r = await dbEntregarCanje(getCurrentStudioId(), { codigo: limpio });
    setBuscando(false);
    if ('error' in r) { onToast(mensajeDeError(r.error)); return; }
    setItems(prev => (prev ?? []).filter(x => x.id !== r.id));
    setCodigo('');
    onToast('Recompensa entregada');
  }

  if (!items?.length) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4" data-testid="canjes-pendientes">
      <div className="mb-3 flex items-center gap-2">
        <Gift className="size-4 text-brand-medio" />
        <p className="text-[13px] font-medium text-foreground">
          {items.length} recompensa{items.length > 1 ? 's' : ''} pendiente{items.length > 1 ? 's' : ''} de entregar
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {items.map(c => (
          <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-[13px] text-foreground">{c.socioNombre}</p>
              <p className="text-[11px] text-muted-foreground">
                {c.recompensa} · {c.creditos} {moneda}
                {/* El código se enseña aquí a propósito: sirve para CASAR lo que
                    la socia trae en el móvil con esta fila, no para exigírselo. */}
                {c.codigo ? ` · ${c.codigo}` : ''}
              </p>
            </div>
            <Button
              size="sm" variant="outline" disabled={entregando === c.id}
              onClick={() => entregar(c)}
            >
              {entregando === c.id ? 'Entregando…' : 'Entregar'}
            </Button>
          </div>
        ))}
      </div>

      {/* La vía del código, debajo de la lista y no encima: lo normal es
          reconocer a quien tienes delante y pulsar su fila. */}
      <div className="mt-3 flex items-center gap-2">
        <input
          value={codigo}
          onChange={e => setCodigo(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void entregarPorCodigo(); }}
          placeholder="¿Trae un código? TNT-…"
          aria-label="Código de canje"
          className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-[13px] uppercase placeholder:normal-case placeholder:text-muted-foreground"
        />
        <Button size="sm" variant="outline" disabled={buscando || !codigo.trim()} onClick={() => void entregarPorCodigo()}>
          {buscando ? 'Buscando…' : 'Entregar'}
        </Button>
      </div>
    </div>
  );
}
