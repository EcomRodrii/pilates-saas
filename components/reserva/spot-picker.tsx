'use client';

// Selector de sitio (grid por fila/columna) del calendario de reservas.
// Extraído de reserva-calendario.tsx (donde vivía inline) — 100% prop-driven,
// sin dependencias del padre más allá del tema, así que el extract es
// mecánico: componente aislado que Fase 1 del Booking Engine puede reutilizar
// fuera de la hoja de detalle si algún día hace falta (p. ej. un paso propio
// de "elige tu sitio" en el checkout embebido).
import { useMemo } from 'react';
import type { ModoTokens } from '@/lib/portal-modo';
import type { Spot } from '@/lib/types';
import { radius } from '@/lib/reservar-publico-tokens';

export function SpotPicker({
  t, spots, ocupados, selected, onSelect,
}: {
  t: ModoTokens; spots: Spot[]; ocupados: Set<string>;
  selected: string | null; onSelect: (id: string | null) => void;
}) {
  const filas = useMemo(() => [...new Set(spots.map(s => s.fila))].sort((a, b) => a - b), [spots]);
  const columnas = useMemo(() => [...new Set(spots.map(s => s.columna))].sort((a, b) => a - b), [spots]);

  // Compacto a propósito (feedback literal del fundador: «los sitios son muy
  // grandes y el botón de reservar es muy pequeño»): celdas de tamaño FIJO
  // acotado (máx 48px, cuadradas) y centradas, en vez de estirarse a partes
  // iguales por todo el ancho de la hoja — con 8 plazas en 2 filas aquello
  // ocupaba varias pantallas de scroll antes del CTA.
  return (
    <div style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: radius.card, padding: 10 }}>
      <div style={{ background: t.surface2, borderRadius: 8, padding: '4px 0', textAlign: 'center', fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', color: t.muted, textTransform: 'uppercase', marginBottom: 8 }}>
        Frente · Instructor
      </div>
      <div style={{ display: 'grid', gap: 6, gridTemplateColumns: `repeat(${columnas.length}, minmax(30px, 48px))`, justifyContent: 'center' }}>
        {filas.map(fila =>
          columnas.map(col => {
            const spot = spots.find(s => s.fila === fila && s.columna === col);
            if (!spot) return <div key={`${fila}-${col}`} />;
            const taken = ocupados.has(spot.id);
            const isSel = selected === spot.id;
            return (
              <button
                key={spot.id}
                type="button"
                disabled={taken}
                aria-pressed={isSel}
                aria-label={`Sitio ${spot.nombre}${taken ? ' (ocupado)' : ''}`}
                onClick={() => onSelect(isSel ? null : spot.id)}
                style={{
                  aspectRatio: '1 / 1', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10.5, fontWeight: 800, cursor: taken ? 'not-allowed' : 'pointer',
                  border: `2px solid ${isSel ? 'var(--portal-brand)' : taken ? 'transparent' : t.line}`,
                  background: isSel ? 'var(--portal-brand)' : taken ? t.surface2 : t.surface,
                  color: isSel ? 'var(--portal-brand-foreground)' : taken ? t.muted : t.ink,
                  opacity: taken ? 0.5 : 1,
                }}
              >
                {spot.nombre}
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}
