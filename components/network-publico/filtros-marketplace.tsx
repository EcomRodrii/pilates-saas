'use client';

// Filtros del marketplace público — a diferencia de components/network/
// filtros-busqueda.tsx (panel privado, estado en memoria), aquí cada cambio
// se refleja en la URL (router.push con nuevos searchParams). Así:
//   - la página resultante es la misma que compartirías/guardarías,
//   - y sigue siendo Server Component + SSR (Google ve resultados reales
//     para "pilates reformer barcelona", no un estado de React vacío).
import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, SlidersHorizontal } from 'lucide-react';
import {
  ESPECIALIDADES_NETWORK, ESPECIALIDAD_LABEL,
  DISPONIBILIDAD_ESTADOS_NETWORK, DISPONIBILIDAD_ESTADO_LABEL,
} from '@/lib/network/catalogo';
import { cn } from '@/lib/utils';

const EXPERIENCIA_OPCIONES = [
  { valor: '', etiqueta: 'Cualquier experiencia' },
  { valor: '1', etiqueta: '1+ años' },
  { valor: '3', etiqueta: '3+ años' },
  { valor: '5', etiqueta: '5+ años' },
  { valor: '10', etiqueta: '10+ años' },
];

export function FiltrosMarketplace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [ciudad, setCiudad] = useState(searchParams.get('ciudad') ?? '');
  const [avanzadosAbiertos, setAvanzadosAbiertos] = useState(false);

  function actualizar(clave: string, valor: string | null) {
    const sp = new URLSearchParams(searchParams.toString());
    if (valor) sp.set(clave, valor); else sp.delete(clave);
    startTransition(() => router.push(`/network/instructoras?${sp.toString()}`));
  }

  function toggleEnLista(clave: string, valor: string) {
    const actuales = (searchParams.get(clave) ?? '').split(',').filter(Boolean);
    const siguiente = actuales.includes(valor) ? actuales.filter(v => v !== valor) : [...actuales, valor];
    actualizar(clave, siguiente.length ? siguiente.join(',') : null);
  }

  const especialidadesActivas = (searchParams.get('especialidades') ?? '').split(',').filter(Boolean);
  const disponibilidadActiva = (searchParams.get('disponibilidad') ?? '').split(',').filter(Boolean);

  return (
    <div className={cn('space-y-4', pending && 'opacity-70')}>
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={ciudad}
            onChange={e => setCiudad(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && actualizar('ciudad', ciudad || null)}
            onBlur={() => actualizar('ciudad', ciudad || null)}
            placeholder="¿Dónde? Barcelona, Madrid…"
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-card text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
        </div>
        <button
          type="button"
          onClick={() => setAvanzadosAbiertos(v => !v)}
          className="flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl border border-border bg-card text-[13px] font-medium text-foreground hover:bg-muted transition-colors"
        >
          <SlidersHorizontal size={14} /> Filtros
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {ESPECIALIDADES_NETWORK.map(v => (
          <button
            key={v}
            type="button"
            onClick={() => toggleEnLista('especialidades', v)}
            aria-pressed={especialidadesActivas.includes(v)}
            className={cn(
              'px-3 py-1.5 rounded-full text-[12.5px] font-medium border transition-colors',
              especialidadesActivas.includes(v)
                ? 'bg-brand text-brand-foreground border-brand'
                : 'bg-card text-foreground border-border hover:bg-muted',
            )}
          >
            {ESPECIALIDAD_LABEL[v]}
          </button>
        ))}
      </div>

      {avanzadosAbiertos && (
        <div className="grid sm:grid-cols-2 gap-4 p-4 rounded-xl border border-border bg-card">
          <div>
            <p className="text-[12px] font-medium text-muted-foreground mb-2">Disponibilidad</p>
            <div className="flex flex-wrap gap-1.5">
              {DISPONIBILIDAD_ESTADOS_NETWORK.filter(v => v !== 'no_disponible').map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => toggleEnLista('disponibilidad', v)}
                  aria-pressed={disponibilidadActiva.includes(v)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors',
                    disponibilidadActiva.includes(v)
                      ? 'bg-brand text-brand-foreground border-brand'
                      : 'bg-background text-foreground border-border hover:bg-muted',
                  )}
                >
                  {DISPONIBILIDAD_ESTADO_LABEL[v]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[12px] font-medium text-muted-foreground mb-2">Experiencia</p>
            <select
              defaultValue={searchParams.get('experienciaMinima') ?? ''}
              onChange={e => actualizar('experienciaMinima', e.target.value || null)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-[12.5px] text-foreground"
            >
              {EXPERIENCIA_OPCIONES.map(o => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
