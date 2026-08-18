'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Chips de filtro en píldora, fila horizontal — pantalla 01 del handoff
// (docs/widget-reservas-theme-builder-diseno.md, Fase 1).
//
// Mismo motivo que tira-dias.tsx: componente NUEVO y AISLADO, no un reemplazo
// todavía de `rail-filtros.tsx` (rail lateral con `<select>`, en producción en
// Modo A y Modo B). Reutiliza la lógica pura de `opcionesDe`/`vaLaPena`
// (lib/reservar/filtros-clases.ts) — lo único que cambia es la disposición
// visual, tal como pide el diseño técnico (§2.3: "la LÓGICA de qué opciones
// mostrar se reutiliza, la disposición visual no").
//
// A diferencia del rail (que ofrece 5 filtros con desplegable), el patrón de
// píldoras del handoff es de SELECCIÓN ÚNICA en una sola fila — por eso este
// componente cubre solo el filtro de TIPO DE CLASE (el que el handoff dibuja),
// no los 5 ejes del rail. Instructora/nivel/horario/sala siguen sirviéndose
// mejor como desplegable — cinco filas de píldoras no caben en un móvil de
// 390px sin desbordar, que es justo el caso que el rail ya resolvía.
// ─────────────────────────────────────────────────────────────────────────────

import { opcionesDe, vaLaPena, type ClaseFiltrable } from '@/lib/reservar/filtros-clases';

export interface TokensFiltrosPildoras {
  ink: string;
  bg: string;
  surface: string;
  line: string;
  mutedText: string;
  fuenteUI: string;
}

export function FiltrosPildoras({
  clases, valor, onCambiar, etiquetaTipo, tokens,
}: {
  clases: readonly ClaseFiltrable[];
  /** '' = "Todas". */
  valor: string;
  onCambiar: (tipoClaseId: string) => void;
  etiquetaTipo: (id: string) => string;
  tokens: TokensFiltrosPildoras;
}) {
  const tipos = opcionesDe(clases, (c) => c.tipoClaseId, etiquetaTipo);
  if (!vaLaPena(tipos)) return null;

  const opciones = [{ valor: '', etiqueta: 'Todas' }, ...tipos];

  return (
    <div
      role="tablist"
      aria-label="Filtrar por tipo de clase"
      style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none', fontFamily: tokens.fuenteUI }}
    >
      {opciones.map((o) => {
        const activo = o.valor === valor;
        return (
          <button
            key={o.valor}
            type="button"
            role="tab"
            aria-selected={activo}
            onClick={() => onCambiar(o.valor)}
            style={{
              flexShrink: 0, padding: '8px 14px', borderRadius: 999,
              fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
              border: `1px solid ${activo ? tokens.ink : tokens.line}`,
              background: activo ? tokens.ink : tokens.surface,
              color: activo ? tokens.bg : tokens.mutedText,
              transition: 'border-color .4s ease, background .4s ease, color .4s ease',
            }}
          >
            {o.etiqueta}
          </button>
        );
      })}
    </div>
  );
}
