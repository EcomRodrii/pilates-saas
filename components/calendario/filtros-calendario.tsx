'use client';

import { Search, X } from 'lucide-react';

// Rediseño del Calendario — punto 9. `filtroSala` reduce columnas (día:
// prepararColumnasSalaDia ya lo hace con este mismo valor; semana: quien
// compone pre-filtra `sesiones` por salaId antes de agrupar). `filtroInstructor`
// nunca esconde — solo atenúa (lib/calendario-filtros.ts), preserva el
// contexto del estudio. `busqueda` es opcional: ya existía en la FilterBar
// vieja (texto libre por tipo/sala/instructora) y se conserva tal cual, no es
// parte del punto 9 pero quitarla sería una regresión sin pedirla.
export interface FiltrosCalendarioProps {
  salas: { id: string; nombre: string }[];
  instructores: { id: string; nombre: string }[];
  filtroSala: string; // 'todas' o un id
  filtroInstructor: string; // '' o un id
  onSala: (v: string) => void;
  onInstructor: (v: string) => void;
  busqueda?: string;
  onBusqueda?: (v: string) => void;
}

const SELECT = 'rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground focus:outline-none appearance-none cursor-pointer';

export function FiltrosCalendario({
  salas, instructores, filtroSala, filtroInstructor, onSala, onInstructor, busqueda, onBusqueda,
}: FiltrosCalendarioProps) {
  const hayFiltros = filtroSala !== 'todas' || filtroInstructor !== '' || !!busqueda;

  return (
    <div className="flex flex-none items-center gap-2 flex-wrap">
      {onBusqueda && (
        <div className="relative min-w-[160px] max-w-xs flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            className="w-full rounded-xl border border-border bg-card py-2 pl-8 pr-3 text-sm font-medium text-foreground placeholder:text-muted-foreground focus:outline-none"
            placeholder="Buscar clase..."
            value={busqueda ?? ''}
            onChange={e => onBusqueda(e.target.value)}
          />
        </div>
      )}
      <select className={SELECT} value={filtroSala} onChange={e => onSala(e.target.value)}>
        <option value="todas">Todas las salas</option>
        {salas.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
      </select>
      <select className={SELECT} value={filtroInstructor} onChange={e => onInstructor(e.target.value)}>
        <option value="">Todas las instructoras</option>
        {instructores.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
      </select>
      {hayFiltros && (
        <button
          onClick={() => { onSala('todas'); onInstructor(''); onBusqueda?.(''); }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-border text-muted-foreground hover:bg-muted transition-colors"
        >
          <X size={12} />Limpiar
        </button>
      )}
    </div>
  );
}
