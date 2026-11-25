'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Configuración → Plan con la forma del admin de Shopify (25-nov-2026, decisión
// del fundador). Solo en el marco a sangre (`SHELL_NUEVO`): sin él, la vista de
// siempre, sin un píxel distinto.
//
// Dos pantallas, como allí: «Información del plan» y «Seleccionar plan». Aquí no
// se decide nada: el estado, las reglas y lo que se cobra son de
// `SuscripcionVista`, y los precios y lo que incluye cada plan salen de
// `entitlements.ts` y del catálogo. Elegir una tarjeta NO paga: selecciona, y
// debajo se confirma (con el aviso de lo que cancela Cadena, si toca).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, type ReactNode } from 'react';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ADDONS, LISTA_ADDONS, PLANES, PLAN_ENTITLEMENTS, PLAN_INFO, type Plan } from '@/lib/billing/entitlements';
import { novedadesFrenteAlAnterior } from '@/lib/billing/catalogo-planes';
import { euros, importeDe, textoAhorro, type IntervaloUi } from '@/lib/billing/intervalo-ui';
import { FRASE_PLAN_GRATIS, LIMITE_RESERVAS_MES, type EstadoGratisApi } from '@/lib/billing/plan-gratis';
import { NombrePlan } from '@/components/planes/nombre-plan';
import { SelectorIntervalo } from '@/components/planes/selector-intervalo';
import { ComparativaPlanes } from '@/components/planes/comparativa-planes';
import { UsoPlanGratis } from '@/components/billing/plan-gratis';
import './plan-shell.css';

const NEGRO = 'inline-flex items-center justify-center gap-2 rounded-full bg-foreground text-[13px] font-medium text-background shadow-[inset_0_1px_1px_rgb(255_255_255/0.28),0_1px_3px_rgb(0_0_0/0.3)] transition-[filter] hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none';
const TARJETA = 'rounded-[20px] border border-border bg-card shadow-[0_2px_12px_rgb(0_0_0/0.04)]';

/** Lo que suma cada tarjeta, derivado del catálogo y de los complementos: nada escrito dos veces. */
function puntos(p: Plan): string[] {
  const consultas = `Pregúntale a Tentare: ${PLAN_ENTITLEMENTS[p].consultasAsistenteMes} consultas al mes`;
  if (p === 'BASE') {
    return ['Sin límite de reservas ni de clientes', ...LISTA_ADDONS.map((a) => `${ADDONS[a].nombre}: +${ADDONS[a].precioMes} €/mes`), consultas];
  }
  const anterior: Plan = p === 'CADENA' ? 'ESTUDIO' : 'BASE';
  return [`Todo lo de ${PLAN_INFO[anterior].nombre}`, ...novedadesFrenteAlAnterior(p, anterior).filter((t) => !t.startsWith('Pregúntale')), consultas];
}

const PARA: Record<Plan, string> = {
  BASE: 'Para estudios pequeños',
  ESTUDIO: 'Para estudios que quieren automatizar',
  CADENA: 'Para varios centros',
};

export function PlanShell({
  gratis, yaPaga, enImpago, plan, importe, intervaloActual, proximoCobro, primerCobro, esPropietaria, stripeListo, soloCadena,
  anual, intervalo, onIntervalo, elegido, onElegir, accion, onSuscribir, onPortal, avisoCadena, uso, detalle,
}: {
  gratis: EstadoGratisApi | null;
  yaPaga: boolean;
  enImpago: boolean;
  plan: Plan;
  /** Lo que paga hoy (plan y complementos), ya calculado. */
  importe: number;
  intervaloActual: IntervaloUi;
  proximoCobro: string | null;
  primerCobro: boolean;
  esPropietaria: boolean;
  stripeListo: boolean;
  soloCadena: boolean;
  /** ¿Se puede pagar por años? */
  anual: boolean;
  intervalo: IntervaloUi;
  onIntervalo: (i: IntervaloUi) => void;
  elegido: Plan;
  onElegir: (p: Plan) => void;
  accion: 'suscribir' | 'portal' | null;
  onSuscribir: () => void;
  onPortal: () => void;
  avisoCadena: ReactNode;
  /** El tope de clientas del plan, si lo tiene. */
  uso: ReactNode;
  /** Lo de quien ya paga: su suscripción y sus complementos. */
  detalle: ReactNode;
}) {
  // Sin plan que enseñar (ni gratis ni de pago), lo único que hay que hacer es elegir.
  const sinPlan = !gratis && !yaPaga;
  const [viendoPlanes, setViendoPlanes] = useState(false);
  const planes = soloCadena ? (['CADENA'] as const) : PLANES;
  const cuando = anual ? intervalo : 'mensual';
  const precio = (p: Plan) => `${euros(importeDe(PLAN_INFO[p].precioMes, cuando))} €`;
  const periodo = cuando === 'anual' ? '/año' : '/mes';
  const seHaPasado = gratis?.fase === 'MARGEN' || gratis?.fase === 'CERRADO';

  if (sinPlan || viendoPlanes) {
    return (
      <div className="plan-sh flex flex-col gap-4">
        {!sinPlan && (
          <nav aria-label="Ruta" className="flex items-center gap-3 text-[13px]">
            <button type="button" onClick={() => setViendoPlanes(false)} aria-label="Volver a Plan"
              className="flex size-8 items-center justify-center rounded-full border border-border bg-card hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              <ChevronLeft size={16} aria-hidden />
            </button>
            <span className="text-muted-foreground">Plan</span><span aria-hidden className="text-muted-foreground">/</span>
            <span className="font-medium text-foreground">Seleccionar plan</span>
          </nav>
        )}
        <div>
          <h2 className="text-[26px] font-semibold leading-8 tracking-tight text-foreground">
            Planes desde {PLAN_INFO[soloCadena ? 'CADENA' : 'BASE'].precioMes} €
          </h2>
          {gratis && <p className="text-[13px] text-muted-foreground">Ahora estás en {PLAN_INFO.BASE.nombre} gratis, hasta {LIMITE_RESERVAS_MES} reservas al mes.</p>}
        </div>
        {soloCadena && (
          <p data-solo-cadena className={cn(TARJETA, 'px-4 py-3 text-[13px] text-muted-foreground text-pretty')}>
            <strong className="font-semibold text-foreground">Esta sede forma parte de tu cadena,</strong> así que se contrata con el plan Cadena:
            una sola suscripción para todas tus sedes. {PLAN_INFO.BASE.nombre} y Estudio son para un solo estudio, y solo los puede contratar tu sede principal.
          </p>
        )}
        {anual && <SelectorIntervalo valor={intervalo} onCambio={onIntervalo} className="self-start" />}

        <div role="radiogroup" aria-label="Plan" className={cn('grid gap-2', planes.length > 1 ? 'lg:grid-cols-3' : 'lg:max-w-sm')}>
          {planes.map((p) => (
            <section key={p} aria-label={PLAN_INFO[p].nombre} className={cn(TARJETA, 'flex flex-col p-6', elegido === p && 'border-foreground')}>
              <h3 className="text-[22px] font-medium leading-7 tracking-tight text-foreground"><NombrePlan plan={p} /></h3>
              <p className="mt-1 text-[14px] text-muted-foreground">{PARA[p]}</p>
              <p className="mt-4 text-foreground">
                <span className="text-[26px] font-semibold tabular-nums tracking-tight">{precio(p)}</span>
                <span className="text-[12px] text-muted-foreground">{periodo}</span>
              </p>
              <p className="min-h-5 text-[12px] text-muted-foreground">
                {cuando === 'anual' ? `${textoAhorro(PLAN_INFO[p].precioMes)} · IVA incluido` : 'IVA incluido'}
              </p>
              <button type="button" role="radio" aria-checked={elegido === p} onClick={() => onElegir(p)} className={cn(NEGRO, 'mt-3 h-10 w-full')}>
                {elegido === p ? 'Elegido' : `Elegir ${PLAN_INFO[p].nombre}`}
              </button>
              <ul className="mt-3 text-[13px] text-foreground">
                {puntos(p).map((t) => <li key={t} className="border-b border-border py-2.5 last:border-0">{t}</li>)}
              </ul>
            </section>
          ))}
        </div>

        <div className={cn(TARJETA, 'p-4')}>
          {elegido === 'CADENA' && avisoCadena}
          {esPropietaria ? (
            <>
              <button type="button" onClick={onSuscribir} disabled={accion !== null || !stripeListo} className={cn(NEGRO, 'mt-3 h-11 w-full px-5 first:mt-0 sm:w-auto')}>
                {accion === 'suscribir' && <Loader2 size={15} className="animate-spin motion-reduce:animate-none" aria-hidden />}
                {accion === 'suscribir' ? 'Redirigiendo a Stripe…' : `Continuar con ${PLAN_INFO[elegido].nombre} · ${precio(elegido)}${periodo}`}
              </button>
              <p className="mt-2 text-[12.5px] text-muted-foreground">Tus datos y tu app siguen igual. Puedes cancelar cuando quieras desde esta misma pantalla.</p>
            </>
          ) : (
            <p className="text-[13.5px] text-muted-foreground">Solo la propietaria puede cambiar de plan.</p>
          )}
        </div>

        <h2 className="mt-6 text-[22px] font-medium tracking-tight text-foreground">Comparar planes</h2>
        <ComparativaPlanes
          todoAbierto
          acciones={Object.fromEntries(planes.map((p) => [p, (
            <button key={p} type="button" onClick={() => onElegir(p)} aria-pressed={elegido === p} className={cn(NEGRO, 'mt-2 min-h-9 w-full px-3 py-1')}>
              {elegido === p ? 'Elegido' : 'Elegir'}
            </button>
          )]))}
        />
        <p className="text-center text-[12.5px] text-muted-foreground">Los pagos de tus clientes van directos a tu cuenta de Stripe — Tentare no cobra comisión sobre ellos.</p>
      </div>
    );
  }

  return (
    <div className="plan-sh flex flex-col gap-8">
      <section aria-label="Tu plan">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
          <h2 className="text-[16px] font-semibold tracking-tight text-foreground">Información del plan</h2>
          {gratis ? (
            <button type="button" onClick={() => setViendoPlanes(true)} className={cn(NEGRO, 'h-7 px-3')}>{seHaPasado ? 'Elegir cómo seguir' : 'Elegir plan'}</button>
          ) : esPropietaria ? (
            <button type="button" onClick={onPortal} disabled={accion === 'portal'} className={cn(NEGRO, 'h-7 px-3')}>
              {accion === 'portal' ? 'Abriendo…' : 'Facturas, tarjeta y cambio de plan'}
            </button>
          ) : null}
        </div>
        <div className={cn(TARJETA, 'p-4')}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[16px] font-semibold tracking-tight text-foreground"><NombrePlan plan={gratis ? 'BASE' : plan} /></span>
            <span className={cn('rounded-lg px-1.5 py-px text-[13px] text-foreground', enImpago ? 'bg-warning/30' : 'bg-success/25')}>
              {gratis ? 'Gratis' : enImpago ? 'Cobro pendiente' : 'Activa'}
            </span>
            {!gratis && (
              <span className="ml-auto text-[13px] tabular-nums text-muted-foreground">
                {euros(importe)}€ · {intervaloActual === 'anual' ? 'al año, IVA incluido' : 'al mes, IVA incluido'} · sin permanencia
              </span>
            )}
          </div>
          {gratis && (
            <>
              <p className="mt-3 text-[14px] font-medium text-foreground">{FRASE_PLAN_GRATIS}</p>
              <p className="mt-1 text-[13px] text-muted-foreground text-pretty">
                Todo Tentare menos varias sedes, sin tarjeta y sin pagar nada, mientras tu estudio tenga hasta {LIMITE_RESERVAS_MES} reservas al mes. Si pasas
                de ahí, {PLAN_INFO.BASE.precioMes} €/mes, sin tope de reservas; con ese plan, el Centro de Control, las sustituciones automáticas y la redacción
                con IA van aparte.
              </p>
            </>
          )}
          {!gratis && proximoCobro && (
            <p className="mt-3 border-t border-border pt-3 text-[13px] text-muted-foreground">
              {primerCobro ? 'Primer cobro el ' : 'Próximo cobro el '}<strong className="text-foreground">{proximoCobro}</strong>
            </p>
          )}
          {!gratis && uso}
          {!gratis && (
            <p className="mt-3 text-[12.5px] text-muted-foreground">
              {esPropietaria ? 'Se abre el portal seguro de Stripe.' : 'Solo la propietaria puede gestionar la facturación.'}
            </p>
          )}
        </div>
      </section>
      {gratis ? <UsoPlanGratis gratis={gratis} /> : detalle}
    </div>
  );
}
