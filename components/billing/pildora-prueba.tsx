'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { estadoBilling, type EstadoBilling } from '@/lib/api-client';
import { TRIAL_DIAS, type FaseTrial } from '@/lib/billing/trial';
import { PLAN_INFO, type Plan } from '@/lib/billing/entitlements';
import { TZ_ESTUDIO } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// «Prueba gratuita · 6 días restantes» en la barra superior del panel.
//
// El encargo era explícito: nada de banner ocupando media pantalla, nada que se
// lea como un error, y que se pueda pulsar para ver el detalle. De ahí la
// forma: una píldora del tamaño de un botón de icono, con un arco que se va
// vaciando, y todo lo demás dentro de un desplegable que solo aparece si se
// pide.
//
// Lo que NO hace, a propósito:
//  · No se pinta si el estudio ya paga, ni si nunca tuvo prueba local. Un aviso
//    que sale siempre deja de leerse.
//  · No cuenta los días con el reloj del navegador: los da ya calculados
//    /api/billing/status. Un portátil con la hora mal enseñaría una cuenta
//    atrás distinta de la que aplica el servidor, y la que bloquea es la del
//    servidor.
//  · No pide nada extra a la red: `estadoBilling()` pasa por `unaVez()`, así
//    que comparte la misma petición que ya hace el marco del panel.
// ─────────────────────────────────────────────────────────────────────────────

/** Cada fase con su tono. Ninguna usa rojo salvo la que de verdad es un corte. */
const TONOS: Record<FaseTrial, { pill: string; arco: string; punto: string }> = {
  PLENA: {
    pill: 'border-border bg-card text-muted-foreground hover:border-brand/40',
    arco: 'text-brand-medio',
    punto: 'bg-brand-medio',
  },
  HOLGADA: {
    pill: 'border-border bg-card text-muted-foreground hover:border-brand/40',
    arco: 'text-brand-medio',
    punto: 'bg-brand-medio',
  },
  AVISO: {
    pill: 'border-brand/35 bg-brand/[0.07] text-foreground hover:border-brand/60',
    arco: 'text-brand-medio',
    punto: 'bg-brand-medio',
  },
  ULTIMO_DIA: {
    pill: 'border-warning/40 bg-warning/10 text-warning hover:border-warning/70',
    arco: 'text-warning',
    punto: 'bg-warning',
  },
  EXPIRADA: {
    pill: 'border-destructive/40 bg-destructive/10 text-destructive hover:border-destructive/70',
    arco: 'text-destructive',
    punto: 'bg-destructive',
  },
  // Las dos que nunca se pintan (la píldora sale antes), pero el Record las
  // exige y dejarlas fuera sería un error de tipos.
  SIN_PRUEBA: { pill: '', arco: '', punto: '' },
  SUSCRITO: { pill: '', arco: '', punto: '' },
};

/** El arco que se vacía conforme pasan los días. Puro adorno: `aria-hidden`. */
function Arco({ restantes, className }: { restantes: number; className: string }) {
  const r = 7;
  const circunferencia = 2 * Math.PI * r;
  const parte = Math.max(0, Math.min(1, restantes / TRIAL_DIAS));
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className={`shrink-0 ${className}`}>
      <circle cx="9" cy="9" r={r} fill="none" stroke="currentColor" strokeWidth="2" opacity="0.2" />
      <circle
        cx="9" cy="9" r={r} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
        strokeDasharray={circunferencia}
        strokeDashoffset={circunferencia * (1 - parte)}
        transform="rotate(-90 9 9)"
        style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.16,1,.3,1)' }}
        className="motion-reduce:transition-none"
      />
    </svg>
  );
}

export function PildoraPrueba({ className = '' }: { className?: string }) {
  const [estado, setEstado] = useState<EstadoBilling | null>(null);
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    let vivo = true;
    estadoBilling().then((e) => { if (vivo) setEstado(e); });
    return () => { vivo = false; };
  }, []);

  // Cerrar al pulsar fuera o con Escape. Sin esto el desplegable se queda
  // abierto tapando la barra mientras se navega por el panel.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [abierto]);

  const trial = estado?.trial;
  // Sin dato todavía, o nada que contar: no se pinta NADA. Un esqueleto aquí
  // sería un hueco parpadeante en la barra para la mayoría de estudios, que no
  // están en prueba.
  //
  // ⚠️ `SIN_PRUEBA` va aquí junto a `SUSCRITO`, y no con las fases de prueba:
  // son los estudios anteriores a la apertura al público (7 de 12 en
  // producción), que tienen `trial_ends_at` a NULL. Sin esta condición les
  // saldría un aviso ROJO de «prueba finalizada» por una prueba que nunca
  // tuvieron — y a algunos, pagando.
  if (!trial || trial.fase === 'SUSCRITO' || trial.fase === 'SIN_PRUEBA') return null;

  const expirada = trial.fase === 'EXPIRADA';
  const tono = TONOS[trial.fase];
  const plan = PLAN_INFO[(estado?.plan as Plan) ?? 'BASE'];
  const fin = trial.finaliza
    ? new Date(trial.finaliza).toLocaleDateString('es-ES', {
        day: 'numeric', month: 'long', timeZone: TZ_ESTUDIO,
      })
    : null;

  const etiqueta = expirada
    ? 'Prueba finalizada'
    : `${trial.diasRestantes} ${trial.diasRestantes === 1 ? 'día' : 'días'}`;

  return (
    <div ref={contenedor} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-controls={panelId}
        className={`flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-[12.5px] font-semibold transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none ${tono.pill}`}
      >
        {expirada ? (
          <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${tono.punto}`} />
        ) : (
          <Arco restantes={trial.diasRestantes} className={tono.arco} />
        )}
        {/* En pantallas estrechas se queda solo el número: «Prueba gratuita»
            entero empujaría al resto de la barra. El texto completo sigue en
            el nombre accesible del botón, así que no se pierde para quien no
            ve la barra. */}
        <span className="hidden sm:inline">Prueba gratuita ·&nbsp;</span>
        <span className="tabular-nums">{etiqueta}</span>
        <span className="sr-only">
          {expirada
            ? 'Tu prueba gratuita ha terminado. Pulsa para elegir un plan.'
            : `Te quedan ${trial.diasRestantes} de ${TRIAL_DIAS} días de prueba gratuita. Pulsa para ver el detalle.`}
        </span>
      </button>

      {abierto && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Detalle de tu prueba gratuita"
          className="absolute right-0 z-40 mt-2 w-[min(20rem,calc(100vw-2rem))] origin-top-right rounded-2xl border border-border bg-popover p-4 shadow-xl animate-[sheet-pop-in_.2s_cubic-bezier(.16,1,.3,1)_both] motion-reduce:animate-none"
        >
          <div className="text-[15px] font-bold text-popover-foreground">
            {expirada ? 'Tu prueba ha terminado' : `Te quedan ${trial.diasRestantes} ${trial.diasRestantes === 1 ? 'día' : 'días'}`}
          </div>

          {!expirada && (
            <>
              {/* La barra de progreso repite el arco en grande. Va con
                  role="progressbar" para que no sea solo una raya de color. */}
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={TRIAL_DIAS}
                aria-valuenow={trial.diasRestantes}
                aria-label="Días de prueba restantes"
                className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full rounded-full bg-brand transition-[width] duration-500 motion-reduce:transition-none"
                  style={{ width: `${Math.max(4, (trial.diasRestantes / TRIAL_DIAS) * 100)}%` }}
                />
              </div>
              {fin && (
                <p className="mt-2 text-[12.5px] text-muted-foreground">
                  Termina el <strong className="text-popover-foreground">{fin}</strong>.
                </p>
              )}
            </>
          )}

          <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
            {expirada
              ? 'Tus datos están intactos, no se ha borrado nada. Elige un plan y sigues justo donde lo dejaste.'
              : `Estás probando el plan ${plan.nombre} con todo abierto. No hemos pedido tarjeta y no se te va a cobrar nada al terminar: si no eliges plan, simplemente se pausa.`}
          </p>

          {!expirada && (
            <p className="mt-2 text-[12.5px] text-muted-foreground">
              Después serían <strong className="text-popover-foreground">{plan.precioMes}€/mes</strong>, sin permanencia.
            </p>
          )}

          {estado?.esPropietaria ? (
            <Link
              href="/suscripcion"
              onClick={() => setAbierto(false)}
              className="mt-4 flex w-full items-center justify-center rounded-xl bg-brand px-4 py-2.5 text-[14px] font-bold text-brand-foreground transition-all hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
            >
              {expirada ? 'Elegir mi plan' : 'Ver planes'}
            </Link>
          ) : (
            <p className="mt-4 rounded-xl bg-muted px-3 py-2.5 text-[12.5px] text-muted-foreground">
              Solo la propietaria puede contratar el plan.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
