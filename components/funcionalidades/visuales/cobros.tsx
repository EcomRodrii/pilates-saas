import { MUTED } from '@/components/landing/theme';
import { PanelClaro, PanelOscuro } from './comunes';

// ── Dibujos propios de /funcionalidades/cobros-recurrentes ───────────────────
// Fuente: lib/billing/dunning.ts (OFFSETS_REINTENTO_DIAS = [1,3,7],
// MAX_REINTENTOS = 3, y la regla de avisar solo en el primer fallo y en el
// definitivo). Si esa cadencia cambia, este dibujo hay que cambiarlo.

const PASOS = [
  { d: 'Vence', t: 'Se cobra con la tarjeta guardada', estado: 'ok' as const, aviso: null },
  { d: '+1 día', t: 'Primer reintento', estado: 'retry' as const, aviso: 'La socia recibe un aviso informativo' },
  { d: '+3 días', t: 'Segundo reintento', estado: 'retry' as const, aviso: 'Sin aviso — para no hacer ruido con algo que suele arreglarse solo' },
  { d: '+7 días', t: 'Tercer y último reintento', estado: 'retry' as const, aviso: 'Sin aviso' },
  { d: 'Después', t: 'El recibo queda como fallido', estado: 'fail' as const, aviso: 'Aviso a la socia y aviso al estudio: aquí ya hace falta una persona' },
];

const COLOR = { ok: '#4E9E7F', retry: '#C79A2E', fail: '#C2503A' };

export function CadenciaDeReintentos() {
  return (
    <PanelClaro
      titulo="Qué pasa cuando una tarjeta falla"
      nota="Los avisos van solo en el primer fallo y en el definitivo. Los intermedios se callan a propósito: la mayoría de pagos que fallan se recuperan en el segundo o el tercer intento, y avisar cuatro veces por algo que se arregló solo desgasta la relación con la socia."
    >
      <div style={{ display: 'grid', gap: 0 }}>
        {PASOS.map((p, i) => (
          <div key={p.d} style={{ display: 'flex', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 62 }}>
              <span className="lp-mono" style={{ fontSize: 11, color: COLOR[p.estado], fontWeight: 500, whiteSpace: 'nowrap' }}>{p.d}</span>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: COLOR[p.estado], marginTop: 6 }} />
              {i < PASOS.length - 1 && <span style={{ flex: 1, width: 2, minHeight: 16, background: '#E7E7E0', marginTop: 2 }} />}
            </div>
            <div style={{ paddingBottom: i < PASOS.length - 1 ? 20 : 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: '-.01em', marginBottom: 3 }}>{p.t}</div>
              {p.aviso && <div style={{ fontSize: 13.5, lineHeight: 1.5, color: MUTED }}>{p.aviso}</div>}
            </div>
          </div>
        ))}
      </div>
    </PanelClaro>
  );
}

const VIAS = [
  { t: 'Tarjeta guardada', d: 'Cobro automático el día del vencimiento, sin que la socia tenga que hacer nada.', pie: 'Vía Stripe, con la cuenta del estudio' },
  { t: 'Pago en el momento', d: 'La socia compra su bono o su plan desde el portal y paga ahí mismo.', pie: 'Tarjeta' },
  { t: 'Remesa SEPA 19.14', d: 'Se genera el fichero de adeudos para presentarlo en tu banco de siempre.', pie: 'Sin pasarela de por medio' },
  { t: 'Cobro de mostrador', d: 'Lo que se paga en efectivo o por Bizum queda registrado igual, con su factura.', pie: 'Registro manual' },
];

export function ViasDeCobro() {
  return (
    <PanelOscuro titulo="Por dónde entra el dinero">
      <div style={{ display: 'grid', gap: 12 }}>
        {VIAS.map((v) => (
          <div key={v.t} style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, padding: '13px 15px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{v.t}</div>
            <div style={{ fontSize: 13, lineHeight: 1.45, color: 'rgba(255,255,255,.62)', marginBottom: 6 }}>{v.d}</div>
            <div className="lp-mono" style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: '#A8B080' }}>{v.pie}</div>
          </div>
        ))}
      </div>
    </PanelOscuro>
  );
}
