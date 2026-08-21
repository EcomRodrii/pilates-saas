'use client';

// Acciones sobre un estudio. Dos decisiones de diseño que importan más que el
// código:
//
//  · Suspender EXIGE un motivo escrito, porque ese texto se le enseña al
//    cliente cuando intente entrar. Un corte de acceso sin explicación es una
//    llamada de teléfono enfadada garantizada.
//  · Cambiar de plan avisa de que NO toca Stripe. El panel cambia lo que el
//    producto deja hacer; lo que se le cobra se cambia en Stripe. Fingir que
//    una sola acción hace ambas cosas es como se acaba regalando un plan caro.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { accionEstudio } from '@/lib/interno/client';
import { PLANES, PLAN_INFO } from '@/lib/billing/entitlements';
import { useSesionInterna } from '../../layout';
import { tienePermiso } from '@/lib/interno/permisos';

export function AccionesEstudio({ id, plan, suspendido, motivo, reviewBoost }: {
  id: string; plan: string; suspendido: boolean; motivo: string | null;
  reviewBoost: { elegibleEn: string | null; mostradoEn: string | null; feedback: { rating: number; creadoEn: string } | null; recompensaCanjeada: boolean };
}) {
  const sesion = useSesionInterna();
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [motivoNuevo, setMotivoNuevo] = useState('');
  const [suspendiendo, setSuspendiendo] = useState(false);

  // Quien no tenga studios.update no ve esto siquiera.
  if (!tienePermiso(sesion.permisos, 'studios.update')) return null;

  async function ejecutar(cuerpo: Record<string, unknown>, exito?: string) {
    setOcupado(true); setError(null); setAviso(null);
    try {
      const r = await accionEstudio(id, cuerpo);
      setSuspendiendo(false); setMotivoNuevo('');
      setAviso(r.avisoStripe ? 'Plan cambiado. Ojo: esto NO cambia lo que se le cobra — eso se ajusta en Stripe.' : exito ?? 'Hecho.');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se ha podido completar.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card px-4 py-3.5">
      <h2 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2.5">Acciones</h2>

      <div className="flex flex-col gap-3">
        <div>
          <p className="text-[12.5px] font-semibold text-foreground mb-1.5">Plan</p>
          <div className="flex flex-wrap gap-1.5">
            {PLANES.map(p => (
              <button key={p} type="button" disabled={ocupado || p === plan}
                onClick={() => ejecutar({ accion: 'cambiar-plan', plan: p })}
                className={`px-3 py-1.5 rounded-lg text-[12.5px] font-semibold border transition-colors ${
                  p === plan
                    ? 'border-brand bg-brand/10 text-brand cursor-default'
                    : 'border-border text-foreground hover:bg-muted disabled:opacity-50'}`}>
                {PLAN_INFO[p].nombre}
                <span className="ml-1.5 text-[11px] font-medium opacity-70">{PLAN_INFO[p].precioMes} €</span>
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-border/60 pt-3">
          {suspendido ? (
            <>
              <p className="text-[12.5px] font-semibold text-foreground">Suspendido</p>
              <p className="text-[12px] text-muted-foreground mb-2">{motivo ?? 'Sin motivo registrado.'}</p>
              <button type="button" disabled={ocupado}
                onClick={() => ejecutar({ accion: 'reactivar' }, 'Estudio reactivado.')}
                className="px-3 py-1.5 rounded-lg text-[12.5px] font-bold bg-brand text-brand-foreground disabled:opacity-50">
                Reactivar acceso
              </button>
            </>
          ) : !suspendiendo ? (
            <button type="button" onClick={() => setSuspendiendo(true)}
              className="px-3 py-1.5 rounded-lg text-[12.5px] font-semibold border border-red-500/40 text-red-600 hover:bg-red-500/5">
              Suspender acceso…
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-[12.5px] font-semibold text-foreground">
                Se le cortará el acceso al panel y a su portal.
              </p>
              <p className="text-[12px] text-muted-foreground -mt-1">
                El motivo que escribas <strong>se le muestra a la dueña</strong> cuando intente entrar.
              </p>
              <input
                value={motivoNuevo} onChange={e => setMotivoNuevo(e.target.value)}
                placeholder="Impago de 3 recibos tras 2 avisos…"
                className="rounded-xl border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-brand"
              />
              <div className="flex gap-2">
                <button type="button" disabled={ocupado || motivoNuevo.trim().length < 10}
                  onClick={() => ejecutar({ accion: 'suspender', motivo: motivoNuevo }, 'Estudio suspendido.')}
                  className="px-3 py-1.5 rounded-lg text-[12.5px] font-bold bg-red-600 text-white disabled:opacity-40">
                  Confirmar suspensión
                </button>
                <button type="button" onClick={() => { setSuspendiendo(false); setMotivoNuevo(''); }}
                  className="px-3 py-1.5 rounded-lg text-[12.5px] font-semibold text-muted-foreground hover:bg-muted">
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border/60 pt-3">
          <p className="text-[12.5px] font-semibold text-foreground mb-1">Review Boost</p>
          {reviewBoost.feedback ? (
            <p className="text-[12.5px] text-muted-foreground">
              Ya dio su feedback: {reviewBoost.feedback.rating}★{reviewBoost.recompensaCanjeada ? ' · descuento canjeado' : ''}.
              No tiene sentido volver a activarlo.
            </p>
          ) : reviewBoost.elegibleEn ? (
            <p className="text-[12.5px] text-muted-foreground">
              Activado {reviewBoost.mostradoEn ? '— ya se le mostró el modal, esperando respuesta.' : '— aún no ha entrado al panel desde entonces.'}
            </p>
          ) : (
            <>
              <p className="text-[12px] text-muted-foreground mb-2">
                Normalmente lo activa solo el cron diario al terminar el trial, si el estudio cumple las señales de
                buen uso. Esto lo salta para este estudio en concreto.
              </p>
              <button type="button" disabled={ocupado}
                onClick={() => ejecutar({ accion: 'activar-review-boost' }, 'Review Boost activado: verá el modal la próxima vez que entre.')}
                className="px-3 py-1.5 rounded-lg text-[12.5px] font-bold bg-brand text-brand-foreground disabled:opacity-50">
                Activar manualmente
              </button>
            </>
          )}
        </div>

        {error && <p className="text-[12.5px] text-red-600">{error}</p>}
        {aviso && <p className="text-[12.5px] text-emerald-700">{aviso}</p>}
        <p className="text-[11.5px] text-muted-foreground">Todo lo de aquí queda registrado en la auditoría con tu nombre.</p>
      </div>
    </section>
  );
}
