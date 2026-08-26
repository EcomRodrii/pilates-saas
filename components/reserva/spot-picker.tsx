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
  // acotado y centradas, en vez de estirarse a partes iguales por todo el
  // ancho de la hoja — con 8 plazas en 2 filas aquello ocupaba varias
  // pantallas de scroll antes del CTA.
  //
  // Forma "cama" del diseño "Tentare Portal Reservas" (2026-08-26): celda
  // rectangular (más ancha que alta, no cuadrada) con una barra vertical
  // interior ("eje") y el número FUERA, debajo — más leyenda libre/ocupada/
  // tuya al pie, que el selector no tenía. "Frente · Instructor" se
  // mantiene como rótulo (en vez de "espejo" del diseño): no todo estudio
  // tiene reformers frente a un espejo, pero todos tienen un frente hacia la
  // instructora — es el dato real que orienta la sala.
  return (
    <div style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: radius.card, padding: '13px 16px 10px' }}>
      <div style={{ height: 7, borderRadius: 999, background: `linear-gradient(90deg, ${t.line}, ${t.surface2} 30%, ${t.surface2} 70%, ${t.line})` }} aria-hidden="true" />
      <p style={{ margin: '3px 0 10px', textAlign: 'center', fontSize: 8, fontWeight: 800, letterSpacing: '.3em', textTransform: 'uppercase', color: t.muted }}>
        Frente · Instructor
      </p>
      <div style={{ display: 'grid', gap: '4px 4px', gridTemplateColumns: `repeat(${columnas.length}, minmax(30px, 50px))`, justifyContent: 'center' }}>
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
                  border: 'none', background: 'transparent', padding: '2px 0 0', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', gap: 3, cursor: taken ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                }}
              >
                <span aria-hidden="true" style={{
                  display: 'block', width: '100%', maxWidth: 46, height: 28, borderRadius: 9, position: 'relative',
                  transition: 'all .22s cubic-bezier(.34,1.3,.5,1)',
                  ...(isSel
                    ? { background: 'var(--portal-brand)', boxShadow: '0 8px 16px -6px rgba(15,15,15,.45)' }
                    : taken
                      ? { background: t.line, opacity: 0.55 }
                      : { background: t.surface, boxShadow: `inset 0 0 0 1.5px ${t.line}` }),
                }}>
                  <span aria-hidden="true" style={{
                    position: 'absolute', left: 5, top: 6, bottom: 6, width: 5, borderRadius: 3,
                    background: isSel ? 'rgba(255,255,255,.55)' : taken ? 'rgba(15,15,15,.12)' : t.surface2,
                  }} />
                </span>
                <span style={{ fontSize: 9.5, color: isSel ? t.ink : t.muted, fontWeight: isSel ? 800 : 500 }}>{spot.nombre}</span>
              </button>
            );
          }),
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 11 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9.5, color: t.muted }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, boxShadow: `inset 0 0 0 1.5px ${t.line}`, background: t.surface }} />
          libre
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9.5, color: t.muted }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: t.line }} />
          ocupada
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9.5, color: t.muted }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: 'var(--portal-brand)' }} />
          la tuya
        </span>
      </div>
    </div>
  );
}
