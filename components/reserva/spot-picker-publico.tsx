// Extraído de app/reservar/[slug]/page.tsx: lo usaba solo la pantalla
// 'confirm' (socia ya autenticada). El checkout "pagar y reservar sin login
// previo" (<PantallaReserva>, fase 'datos') necesita el MISMO selector —
// mismo componente compartido en vez de una segunda copia.
'use client';

export function SpotPickerPublico({ spots, takenIds, selected, onSelect, primary }: {
  spots: { id: string; nombre: string; fila: number; columna: number }[];
  takenIds: Set<string>;
  selected: string | null;
  onSelect: (id: string | null) => void;
  primary: string;
}) {
  const filas = [...new Set(spots.map(s => s.fila))].sort((a, b) => a - b);
  const columnas = [...new Set(spots.map(s => s.columna))].sort((a, b) => a - b);
  // Forma "cama" del diseño "Tentare Portal Reservas" — mismo tratamiento que
  // components/reserva/spot-picker.tsx (el SpotPicker del calendario
  // compartido): celda rectangular con una barra interior ("eje") y el número
  // fuera, debajo, más leyenda libre/ocupada/tuya. Envoltorio con fondo
  // `--portal-surface-2` (`--suave` en el .dc.html) y columnas derivadas de
  // `fila`/`columna` reales de cada estudio, no fijas a 4 como en el mockup
  // (ahí no hay datos reales de sala detrás, solo una cuadrícula ilustrativa).
  return (
    <div className="px-4 pt-[13px] pb-2.5" style={{ background: 'var(--portal-surface-2)', borderRadius: 20 }}>
      <div className="h-[7px] rounded-full" style={{ background: `linear-gradient(90deg, var(--portal-line), var(--portal-surface) 30%, var(--portal-surface) 70%, var(--portal-line))` }} aria-hidden="true" />
      <p className="mt-[3px] mb-2.5 text-center text-[8px] font-bold uppercase tracking-[.34em] text-[var(--portal-muted)]">
        espejo
      </p>
      <div className="grid gap-1 justify-center" style={{ gridTemplateColumns: `repeat(${columnas.length}, minmax(30px, 50px))` }}>
        {filas.map(f => columnas.map(c => {
          const spot = spots.find(s => s.fila === f && s.columna === c);
          if (!spot) return <div key={`${f}-${c}`} />;
          const taken = takenIds.has(spot.id);
          const isSel = selected === spot.id;
          return (
            <button key={spot.id} type="button" disabled={taken}
              onClick={() => onSelect(isSel ? null : spot.id)}
              title={taken ? 'Ocupado' : spot.nombre}
              className="border-none bg-transparent pt-0.5 flex flex-col items-center gap-[3px] disabled:cursor-not-allowed"
            >
              <span aria-hidden="true" className="block w-full max-w-[46px] h-7 rounded-[9px] relative transition-all"
                style={taken
                  ? { background: 'var(--portal-line)', opacity: 0.55 }
                  : isSel
                  ? { background: primary, boxShadow: '0 8px 16px -6px rgba(15,15,15,.45)' }
                  : { background: 'var(--portal-surface)', boxShadow: 'inset 0 0 0 1.5px var(--portal-line)' }}>
                <span aria-hidden="true" className="absolute left-[5px] top-1.5 bottom-1.5 w-[5px] rounded-[3px]"
                  style={{ background: isSel ? 'rgba(255,255,255,.55)' : taken ? 'rgba(15,15,15,.12)' : 'var(--portal-surface-2)' }} />
              </span>
              <span className="text-[9.5px]" style={{ color: isSel ? 'var(--portal-ink)' : 'var(--portal-muted)', fontWeight: isSel ? 800 : 500 }}>{spot.nombre}</span>
            </button>
          );
        }))}
      </div>
      <div className="flex justify-between items-center mt-[11px]">
        <span className="text-[8px] font-bold uppercase tracking-[.22em] text-[var(--portal-muted)] border-l-2 pl-1.5" style={{ borderColor: 'var(--portal-muted)' }}>
          puerta
        </span>
        <div className="flex gap-3">
          <span className="flex items-center gap-1 text-[9.5px] text-[var(--portal-muted)]">
            <span className="w-[9px] h-[9px] rounded-sm" style={{ boxShadow: 'inset 0 0 0 1.5px var(--portal-line)', background: 'var(--portal-surface)' }} />
            libre
          </span>
          <span className="flex items-center gap-1 text-[9.5px] text-[var(--portal-muted)]">
            <span className="w-[9px] h-[9px] rounded-sm" style={{ background: 'var(--portal-line)' }} />
            ocupada
          </span>
          <span className="flex items-center gap-1 text-[9.5px] text-[var(--portal-muted)]">
            <span className="w-[9px] h-[9px] rounded-sm" style={{ background: primary }} />
            la tuya
          </span>
        </div>
      </div>
    </div>
  );
}
