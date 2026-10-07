'use client';

import { useId, useMemo, useState } from 'react';
import { calcularPlazasVacias, type EntradaPlazasVacias } from '@/lib/recursos/calculadora-plazas-vacias';
import { capturarEvento } from '@/lib/posthog-cliente';

// Lo que cuestan las plazas de reformer que se quedan vacías
// (lib/recursos/calculadora-plazas-vacias.ts). Los valores de partida son un
// EJEMPLO y la pantalla lo dice. Los 18,75 € son la mediana de una sesión de
// reformer con cuota de una clase semanal en nuestro estudio de precios de 32
// estudios españoles (/recursos/precio-clase-de-pilates y bonos-de-pilates).

const EJEMPLO: EntradaPlazasVacias = { reformers: 8, clasesPorSemana: 30, ocupacionPct: 80, ingresoPorPlaza: 18.75 };

const CAMPOS: { clave: keyof EntradaPlazasVacias; etiqueta: string; ayuda: string; paso: number; sufijo: string }[] = [
  { clave: 'reformers', etiqueta: 'Reformers por clase', ayuda: 'Plazas de cada clase', paso: 1, sufijo: '' },
  { clave: 'clasesPorSemana', etiqueta: 'Clases a la semana', ayuda: 'De todas las salas de reformer', paso: 1, sufijo: '' },
  { clave: 'ocupacionPct', etiqueta: 'Ocupación media', ayuda: 'Plazas llenas de cada 100', paso: 1, sufijo: '%' },
  { clave: 'ingresoPorPlaza', etiqueta: 'Precio medio por plaza', ayuda: 'Lo que paga de media una alumna por clase', paso: 0.01, sufijo: '€' },
];

const euros = (n: number) => `${Math.round(n).toLocaleString('es-ES')} €`;
const entero = (n: number) => Math.round(n).toLocaleString('es-ES');

export function CalculadoraPlazasVacias() {
  const id = useId();
  const [e, setE] = useState<EntradaPlazasVacias>(EJEMPLO);
  const [usada, setUsada] = useState(false);
  const r = useMemo(() => calcularPlazasVacias(e), [e]);

  function cambiar(clave: keyof EntradaPlazasVacias, valor: string) {
    setE((prev) => ({ ...prev, [clave]: valor === '' ? Number.NaN : Number(valor) }));
    if (!usada) { setUsada(true); capturarEvento('herramienta_usada', { herramienta: 'calculadora-plazas-vacias' }); }
  }

  return (
    <div className="sol-calc" role="group" aria-labelledby={`${id}-t`}>
      <div className="sol-calc-campos">
        <p id={`${id}-t`} className="lp-mono sol-calc-titulo">Tu estudio · los números de partida son un ejemplo</p>
        {CAMPOS.map((c) => (
          <label key={c.clave} htmlFor={`${id}-${c.clave}`} className="sol-calc-campo">
            <span className="sol-calc-etiqueta">{c.etiqueta}{c.sufijo ? ` (${c.sufijo})` : ''}</span>
            <span className="sol-calc-ayuda">{c.ayuda}</span>
            <input
              id={`${id}-${c.clave}`}
              type="number"
              inputMode="decimal"
              min={0}
              max={c.clave === 'ocupacionPct' ? 100 : undefined}
              step={c.paso}
              value={Number.isNaN(e[c.clave]) ? '' : e[c.clave]}
              onChange={(ev) => cambiar(c.clave, ev.target.value)}
            />
          </label>
        ))}
      </div>
      <div className="sol-calc-resultado" aria-live="polite">
        <p className="lp-mono sol-calc-titulo sol-calc-titulo-claro">Lo que se queda sin vender</p>
        <p className="sol-calc-cifra">{euros(r.ingresoNoVendidoMes)}<span> al mes</span></p>
        <p className="sol-calc-sub">{entero(r.plazasVaciasMes)} plazas vacías de {entero(r.plazasOfertadasMes)} al mes · {euros(r.ingresoNoVendidoAno)} al año</p>
        <p className="sol-calc-nota">Cálculo orientativo con 52 semanas al año. Es el valor de las plazas que salen y no se reservan; cuántas recuperas depende de tu horario y de tus alumnas.</p>
      </div>
    </div>
  );
}
