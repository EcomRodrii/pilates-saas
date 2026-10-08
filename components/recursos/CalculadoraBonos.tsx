'use client';

import { useId, useMemo, useState } from 'react';
import { calcularBonos, type EntradaBonos } from '@/lib/recursos/calculadora-bonos';
import { capturarEvento } from '@/lib/posthog-cliente';

// Calculadora de la escalera de precios (lib/recursos/calculadora-bonos.ts).
// Arranca con el ejemplo de la tabla que tiene justo encima en el artículo
// (medianas de reformer en grupo, 25-sep-2026), y la pantalla lo dice. Mismo
// aspecto que la calculadora de rentabilidad, para que las herramientas de
// /recursos se lean como una familia.

const EJEMPLO: EntradaBonos = { suelta: 25, descuentoBono5: 12, descuentoBono10: 20, descuentoCuota1: 25, descuentoCuota2: 35, costePorPlaza: 0 };

const CAMPOS: { clave: keyof EntradaBonos; etiqueta: string; ayuda: string; paso: number; sufijo: string }[] = [
  { clave: 'suelta', etiqueta: 'Precio de la clase suelta', ayuda: 'Lo que cobras por venir un día, con IVA', paso: 0.5, sufijo: '€' },
  { clave: 'descuentoBono5', etiqueta: 'Descuento del bono de 5', ayuda: 'Por sesión, frente a la suelta (en la muestra, del 7 % al 20 %)', paso: 1, sufijo: '%' },
  { clave: 'descuentoBono10', etiqueta: 'Descuento del bono de 10', ayuda: 'Por sesión, frente a la suelta (en la muestra, del 7 % al 33 %)', paso: 1, sufijo: '%' },
  { clave: 'descuentoCuota1', etiqueta: 'Descuento de la cuota de 1 clase', ayuda: 'Por sesión, frente a la suelta: 4 clases al mes', paso: 1, sufijo: '%' },
  { clave: 'descuentoCuota2', etiqueta: 'Descuento de la cuota de 2 clases', ayuda: 'Por sesión, frente a la suelta: 8 clases al mes', paso: 1, sufijo: '%' },
  { clave: 'costePorPlaza', etiqueta: 'Tu coste por plaza ocupada, sin IVA', ayuda: 'Opcional: para avisarte si un escalón no lo cubre', paso: 0.5, sufijo: '€' },
];

const euros = (n: number) => `${n.toLocaleString('es-ES', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} €`;

export function CalculadoraBonos() {
  const id = useId();
  const [e, setE] = useState<EntradaBonos>(EJEMPLO);
  const [usada, setUsada] = useState(false);
  const r = useMemo(() => calcularBonos(e), [e]);

  function cambiar(clave: keyof EntradaBonos, valor: string) {
    setE((prev) => ({ ...prev, [clave]: valor === '' ? Number.NaN : Number(valor) }));
    if (!usada) { setUsada(true); capturarEvento('herramienta_usada', { herramienta: 'calculadora-bonos' }); }
  }

  return (
    <section aria-labelledby={`${id}-t`} style={{ background: '#fff', border: '1px solid #E0E5D0', borderRadius: 20, padding: 'clamp(18px,3vw,26px)', margin: '26px 0' }}>
      <h3 id={`${id}-t`} style={{ margin: '0 0 4px', fontSize: 19, fontWeight: 800, letterSpacing: '-.02em' }}>Calculadora de precios de bonos</h3>
      <p style={{ margin: '0 0 18px', fontSize: 13.5, color: '#5A5A52' }}>Los números de partida son los del ejemplo de arriba (medianas de reformer en grupo en 32 estudios españoles): cámbialos por los tuyos.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
        {CAMPOS.map((c) => (
          <label key={c.clave} htmlFor={`${id}-${c.clave}`} style={{ display: 'block' }}>
            <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, marginBottom: 2 }}>{c.etiqueta} ({c.sufijo})</span>
            <span style={{ display: 'block', fontSize: 12, color: '#6B6B63', marginBottom: 6 }}>{c.ayuda}</span>
            <input
              id={`${id}-${c.clave}`}
              type="number"
              inputMode="decimal"
              min={0}
              max={c.sufijo === '%' ? 95 : undefined}
              step={c.paso}
              value={Number.isNaN(e[c.clave]) ? '' : e[c.clave]}
              onChange={(ev) => cambiar(c.clave, ev.target.value)}
              style={{ width: '100%', fontSize: 16, padding: '10px 12px', borderRadius: 12, border: '1px solid #D6D6CE', background: '#FAFAF7' }}
            />
          </label>
        ))}
      </div>
      <div aria-live="polite" style={{ marginTop: 20, border: '1px solid #E7E7E0', borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#0F0F0F', color: '#fff', textAlign: 'left' }}>
              <th scope="col" style={{ padding: '10px 12px', fontWeight: 700 }}>Producto</th>
              <th scope="col" style={{ padding: '10px 12px', fontWeight: 700 }}>Precio</th>
              <th scope="col" style={{ padding: '10px 12px', fontWeight: 700 }}>Por sesión (con IVA)</th>
              <th scope="col" style={{ padding: '10px 12px', fontWeight: 700 }}>Ahorro</th>
            </tr>
          </thead>
          <tbody>
            {r.escalones.map((s) => (
              <tr key={s.id} style={{ borderTop: '1px solid #EDEDE6', background: s.porDebajoDelCoste ? '#FBEFEC' : undefined }}>
                <th scope="row" style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>{s.nombre}</th>
                <td style={{ padding: '10px 12px' }}>{euros(s.precio)}{s.id.startsWith('cuota') ? '/mes' : ''}</td>
                <td style={{ padding: '10px 12px' }}>{euros(s.porSesion)}{s.porDebajoDelCoste ? ' · por debajo de tu coste' : ''}</td>
                <td style={{ padding: '10px 12px' }}>{s.id === 'suelta' ? '—' : `${s.ahorro} %`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {r.bonoCanibalizaCuota && (
        <p style={{ margin: '12px 0 0', fontSize: 13.5, lineHeight: 1.5, color: '#7A3B2A' }}>
          El bono de 10 sale más barato por sesión que la cuota de una clase semanal: así empujas a tus alumnas fuera de la cuota. Sube un poco el bono o rebaja la cuota.
        </p>
      )}
      <p style={{ margin: '12px 0 0', fontSize: 12, color: '#6B6B63', lineHeight: 1.5 }}>
        Cuotas con 4 y 8 sesiones al mes, la cuenta que enseñan los propios estudios. Para compararlo con tu coste se le quita al precio el 21 % de IVA. Precios redondeados al céntimo: redondéalos tú a una cifra fácil de recordar.
      </p>
    </section>
  );
}
