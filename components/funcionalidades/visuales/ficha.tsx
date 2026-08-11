import { MUTED } from '@/components/landing/theme';
import { PanelClaro, PanelOscuro } from './comunes';

// ── Dibujos propios de /funcionalidades/ficha-de-clienta ─────────────────────
// Fuente: lib/ficha-clinica.ts y lib/types.ts — CategoriaCondicion, ZonaCorporal
// (8 zonas), SeveridadCondicion, NivelSemaforo (VERDE|AMBAR|ROJO) y
// RespuestaSesion (MEJOR|IGUAL|MOLESTIAS|DOLOR).
//
// ⚠️ El encuadre de esta página copia el del propio código: «no es una historia
// clínica médica: no diagnostica ni prescribe». Es una ayuda de atención para
// quien da la clase. No se puede vender como otra cosa.

const SEMAFORO = [
  { n: 'Verde', c: '#4E9E7F', bg: '#E7F3EC', d: 'Sin restricciones activas. La clase va como siempre.' },
  { n: 'Ámbar', c: '#C79A2E', bg: '#F7F0DE', d: 'Hay algo que adaptar. La instructora lo ve antes de empezar.' },
  { n: 'Rojo', c: '#C2503A', bg: '#FBF0ED', d: 'Hay algo que no se debe hacer. No es una sugerencia.' },
];

export function Semaforo() {
  return (
    <PanelOscuro titulo="Lo que ve quien da la clase">
      <div style={{ display: 'grid', gap: 10 }}>
        {SEMAFORO.map((s) => (
          <div key={s.n} style={{ display: 'flex', gap: 13, alignItems: 'flex-start', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, padding: '13px 15px' }}>
            <span style={{ flexShrink: 0, width: 12, height: 12, borderRadius: '50%', background: s.c, marginTop: 4, boxShadow: `0 0 12px ${s.c}66` }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 3 }}>{s.n}</div>
              <div style={{ fontSize: 13, lineHeight: 1.45, color: 'rgba(255,255,255,.62)' }}>{s.d}</div>
            </div>
          </div>
        ))}
      </div>
      <p style={{ margin: '15px 0 0', fontSize: 12, lineHeight: 1.5, color: 'rgba(255,255,255,.5)' }}>
        El color se calcula a partir de las restricciones grabadas, no lo pone nadie a mano. Una restricción de «no
        realizar» pinta rojo; una de «adaptar», ámbar.
      </p>
    </PanelOscuro>
  );
}

const ZONAS = ['Cuello', 'Hombro', 'Columna', 'Muñeca', 'Cadera', 'Rodilla', 'Tobillo', 'General'];
const CATEGORIAS = ['Lesión', 'Embarazo', 'Postparto', 'Crónica', 'Prótesis', 'Otro'];

export function CondicionesYZonas() {
  return (
    <PanelClaro
      titulo="Una condición no es una nota suelta"
      nota="Las zonas y las categorías son un catálogo cerrado, no texto libre. Es lo que permite que una condición de rodilla genere sola el aviso antes de una clase con saltos — con texto libre eso no se puede hacer."
    >
      <div style={{ display: 'grid', gap: 18 }}>
        <div>
          <div className="lp-mono" style={{ fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', color: '#8E8E86', marginBottom: 10 }}>Ocho zonas</div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {ZONAS.map((z) => (
              <span key={z} style={{ fontSize: 13, color: '#3A3A34', background: '#F1F2EA', border: '1px solid #E1E5D4', padding: '6px 12px', borderRadius: 8 }}>{z}</span>
            ))}
          </div>
        </div>
        <div>
          <div className="lp-mono" style={{ fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', color: '#8E8E86', marginBottom: 10 }}>Seis categorías</div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {CATEGORIAS.map((c) => (
              <span key={c} style={{ fontSize: 13, color: '#3A3A34', background: '#FAFAF6', border: '1px solid #EDEDE5', padding: '6px 12px', borderRadius: 8 }}>{c}</span>
            ))}
          </div>
        </div>
        <div>
          <div className="lp-mono" style={{ fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', color: '#8E8E86', marginBottom: 10 }}>Cómo respondió a la última sesión</div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {[['Mejor', '#4E9E7F'], ['Igual', '#8E8E86'], ['Molestias', '#C79A2E'], ['Dolor', '#C2503A']].map(([c, col]) => (
              <span key={c} style={{ fontSize: 13, color: col as string, background: '#fff', border: `1px solid ${col}33`, padding: '6px 12px', borderRadius: 8, fontWeight: 600 }}>{c}</span>
            ))}
          </div>
        </div>
      </div>
    </PanelClaro>
  );
}

export function LineaDeVida() {
  const hitos = [
    { t: 'Alta', d: 'Marzo · vino por una recomendación', c: '#5A6142' },
    { t: 'Primera clase', d: 'Reformer iniciación, con Marta', c: '#5A6142' },
    { t: 'Bono 10', d: 'Comprado en abril · quedan 3 sesiones', c: '#3E7C86' },
    { t: 'Molestia lumbar', d: 'Junio · adaptaciones activas, semáforo ámbar', c: '#C79A2E' },
    { t: 'Tres semanas sin venir', d: 'La regla de ausencia ya le ha escrito', c: '#C2503A' },
  ];
  return (
    <PanelClaro
      titulo="Todo lo de una alumna, en orden"
      nota="No hay que cruzar cuatro pantallas para responder «¿qué tal va Nora?». Compras, asistencia, condiciones y avisos automáticos son la misma historia."
    >
      <div style={{ display: 'grid', gap: 0 }}>
        {hitos.map((h, i) => (
          <div key={h.t} style={{ display: 'flex', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: h.c, marginTop: 5 }} />
              {i < hitos.length - 1 && <span style={{ flex: 1, width: 2, minHeight: 14, background: '#E7E7E0', marginTop: 3 }} />}
            </div>
            <div style={{ paddingBottom: i < hitos.length - 1 ? 16 : 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: '-.01em' }}>{h.t}</div>
              <div style={{ fontSize: 13.5, lineHeight: 1.5, color: MUTED }}>{h.d}</div>
            </div>
          </div>
        ))}
      </div>
    </PanelClaro>
  );
}
