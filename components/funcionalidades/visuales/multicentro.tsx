import { MUTED } from '@/components/landing/theme';
import { PanelClaro, PanelOscuro } from './comunes';

// ── Dibujos propios de /funcionalidades/multi-centro ─────────────────────────
// Fuente:
//   · `mis_estudios()` (migr 0066, ampliada en P2-14 con el rol por sede) y
//     components/layout/sede-activa.tsx — el selector con el rol a la vista.
//   · lib/layout-data.ts — el menú/home se configura POR CADENA, no por sede.
//   · `instructores` con UNIQUE (auth_user_id, studio_id) — una fila por
//     persona y sede, con su propio rol, tarifa y disponibilidad.
//   · La RLS acota por estudio: una sede no lee los datos de otra.

const SEDES = [
  { n: 'Gràcia', rol: 'Propietaria', activa: true },
  { n: 'Eixample', rol: 'Gerencia', activa: false },
  { n: 'Sant Cugat', rol: 'Instructora', activa: false },
];

export function SelectorDeSede() {
  return (
    <PanelOscuro titulo="Dónde estás mirando">
      <div style={{ display: 'grid', gap: 9 }}>
        {SEDES.map((s) => (
          <div
            key={s.n}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: s.activa ? 'rgba(217,194,158,.12)' : 'rgba(255,255,255,.04)',
              border: `1px solid ${s.activa ? 'rgba(217,194,158,.28)' : 'rgba(255,255,255,.08)'}`,
              borderRadius: 12, padding: '13px 15px',
            }}
          >
            <span style={{ flexShrink: 0, width: 8, height: 8, borderRadius: '50%', background: s.activa ? '#D9C29E' : 'rgba(255,255,255,.18)' }} />
            <span style={{ fontSize: 14.5, fontWeight: 700, color: '#fff' }}>{s.n}</span>
            <span className="lp-mono" style={{ fontSize: 10.5, letterSpacing: '.06em', textTransform: 'uppercase', color: s.activa ? '#D9C29E' : 'rgba(255,255,255,.42)', marginLeft: 'auto' }}>{s.rol}</span>
          </div>
        ))}
      </div>
      <p style={{ margin: '15px 0 0', fontSize: 12, lineHeight: 1.5, color: 'rgba(255,255,255,.5)' }}>
        El rol va junto al nombre a propósito: puedes ser propietaria en una sede y solo instructora en otra, y cambiar de
        sede cambia lo que puedes hacer.
      </p>
    </PanelOscuro>
  );
}

const FILAS: [string, string, string][] = [
  ['Alumnas, reservas y cobros', 'Por sede', 'Cada centro solo ve lo suyo'],
  ['Clases, salas y horario', 'Por sede', 'Nada que compartir entre centros'],
  ['Facturación y numeración', 'Por sede', 'Series independientes'],
  ['Equipo y tarifas', 'Por sede', 'La misma persona, condiciones distintas'],
  ['Menú y pantalla de inicio', 'Por cadena', 'Se configura una vez para todas'],
  ['Suscripción a Tentare', 'Por cadena', 'Un plan Cadena, no uno por centro'],
];

export function QueSeCompartYQueNo() {
  return (
    <PanelClaro
      titulo="Qué es de cada sede y qué es de la cadena"
      nota="La línea está donde tiene sentido operativo: los datos de las alumnas no cruzan de centro, pero no vas a configurar tres veces el mismo menú."
    >
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ width: '100%', minWidth: 520, borderCollapse: 'separate', borderSpacing: 0, fontSize: 13.5 }}>
          <thead>
            <tr>
              {['', 'Alcance', ''].map((c, i) => (
                <th key={i} style={{ textAlign: 'left', padding: '11px 14px', fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#8E8E86', borderBottom: '1px solid #E7E7E0', minWidth: i === 0 ? 190 : 120 }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FILAS.map(([f, a, d], i) => {
              const cadena = a === 'Por cadena';
              return (
                <tr key={f}>
                  <td style={{ padding: '12px 14px', borderBottom: i === FILAS.length - 1 ? 'none' : '1px solid #F0F0EA', fontWeight: 600, color: '#1A1A1A' }}>{f}</td>
                  <td style={{ padding: '12px 14px', borderBottom: i === FILAS.length - 1 ? 'none' : '1px solid #F0F0EA' }}>
                    <span className="lp-mono" style={{ fontSize: 10.5, letterSpacing: '.05em', textTransform: 'uppercase', color: cadena ? '#3E7C86' : '#5A6142', background: cadena ? '#EDF3F4' : '#F1F2EA', padding: '4px 9px', borderRadius: 6, whiteSpace: 'nowrap' }}>{a}</span>
                  </td>
                  <td style={{ padding: '12px 14px', borderBottom: i === FILAS.length - 1 ? 'none' : '1px solid #F0F0EA', color: MUTED, lineHeight: 1.45 }}>{d}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </PanelClaro>
  );
}

export function InstructoraEnDosSedes() {
  return (
    <PanelClaro
      titulo="La misma instructora, dos condiciones"
      nota="No es una tabla puente sobre una ficha compartida: es una ficha por sede, y por eso pueden diferir en todo. Lo que las une es su cuenta, para que entre una sola vez."
    >
      <div className="mc-dos" style={{ display: 'grid', gap: 14 }}>
        {[
          { sede: 'Gràcia', rol: 'Gerencia', tarifa: '38 €/h', dispo: 'Lunes a viernes, mañanas', c: '#343825' },
          { sede: 'Sant Cugat', rol: 'Instructora', tarifa: '32 €/h', dispo: 'Martes y jueves, tardes', c: '#3E7C86' },
        ].map((s) => (
          <div key={s.sede} style={{ background: '#FAFAF6', border: '1px solid #EDEDE5', borderRadius: 14, padding: '17px 18px', borderTop: `3px solid ${s.c}` }}>
            <div style={{ fontSize: 15.5, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 12 }}>{s.sede}</div>
            {[['Rol', s.rol], ['Tarifa', s.tarifa], ['Disponibilidad', s.dispo]].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13.5, padding: '5px 0', borderTop: '1px solid #EDEDE5' }}>
                <span style={{ color: MUTED }}>{k}</span>
                <span style={{ fontWeight: 600, textAlign: 'right' }}>{v}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <style>{`
        .mc-dos { grid-template-columns: 1fr 1fr; }
        @media (max-width: 620px) { .mc-dos { grid-template-columns: 1fr; } }
      `}</style>
    </PanelClaro>
  );
}
