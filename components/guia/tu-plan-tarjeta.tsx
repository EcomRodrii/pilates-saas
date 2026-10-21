'use client';

// ─────────────────────────────────────────────────────────────────────────────
// «Tu plan, sin sorpresas» (PR-5, decisión D2 del fundador): ni plan ni tarjeta
// en el alta; el plan se enseña UNA vez, tras la primera reserva, con el uso
// REAL. Qué dice, en lib/alta/tu-plan.ts.
//
//   · Solo la propietaria de un estudio del alta nueva, con Founding Studio
//     gratis de verdad (el `gratis` de /api/billing/status, que solo existe con
//     FOUNDING_GRATIS encendido) y ya medido. Sin eso, nada.
//   · Una vez: en cuanto se pinta se apunta `plan_ensenado` en el embudo y, al
//     volver a cargar, ya no sale. Mientras está en pantalla no se va sola:
//     «Ahora no» la cierra, «Ver los planes» lleva a /suscripcion.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Ticket } from 'lucide-react';
import { estadoBilling, type EstadoBilling } from '@/lib/api-client';
import { useStudio } from '@/lib/studio-context';
import { estudioActivado } from '@/lib/onboarding';
import { apuntarPlanEnsenado } from '@/lib/alta/embudo-cliente';
import { anotarEnEstadoAlta } from '@/lib/alta/estado-cliente';
import { sedesDeOnbCentros } from '@/lib/alta/tu-estudio';
import { tarjetaDelPlan, tocaEnsenarPlan, type TarjetaDelPlan } from '@/lib/alta/tu-plan';
import { CabeceraTarjeta } from '@/components/dashboard/vivo';
import { useAltaNuevaPropia } from './use-pon-en-marcha';

export function TuPlanTarjeta() {
  const { studio, reservas } = useStudio();
  const { activo, estado } = useAltaNuevaPropia();
  const primeraReserva = estudioActivado({ numReservas: reservas.length }) || estado?.primeraReserva === true;
  const toca = activo === true && !!estado && tocaEnsenarPlan({ primeraReserva, planEnsenado: estado.planEnsenado, descartadaAqui: false });

  // Lo que se enseña, fijado al pintarse por primera vez: después, ni el
  // `plan_ensenado` recién apuntado ni otra medición la cambian delante de ella.
  const [tarjeta, setTarjeta] = useState<TarjetaDelPlan | null>(null);
  const [cerrada, setCerrada] = useState(false);
  const [billing, setBilling] = useState<EstadoBilling | null | undefined>(undefined);

  useEffect(() => {
    if (!toca || billing !== undefined) return;
    let vivo = true;
    void estadoBilling().then(b => { if (vivo) setBilling(b); });
    return () => { vivo = false; };
  }, [toca, billing]);

  const candidata = toca && billing ? tarjetaDelPlan({ gratis: billing.gratis, sedes: sedesDeOnbCentros(studio?.onbCentros) }) : null;
  if (candidata && !tarjeta && !cerrada) setTarjeta(candidata);

  useEffect(() => {
    if (!tarjeta) return;
    apuntarPlanEnsenado();
    anotarEnEstadoAlta({ planEnsenado: true });
  }, [tarjeta]);

  if (!tarjeta || cerrada) return null;

  return (
    <section aria-labelledby="tu-plan-titulo" data-testid="tu-plan" className="rounded-t-card border border-border bg-card p-5 shadow-t-card sm:p-6">
      <CabeceraTarjeta tono="indigo" Icono={Ticket} titulo="Tu plan, sin sorpresas" id="tu-plan-titulo" sub={tarjeta.subtitulo} />
      <div className="mt-4 grid gap-3">
        {tarjeta.cifras.map(c => {
          const pct = Math.min(100, Math.round((c.valor / c.limite) * 100));
          return (
            <div key={c.etiqueta}>
              <div className="flex items-baseline justify-between gap-3 text-[13.5px] text-muted-foreground">
                <span>{c.etiqueta}</span>
                <b className="font-t-mono text-[17px] font-medium text-foreground tabular-nums">{c.valor} <small className="text-[12px] text-muted-foreground">/ {c.limite}</small></b>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" role="meter" aria-label={c.etiqueta} aria-valuenow={c.valor} aria-valuemin={0} aria-valuemax={c.limite}>
                <div className="h-full rounded-full" style={{ width: `${Math.max(pct, c.valor > 0 ? 2 : 0)}%`, backgroundColor: 'var(--success)' }} />
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-[13.5px] leading-relaxed text-foreground text-pretty">{tarjeta.texto}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <Link href="/suscripcion" className="inline-flex h-9 items-center rounded-full border border-border px-4 text-[13px] font-semibold text-foreground hover:bg-muted">
          Ver los planes
        </Link>
        <button type="button" onClick={() => setCerrada(true)} className="inline-flex h-9 items-center rounded-full px-3 text-[13px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground">
          Ahora no
        </button>
      </div>
      <p className="mt-3 text-[12px] text-muted-foreground">Te lo enseñamos una vez, tras tu primera reserva.</p>
    </section>
  );
}
