import { MUTED } from '@/components/landing/theme';
import { PanelClaro, PanelOscuro } from './comunes';

// ── Dibujos propios de /funcionalidades/facturacion ──────────────────────────
// Fuente: lib/billing/sellar-factura-server.ts (numeración atómica) y
// lib/verifactu.ts (cadena y huella SHA-256 en el orden de la AEAT). Sin
// Veri*Factu activo —hoy en ningún estudio— la factura sale SIN huella ni QR y
// sin envío (migr 20261002191517), así que el flujo no pinta la huella como un
// paso de cada cobro: solo `CadenaDeHuellas` la explica, como lo que trae
// Veri*Factu. El ejemplo de huella de abajo es ILUSTRATIVO —hex acortado— pero
// el formato de la cadena es el real.

const ETAPAS = [
  { t: 'Se cobra', d: 'Tarjeta, remesa SEPA o cobro de mostrador. El recibo pasa a COBRADO.', c: '#3E7C86' },
  { t: 'Se reserva el número', d: 'Correlativo, con bloqueo por estudio: dos cobros a la vez no pueden partir la serie.', c: '#5A6142' },
  { t: 'Sale la factura', d: 'Para la clienta y para tu gestoría, sin que la emitas a mano.', c: '#4E9E7F' },
];

export function DelCobroALaFactura() {
  return (
    <PanelClaro
      titulo="Del cobro a la factura"
      nota="Con la facturación encendida, que es como viene, estas tres etapas ocurren en cada cobro salvo el efectivo. La huella, el QR y el envío del registro a la AEAT van con Veri*Factu, que todavía no está activo en ningún estudio."
    >
      <div className="fac-flujo">
        {ETAPAS.map((e, i) => (
          <div key={e.t} style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: e.c, flexShrink: 0 }} />
              <span className="lp-mono" style={{ fontSize: 10, color: '#A8A89F' }}>0{i + 1}</span>
              {i < ETAPAS.length - 1 && <span className="fac-linea" style={{ flex: 1, height: 1, background: '#E7E7E0' }} />}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-.01em', marginBottom: 4 }}>{e.t}</div>
              <div style={{ fontSize: 13, lineHeight: 1.45, color: MUTED }}>{e.d}</div>
            </div>
          </div>
        ))}
      </div>
      <style>{`
        .fac-flujo { display: grid; grid-template-columns: repeat(5,1fr); gap: 16px; }
        @media (max-width: 860px) { .fac-flujo { grid-template-columns: 1fr 1fr; } .fac-linea { display: none; } }
        @media (max-width: 520px) { .fac-flujo { grid-template-columns: 1fr; } }
      `}</style>
    </PanelClaro>
  );
}

export function CadenaDeHuellas() {
  const eslabones = [
    { num: '2026/0041', hash: '9F2C…A104' },
    { num: '2026/0042', hash: '4B7E…C9D2' },
    { num: '2026/0043', hash: '1D80…77FA' },
  ];
  return (
    <PanelClaro
      titulo="Cómo funciona la huella de Veri*Factu"
      nota="Hoy tus facturas no la llevan: llega con Veri*Factu, todavía no activo. Cada huella se calcula sobre los datos fiscales de la factura MÁS la huella de la anterior. Cambiar un importe de hace tres meses invalidaría todas las posteriores — y eso es exactamente lo que la Ley Antifraude persigue."
    >
      <div style={{ display: 'grid', gap: 10 }}>
        {eslabones.map((e, i) => (
          <div key={e.num}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#FAFAF6', border: '1px solid #EDEDE5', borderRadius: 12, padding: '13px 15px', flexWrap: 'wrap' }}>
              <span className="lp-mono" style={{ fontSize: 12.5, fontWeight: 500, color: '#1A1A1A' }}>{e.num}</span>
              <span style={{ fontSize: 12.5, color: MUTED }}>Huella</span>
              <span className="lp-mono" style={{ fontSize: 12.5, color: '#343825', background: '#F1F2EA', padding: '3px 9px', borderRadius: 6 }}>{e.hash}</span>
              {i > 0 && (
                <span className="lp-mono" style={{ fontSize: 11, color: '#8E8E86', marginLeft: 'auto' }}>
                  incluye {eslabones[i - 1].hash}
                </span>
              )}
            </div>
            {i < eslabones.length - 1 && (
              <div style={{ height: 14, marginLeft: 22, borderLeft: '2px solid #E1E5D4' }} />
            )}
          </div>
        ))}
      </div>
    </PanelClaro>
  );
}

export function LoQueLlevaLaFactura() {
  return (
    <PanelOscuro titulo="Lo que lleva cada factura">
      <div style={{ display: 'grid', gap: 11 }}>
        {[
          ['Número correlativo', 'Serie por estudio, sin saltos ni duplicados'],
          ['Desglose de IVA', 'Base, cuota y total'],
          ['Datos del emisor', 'NIF validado antes de sellar'],
        ].map(([t, d]) => (
          <div key={t} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: 5, background: 'rgba(217,194,158,.16)', color: '#D9C29E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, marginTop: 2 }}>✓</span>
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
