'use client';

import { useId, useMemo, useState } from 'react';
import { calcularRentabilidad, type EntradaRentabilidad } from '@/lib/recursos/calculadora-rentabilidad';
import { capturarEvento } from '@/lib/posthog-cliente';

// Calculadora de rentabilidad de un estudio (lib/recursos/calculadora-rentabilidad.ts).
// Los valores iniciales son un EJEMPLO y la pantalla lo dice: la propietaria
// los cambia por los suyos. Son el escenario A del artículo de rentabilidad
// (6 reformers, 30 clases, 18,75 € con IVA menos un 2 % de comisiones, 25 € de
// instructora, 2.400 € de local y 604 € de reserva para máquinas), para que la
// herramienta y la tabla digan lo mismo: equilibrio hacia el 53 %.

const EJEMPLO: EntradaRentabilidad = {
  plazasPorClase: 6, clasesPorSemana: 30, ocupacionPct: 60, ingresoPorPlaza: 15.19, costeInstructoraPorClase: 25, costesFijosMes: 3004,
};

const CAMPOS: { clave: keyof EntradaRentabilidad; etiqueta: string; ayuda: string; paso: number; sufijo: string }[] = [
  { clave: 'plazasPorClase', etiqueta: 'Plazas por clase', ayuda: 'Máquinas o esterillas', paso: 1, sufijo: '' },
  { clave: 'clasesPorSemana', etiqueta: 'Clases a la semana', ayuda: 'Todas las salas', paso: 1, sufijo: '' },
  { clave: 'ocupacionPct', etiqueta: 'Ocupación media', ayuda: 'Plazas llenas de cada 100', paso: 1, sufijo: '%' },
  { clave: 'ingresoPorPlaza', etiqueta: 'Ingreso medio por plaza', ayuda: 'Sin IVA ni comisiones, con bonos y cuotas prorrateados', paso: 0.01, sufijo: '€' },
  { clave: 'costeInstructoraPorClase', etiqueta: 'Coste de instructora por clase', ayuda: 'Lo que te cuesta cada clase dada', paso: 1, sufijo: '€' },
  { clave: 'costesFijosMes', etiqueta: 'Costes fijos al mes', ayuda: 'Alquiler, suministros, seguros, software, reserva para máquinas…', paso: 1, sufijo: '€' },
];

const euros = (n: number) => `${Math.round(n).toLocaleString('es-ES')} €`;

export function CalculadoraRentabilidad() {
  const id = useId();
  const [e, setE] = useState<EntradaRentabilidad>(EJEMPLO);
  const [usada, setUsada] = useState(false);
  const r = useMemo(() => calcularRentabilidad(e), [e]);

  function cambiar(clave: keyof EntradaRentabilidad, valor: string) {
    setE((prev) => ({ ...prev, [clave]: valor === '' ? Number.NaN : Number(valor) }));
    if (!usada) { setUsada(true); capturarEvento('herramienta_usada', { herramienta: 'calculadora-rentabilidad' }); }
  }

  const positivo = r.resultadoMes >= 0;
  return (
    <section aria-labelledby={`${id}-t`} style={{ background: '#fff', border: '1px solid #E0E5D0', borderRadius: 20, padding: 'clamp(18px,3vw,26px)', margin: '26px 0' }}>
      <h3 id={`${id}-t`} style={{ margin: '0 0 4px', fontSize: 19, fontWeight: 800, letterSpacing: '-.02em' }}>Calculadora de rentabilidad</h3>
      <p style={{ margin: '0 0 18px', fontSize: 13.5, color: '#5A5A52' }}>Los números de partida son un <strong>ejemplo</strong>: cámbialos por los de tu estudio.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
        {CAMPOS.map((c) => (
          <label key={c.clave} htmlFor={`${id}-${c.clave}`} style={{ display: 'block' }}>
            <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, marginBottom: 2 }}>{c.etiqueta}{c.sufijo ? ` (${c.sufijo})` : ''}</span>
            <span style={{ display: 'block', fontSize: 12, color: '#6B6B63', marginBottom: 6 }}>{c.ayuda}</span>
            <input
              id={`${id}-${c.clave}`}
              type="number"
              inputMode="decimal"
              min={0}
              max={c.clave === 'ocupacionPct' ? 100 : undefined}
              step={c.paso}
              value={Number.isNaN(e[c.clave]) ? '' : e[c.clave]}
              onChange={(ev) => cambiar(c.clave, ev.target.value)}
              style={{ width: '100%', fontSize: 16, padding: '10px 12px', borderRadius: 12, border: '1px solid #D6D6CE', background: '#FAFAF7' }}
            />
          </label>
        ))}
      </div>
      <div aria-live="polite" style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
        {[
          { v: euros(r.ingresosMes), l: 'Ingresos al mes' },
          { v: euros(r.costesTotalesMes), l: 'Costes al mes (instructoras + fijos)' },
          { v: euros(r.resultadoMes), l: positivo ? 'Te queda al mes, antes de impuestos' : 'Pierdes al mes' },
          { v: r.ocupacionEquilibrioPct === null ? 'No se alcanza' : `${Math.ceil(r.ocupacionEquilibrioPct)} %`, l: 'Ocupación para no perder dinero' },
        ].map((x) => (
          <div key={x.l} style={{ background: '#0F0F0F', color: '#fff', borderRadius: 14, padding: '14px 16px' }}>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em', color: x.l === 'Pierdes al mes' ? '#F2A48F' : '#fff' }}>{x.v}</div>
            <div style={{ fontSize: 12.5, color: '#A6A69E' }}>{x.l}</div>
          </div>
        ))}
      </div>
      <p style={{ margin: '14px 0 0', fontSize: 12, color: '#6B6B63', lineHeight: 1.5 }}>
        Cálculo orientativo con 52 semanas al año. No incluye impuestos sobre el beneficio, cuota de autónoma ni la amortización del equipo.
      </p>
    </section>
  );
}
