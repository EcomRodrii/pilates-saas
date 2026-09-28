import { MUTED } from '@/components/landing/theme';
import { PanelClaro, PanelOscuro } from './comunes';

// ── Dibujos propios de /funcionalidades/control-de-asistencia ────────────────
// Fuente:
//   · lib/acceso/evaluar-acceso.ts — el QR permanente identifica; si entra lo
//     decide su reserva para la clase de ahora (🟢 / 🟠 / 🔴, 28-sep). Sin
//     código corto y sin caducidad: se retiraron con el pase de 2 minutos.
//   · lib/acceso/escanear-servidor.ts — con Kisi, la puerta la abre una persona
//     con el botón «Abrir la puerta», nunca el QR solo.
//   · lib/checkin/marcar-asistidas-automatico.ts — pasar lista es opcional
//     (`studios.requiere_checkin_qr`, y por tipo de clase desde migr
//     20260909210000): cuando no se pasa, marca ASISTIDA al TERMINAR la clase,
//     no al reservar. Lo dispara `app/api/cron/checkin-automatico` desde
//     pg_cron cada 30 min — ya no vive en Inngest, que es donde lo situaba
//     este comentario.
//   · lib/no-show.ts — riesgo de plantón con decaimiento exponencial
//     (VENTANA_DIAS = 90, VIDA_MEDIA_DIAS = 45) y suavizado bayesiano.
//   · components/acceso/lector-qr.tsx — lector con BarcodeDetector nativo y
//     respaldo jsQR (Safari no lo implementa en ninguna versión).
//   · lib/portal-instructora/lista-servidor.ts — la instructora pasa lista de
//     SUS clases desde la app del estudio.

const VIAS = [
  {
    n: 'Enseña su QR',
    d: 'Lo lleva en su app. Lo leéis con la cámara del mostrador y Tentare comprueba su reserva al momento.',
    pie: 'Con Kisi, la puerta la abre quien mira',
    c: '#343825',
  },
  {
    n: 'La instructora pasa lista',
    d: 'Desde la app del estudio, en su clase: marca quién ha venido en el móvil.',
    pie: 'Solo en sus clases',
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

export function SemaforoDelAcceso() {
  const filas = [
    { c: '#4E9E7F', t: 'Acceso permitido', d: 'Reserva confirmada o plaza fija para la clase de ahora. Si pasáis lista, queda marcada.' },
    { c: '#D9A441', t: 'Revisar', d: 'Pendiente de aprobación, ficha desactivada o un recibo impagado: decide quien escanea.' },
    { c: '#C2503A', t: 'Acceso denegado', d: 'Sin reserva, cancelada, en lista de espera o de otra clase. La pantalla dice por qué.' },
  ];
  return (
    <PanelOscuro titulo="Lo que ve recepción al escanear">
      <div style={{ display: 'grid', gap: 12, marginTop: 4 }}>
        {filas.map((f) => (
          <div key={f.t} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span aria-hidden style={{ flexShrink: 0, width: 12, height: 12, borderRadius: 6, background: f.c, marginTop: 4, boxShadow: `0 0 0 4px ${f.c}33` }} />
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#fff' }}>{f.t}</div>
              <div style={{ fontSize: 12.5, lineHeight: 1.45, color: 'rgba(255,255,255,.62)' }}>{f.d}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 16, fontSize: 12, lineHeight: 1.5, color: 'rgba(255,255,255,.5)' }}>
        El QR es siempre el mismo y no lleva sus datos: lo que cambia es su reserva, y eso es lo que se mira.
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
