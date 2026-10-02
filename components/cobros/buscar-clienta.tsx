'use client';

// Selector de clienta BUSCABLE (P0-23): con miles de clientas, pintarlas todas
// como opciones cuelga el navegador. Se filtra por texto (sin tildes) y se pintan
// como mucho 20. Se abre al pulsarlo o al escribir, NO al recibir el foco: el
// diálogo pone el foco aquí al abrirse y el desplegable nacía abierto, con un
// velo que se comía el primer clic.

import { useMemo, useState } from 'react';
import type { Socio } from '@/lib/types';
import { cn } from '@/lib/utils';
import { normalizar } from './piezas';

export function BuscarClienta({ socios, valor, onCambio, className }: {
  socios: Socio[]; valor: string; onCambio: (id: string) => void; className?: string;
}) {
  const [q, setQ] = useState('');
  const [abierto, setAbierto] = useState(false);
  const elegida = socios.find(s => s.id === valor);
  const resultados = useMemo(() => {
    const t = normalizar(q.trim());
    const activas = socios.filter(s => s.activo);
    return (t ? activas.filter(s => normalizar(`${s.nombre} ${s.apellidos} ${s.email ?? ''}`).includes(t)) : activas).slice(0, 20);
  }, [socios, q]);
  return (
    <div className="relative">
      {abierto && <div className="fixed inset-0 z-40" onClick={() => setAbierto(false)} />}
      <input
        className={cn('relative z-50 w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm font-medium text-foreground transition-colors focus:border-brand focus:outline-none', className)}
        placeholder="Buscar clienta…"
        aria-label="Clienta"
        value={abierto ? q : (elegida ? `${elegida.nombre} ${elegida.apellidos}` : '')}
        onClick={() => { if (!abierto) { setAbierto(true); setQ(''); } }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown' && !abierto) { e.preventDefault(); setAbierto(true); setQ(''); }
          if (e.key === 'Escape' && abierto) { e.stopPropagation(); setAbierto(false); }
        }}
        onChange={e => { setQ(e.target.value); setAbierto(true); }}
      />
      {abierto && (
        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
          {resultados.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</p>
          ) : resultados.map(s => (
            <button
              key={s.id} type="button"
              onClick={() => { onCambio(s.id); setAbierto(false); setQ(''); }}
              className="w-full px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
            >
              {s.nombre} {s.apellidos}
              {s.email && <span className="ml-1.5 text-xs text-muted-foreground">{s.email}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
