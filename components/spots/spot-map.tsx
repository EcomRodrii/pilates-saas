'use client';

import { useState } from 'react';
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

  const filas = [...new Set(spots.map(s => s.fila))].sort((a, b) => a - b);
  const columnas = [...new Set(spots.map(s => s.columna))].sort((a, b) => a - b);

  function getReserva(spotId: string) {
    return reservas.find(r => r.spotId === spotId && (r.estado === 'CONFIRMADA' || r.estado === 'ASISTIDA'));
  }

  const selectedSpot = spots.find(s => s.id === selected);
  const selectedReserva = selected ? getReserva(selected) : null;

  return (
    <div className="space-y-4">
      {/* Leyenda */}
      <div className="flex items-center gap-4 text-xs text-gray-400 font-medium">
        <div className="flex items-center gap-1.5">
          <div className="w-3.5 h-3.5 rounded-lg border-2 border-gray-200 bg-white" />Libre
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3.5 h-3.5 rounded-lg" style={{ backgroundColor: '#F7EDEF', border: '2px solid #BBAAE0' }} />Reservado
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3.5 h-3.5 rounded-lg" style={{ backgroundColor: '#E3EFE6', border: '2px solid #9CC5A8' }} />Check-in
        </div>
      </div>

      <div className="bg-gray-50 rounded-xl py-2 text-center text-[10px] text-gray-400 font-bold uppercase tracking-widest">
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
                    ? { backgroundColor: '#F7EDEF', borderColor: '#BBAAE0' } as React.CSSProperties
                    : { backgroundColor: '#FFFFFF', borderColor: '#E5E5EA' } as React.CSSProperties
                }
              >
                <span className="text-[10px] font-bold opacity-50 mb-1">{spot.nombre}</span>
                {reserva ? (
                  <div className="flex flex-col items-center gap-1">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                      style={asistida
                        ? { backgroundColor: '#C3D9B0', color: '#1A1A2E' }
                        : { backgroundColor: '#BBAAE0', color: '#1A1A2E' }}
                    >
                      {asistida ? <Check size={13} /> : `${reserva.socio.nombre[0]}${reserva.socio.apellidos[0]}`}
                    </div>
                    <span className="text-[10px] font-semibold leading-tight text-gray-700">
                      {reserva.socio.nombre.split(' ')[0]}
                    </span>
                  </div>
                ) : (
                  <User size={18} className="text-gray-300" />
                )}
              </button>
            );
          })
        )}
      </div>

      {selected && selectedSpot && !readOnly && (
        <div className="rounded-2xl p-4 space-y-3" style={{ backgroundColor: '#FDFBFA', border: '1px solid #EBEBF0' }}>
          <p className="text-sm font-bold text-[#1A1A2E]">
            {selectedSpot.nombre} — {selectedReserva ? `${selectedReserva.socio.nombre} ${selectedReserva.socio.apellidos}` : 'Libre'}
          </p>
          {selectedReserva ? (
            <div className="flex gap-2 flex-wrap">
              {selectedReserva.estado === 'CONFIRMADA' && onCheckin && (
                <button
                  onClick={() => { onCheckin(selectedReserva.id); setSelected(null); }}
                  className="px-3.5 py-1.5 rounded-full text-xs font-bold transition-opacity hover:opacity-80"
                  style={{ backgroundColor: '#C3D9B0', color: '#1A1A2E' }}
                >
                  ✓ Check-in
                </button>
              )}
              {onQuitarSpot && (
                <button
                  onClick={() => { onQuitarSpot(selectedReserva.id); setSelected(null); }}
                  className="px-3.5 py-1.5 rounded-full text-xs font-semibold border border-gray-200 text-gray-500 hover:bg-gray-100 transition-colors"
                >
                  Liberar spot
                </button>
              )}
            </div>
          ) : onAsignarSpot ? (
            <div>
              <p className="text-xs text-gray-400 mb-2 font-medium">Asignar socia a este reformer:</p>
              <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto">
                {socios.filter(s => s.activo && !reservas.find(r => r.socioId === s.id && (r.estado === 'CONFIRMADA' || r.estado === 'ASISTIDA'))).map(s => (
                  <button
                    key={s.id}
                    onClick={() => { onAsignarSpot(selectedSpot.id, s.id); setSelected(null); }}
                    className="text-left px-2.5 py-1.5 rounded-xl text-xs font-semibold border border-gray-200 text-gray-700 hover:border-[#BBAAE0] transition-colors"
                    style={{ ':hover': { backgroundColor: '#F7EDEF' } } as React.CSSProperties}
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
