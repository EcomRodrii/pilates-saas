import { MUTED } from '@/components/landing/theme';
import { PanelClaro, PanelOscuro } from './comunes';

// ── Dibujos propios de /funcionalidades/cancelaciones-y-politicas ────────────
// Fuente:
//   · `cancelar_reserva_plaza` + dbCancelarReservaPlaza — la decisión de
//     devolver bono la toma la BD (migr 0129), no el cliente, para que portal
//     y panel respondan igual.
//   · `studios.cancelacion_devolver_bono_tardia` (default false).
//   · Guard de plaza fija: `res-pf-` no devuelve bono porque nunca lo consumió;
//     su compensación es la recuperación.
//   · `cancelarSesionPorMinimoNoAlcanzado` — la única cancelación de sesión
//     completa que SÍ devuelve bono.
//   · EstadoPenalizacion (lib/types.ts) para la máquina de estados de abajo.

const CASOS = [
  {
    q: 'Cancela dentro de plazo',
    bono: 'Se le devuelve',
    plaza: 'Se libera y se ofrece a la lista de espera',
    color: '#4E9E7F',
  },
  {
    q: 'Cancela fuera de plazo',
    bono: 'No se le devuelve, salvo que tú lo permitas',
    plaza: 'Se libera igualmente — la clase no se queda a medias por castigarla',
    color: '#C79A2E',
  },
  {
    q: 'No se presenta',
    bono: 'Ya estaba consumido',
    plaza: 'Nadie la ocupó: es el caso más caro',
    color: '#C2503A',
  },
  {
    q: 'Cancela una plaza fija',
    bono: 'Nunca se descontó — recibe una recuperación',
    plaza: 'Se libera',
    color: '#3E7C86',
  },
  {
    q: 'Cancelas tú la clase entera',
    bono: 'No se devuelve por defecto',
    plaza: '—',
    color: '#8E8E86',
  },
  {
    q: 'La clase se cae por falta de gente',
    bono: 'Se devuelve, siempre',
    plaza: '—',
    color: '#4E9E7F',
  },
];

export function QuePasaConElBono() {
  return (
    <PanelClaro
      titulo="Quién recupera su sesión y quién no"
      nota="Las dos últimas filas son la misma acción vista desde dos sitios, y por eso se comportan distinto: si cancelas tú una clase, es tu decisión; si se cae sola por no llegar al mínimo, no es decisión de nadie — y entonces el bono vuelve."
    >
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ width: '100%', minWidth: 560, borderCollapse: 'separate', borderSpacing: 0, fontSize: 13.5 }}>
          <thead>
            <tr>
              {['Qué ha pasado', 'Su bono', 'Su plaza'].map((c, i) => (
                <th key={c} style={{ textAlign: 'left', padding: '11px 14px', fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#8E8E86', borderBottom: '1px solid #E7E7E0', minWidth: i === 0 ? 190 : 160 }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CASOS.map((c, i) => (
              <tr key={c.q}>
                <td style={{ padding: '12px 14px', borderBottom: i === CASOS.length - 1 ? 'none' : '1px solid #F0F0EA', fontWeight: 600, color: '#1A1A1A' }}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: c.color, marginRight: 9 }} />
                  {c.q}
                </td>
                <td style={{ padding: '12px 14px', borderBottom: i === CASOS.length - 1 ? 'none' : '1px solid #F0F0EA', color: MUTED, lineHeight: 1.45 }}>{c.bono}</td>
                <td style={{ padding: '12px 14px', borderBottom: i === CASOS.length - 1 ? 'none' : '1px solid #F0F0EA', color: MUTED, lineHeight: 1.45 }}>{c.plaza}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PanelClaro>
  );
}

const ESTADOS = [
  { e: 'Detectada', d: 'Se registra en el momento de cancelar o de marcar el no-show, no en un barrido posterior.', c: '#5A6142' },
  { e: 'Sin tarjeta guardada', d: 'No hay con qué cobrar. Queda anotado.', c: '#8E8E86', omite: true },
  { e: 'Sin consentimiento vigente', d: 'No aceptó unas condiciones que incluyeran esta cláusula. No se cobra.', c: '#8E8E86', omite: true },
  { e: 'Revertida', d: 'Marcaste el no-show por error y lo deshiciste.', c: '#8E8E86', omite: true },
  { e: 'Pendiente de aprobación', d: 'El modo por defecto: aparece en tu panel y se cobra si tú lo apruebas.', c: '#C79A2E' },
  { e: 'Recibo creado', d: 'Se ha emitido el cargo.', c: '#3E7C86' },
  { e: 'Cobrada / Fallida', d: 'Resultado real del cobro, con su factura si entró.', c: '#4E9E7F' },
];

export function CicloDeLaPenalizacion() {
  return (
    <PanelClaro
      titulo="Por qué una penalización acabó cobrándose — o no"
      nota="Las tres filas grises no son errores: son las razones por las que el sistema decidió NO cobrar. Viven como estado propio y no como una línea de log, porque cuando una socia pregunte «¿por qué a mí sí y a ella no?» hay que poder responder."
    >
      <div style={{ display: 'grid', gap: 8 }}>
        {ESTADOS.map((s) => (
          <div
            key={s.e}
            style={{
              display: 'flex', gap: 12, alignItems: 'flex-start',
              background: s.omite ? '#FAFAF6' : '#fff',
              border: `1px solid ${s.omite ? '#EDEDE5' : '#E7E7E0'}`,
              borderLeft: `3px solid ${s.c}`,
              borderRadius: 11, padding: '12px 14px',
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: s.omite ? '#6E6E68' : '#1A1A1A', marginBottom: 3 }}>{s.e}</div>
              <div style={{ fontSize: 13.5, lineHeight: 1.5, color: MUTED }}>{s.d}</div>
            </div>
          </div>
        ))}
      </div>
    </PanelClaro>
  );
}

export function LaVentana() {
  return (
    <PanelOscuro titulo="La ventana de cancelación">
      <div style={{ position: 'relative', padding: '10px 0 4px' }}>
        <div style={{ height: 6, borderRadius: 3, background: 'linear-gradient(90deg, rgba(78,158,127,.55) 0%, rgba(78,158,127,.55) 62%, rgba(194,80,58,.6) 62%, rgba(194,80,58,.6) 100%)' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
          <span className="lp-mono" style={{ fontSize: 10.5, color: '#A8B080' }}>SE ABRE LA RESERVA</span>
          <span className="lp-mono" style={{ fontSize: 10.5, color: '#E0785F' }}>EMPIEZA LA CLASE</span>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
        <div style={{ background: 'rgba(78,158,127,.1)', border: '1px solid rgba(78,158,127,.22)', borderRadius: 11, padding: '12px 14px' }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#fff', marginBottom: 3 }}>Cancelación a tiempo</div>
          <div style={{ fontSize: 12.5, lineHeight: 1.45, color: 'rgba(255,255,255,.65)' }}>Recupera su sesión y hay margen para llenar el hueco.</div>
        </div>
        <div style={{ background: 'rgba(194,80,58,.12)', border: '1px solid rgba(224,120,95,.26)', borderRadius: 11, padding: '12px 14px' }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#fff', marginBottom: 3 }}>Cancelación tardía</div>
          <div style={{ fontSize: 12.5, lineHeight: 1.45, color: 'rgba(255,255,255,.65)' }}>Pierde la sesión, y el hueco probablemente ya no se cubre.</div>
        </div>
      </div>
      <p style={{ margin: '15px 0 0', fontSize: 12, lineHeight: 1.5, color: 'rgba(255,255,255,.5)' }}>
        Las horas las pones tú, y pueden ser distintas por tipo de clase: el reformer suele cerrarse antes que el mat.
      </p>
    </PanelOscuro>
  );
}
