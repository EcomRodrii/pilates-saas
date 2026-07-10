'use client';

import { useState, useMemo } from 'react';
import type { Spot, ReservaEnriquecida, Socio } from '@/lib/types';
import { cn } from '@/lib/utils';
import { User, Check } from 'lucide-react';

interface SpotMapProps {
  spots: Spot[];
  reservas: ReservaEnriquecida[];
  socios: Socio[];
  readOnly?: boolean;
  onAsignarSpot?: (spotId: string, socioId: string) => void;
  onQuitarSpot?: (reservaId: string) => void;
  onCheckin?: (reservaId: string) => void;
}

export function SpotMap({ spots, reservas, socios, readOnly, onAsignarSpot, onQuitarSpot, onCheckin }: SpotMapProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [buscarSocia, setBuscarSocia] = useState('');

  const filas = [...new Set(spots.map(s => s.fila))].sort((a, b) => a - b);
  const columnas = [...new Set(spots.map(s => s.columna))].sort((a, b) => a - b);

  // P0-26: reserva activa por spot y socias ya en clase, indexadas en UNA pasada
  // (antes: reservas.find() por cada spot del grid y por cada socia del panel).
  const reservaPorSpot = useMemo(() => {
    const m = new Map<string, ReservaEnriquecida>();
    for (const r of reservas) {
      if (r.spotId && (r.estado === 'CONFIRMADA' || r.estado === 'ASISTIDA')) m.set(r.spotId, r);
    }
    return m;
  }, [reservas]);
  const sociosEnClaseIds = useMemo(
    () => new Set(reservas.filter(r => r.estado === 'CONFIRMADA' || r.estado === 'ASISTIDA').map(r => r.socioId)),
    [reservas],
  );

  function getReserva(spotId: string) {
    return reservaPorSpot.get(spotId);
  }

  const selectedSpot = spots.find(s => s.id === selected);
  const selectedReserva = selected ? getReserva(selected) : null;

  return (
    <div className="space-y-4">
      {/* Leyenda */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground font-medium">
        <div className="flex items-center gap-1.5">
          <div className="w-3.5 h-3.5 rounded-lg border-2 border-border bg-card" />Libre
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3.5 h-3.5 rounded-lg" style={{ backgroundColor: 'color-mix(in srgb, var(--brand) 10%, var(--card))', border: '2px solid var(--brand)' }} />Reservado
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3.5 h-3.5 rounded-lg" style={{ backgroundColor: '#E3EFE6', border: '2px solid #9CC5A8' }} />Check-in
        </div>
      </div>

      <div className="bg-muted rounded-xl py-2 text-center text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
        PARTE FRONTAL · INSTRUCTOR
      </div>

      <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${columnas.length}, minmax(0, 1fr))` }}>
        {filas.map(fila =>
          columnas.map(col => {
            const spot = spots.find(s => s.fila === fila && s.columna === col);
            if (!spot) return <div key={`${fila}-${col}`} />;

            const reserva = getReserva(spot.id);
            const asistida = reserva?.estado === 'ASISTIDA';
            const isSelected = selected === spot.id;

            return (
              <button
                key={spot.id}
                onClick={() => !readOnly && setSelected(isSelected ? null : spot.id)}
                disabled={readOnly}
                className={cn(
                  'relative flex flex-col items-center justify-center rounded-2xl border-2 p-3 transition-all aspect-[3/4] text-center focus:outline-none',
                  isSelected && 'ring-2 ring-offset-2'
                )}
                style={
                  asistida
                    ? { backgroundColor: '#E3EFE6', borderColor: '#9CC5A8' } as React.CSSProperties
                    : reserva
                    ? { backgroundColor: 'color-mix(in srgb, var(--brand) 10%, var(--card))', borderColor: 'var(--brand)' } as React.CSSProperties
                    : { backgroundColor: '#FFFFFF', borderColor: '#E5E5EA' } as React.CSSProperties
                }
              >
                <span className="text-[10px] font-bold opacity-50 mb-1">{spot.nombre}</span>
                {reserva ? (
                  <div className="flex flex-col items-center gap-1">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                      style={asistida
                        ? { backgroundColor: '#C3D9B0', color: 'var(--foreground)' }
                        : { backgroundColor: 'var(--brand)', color: 'var(--brand-foreground)' }}
                    >
                      {asistida ? <Check size={13} /> : `${reserva.socio.nombre[0]}${reserva.socio.apellidos[0]}`}
                    </div>
                    <span className="text-[10px] font-semibold leading-tight text-foreground">
                      {reserva.socio.nombre.split(' ')[0]}
                    </span>
                  </div>
                ) : (
                  <User size={18} className="text-muted-foreground" />
                )}
              </button>
            );
          })
        )}
      </div>

      {selected && selectedSpot && !readOnly && (
        <div className="rounded-2xl p-4 space-y-3 bg-background" style={{ border: '1px solid var(--border)' }}>
          <p className="text-sm font-bold text-foreground">
            {selectedSpot.nombre} — {selectedReserva ? `${selectedReserva.socio.nombre} ${selectedReserva.socio.apellidos}` : 'Libre'}
          </p>
          {selectedReserva ? (
            <div className="flex gap-2 flex-wrap">
              {selectedReserva.estado === 'CONFIRMADA' && onCheckin && (
                <button
                  onClick={() => { onCheckin(selectedReserva.id); setSelected(null); }}
                  className="px-3.5 py-1.5 rounded-full text-xs font-bold transition-opacity hover:opacity-80"
                  style={{ backgroundColor: '#C3D9B0', color: 'var(--foreground)' }}
                >
                  ✓ Check-in
                </button>
              )}
              {onQuitarSpot && (
                <button
                  onClick={() => { onQuitarSpot(selectedReserva.id); setSelected(null); }}
                  className="px-3.5 py-1.5 rounded-full text-xs font-semibold border border-border text-muted-foreground hover:bg-muted transition-colors"
                >
                  Liberar spot
                </button>
              )}
            </div>
          ) : onAsignarSpot ? (
            <div>
              <p className="text-xs text-muted-foreground mb-2 font-medium">Asignar socia a este reformer:</p>
              {/* P0-26: buscador + límite de resultados, en vez de renderizar la
                  lista completa de socias (con 200.000, colgaba el navegador). */}
              <input
                autoFocus
                value={buscarSocia}
                onChange={e => setBuscarSocia(e.target.value)}
                placeholder="Buscar socia…"
                className="w-full mb-2 rounded-xl border border-border bg-card px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-brand"
              />
              <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto">
                {socios
                  .filter(s => {
                    if (!s.activo || sociosEnClaseIds.has(s.id)) return false;
                    const q = buscarSocia.trim().toLowerCase();
                    return !q || `${s.nombre} ${s.apellidos}`.toLowerCase().includes(q);
                  })
                  .slice(0, 20)
                  .map(s => (
                    <button
                      key={s.id}
                      onClick={() => { onAsignarSpot(selectedSpot.id, s.id); setSelected(null); setBuscarSocia(''); }}
                      className="text-left px-2.5 py-1.5 rounded-xl text-xs font-semibold border border-border text-foreground hover:border-brand hover:bg-brand/10 transition-colors"
                    >
                      {s.nombre} {s.apellidos}
                    </button>
                  ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
