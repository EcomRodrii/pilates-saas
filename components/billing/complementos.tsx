'use client';

// Complementos de Founding Studio (19-oct-2026, decisión del fundador; catálogo
// en lib/billing/entitlements.ts `ADDONS`). Cada uno es una línea más de la
// suscripción de Stripe: 29 € + 6 € = 35 €/mes. Activar o quitar lo hace el
// SERVIDOR (`/api/billing/addons`) y la pantalla solo cambia con lo que él
// contesta: es dinero, nada optimista. Se confirma antes, con el total nuevo.

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { ADDONS, LISTA_ADDONS, PLAN_INFO, precioMensual, type Addon } from '@/lib/billing/entitlements';
import { cambiarComplemento } from '@/lib/api-client';
import { cn } from '@/lib/utils';

export function Complementos({
  contratados, disponibles, esPropietaria, onCambio, className,
}: {
  contratados: string[];
  disponibles: string[];
  esPropietaria: boolean;
  /** Los complementos que hay de verdad tras un cambio (para el total de arriba). */
  onCambio: (addons: string[]) => void;
  className?: string;
}) {
  const [confirmar, setConfirmar] = useState<{ addon: Addon; activar: boolean } | null>(null);
  const [trabajando, setTrabajando] = useState<Addon | null>(null);
  const [error, setError] = useState<string | null>(null);
  const total = precioMensual('BASE', contratados);

  async function aplicar() {
    if (!confirmar || trabajando) return;
    setTrabajando(confirmar.addon); setError(null);
    const r = await cambiarComplemento(confirmar.addon, confirmar.activar);
    setTrabajando(null);
    if ('error' in r) { setError(r.error); return; }
    setConfirmar(null);
    onCambio(r.addons);
  }

  return (
    <section id="complementos" aria-labelledby="complementos-titulo" className={cn('rounded-2xl border border-border bg-card p-6 sm:p-7', className)}>
      <h2 id="complementos-titulo" className="text-[19px] font-extrabold tracking-tight text-foreground">Complementos</h2>
      <p className="mt-1 text-[13.5px] text-muted-foreground text-pretty">
        Se suman a tu {PLAN_INFO.BASE.nombre}. Los quitas cuando quieras: este mes solo se cobra la parte proporcional, en tu próxima factura.
      </p>

      <ul className="mt-4 divide-y divide-border">
        {LISTA_ADDONS.map((a) => {
          const info = ADDONS[a];
          const activo = contratados.includes(a);
          const disponible = disponibles.includes(a);
          const pidiendo = confirmar?.addon === a;
          return (
            <li key={a} data-testid="complemento" data-complemento={a} className="py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-bold text-foreground">{info.nombre}</span>
                    {activo && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11.5px] font-bold text-success">
                        <Check size={12} strokeWidth={3} aria-hidden="true" /> Activo
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[13px] text-muted-foreground text-pretty">{info.resumen}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-[14px] font-semibold tabular-nums text-foreground">+{info.precioMes}€/mes</span>
                  {esPropietaria && !pidiendo && (
                    disponible || activo ? (
                      <button
                        type="button"
                        onClick={() => { setError(null); setConfirmar({ addon: a, activar: !activo }); }}
                        disabled={trabajando !== null}
                        className={cn(
                          'rounded-xl px-4 py-2 text-[13.5px] font-bold transition-all disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                          activo ? 'border border-border bg-card text-foreground hover:bg-background' : 'bg-brand text-brand-foreground hover:brightness-110',
                        )}
                      >
                        {activo ? 'Quitar' : 'Activar'}
                      </button>
                    ) : (
                      <span className="text-[12.5px] text-muted-foreground">Muy pronto</span>
                    )
                  )}
                </div>
              </div>

              {pidiendo && confirmar && (
                <div role="group" aria-label={`Confirmar ${info.nombre}`} className="mt-3 rounded-xl bg-muted px-4 py-3">
                  <p className="text-[13.5px] text-foreground text-pretty">
                    {confirmar.activar
                      ? <>Tu cuota pasará a <strong>{precioMensual('BASE', [...contratados, a])}€/mes</strong>. Este mes se cobra solo la parte proporcional.</>
                      : <>Tu cuota pasará a <strong>{precioMensual('BASE', contratados.filter((x) => x !== a))}€/mes</strong> y dejarás de usar {info.nombre} ahora mismo.</>}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button" onClick={() => void aplicar()} disabled={trabajando !== null}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-[13.5px] font-bold text-brand-foreground hover:brightness-110 disabled:opacity-60"
                    >
                      {trabajando === a && <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                      {confirmar.activar ? `Sí, activar por ${info.precioMes}€/mes` : 'Sí, quitarlo'}
                    </button>
                    <button
                      type="button" onClick={() => setConfirmar(null)} disabled={trabajando !== null}
                      className="rounded-xl border border-border bg-card px-4 py-2 text-[13.5px] font-medium hover:bg-background disabled:opacity-60"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {error && <p role="alert" className="mt-3 text-[13px] text-destructive">{error}</p>}

      <p className="mt-4 border-t border-border pt-4 text-[13.5px] text-muted-foreground">
        Total al mes: <strong className="text-foreground tabular-nums">{total}€</strong>, IVA incluido.
        {/* Con dos o más, Estudio empieza a salir a cuenta: se dice, sin empujar. */}
        {contratados.length >= 2 && (
          <> Con {PLAN_INFO.ESTUDIO.nombre} ({PLAN_INFO.ESTUDIO.precioMes}€) los tienes todos incluidos, además de la app propia.</>
        )}
      </p>
      {/* El portal de Stripe no cambia el plan de una suscripción con varias
          líneas: hasta que haya un cambio de plan propio, se dice cómo hacerlo. */}
      {contratados.length > 0 && (
        <p className="mt-2 text-[12.5px] text-muted-foreground text-pretty">
          Para cambiar de plan, quita antes tus complementos: {PLAN_INFO.ESTUDIO.nombre} ya los incluye.
        </p>
      )}
    </section>
  );
}
