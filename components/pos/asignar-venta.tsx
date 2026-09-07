'use client';

import { useMemo, useState } from 'react';
import { UserPlus, Loader2, Check } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { asignarVentaAClienta, esError } from '@/lib/pos/cliente';

// ─────────────────────────────────────────────────────────────────────────────
// «Esto lo pagó alguien que entonces no tenía ficha.»
//
// Una clase de prueba se cobra de pie, en treinta segundos y sin pedir datos.
// La ficha llega después —ese mismo día o tres semanas más tarde— y hasta
// ahora no había forma de juntar las dos cosas: el dinero quedaba en una venta
// anónima y el bono no se entregaba a nadie.
//
// Al asignar, la entrega de siempre crea el bono y suma los créditos. El
// recibo también pasa a su ficha, para que el cobro aparezca en su historial.
//
// La FACTURA no se mueve: se emitió como simplificada (F2, sin receptor) y ya
// está encadenada en Veri*Factu. Reescribir el receptor de un documento fiscal
// emitido no es corregir, es falsear; para eso está la rectificativa desde
// /facturas, que la decide una persona con criterio de gestoría.
// ─────────────────────────────────────────────────────────────────────────────

export function AsignarVenta({ ventaId, onHecho }: { ventaId: string; onHecho: () => void }) {
  const { socios } = useStudio();
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resultados = useMemo(() => {
    const t = q.trim().toLowerCase();
    const activos = socios.filter((s) => s.activo);
    if (!t) return activos.slice(0, 8);
    return activos
      .filter((s) => `${s.nombre} ${s.apellidos ?? ''} ${s.email ?? ''} ${s.telefono ?? ''}`.toLowerCase().includes(t))
      .slice(0, 8);
  }, [socios, q]);

  async function asignar(socioId: string) {
    setEnviando(true);
    setError(null);
    const r = await asignarVentaAClienta(ventaId, socioId);
    setEnviando(false);
    if (esError(r)) { setError(r.error); return; }
    setAbierto(false);
    setQ('');
    onHecho();
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="w-full h-12 rounded-xl border border-dashed border-border text-[15px] font-semibold text-foreground inline-flex items-center justify-center gap-2"
      >
        <UserPlus size={16} />
        Asignar a una clienta
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-background p-3 space-y-2">
      <p className="text-[12.5px] text-muted-foreground">
        Se le entregará el bono de esta venta y el cobro pasará a su ficha.
      </p>
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por nombre, email o teléfono…"
        className="w-full h-12 px-3 rounded-xl border border-border bg-card text-[15px]"
      />
      {error && <p className="text-[12.5px] text-destructive">{error}</p>}
      <div className="max-h-64 overflow-y-auto -mx-1">
        {resultados.length === 0 && (
          <p className="px-1 py-3 text-[13px] text-muted-foreground">No hay ninguna clienta que coincida.</p>
        )}
        {resultados.map((s) => (
          <button
            key={s.id}
            disabled={enviando}
            onClick={() => asignar(s.id)}
            className="w-full px-3 py-2.5 rounded-xl text-left hover:bg-muted/60 disabled:opacity-50 flex items-center gap-2"
          >
            <span className="flex-1 min-w-0">
              <span className="block text-[14.5px] font-medium text-foreground truncate">
                {s.nombre} {s.apellidos ?? ''}
              </span>
              {s.email && <span className="block text-[12px] text-muted-foreground truncate">{s.email}</span>}
            </span>
            {enviando ? <Loader2 size={15} className="animate-spin text-muted-foreground" /> : <Check size={15} className="text-muted-foreground" />}
          </button>
        ))}
      </div>
      <button
        onClick={() => { setAbierto(false); setError(null); }}
        className="w-full h-10 rounded-xl text-[14px] font-medium text-muted-foreground"
      >
        Cancelar
      </button>
    </div>
  );
}
