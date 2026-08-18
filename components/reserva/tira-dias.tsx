'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Tira de 10 días con scroll horizontal — pantalla 01/02 del handoff
// (docs/widget-reservas-theme-builder-diseno.md, Fase 1).
//
// Componente NUEVO y AISLADO: no sustituye todavía la tira de SEMANA de
// `reserva-calendario.tsx` (flechas ‹ › que saltan de 7 en 7) — esa pieza la
// usan Modo A y Modo B en producción, con lista/semana/mes y toda la lógica
// de aforo/gate detrás, y cambiar su comportamiento por defecto exige una
// pasada de regresión completa que esta pieza, por sí sola, no cubre. Este
// componente es el bloque visual verificado contra la captura 01 del handoff;
// integrarlo como el layout por defecto de `/reservar/[slug]` es el paso
// siguiente, deliberadamente no incluido aquí.
//
// Puro en props: recibe los 10 días ya calculados (`addDays` de
// lib/reserva-calendario-logic.ts) y un recuento por clave de día
// (`contarSlotsPorDia`) — no conoce `ReservaSlot` ni fetching.
// ─────────────────────────────────────────────────────────────────────────────

import { useRef, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { localDayKey } from '@/lib/reserva-calendario-logic';

const DOW_CORTO = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];

export interface TokensTiraDias {
  surface: string;
  line: string;
  ink: string;
  mutedText: string;
  /** Color de acento — fondo del día seleccionado y del punto "hay clases". */
  acento: string;
  /** Color de texto sobre `acento` (derivado por contraste, nunca fijo). */
  acentoTexto: string;
  fuenteDisplay: string;
  fuenteUI: string;
  radioChip: number;
}

export function TiraDias({
  dias, seleccionado, conteos, onSeleccionar, tokens,
}: {
  /** Los N días a mostrar, ya calculados (medianoche local, orden cronológico). */
  dias: Date[];
  /** Clave de día (`localDayKey`) del día activo. */
  seleccionado: string;
  /** Nº de clases por clave de día — solo importa si es > 0 (pinta el punto). */
  conteos: Map<string, number>;
  onSeleccionar: (dayKey: string) => void;
  tokens: TokensTiraDias;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  function desplazar(delta: number) {
    scrollRef.current?.scrollBy({ left: delta, behavior: 'smooth' });
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: tokens.fuenteUI }}>
      <button
        type="button"
        onClick={() => desplazar(-240)}
        aria-label="Días anteriores"
        style={botonFlecha(tokens)}
      >
        <ChevronLeft size={16} />
      </button>

      <div
        ref={scrollRef}
        role="tablist"
        aria-label="Elegir día"
        style={{
          display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none',
          scrollSnapType: 'x proximity', flex: 1,
        }}
      >
        {dias.map((d) => {
          const key = localDayKey(d);
          const activo = key === seleccionado;
          const hayClases = (conteos.get(key) ?? 0) > 0;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={activo}
              onClick={() => onSeleccionar(key)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                minWidth: 54, padding: '9px 6px 7px', borderRadius: tokens.radioChip,
                border: `1px solid ${activo ? tokens.acento : tokens.line}`,
                background: activo ? tokens.acento : tokens.surface,
                cursor: 'pointer', scrollSnapAlign: 'start', flexShrink: 0,
                transition: 'border-color .4s ease, background .4s ease',
              }}
            >
              <span style={{
                fontSize: 9.5, fontWeight: 700, letterSpacing: '.14em',
                opacity: activo ? 0.85 : 0.72,
                color: activo ? tokens.acentoTexto : tokens.mutedText,
              }}>
                {DOW_CORTO[d.getDay()]}
              </span>
              <span style={{
                fontFamily: tokens.fuenteDisplay, fontSize: 18, lineHeight: 1,
                color: activo ? tokens.acentoTexto : tokens.ink,
              }}>
                {d.getDate()}
              </span>
              <span style={{
                width: 4, height: 4, borderRadius: 999,
                background: hayClases ? (activo ? `${tokens.acentoTexto}D9` : tokens.acento) : 'transparent',
              }} />
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => desplazar(240)}
        aria-label="Días siguientes"
        style={botonFlecha(tokens)}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

function botonFlecha(tokens: TokensTiraDias): CSSProperties {
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 34, height: 34, borderRadius: 999, flexShrink: 0,
    border: `1px solid ${tokens.line}`, background: tokens.surface, color: tokens.ink,
    cursor: 'pointer',
  };
}
