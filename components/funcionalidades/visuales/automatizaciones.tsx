import { MUTED } from '@/components/landing/theme';
import { PanelClaro, PanelOscuro } from './comunes';
import { REGLAS as REGLAS_AVISOS } from '@/lib/notifications/catalog';

// ── Dibujos propios de /funcionalidades/automatizaciones-y-avisos ────────────
// Fuente: app/(dashboard)/automatizaciones (REGLAS_SUGERIDAS: las 6 reglas que
// un estudio puede encender, con sus umbrales por defecto) y
// lib/notifications/catalog.ts (los canales por evento). El recordatorio de
// clase (CLASE_MANANA) sigue en TRIGGERS_IMPLEMENTADOS pero ya NO se ofrece:
// va de serie para todos los estudios (barrido de pg_cron `notif-recordatorios`).
//
// ⚠️ Solo se listan las reglas VIVAS. Existen otros 10 disparadores en el
// código (`TriggerAutomatizacion`) que solo se configuran desde el módulo de
// marketing, hoy apagado: contarlos aquí sería vender una pantalla a la que un
// estudio nuevo no puede llegar.

export const REGLAS = [
  {
    n: 'Clienta ausente',
    disparo: 'Lleva días sin venir',
    hace: 'La echa de menos a los 7 días, pregunta qué tal a las 2 semanas y, si la ausencia se alarga, propone una vuelta con descuento.',
    umbral: '7 / 14 / 25 días',
    escribe: true,
  },
  {
    n: 'Pago pendiente',
    disparo: 'Un recibo vence sin cobrar',
    hace: 'Dos avisos escalados. Si hay tarjeta guardada puede proponerte el cobro; si tras el segundo aviso sigue sin resolverse, te lo pasa a ti.',
    umbral: '3 / 8 / 15 días',
    escribe: true,
  },
  {
    n: 'Seguimiento de clienta nueva',
    disparo: 'Alta reciente',
    hace: 'Si a los 2 días no ha reservado, la anima. Si a los 10 sigue sin pisar una clase, te avisa a ti para que la llames tú.',
    umbral: '2 / 10 días',
    escribe: true,
  },
  {
    n: 'Renovación confirmada',
    disparo: 'Se cobra una renovación',
    hace: 'Confirma el cobro, con un detalle extra en los hitos de antigüedad.',
    umbral: 'Hito a los 6 meses',
    escribe: true,
  },
  {
    n: 'Bono casi agotado',
    disparo: 'Compra el mismo bono varias veces seguidas',
    hace: 'Te propone ofrecerle un plan ilimitado. La propuesta pasa por ti antes de salir.',
    umbral: '3 compras seguidas',
    escribe: false,
  },
  {
    n: 'Clase con demanda sostenida',
    disparo: 'Una franja lleva semanas casi llena',
    hace: 'Te recomienda abrir otra sesión en esa franja. No escribe a nadie: es un aviso para ti.',
    umbral: '3 semanas al 95 %',
    escribe: false,
  },
];

export function TablaDeReglas() {
  return (
    <PanelClaro
      titulo="Las seis reglas que puedes encender"
      nota="Todas nacen apagadas, a propósito. Cuatro de ellas escriben a tus clientas en nombre del estudio, así que encenderlas es una decisión consciente y no el efecto secundario de pulsar «cargar reglas sugeridas». Los umbrales son un punto de partida: se cambian. El recordatorio de clase no está aquí porque no hay que encenderlo: va de serie."
    >
      <div style={{ display: 'grid', gap: 10 }}>
        {REGLAS.map((r) => (
          <div key={r.n} style={{ background: '#FAFAF6', border: '1px solid #EDEDE5', borderRadius: 13, padding: '15px 17px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.01em' }}>{r.n}</span>
              <span className="lp-mono" style={{ fontSize: 10.5, color: '#5A6142', background: '#F1F2EA', padding: '3px 8px', borderRadius: 5 }}>{r.umbral}</span>
              <span
                className="lp-mono"
                style={{ fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', marginLeft: 'auto', color: r.escribe ? '#3B7D64' : '#8E6B1E', background: r.escribe ? '#E7F3EC' : '#F7F0DE', padding: '3px 8px', borderRadius: 5 }}
              >
                {r.escribe ? 'Escribe a la clienta' : 'Solo te avisa a ti'}
              </span>
            </div>
            <div style={{ fontSize: 12.5, color: '#8E8E86', marginBottom: 5 }}>Se dispara cuando: {r.disparo}</div>
            <div style={{ fontSize: 14, lineHeight: 1.55, color: MUTED }}>{r.hace}</div>
          </div>
        ))}
      </div>
    </PanelClaro>
  );
}

// Proporciones CALCULADAS sobre el catálogo real, no escritas a mano: con los
// números fijos de antes (37 eventos, 5 canales) esta página siguió diciendo
// WhatsApp y SMS después de que el motor los retirara con Twilio, y 37 cuando
// ya eran 61. El in-app va en todos salvo los silenciosos.
const EVENTOS_AVISO = Object.values(REGLAS_AVISOS);
const pctCanal = (canal: 'PUSH' | 'EMAIL') =>
  Math.round((EVENTOS_AVISO.filter((r) => r.canales.includes(canal)).length / EVENTOS_AVISO.length) * 100);
const CANALES = [
  { n: 'En la app', d: 'Siempre, salvo que la persona lo apague', pct: 100 },
  { n: 'Push al móvil', d: 'Lo que hay que ver ahora', pct: pctCanal('PUSH') },
  { n: 'Email', d: 'Lo que hay que poder releer', pct: pctCanal('EMAIL') },
];

export function CanalesPorEvento() {
  return (
    <PanelOscuro titulo={`${EVENTOS_AVISO.length} tipos de aviso · 3 canales`}>
      <div style={{ display: 'grid', gap: 13 }}>
        {CANALES.map((c) => (
          <div key={c.n}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{c.n}</span>
              <span className="lp-mono" style={{ fontSize: 11, color: 'rgba(255,255,255,.5)' }}>{c.d}</span>
            </div>
            <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,.08)', overflow: 'hidden' }}>
              <div style={{ width: `${c.pct}%`, height: '100%', borderRadius: 3, background: 'linear-gradient(90deg,#A8B080,#D9C29E)' }} />
            </div>
          </div>
        ))}
      </div>
      <p style={{ margin: '16px 0 0', fontSize: 12, lineHeight: 1.5, color: 'rgba(255,255,255,.5)' }}>
        La proporción es la del catálogo real: la mayoría de avisos se quedan dentro de la app y del móvil. Un aviso solo
        sale por un canal si ese evento lo tiene declarado — ni siquiera los críticos improvisan uno nuevo. WhatsApp, si
        conectas tu número, va aparte: recordatorio de clase, radar de ocupación y sustituciones.
      </p>
    </PanelOscuro>
  );
}
