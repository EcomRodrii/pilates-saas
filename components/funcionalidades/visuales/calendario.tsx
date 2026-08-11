import { MUTED } from '@/components/landing/theme';
import { PanelClaro, PanelOscuro } from './comunes';

// ── Dibujos propios de /funcionalidades/calendario-y-salas ───────────────────
// Fuente: lib/types.ts (Sala.capacidad, Spot con fila/columna y tipo
// REFORMER|MAT|OTRO, BloqueoMaquina con `hasta: null` = avería abierta) y
// lib/aforo-logic.ts (`aforoEfectivo` = aforo máximo − máquinas averiadas que
// solapan la sesión).

// Rejilla 2×5: nueve reformers operativos y uno averiado. La numeración va por
// filas, como el mapa de puestos real de una sala.
const PUESTOS = Array.from({ length: 10 }, (_, i) => ({ n: i + 1, averiado: i === 6 }));

export function RejillaDeSala() {
  return (
    <PanelClaro
      titulo="Una sala no es un número de aforo"
      nota="La capacidad de una clase se calcula al vuelo: aforo de la sala menos las máquinas averiadas que solapan esa sesión. Una avería sin fecha de arreglo sigue descontando hasta que la cierras."
    >
      <div style={{ display: 'flex', gap: 'clamp(18px,3vw,34px)', flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <div className="lp-mono" style={{ fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: '#A8A89F', marginBottom: 11 }}>Sala Reformer · 10 puestos</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8 }}>
            {PUESTOS.map((p) => (
              <div
                key={p.n}
                title={p.averiado ? `Reformer ${p.n} — fuera de servicio` : `Reformer ${p.n}`}
                style={{
                  width: 46, height: 34, borderRadius: 8,
                  background: p.averiado ? '#FBF0ED' : '#F1F2EA',
                  border: `1px solid ${p.averiado ? '#E8C9C0' : '#DDE0CC'}`,
                  color: p.averiado ? '#C2503A' : '#5A6142',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 600,
                }}
              >
                {p.averiado ? '×' : p.n}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 12, color: MUTED, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: '#F1F2EA', border: '1px solid #DDE0CC' }} />Disponible</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: '#FBF0ED', border: '1px solid #E8C9C0' }} />Averiado</span>
          </div>
        </div>

        <div style={{ background: '#0F0F0F', borderRadius: 14, padding: '18px 20px', color: '#E8E8E4', minWidth: 210 }}>
          <div className="lp-mono" style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: '#A8B080', marginBottom: 12 }}>Martes 19:00</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, color: '#A6A69E', marginBottom: 6 }}><span>Aforo de la sala</span><span style={{ color: '#fff' }}>10</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, color: '#A6A69E', marginBottom: 10 }}><span>Fuera de servicio</span><span style={{ color: '#E0785F' }}>−1</span></div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,.12)', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 13.5, color: '#A6A69E' }}>Plazas reales</span>
            <span style={{ fontSize: 26, fontWeight: 800, color: '#fff', letterSpacing: '-.03em' }}>9</span>
          </div>
        </div>
      </div>
    </PanelClaro>
  );
}

const SEMANA = [
  { dia: 'L', clases: [{ h: '09:00', sala: 'a' }, { h: '19:00', sala: 'a' }] },
  { dia: 'M', clases: [{ h: '10:00', sala: 'b' }, { h: '19:00', sala: 'a' }] },
  { dia: 'X', clases: [{ h: '09:00', sala: 'a' }] },
  { dia: 'J', clases: [{ h: '10:00', sala: 'b' }, { h: '19:00', sala: 'a' }] },
  { dia: 'V', clases: [{ h: '09:00', sala: 'a' }] },
  { dia: 'S', clases: [{ h: '11:00', sala: 'b' }] },
  { dia: 'D', clases: [] },
];
const SALA_COLOR = { a: { bg: 'rgba(217,194,158,.18)', bd: 'rgba(217,194,158,.3)', fg: '#E4D3B6' }, b: { bg: 'rgba(168,176,128,.16)', bd: 'rgba(168,176,128,.28)', fg: '#B9C293' } };

export function SemanaEnSalas() {
  return (
    <PanelOscuro titulo="La semana, por sala">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
        {SEMANA.map((d) => (
          <div key={d.dia}>
            <div className="lp-mono" style={{ fontSize: 10, textAlign: 'center', color: 'rgba(255,255,255,.45)', marginBottom: 7 }}>{d.dia}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minHeight: 70 }}>
              {d.clases.map((c) => {
                const col = SALA_COLOR[c.sala as 'a' | 'b'];
                return (
                  <div key={c.h} style={{ background: col.bg, border: `1px solid ${col.bd}`, borderRadius: 7, padding: '7px 4px', textAlign: 'center' }}>
                    <span className="lp-mono" style={{ fontSize: 9.5, color: col.fg }}>{c.h}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 14, fontSize: 11.5, color: 'rgba(255,255,255,.55)', flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: SALA_COLOR.a.bg, border: `1px solid ${SALA_COLOR.a.bd}` }} />Sala Reformer</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: SALA_COLOR.b.bg, border: `1px solid ${SALA_COLOR.b.bd}` }} />Sala Mat</span>
      </div>
    </PanelOscuro>
  );
}
