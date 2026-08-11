'use client';

import { serif, cq, radius as R, eyebrow } from '@/lib/reservar-publico-tokens';
import type { TipoClase } from '@/lib/types';

const PRIMARY = 'var(--portal-brand)';
const PRIMARY_FG = 'var(--portal-brand-foreground)';

const HORARIOS: { id: '' | 'manana' | 'mediodia' | 'tarde'; label: string }[] = [
  { id: '', label: 'Cualquiera' },
  { id: 'manana', label: 'Mañana' },
  { id: 'mediodia', label: 'Mediodía' },
  { id: 'tarde', label: 'Tarde' },
];

const DIAS: { id: number; label: string }[] = [
  { id: 1, label: 'L' }, { id: 2, label: 'M' }, { id: 3, label: 'X' }, { id: 4, label: 'J' },
  { id: 5, label: 'V' }, { id: 6, label: 'S' }, { id: 0, label: 'D' },
];

// Chip seleccionable — mismo patrón visual que el filtro de tipo de clase ya
// existente en page.tsx (radio pill, color de marca cuando está activo), sin
// importar el Pill del portal privado (otro sistema de theming, no aplica
// aquí — ver reservar-publico-tokens.ts).
function Chip({ label, dot, active, onClick }: { label: string; dot?: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      style={{
        flex: '0 0 auto', height: 38, padding: '0 18px', borderRadius: R.pill,
        display: 'flex', alignItems: 'center', gap: 9, fontSize: 12, fontWeight: 500, cursor: 'pointer',
        whiteSpace: 'nowrap', transition: 'background .3s ease, color .3s ease',
        border: active ? '1px solid transparent' : '1px solid var(--portal-line)',
        background: active ? (dot ?? PRIMARY) : 'rgba(255,255,255,.7)',
        color: active ? (dot ? '#fff' : PRIMARY_FG) : 'var(--portal-muted-2)',
      }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: 999, background: active ? 'rgba(255,255,255,0.8)' : dot }} />}
      {label}
    </button>
  );
}

export interface DiscoveryQuizProps {
  tiposClase: TipoClase[];
  nivelesDisponibles: string[];
  nivelLabel: Record<string, string>;
  paso: number;
  setPaso: (p: number) => void;
  filtroNivel: string;
  setFiltroNivel: (v: string) => void;
  filtroTipo: string;
  setFiltroTipo: (v: string) => void;
  filtroHorario: '' | 'manana' | 'mediodia' | 'tarde';
  setFiltroHorario: (v: '' | 'manana' | 'mediodia' | 'tarde') => void;
  filtroDias: number[];
  setFiltroDias: (v: number[]) => void;
  onCompletar: () => void;
  onCerrar: () => void;
}

export function DiscoveryQuiz(props: DiscoveryQuizProps) {
  const {
    tiposClase, nivelesDisponibles, nivelLabel, paso, setPaso,
    filtroNivel, setFiltroNivel, filtroTipo, setFiltroTipo,
    filtroHorario, setFiltroHorario, filtroDias, setFiltroDias,
    onCompletar, onCerrar,
  } = props;

  const TOTAL_PASOS = 4;

  function toggleDia(id: number) {
    setFiltroDias(filtroDias.includes(id) ? filtroDias.filter(d => d !== id) : [...filtroDias, id]);
  }

  return (
    <div style={{ borderRadius: R.card, background: 'rgba(255,255,255,.7)', border: '1px solid var(--portal-line)', padding: cq(22, 3, 30) }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={eyebrow(9)}>PASO {paso + 1} DE {TOTAL_PASOS}</div>
        <button type="button" onClick={onCerrar} style={{ fontSize: 11, color: 'var(--portal-muted-2)', background: 'none', border: 'none', cursor: 'pointer' }}>
          Cerrar
        </button>
      </div>

      {paso === 0 && (
        <>
          <h3 style={{ fontFamily: serif, fontSize: cq(20, 2.4, 26), marginTop: 12 }}>¿Qué nivel te viene mejor?</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
            <Chip label="Cualquiera" active={filtroNivel === ''} onClick={() => { setFiltroNivel(''); setPaso(1); }} />
            {nivelesDisponibles.map(n => (
              <Chip key={n} label={nivelLabel[n] ?? n} active={filtroNivel === n} onClick={() => { setFiltroNivel(n); setPaso(1); }} />
            ))}
          </div>
        </>
      )}

      {paso === 1 && (
        <>
          <h3 style={{ fontFamily: serif, fontSize: cq(20, 2.4, 26), marginTop: 12 }}>¿Qué tipo de clase te llama?</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
            <Chip label="Cualquiera" active={filtroTipo === ''} onClick={() => { setFiltroTipo(''); setPaso(2); }} />
            {tiposClase.map(t => (
              <Chip key={t.id} label={t.nombre} dot={t.color} active={filtroTipo === t.id} onClick={() => { setFiltroTipo(t.id); setPaso(2); }} />
            ))}
          </div>
        </>
      )}

      {paso === 2 && (
        <>
          <h3 style={{ fontFamily: serif, fontSize: cq(20, 2.4, 26), marginTop: 12 }}>¿Qué horario prefieres?</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
            {HORARIOS.map(h => (
              <Chip key={h.id || 'todos'} label={h.label} active={filtroHorario === h.id} onClick={() => { setFiltroHorario(h.id); setPaso(3); }} />
            ))}
          </div>
        </>
      )}

      {paso === 3 && (
        <>
          <h3 style={{ fontFamily: serif, fontSize: cq(20, 2.4, 26), marginTop: 12 }}>¿Qué días puedes venir?</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
            {DIAS.map(d => (
              <Chip key={d.id} label={d.label} active={filtroDias.includes(d.id)} onClick={() => toggleDia(d.id)} />
            ))}
          </div>
          <button type="button" onClick={onCompletar}
            style={{
              marginTop: 20, height: 46, padding: `0 ${cq(18, 2, 26)}`, borderRadius: R.pillBtnSm,
              background: PRIMARY, color: PRIMARY_FG, border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}>
            Ver mis clases
          </button>
        </>
      )}

      {paso > 0 && (
        <button type="button" onClick={() => setPaso(paso - 1)}
          style={{ marginTop: 14, marginLeft: paso === 3 ? 12 : 0, fontSize: 11, color: 'var(--portal-muted-2)', background: 'none', border: 'none', cursor: 'pointer' }}>
          ← Volver
        </button>
      )}
    </div>
  );
}
