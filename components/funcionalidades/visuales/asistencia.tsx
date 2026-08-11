import { MUTED } from '@/components/landing/theme';
import { PanelClaro, PanelOscuro } from './comunes';

// ── Dibujos propios de /funcionalidades/control-de-asistencia ────────────────
// Fuente:
//   · lib/pase-acceso.ts — ventana del pase (60 min antes / 15 después), QR con
//     token firmado que caduca a los 2 min, código corto que no rota.
//   · lib/inngest/checkin-automatico.ts — `studios.requiere_checkin_qr = false`
//     marca ASISTIDA al TERMINAR la clase, no al reservar.
//   · lib/no-show.ts — riesgo de plantón con decaimiento exponencial
//     (VENTANA_DIAS = 90, VIDA_MEDIA_DIAS = 45) y suavizado bayesiano.
//   · app/(dashboard)/calendario/pase — lector con BarcodeDetector nativo y
//     respaldo jsQR (Safari no lo implementa en ninguna versión).

const VIAS = [
  {
    n: 'Enseña su QR',
    d: 'Lo abre en su móvil al llegar. Vosotros lo leéis con la cámara del mostrador.',
    pie: 'Y si tenéis Kisi, el escaneo abre la puerta',
    c: '#343825',
  },
  {
    n: 'Dice su código',
    d: 'Seis caracteres, para cuando la cámara no coopera: cristal sucio, contraluz, móvil sin batería.',
    pie: 'Solo vale dentro de la ventana de su clase',
    c: '#3E7C86',
  },
  {
    n: 'Lo marcáis a mano',
    d: 'Desde la lista de asistentes de la clase, como toda la vida.',
    pie: 'Siempre disponible',
    c: '#5A6142',
  },
  {
    n: 'No hacéis nada',
    d: 'Si confías en que quien reserva viene, al terminar la clase se marca sola.',
    pie: 'Para estudios sin mostrador',
    c: '#4E9E7F',
  },
];

export function CuatroFormasDeMarcar() {
  return (
    <PanelClaro
      titulo="Cuatro formas de saber quién vino"
      nota="La cuarta es la que más se usa en estudios pequeños: no hay nadie en recepción a las 7 de la mañana. Y se marca cuando la clase TERMINA, no al reservar — si no, bastaría con reservar y no ir para seguir sumando racha."
    >
      <div className="asi-vias" style={{ display: 'grid', gap: 12 }}>
        {VIAS.map((v, i) => (
          <div key={v.n} style={{ background: '#FAFAF6', border: '1px solid #EDEDE5', borderRadius: 14, padding: '16px 17px', borderTop: `3px solid ${v.c}` }}>
            <div className="lp-mono" style={{ fontSize: 9.5, letterSpacing: '.12em', color: v.c, marginBottom: 7 }}>0{i + 1}</div>
            <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 6 }}>{v.n}</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.5, color: MUTED, marginBottom: 10 }}>{v.d}</div>
            <div className="lp-mono" style={{ fontSize: 10.5, color: '#A8A89F', lineHeight: 1.4 }}>{v.pie}</div>
          </div>
        ))}
      </div>
      <style>{`
        .asi-vias { grid-template-columns: repeat(4,1fr); }
        @media (max-width: 900px) { .asi-vias { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 520px) { .asi-vias { grid-template-columns: 1fr; } }
      `}</style>
    </PanelClaro>
  );
}

export function VentanaDelPase() {
  return (
    <PanelOscuro titulo="Cuándo vale su pase">
      <div style={{ position: 'relative', padding: '8px 0 4px' }}>
        <div style={{ height: 6, borderRadius: 3, background: 'linear-gradient(90deg, rgba(255,255,255,.07) 0%, rgba(255,255,255,.07) 18%, rgba(168,176,128,.5) 18%, rgba(168,176,128,.5) 82%, rgba(255,255,255,.07) 82%, rgba(255,255,255,.07) 100%)' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
          <span className="lp-mono" style={{ fontSize: 10, color: 'rgba(255,255,255,.4)' }}>−60 MIN</span>
          <span className="lp-mono" style={{ fontSize: 10, color: '#D9C29E' }}>EMPIEZA</span>
          <span className="lp-mono" style={{ fontSize: 10, color: 'rgba(255,255,255,.4)' }}>+15 MIN</span>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 10, marginTop: 18 }}>
        {[
          ['Una hora antes', 'En Pilates se llega pronto. El pase tiene que estar listo cuando va de camino.'],
          ['El QR caduca a los 2 minutos', 'Y se renueva solo mientras tiene la pantalla abierta. Una captura reenviada por WhatsApp no sirve.'],
          ['Quince minutos después', 'Pasado ese rato ya no es «llegar»: lo marca la instructora y decide ella.'],
        ].map(([t, d]) => (
          <div key={t} style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
            <span style={{ flexShrink: 0, width: 17, height: 17, borderRadius: 5, background: 'rgba(217,194,158,.16)', color: '#D9C29E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, marginTop: 2 }}>·</span>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#fff' }}>{t}</div>
              <div style={{ fontSize: 12.5, lineHeight: 1.45, color: 'rgba(255,255,255,.62)' }}>{d}</div>
            </div>
          </div>
        ))}
      </div>
    </PanelOscuro>
  );
}

export function RiesgoDePlanton() {
  const casos = [
    { q: 'Falló 3 de 4 veces, la semana pasada', r: 'Riesgo alto', pct: 82, c: '#C2503A' },
    { q: 'Falló 3 de 40, hace tres meses', r: 'Riesgo bajo', pct: 14, c: '#4E9E7F' },
    { q: 'Falló 1 de 1, es nueva', r: 'Riesgo bajo', pct: 22, c: '#4E9E7F' },
    { q: 'Canceló a tiempo 5 veces', r: 'No cuenta', pct: 0, c: '#8E8E86' },
  ];
  return (
    <PanelClaro
      titulo="Quién es probable que no aparezca"
      nota="Los porcentajes son ilustrativos; las tres reglas que los separan no lo son. Un plantón de ayer pesa el doble que uno de hace 45 días, cancelar a tiempo nunca cuenta como plantón, y con pocos datos el resultado se acerca a la media del estudio en vez de dispararse."
    >
      <div style={{ display: 'grid', gap: 12 }}>
        {casos.map((c) => (
          <div key={c.q}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5, gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{c.q}</span>
              <span className="lp-mono" style={{ fontSize: 11.5, color: c.c, whiteSpace: 'nowrap' }}>{c.r}</span>
            </div>
            <div style={{ height: 7, borderRadius: 4, background: '#F0F0EA', overflow: 'hidden' }}>
              <div style={{ width: `${Math.max(c.pct, 2)}%`, height: '100%', borderRadius: 4, background: c.pct === 0 ? '#DDDDD5' : `linear-gradient(90deg, ${c.c}, ${c.c}99)` }} />
            </div>
          </div>
        ))}
      </div>
      <div style={{ background: '#F1F2EA', border: '1px solid #E1E5D4', borderRadius: 12, padding: '13px 15px', marginTop: 16, fontSize: 13.5, lineHeight: 1.55, color: '#3E4430' }}>
        La tercera fila es la que más cuesta acertar y la que más importa: <strong>una de una no es un 100 % de
        riesgo</strong>. Un sistema que lo trate así señala a media clase la primera semana y nadie vuelve a mirarlo.
      </div>
    </PanelClaro>
  );
}
