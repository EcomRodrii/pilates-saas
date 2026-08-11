import { MUTED } from '@/components/landing/theme';
import { PanelClaro, PanelOscuro } from './comunes';

// ── Dibujos propios de /funcionalidades/bonos-y-membresias ───────────────────
// Fuente: lib/types.ts — TipoPlan ('MENSUAL' | 'BONO' | 'PUNTUAL'),
// PlanTarifa (validezDias, limiteSemanal, tiposClaseIds), PlazaFija (slot
// día+hora+sala, con spot opcional), Recuperacion (crédito con caducidad) y
// Congelacion (pausa que empuja la fecha de fin).

const MODELOS = [
  {
    n: 'Cuota mensual',
    tipo: 'MENSUAL',
    quien: 'La socia que viene siempre',
    detalle: ['Se renueva y se cobra sola', 'Tope semanal opcional', 'Se puede congelar sin perder días'],
    color: '#343825',
  },
  {
    n: 'Bono de sesiones',
    tipo: 'BONO',
    quien: 'La que viene cuando puede',
    detalle: ['Número de sesiones cerrado', 'Caducidad opcional en días', 'Aviso cuando le queda una'],
    color: '#3E7C86',
  },
  {
    n: 'Clase suelta',
    tipo: 'PUNTUAL',
    quien: 'La que prueba, o la visita',
    detalle: ['Un pago, una clase', 'Sin compromiso', 'Puerta de entrada al bono'],
    color: '#5A6142',
  },
  {
    n: 'Plaza fija',
    tipo: 'SEMANAL',
    quien: 'La de los martes a las 19:00',
    detalle: ['Su hueco, su sala, su reformer', 'Las reservas se crean solas', 'Si falta, genera recuperación'],
    color: '#C2503A',
  },
];

export function CuatroModelos() {
  return (
    <PanelClaro
      titulo="Cómo cobra un estudio de Pilates"
      nota="Los cuatro conviven en el mismo estudio y en la misma socia: puede tener una cuota mensual para el mat y un bono suelto de reformer a la vez."
    >
      <div className="bon-modelos" style={{ display: 'grid', gap: 12 }}>
        {MODELOS.map((m) => (
          <div key={m.n} style={{ background: '#FAFAF6', border: '1px solid #EDEDE5', borderRadius: 14, padding: '16px 17px', borderTop: `3px solid ${m.color}` }}>
            <div className="lp-mono" style={{ fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', color: m.color, marginBottom: 7 }}>{m.tipo}</div>
            <div style={{ fontSize: 15.5, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 4 }}>{m.n}</div>
            <div style={{ fontSize: 12.5, color: '#8E8E86', marginBottom: 11, fontStyle: 'italic' }}>{m.quien}</div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
              {m.detalle.map((d) => (
                <li key={d} style={{ display: 'flex', gap: 7, fontSize: 13, lineHeight: 1.4, color: MUTED }}>
                  <span style={{ color: m.color, flexShrink: 0 }}>·</span>{d}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <style>{`
        .bon-modelos { grid-template-columns: repeat(4,1fr); }
        @media (max-width: 900px) { .bon-modelos { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 520px) { .bon-modelos { grid-template-columns: 1fr; } }
      `}</style>
    </PanelClaro>
  );
}

export function PlazaFijaYRecuperacion() {
  return (
    <PanelClaro
      titulo="La plaza fija y su recuperación"
      nota="La recuperación es un crédito con fecha de caducidad, no una sesión devuelta al bono. Así se distingue lo que la socia pagó de lo que el estudio le concedió, y ese crédito no se acumula para siempre."
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: '#F1F2EA', border: '1px solid #E1E5D4', borderRadius: 12, padding: '14px 16px', flexWrap: 'wrap' }}>
          <span className="lp-mono" style={{ fontSize: 11, color: '#5A6142' }}>MARTES · 19:00 · SALA REFORMER · PUESTO 4</span>
          <span style={{ fontSize: 13, color: MUTED, marginLeft: 'auto' }}>Su sitio, cada semana</span>
        </div>
        <div style={{ display: 'grid', gap: 9, paddingLeft: 12, borderLeft: '2px solid #E7E7E0' }}>
          {[
            ['Cada semana', 'Su reserva se crea sola, sin que tenga que entrar a reservar.'],
            ['Si un martes no puede', 'Cancela como cualquier reserva y se le genera una recuperación.'],
            ['La recuperación', 'Vale para otra clase, y caduca en la fecha que fijes.'],
            ['Si se va de vacaciones', 'La plaza se pausa; al volver sigue siendo suya.'],
          ].map(([t, d]) => (
            <div key={t}>
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>{t}. </span>
              <span style={{ fontSize: 13.5, color: MUTED, lineHeight: 1.5 }}>{d}</span>
            </div>
          ))}
        </div>
      </div>
    </PanelClaro>
  );
}

export function AjustesDelPlan() {
  return (
    <PanelOscuro titulo="Lo que define un plan">
      <div style={{ display: 'grid', gap: 11 }}>
        {[
          ['Precio y tipo', 'Mensual, bono de N sesiones o clase suelta'],
          ['Caducidad', 'A los N días de la compra, o sin caducidad'],
          ['Tope semanal', 'Máximo de sesiones por semana, si lo quieres'],
          ['Tipos de clase que cubre', 'Un «Bono 10 Reformer» que no sirve para Mat'],
          ['Congelación', 'Pausa que empuja la fecha de fin en vez de comérsela'],
        ].map(([t, d]) => (
          <div key={t} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: 5, background: 'rgba(217,194,158,.16)', color: '#D9C29E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, marginTop: 2 }}>·</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{t}</div>
              <div style={{ fontSize: 13, lineHeight: 1.45, color: 'rgba(255,255,255,.62)' }}>{d}</div>
            </div>
          </div>
        ))}
      </div>
    </PanelOscuro>
  );
}
