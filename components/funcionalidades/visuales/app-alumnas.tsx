import { MUTED } from '@/components/landing/theme';
import { PanelClaro, PanelOscuro } from './comunes';

// ── Dibujos propios de /funcionalidades/app-para-alumnas ─────────────────────
// Fuente: app/portal/[slug]/* (las pantallas reales), el manifest POR ESTUDIO
// (app/portal/[slug]/manifest.webmanifest — name, theme_color y logo del
// estudio, scope anclado a su slug), lib/theme-definitions.ts (4 temas base) y
// lib/notifications/push-client.ts (web push; en iPhone exige la PWA instalada
// e iOS 16.4+).
//
// ⚠️ Encuadre no negociable: es una app instalable desde el navegador, NO una
// app nativa en App Store/Play. La propia /comparativa/tentare-vs-bsport lo
// admite; prometer lo contrario aquí contradiría a otra página del sitio.

const PANTALLAS = [
  { t: 'Inicio', d: 'Su próxima clase, y qué le conviene hacer ahora' },
  { t: 'Clases', d: 'El horario, con filtros y plazas reales' },
  { t: 'Mis reservas', d: 'Lo que tiene cogido, lo que cancela y su plaza fija' },
  { t: 'Mi plan', d: 'Qué tiene contratado y cuánto le queda' },
  { t: 'Comprar', d: 'Bonos y planes, pagando ahí mismo' },
  { t: 'Progreso', d: 'Clases hechas y horas en sala' },
  { t: 'Perfil', d: 'Sus datos y sus preferencias de aviso' },
  { t: 'Invitar', d: 'Traer a una amiga' },
];

export function PantallasDelPortal() {
  return (
    <PanelClaro
      titulo="Lo que tiene tu alumna en su móvil"
      nota="Ocho pantallas, no un formulario de reserva. La diferencia práctica es que deja de escribirte para preguntar cuántas sesiones le quedan."
    >
      <div className="app-rejilla" style={{ display: 'grid', gap: 10 }}>
        {PANTALLAS.map((p) => (
          <div key={p.t} style={{ background: '#FAFAF6', border: '1px solid #EDEDE5', borderRadius: 12, padding: '13px 15px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-.01em', marginBottom: 4 }}>{p.t}</div>
            <div style={{ fontSize: 13, lineHeight: 1.45, color: MUTED }}>{p.d}</div>
          </div>
        ))}
      </div>
      <style>{`
        .app-rejilla { grid-template-columns: repeat(4,1fr); }
        @media (max-width: 860px) { .app-rejilla { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 480px) { .app-rejilla { grid-template-columns: 1fr; } }
      `}</style>
    </PanelClaro>
  );
}

export function MockMovil() {
  return (
    <PanelOscuro titulo="Instalada, con tu nombre">
      <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Pantalla de inicio del móvil: el icono lleva el logo y el nombre del
            estudio, no los de Tentare. Es literalmente lo que produce el
            manifest por estudio. */}
        <div style={{ width: 132, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 18, padding: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div
                  style={{
                    width: 44, height: 44, borderRadius: 12, margin: '0 auto 5px',
                    background: i === 0 ? 'linear-gradient(140deg,#D9C29E,#B79A6E)' : 'rgba(255,255,255,.08)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 17, fontWeight: 800, color: i === 0 ? '#343825' : 'rgba(255,255,255,.2)',
                  }}
                >
                  {i === 0 ? 'A' : ''}
                </div>
                <div style={{ fontSize: 8.5, color: i === 0 ? '#fff' : 'rgba(255,255,255,.25)' }}>{i === 0 ? 'Alma Pilates' : '···'}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 190, display: 'grid', gap: 10 }}>
          {[
            ['Su nombre, no el nuestro', 'El icono, el título y el color son del estudio'],
            ['Se abre sin navegador', 'A pantalla completa, como cualquier app'],
            ['Avisos al móvil', 'Plaza liberada, clase de mañana, bono que se acaba'],
          ].map(([t, d]) => (
            <div key={t} style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
              <span style={{ flexShrink: 0, width: 17, height: 17, borderRadius: 5, background: 'rgba(217,194,158,.16)', color: '#D9C29E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, marginTop: 2 }}>✓</span>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#fff' }}>{t}</div>
                <div style={{ fontSize: 12.5, lineHeight: 1.45, color: 'rgba(255,255,255,.62)' }}>{d}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PanelOscuro>
  );
}

export function InstalableVsNativa() {
  const filas: [string, string, string][] = [
    ['Se instala en el móvil', 'Sí — desde el navegador', 'Sí — desde la tienda'],
    ['Icono y nombre de tu estudio', 'Sí', 'Sí'],
    ['Avisos al móvil', 'Sí (en iPhone, con la app instalada)', 'Sí'],
    ['Aparece en App Store / Play', 'No', 'Sí'],
    ['Tiempo hasta estar disponible', 'Inmediato', 'Semanas de revisión'],
    ['Actualizaciones', 'Solas, al abrirla', 'La alumna tiene que actualizar'],
    ['Coste de publicación', 'Ninguno', 'Cuentas de desarrollador'],
  ];
  return (
    <PanelClaro
      titulo="Instalable desde el navegador vs. app de tienda"
      nota="Lo decimos así de claro porque el sector vende «app propia» sin matizar. La diferencia que sí notarás: no aparece buscándola en la tienda. Todo lo demás se comporta igual para tu alumna."
    >
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ width: '100%', minWidth: 540, borderCollapse: 'separate', borderSpacing: 0, fontSize: 13.5 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '11px 14px', fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#8E8E86', borderBottom: '1px solid #E7E7E0', minWidth: 200 }} />
              <th style={{ textAlign: 'left', padding: '11px 14px', fontSize: 11.5, fontWeight: 700, color: '#343825', background: '#F1F2EA', borderBottom: '1px solid #E1E5D4' }}>La de Tentare</th>
              <th style={{ textAlign: 'left', padding: '11px 14px', fontSize: 11.5, fontWeight: 700, color: '#5A5A52', borderBottom: '1px solid #E7E7E0' }}>App de tienda</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(([f, a, b], i) => (
              <tr key={f}>
                <td style={{ padding: '11px 14px', borderBottom: i === filas.length - 1 ? 'none' : '1px solid #F0F0EA', fontWeight: 600, color: '#1A1A1A' }}>{f}</td>
                <td style={{ padding: '11px 14px', borderBottom: i === filas.length - 1 ? 'none' : '1px solid #E1E5D4', background: '#F8F9F2', color: a.startsWith('No') ? '#C2503A' : '#3A3A34' }}>{a}</td>
                <td style={{ padding: '11px 14px', borderBottom: i === filas.length - 1 ? 'none' : '1px solid #F0F0EA', color: MUTED }}>{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PanelClaro>
  );
}
