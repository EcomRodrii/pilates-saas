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
import { accionEstudio, type FichaEstudio } from '@/lib/interno/client';
import { ampliacionDePrueba, estadoTrial, DIAS_AMPLIACION_PRUEBA } from '@/lib/billing/trial';
import { PLANES, PLAN_INFO } from '@/lib/billing/entitlements';
import { useSesionInterna } from '../../layout';
import { tienePermiso } from '@/lib/interno/permisos';

const dia = (iso: string) =>
  new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' });

export function AccionesEstudio({ id, plan, suspendido, motivo, reviewBoost, prueba, alTerminar }: {
  id: string; plan: string; suspendido: boolean; motivo: string | null;
  prueba: FichaEstudio['prueba'];
  /** Recarga la ficha: es de cliente, así que `router.refresh()` no la repinta. */
  alTerminar?: () => void;
  reviewBoost: { elegibleEn: string | null; mostradoEn: string | null; feedback: { rating: number; creadoEn: string } | null; recompensaCanjeada: boolean };
}) {
  const sesion = useSesionInterna();
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [motivoNuevo, setMotivoNuevo] = useState('');
  const [suspendiendo, setSuspendiendo] = useState(false);
  // Ampliar la prueba es dar acceso gratis: pide un segundo clic, como suspender.
  const [confirmandoPrueba, setConfirmandoPrueba] = useState(false);

  // Quien no tenga studios.update no ve esto siquiera.
  if (!tienePermiso(sesion.permisos, 'studios.update')) return null;

  // La misma regla que aplica el servidor: aquí solo sirve para avisar ANTES
  // de pulsar, y para no ofrecer un botón que va a decir que no.
  const entradaPrueba = {
    trialEndsAt: prueba.finaliza, subscriptionStatus: prueba.estado,
    subscriptionId: prueba.conSuscripcionStripe ? 'stripe' : null,
  };
  const trial = estadoTrial(entradaPrueba);
  const ampliacion = ampliacionDePrueba({ ...entradaPrueba, esSede: prueba.esSede });

  async function ejecutar(cuerpo: Record<string, unknown>, exito?: string) {
    setOcupado(true); setError(null); setAviso(null);
    try {
      const r = await accionEstudio(id, cuerpo);
      setSuspendiendo(false); setMotivoNuevo(''); setConfirmandoPrueba(false);
      setAviso(
        r.pruebaHasta ? `Prueba ampliada hasta el ${dia(r.pruebaHasta)}. Ya puede volver a entrar.`
        : r.avisoStripe ? 'Plan cambiado. Ojo: esto NO cambia lo que se le cobra — eso se ajusta en Stripe.'
        : exito ?? 'Hecho.',
      );
      router.refresh();
      alTerminar?.();
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
          <p className="text-[12.5px] font-semibold text-foreground mb-1">Prueba gratuita</p>
          {prueba.finaliza && trial.enPrueba && (
            <p className="text-[12.5px] text-muted-foreground">
              En prueba hasta el {dia(prueba.finaliza)} · {trial.diasRestantes === 1 ? 'queda 1 día' : `quedan ${trial.diasRestantes} días`}.
            </p>
          )}
          {prueba.finaliza && trial.agotada && (
            <p className="text-[12.5px] text-muted-foreground">
              La prueba terminó el {dia(prueba.finaliza)}: no puede entrar a su panel hasta que elija un plan.
            </p>
          )}
          {ampliacion.ok ? (
            !confirmandoPrueba ? (
              <button type="button" disabled={ocupado} onClick={() => setConfirmandoPrueba(true)}
                className="mt-2 px-3 py-1.5 rounded-lg text-[12.5px] font-bold bg-brand text-brand-foreground disabled:opacity-50">
                Añadir {DIAS_AMPLIACION_PRUEBA} días…
              </button>
            ) : (
              <div className="mt-2 flex flex-col gap-2">
                <p className="text-[12.5px] text-foreground">
                  Quedará en prueba hasta el <strong>{dia(ampliacion.hasta.toISOString())}</strong>, con todo su plan abierto y sin cobrarle nada.
                </p>
                <div className="flex gap-2">
                  <button type="button" disabled={ocupado}
                    onClick={() => ejecutar({ accion: 'ampliar-prueba' })}
                    className="px-3 py-1.5 rounded-lg text-[12.5px] font-bold bg-brand text-brand-foreground disabled:opacity-50">
                    Confirmar {DIAS_AMPLIACION_PRUEBA} días más
                  </button>
                  <button type="button" disabled={ocupado} onClick={() => setConfirmandoPrueba(false)}
                    className="px-3 py-1.5 rounded-lg text-[12.5px] font-semibold text-muted-foreground hover:bg-muted">
                    Cancelar
                  </button>
                </div>
              </div>
            )
          ) : (
            <p className="text-[12px] text-muted-foreground">{ampliacion.motivo}</p>
          )}
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
