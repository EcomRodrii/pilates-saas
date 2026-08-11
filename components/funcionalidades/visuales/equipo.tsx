import { Fragment } from 'react';
import { MUTED } from '@/components/landing/theme';
import { PanelClaro, PanelOscuro } from './comunes';

// ── Dibujos propios de /funcionalidades/gestion-de-instructoras ──────────────
// Fuente: instructora_disponibilidad (ventana semanal día+hora),
// instructora_disponibilidad_excepciones (tipo 'extra' | 'bloqueo'),
// instructor_tarifas (tabla aparte de `instructores` a propósito) y
// lib/instructor-dependency.ts (riesgo de concentración por instructora).

const FRANJAS = ['L', 'M', 'X', 'J', 'V', 'S'];
// 0 = fuera de su disponibilidad, 1 = disponible, 2 = bloqueo puntual
const REJILLA: { h: string; d: number[] }[] = [
  { h: '08–12', d: [1, 1, 1, 1, 1, 0] },
  { h: '12–16', d: [0, 1, 0, 1, 0, 0] },
  { h: '16–21', d: [1, 1, 1, 2, 1, 0] },
];

const COLOR = ['rgba(255,255,255,.05)', 'rgba(168,176,128,.32)', 'rgba(194,80,58,.4)'];
const BORDE = ['rgba(255,255,255,.07)', 'rgba(168,176,128,.45)', 'rgba(224,120,95,.55)'];

export function DisponibilidadSemanal() {
  return (
    <PanelOscuro titulo="La disponibilidad de Marta">
      <div style={{ display: 'grid', gridTemplateColumns: '46px repeat(6,1fr)', gap: 5, alignItems: 'center' }}>
        <span />
        {FRANJAS.map((d) => (
          <span key={d} className="lp-mono" style={{ fontSize: 10, textAlign: 'center', color: 'rgba(255,255,255,.45)' }}>{d}</span>
        ))}
        {REJILLA.map((fila) => (
          <Fragment key={fila.h}>
            <span className="lp-mono" style={{ fontSize: 9.5, color: 'rgba(255,255,255,.45)' }}>{fila.h}</span>
            {fila.d.map((v, i) => (
              <span
                key={`${fila.h}-${FRANJAS[i]}`}
                style={{ height: 26, borderRadius: 6, background: COLOR[v], border: `1px solid ${BORDE[v]}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#E0785F' }}
              >
                {v === 2 ? '×' : ''}
              </span>
            ))}
          </Fragment>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 13, fontSize: 11.5, color: 'rgba(255,255,255,.55)', flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: COLOR[1], border: `1px solid ${BORDE[1]}` }} />Disponible</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: COLOR[2], border: `1px solid ${BORDE[2]}` }} />Bloqueo del jueves</span>
      </div>
    </PanelOscuro>
  );
}

const ROLES = [
  { r: 'Propietaria', v: ['Todo, incluido dinero y facturación', 'Configura el estudio'] },
  { r: 'Gerencia', v: ['Gestiona calendario, equipo y clientas', 'Fija tarifas'] },
  { r: 'Recepción', v: ['Mostrador: reservas, cobros y altas', 'Sin acceso al detalle de salud'] },
  { r: 'Instructora', v: ['Sus clases y su ficha', 'Lee su tarifa; nunca la escribe'] },
];

export function QuienVeQue() {
  return (
    <PanelClaro
      titulo="Cuatro roles, cuatro alcances"
      nota="El límite real no es lo que se enseña en pantalla, sino lo que la base de datos deja leer y escribir a cada rol. Una instructora no puede sacar la tarifa de una compañera aunque supiera dónde mirar: su ficha salarial vive en una tabla aparte precisamente por eso."
    >
      <div style={{ display: 'grid', gap: 10 }}>
        {ROLES.map((r) => (
          <div key={r.r} style={{ display: 'flex', gap: 14, background: '#FAFAF6', border: '1px solid #EDEDE5', borderRadius: 12, padding: '13px 15px', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 108, fontSize: 14, fontWeight: 700 }}>{r.r}</div>
            <div style={{ flex: 1, minWidth: 200, display: 'grid', gap: 3 }}>
              {r.v.map((v) => (
                <div key={v} style={{ fontSize: 13.5, lineHeight: 1.45, color: MUTED }}>{v}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </PanelClaro>
  );
}

export function RiesgoDeConcentracion() {
  const reparto = [
    { n: 'Marta', pct: 52, alerta: true },
    { n: 'Lucía', pct: 24, alerta: false },
    { n: 'Nora', pct: 16, alerta: false },
    { n: 'Elena', pct: 8, alerta: false },
  ];
  return (
    <PanelClaro
      titulo="Cuánto depende tu estudio de una sola persona"
      nota="Se recalcula una vez por semana y avisa cuando la concentración sube. No es un juicio sobre nadie: es la respuesta a «si esta persona se va en septiembre, ¿qué pasa con mi horario?»."
    >
      <div style={{ display: 'grid', gap: 12 }}>
        {reparto.map((r) => (
          <div key={r.n}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{r.n}</span>
              <span className="lp-mono" style={{ fontSize: 12, color: r.alerta ? '#C2503A' : '#8E8E86' }}>{r.pct} % de las clases</span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: '#F0F0EA', overflow: 'hidden' }}>
              <div style={{ width: `${r.pct}%`, height: '100%', borderRadius: 4, background: r.alerta ? 'linear-gradient(90deg,#C2503A,#E0785F)' : '#C9CFB4' }} />
            </div>
          </div>
        ))}
      </div>
    </PanelClaro>
  );
}
