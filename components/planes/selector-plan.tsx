'use client';

import { useId } from 'react';
import { Check } from 'lucide-react';
import { PLANES, PLAN_INFO, type Plan } from '@/lib/billing/entitlements';
import { PARA_QUIEN, resumenCorto } from '@/lib/billing/catalogo-planes';
import { TRIAL_DIAS } from '@/lib/billing/trial';

// Elegir plan. Lo comparten el alta y /suscripcion.
//
// Es un RADIOGROUP de verdad (`role="radiogroup"` + `role="radio"` +
// `aria-checked`), no tres divs con un onClick. Con divs, un lector de pantalla
// anuncia «Estudio 59 euros al mes» sin decir que es una opción, ni cuántas
// hay, ni cuál está elegida; y las flechas del teclado no mueven entre ellas.
// Aquí las flechas recorren los planes y solo el elegido queda en el orden de
// tabulación (patrón de tabindex móvil), que es como se comporta un grupo de
// radios nativo.

/** El plan anterior en la escalera, para poder decir «todo lo de X, y además…». */
function anteriorA(plan: Plan): Plan | null {
  const i = PLANES.indexOf(plan);
  return i > 0 ? PLANES[i - 1] : null;
}

export function SelectorPlan({
  valor,
  onCambio,
  /** Se enseña el precio como «después de la prueba» en vez de a secas. */
  enPrueba = false,
  className = '',
}: {
  valor: Plan;
  onCambio: (p: Plan) => void;
  enPrueba?: boolean;
  className?: string;
}) {
  const uid = useId();

  function alTeclado(e: React.KeyboardEvent, plan: Plan) {
    const i = PLANES.indexOf(plan);
    let siguiente: Plan | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') siguiente = PLANES[(i + 1) % PLANES.length];
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') siguiente = PLANES[(i - 1 + PLANES.length) % PLANES.length];
    // Espacio elige el que tiene el foco, como un radio nativo.
    if (e.key === ' ') { e.preventDefault(); onCambio(plan); return; }
    if (!siguiente) return;
    e.preventDefault();
    onCambio(siguiente);
    document.getElementById(`${uid}-${siguiente}`)?.focus();
  }

  return (
    // Sin `aria-label` en cada radio, su nombre accesible se calcularía del
    // contenido entero de la tarjeta —nombre, para quién, precio y cuatro
    // bullets—, o sea un párrafo por opción antes de poder comparar nada.
    <div role="radiogroup" aria-label="Plan" className={`grid gap-3 sm:grid-cols-3 ${className}`}>
      {PLANES.map((plan) => {
        const info = PLAN_INFO[plan];
        const elegido = plan === valor;
        const bullets = resumenCorto(plan, anteriorA(plan));
        return (
          <div
            key={plan}
            id={`${uid}-${plan}`}
            role="radio"
            aria-checked={elegido}
            aria-label={`Plan ${info.nombre}, ${info.precioMes} euros al mes`}
            tabIndex={elegido ? 0 : -1}
            onClick={() => onCambio(plan)}
            onKeyDown={(e) => alTeclado(e, plan)}
            className={`relative flex cursor-pointer flex-col rounded-2xl border-2 p-4 text-left transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none sm:p-5 ${
              elegido
                ? 'border-brand bg-brand/[0.06] shadow-sm'
                : 'border-border bg-card hover:border-brand/40 hover:bg-muted/40'
            }`}
          >
            {PARA_QUIEN[plan].gancho === 'El más elegido' && (
              <span className="absolute -top-2.5 left-4 rounded-full bg-brand px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-foreground">
                El más elegido
              </span>
            )}

            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[15px] font-bold text-foreground">{info.nombre}</div>
                <div className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{PARA_QUIEN[plan].para}</div>
              </div>
              {/* El check no es decorativo: es el único indicador de elección
                  que no depende solo del color del borde. */}
              <span
                aria-hidden="true"
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors motion-reduce:transition-none ${
                  elegido ? 'border-brand bg-brand text-brand-foreground' : 'border-border'
                }`}
              >
                {elegido && <Check size={12} strokeWidth={3} />}
              </span>
            </div>

            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-[28px] font-extrabold leading-none tracking-tight text-foreground tabular-nums">
                {info.precioMes}€
              </span>
              <span className="text-[12px] font-medium text-muted-foreground">/mes</span>
            </div>
            {enPrueba && (
              <div className="mt-1 text-[11.5px] font-medium text-brand-medio">
                Gratis los primeros {TRIAL_DIAS} días
              </div>
            )}

            <ul className="mt-3 space-y-1.5">
              {bullets.map((b) => (
                <li key={b} className="flex gap-1.5 text-[12.5px] leading-snug text-muted-foreground">
                  <Check size={13} className="mt-0.5 shrink-0 text-brand-medio" aria-hidden="true" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
