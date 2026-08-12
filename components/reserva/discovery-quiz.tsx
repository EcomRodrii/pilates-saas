'use client';

import { serif, cq, radius as R, eyebrow } from '@/lib/reservar-publico-tokens';
import { OBJETIVOS } from '@/lib/reservar/objetivos';

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
function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      style={{
        flex: '0 0 auto', height: 38, padding: '0 18px', borderRadius: R.pill,
        display: 'flex', alignItems: 'center', gap: 9, fontSize: 12, fontWeight: 500, cursor: 'pointer',
        whiteSpace: 'nowrap', transition: 'background .3s ease, color .3s ease',
        border: active ? '1px solid transparent' : '1px solid var(--portal-line)',
        background: active ? PRIMARY : 'var(--portal-velo-fuerte)',
        color: active ? PRIMARY_FG : 'var(--portal-muted-2)',
      }}>
      {label}
    </button>
  );
}

export interface DiscoveryQuizProps {
  nivelesDisponibles: string[];
  nivelLabel: Record<string, string>;
  paso: number;
  setPaso: (p: number) => void;
  /** Objetivo elegido en el paso 1. '' = sin elegir (se puede saltar). */
  filtroObjetivo: string;
  setFiltroObjetivo: (v: string) => void;
  /** Clases que quedan con lo elegido hasta ahora. El paso final lo enseña en
   *  vez de prometer una recomendación que este asistente no calcula. */
  nResultados: number;
  filtroNivel: string;
  setFiltroNivel: (v: string) => void;
  filtroHorario: '' | 'manana' | 'mediodia' | 'tarde';
  setFiltroHorario: (v: '' | 'manana' | 'mediodia' | 'tarde') => void;
  filtroDias: number[];
  setFiltroDias: (v: number[]) => void;
  onCompletar: () => void;
  onCerrar: () => void;
}

export function DiscoveryQuiz(props: DiscoveryQuizProps) {
  const {
    nivelesDisponibles, nivelLabel, paso, setPaso,
    filtroObjetivo, setFiltroObjetivo, nResultados,
    filtroNivel, setFiltroNivel,
    filtroHorario, setFiltroHorario, filtroDias, setFiltroDias,
    onCompletar, onCerrar,
  } = props;

  // Cinco pasos con nombre, como el diseño: el número solo dice cuánto falta;
  // el nombre dice de qué va lo que viene.
  const NOMBRES = ['Objetivo', 'Horario', 'Días', 'Nivel', 'Resultado'];
  const TOTAL_PASOS = NOMBRES.length;

  function toggleDia(id: number) {
    setFiltroDias(filtroDias.includes(id) ? filtroDias.filter(d => d !== id) : [...filtroDias, id]);
  }

  return (
    <div style={{ borderRadius: R.card, background: 'var(--portal-velo-fuerte)', border: '1px solid var(--portal-line)', padding: cq(22, 3, 30) }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={eyebrow(9)}>{NOMBRES[paso]} · {paso + 1}/{TOTAL_PASOS}</div>
        <button type="button" onClick={onCerrar} style={{ fontSize: 11, color: 'var(--portal-muted-2)', background: 'none', border: 'none', cursor: 'pointer' }}>
          Cerrar
        </button>
      </div>

      {paso === 0 && (
        <>
          <h3 style={{ fontFamily: serif, fontSize: cq(20, 2.4, 26), marginTop: 12 }}>¿Qué quieres conseguir?</h3>
          <p style={{ fontSize: 12.5, color: 'var(--portal-muted)', marginTop: 6 }}>Elige lo que más se parezca a lo tuyo. Puedes saltártelo.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
            {OBJETIVOS.map(o => (
              <Chip key={o.id} label={o.label} active={filtroObjetivo === o.id}
                onClick={() => { setFiltroObjetivo(filtroObjetivo === o.id ? '' : o.id); }} />
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20 }}>
            <button type="button" onClick={() => setPaso(1)}
              style={{ height: 44, padding: `0 ${cq(18, 2, 26)}`, borderRadius: R.pillBtnSm, background: PRIMARY, color: PRIMARY_FG, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Continuar
            </button>
            {/* Saltar NO es lo mismo que no elegir: limpia lo marcado y sigue.
                Sin él, quien toca un objetivo por error no tiene forma de
                deshacerlo salvo volviendo a tocarlo, que no es evidente. */}
            <button type="button" onClick={() => { setFiltroObjetivo(''); setPaso(1); }}
              style={{ fontSize: 12.5, color: 'var(--portal-muted-2)', background: 'none', border: 'none', cursor: 'pointer' }}>
              Saltar
            </button>
          </div>
        </>
      )}

      {paso === 3 && (
        <>
          <h3 style={{ fontFamily: serif, fontSize: cq(20, 2.4, 26), marginTop: 12 }}>¿Qué nivel te viene mejor?</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
            <Chip label="Cualquiera" active={filtroNivel === ''} onClick={() => { setFiltroNivel(''); setPaso(4); }} />
            {nivelesDisponibles.map(n => (
              <Chip key={n} label={nivelLabel[n] ?? n} active={filtroNivel === n} onClick={() => { setFiltroNivel(n); setPaso(4); }} />
            ))}
          </div>
        </>
      )}

      {paso === 1 && (
        <>
          <h3 style={{ fontFamily: serif, fontSize: cq(20, 2.4, 26), marginTop: 12 }}>¿Qué horario prefieres?</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
            {HORARIOS.map(h => (
              <Chip key={h.id || 'todos'} label={h.label} active={filtroHorario === h.id} onClick={() => { setFiltroHorario(h.id); setPaso(2); }} />
            ))}
          </div>
        </>
      )}

      {paso === 2 && (
        <>
          <h3 style={{ fontFamily: serif, fontSize: cq(20, 2.4, 26), marginTop: 12 }}>¿Qué días puedes venir?</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
            {DIAS.map(d => (
              <Chip key={d.id} label={d.label} active={filtroDias.includes(d.id)} onClick={() => toggleDia(d.id)} />
            ))}
          </div>
          <button type="button" onClick={() => setPaso(3)}
            style={{
              marginTop: 20, height: 46, padding: `0 ${cq(18, 2, 26)}`, borderRadius: R.pillBtnSm,
              background: PRIMARY, color: PRIMARY_FG, border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}>
            Continuar
          </button>
        </>
      )}

      {paso === 4 && (
        <>
          <h3 style={{ fontFamily: serif, fontSize: cq(20, 2.4, 26), marginTop: 12 }}>
            {nResultados === 0 ? 'No hay ninguna con todo eso' : `${nResultados} clase${nResultados === 1 ? '' : 's'} para ti`}
          </h3>
          {/* ⚠️ Se dice el NÚMERO, no «tu clase ideal». Este asistente filtra;
              no puntúa ni ordena. Prometer una recomendación y entregar una
              lista filtrada es la clase de exageración que hace desconfiar de
              todo lo demás de la pantalla. */}
          <p style={{ fontSize: 12.5, color: 'var(--portal-muted)', marginTop: 6 }}>
            {nResultados === 0
              ? 'Prueba a quitar algún criterio — o mira el horario completo, que a veces encaja algo parecido.'
              : 'Las hemos dejado listas en el horario, con lo que has elegido aplicado.'}
          </p>
          <button type="button" onClick={onCompletar}
            style={{
              marginTop: 20, height: 46, padding: `0 ${cq(18, 2, 26)}`, borderRadius: R.pillBtnSm,
              background: PRIMARY, color: PRIMARY_FG, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
            {nResultados === 0 ? 'Ver el horario completo' : 'Ver mis clases'}
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
