'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Check, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { PLAN_INFO, type Plan } from '@/lib/billing/entitlements';
import { TRIAL_DIAS } from '@/lib/billing/trial';
import { estadoBilling, iniciarSuscripcion, gestionarSuscripcion, type EstadoBilling } from '@/lib/api-client';
import { SelectorPlan } from '@/components/planes/selector-plan';
import { ComparativaPlanes } from '@/components/planes/comparativa-planes';
import { TZ_ESTUDIO } from '@/lib/utils';

// Suscripción del estudio a Tentare.
//
// ⚠️ Esta pantalla tenía su propia paleta: `const ACC = '#FFC8E2'` y un
// `#F7A6C4` sueltos —restos de la plantilla anterior al cambio de identidad—
// que pintaban el botón principal, la etiqueta «POPULAR» y los checks. Era el
// caso más claro de «un botón que parece de otra aplicación»: el rosa no está
// en ninguna de las cuatro fuentes de verdad del color de Tentare. Ahora todo
// sale de los tokens (`bg-brand`, `text-brand-medio`, `border-border`…), que
// además es lo único que respeta el modo oscuro y el tema del estudio.
//
// Los planes tampoco se describen aquí: los pinta `SelectorPlan` /
// `ComparativaPlanes` desde `lib/billing/catalogo-planes.ts`, la misma fuente
// que /precios y el alta. Antes esta página tenía sus propios 4 bullets por
// plan escritos a mano, y ya no coincidían con los de /precios.

export default function SuscripcionPage() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const [estado, setEstado] = useState<EstadoBilling | null>(null);
  const [cargando, setCargando] = useState(true);
  const [elegido, setElegido] = useState<Plan>('ESTUDIO');
  const [accion, setAccion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !session) router.replace('/login');
  }, [loading, session, router]);

  useEffect(() => {
    if (!session) return;
    let vivo = true;
    estadoBilling().then((e) => {
      if (!vivo) return;
      setEstado(e);
      // Se preselecciona el plan que ya está probando: es el que ha estado
      // usando estos días, y el que menos sorpresas le va a dar.
      if (e?.plan === 'BASE' || e?.plan === 'ESTUDIO' || e?.plan === 'CADENA') setElegido(e.plan);
      setCargando(false);
    });
    return () => { vivo = false; };
  }, [session]);

  async function suscribir() {
    setError(null);
    setAccion('suscribir');
    const r = await iniciarSuscripcion(elegido);
    if ('url' in r) window.location.assign(r.url);
    else { setError(r.error); setAccion(null); }
  }

  async function abrirPortal() {
    setError(null);
    setAccion('portal');
    const r = await gestionarSuscripcion();
    if ('url' in r) window.location.assign(r.url);
    else { setError(r.error); setAccion(null); }
  }

  if (loading || !session) return null;

  const activo = estado?.activo ?? false;
  const esPropietaria = estado?.esPropietaria ?? true;
  const stripeListo = estado?.configurado ?? false;
  const trial = estado?.trial;
  const status = estado?.subscriptionStatus ?? null;

  // ⚠️ `trial` es un campo NUEVO de /api/billing/status. Si no viene —un
  // cliente con el bundle viejo en caché, o el endpoint todavía sin desplegar—
  // esta pantalla NO puede quedarse enseñando el estado equivocado: es la
  // factura del estudio. De ahí el respaldo sobre los campos de siempre, que
  // llevan ahí desde el principio.
  const yaPaga = trial
    ? trial.fase === 'SUSCRITO'
    : status === 'active' || status === 'past_due' || status === 'trialing';
  const enPrueba = trial
    ? trial.fase !== 'SUSCRITO' && trial.fase !== 'EXPIRADA' && trial.fase !== 'SIN_PRUEBA'
    : false;
  const pruebaAgotada = trial?.fase === 'EXPIRADA';
  // Prueba de STRIPE (con tarjeta ya dada): todavía no ha pagado ni un euro, así
  // que su fecha es el PRIMER cobro, no el próximo. Son las suscripciones
  // anteriores a que la prueba pasara a ser local — ya no se crean nuevas, pero
  // las que hay siguen vivas y esta pantalla es donde las mira su dueña.
  const primerCobro = !!estado?.enPrueba;

  const fecha = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ_ESTUDIO }) : null;

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto max-w-4xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
        <Link
          href="/dashboard"
          className="mb-6 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <ArrowLeft size={15} aria-hidden="true" /> Volver al panel
        </Link>

        {/* ── Encabezado: una sola frase que dice dónde está ─────────────── */}
        <header className="mb-7">
          <h1 className="text-[27px] font-extrabold leading-tight tracking-tight text-foreground sm:text-[34px]">
            {yaPaga ? 'Tu suscripción' : pruebaAgotada ? 'Tu prueba ha terminado' : 'Elige tu plan'}
          </h1>
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
            {yaPaga
              ? 'Está al día. Puedes cambiar de plan, ver tus facturas o actualizar la tarjeta cuando quieras.'
              : pruebaAgotada
                ? 'Tus datos están intactos: no se ha borrado nada. Elige un plan y sigues justo donde lo dejaste.'
                : enPrueba
                  ? `Estás en tu prueba gratuita. Elige plan cuando quieras — si no lo haces, no se te cobra nada: la prueba simplemente termina.`
                  : 'Sin permanencia. Cancela cuando quieras.'}
          </p>
        </header>

        {/* ── Avisos ─────────────────────────────────────────────────────── */}
        <div aria-live="polite">
          {error && (
            <div role="alert" className="mb-5 rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-[13.5px] font-medium text-destructive">
              {error}
            </div>
          )}
        </div>

        {!cargando && !stripeListo && !activo && (
          <div className="mb-5 rounded-xl border border-warning/25 bg-warning/10 px-4 py-3 text-[13.5px] text-warning">
            Todavía no se puede contratar desde aquí: estamos terminando de configurar los pagos por nuestro lado.
            Escríbenos a soporte@tentare.app y lo activamos contigo.
          </div>
        )}

        {enPrueba && trial && (
          <div className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-brand/25 bg-brand/[0.06] px-4 py-3 text-[13.5px]">
            <span className="font-bold text-foreground">
              Te quedan {trial.diasRestantes} {trial.diasRestantes === 1 ? 'día' : 'días'} de prueba
            </span>
            {fecha(trial.finaliza) && (
              <span className="text-muted-foreground">· termina el {fecha(trial.finaliza)}</span>
            )}
          </div>
        )}

        {cargando ? (
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-5 py-8 text-[14px] text-muted-foreground">
            <Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            Cargando tu suscripción…
          </div>
        ) : yaPaga ? (
          /* ── Ya paga ──────────────────────────────────────────────────── */
          <div className="rounded-2xl border border-border bg-card p-6 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Plan actual</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-[26px] font-extrabold tracking-tight text-foreground">
                    {PLAN_INFO[(estado?.plan as Plan) ?? 'BASE'].nombre}
                  </span>
                  <span className="text-[15px] font-semibold text-muted-foreground tabular-nums">
                    {PLAN_INFO[(estado?.plan as Plan) ?? 'BASE'].precioMes}€
                  </span>
                </div>
                {/* «al mes, IVA incluido» literal: es la frase que pidió P2-20
                    («es mi factura mensual, quiero ver 149 €, la fecha y la
                    tarjeta») y que su test fija. */}
                <p className="mt-1 text-[13.5px] text-muted-foreground">al mes, IVA incluido · sin permanencia</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1.5 text-[12.5px] font-bold text-success">
                <Check size={14} strokeWidth={3} aria-hidden="true" /> Activa
              </span>
            </div>

            {fecha(estado?.periodoTermina) && (
              <p className="mt-4 border-t border-border pt-4 text-[13.5px] text-muted-foreground">
                {primerCobro ? 'Primer cobro el ' : 'Próximo cobro el '}
                <strong className="text-foreground">{fecha(estado?.periodoTermina)}</strong>
              </p>
            )}

            {esPropietaria ? (
              <>
                <button
                  onClick={abrirPortal}
                  disabled={accion === 'portal'}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3.5 text-[15px] font-bold text-brand-foreground transition-all hover:brightness-110 disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none sm:w-auto"
                >
                  {accion === 'portal' && <Loader2 size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                  {accion === 'portal' ? 'Abriendo…' : 'Facturas, tarjeta y cambio de plan'}
                </button>
                <p className="mt-2 text-[12.5px] text-muted-foreground">Se abre el portal seguro de Stripe.</p>
              </>
            ) : (
              <p className="mt-5 rounded-xl bg-muted px-4 py-3 text-[13.5px] text-muted-foreground">
                Solo la propietaria puede gestionar la facturación.
              </p>
            )}
          </div>
        ) : (
          /* ── Elegir plan ──────────────────────────────────────────────── */
          <>
            <SelectorPlan valor={elegido} onCambio={setElegido} enPrueba={enPrueba} />

            <div className="mt-6 rounded-2xl border border-border bg-card p-4 sm:p-5">
              {esPropietaria ? (
                <>
                  <button
                    onClick={suscribir}
                    disabled={accion !== null || !stripeListo}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3.5 text-[15px] font-bold text-brand-foreground transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
                  >
                    {accion === 'suscribir' && <Loader2 size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                    {accion === 'suscribir' ? 'Redirigiendo a Stripe…' : `Continuar con ${PLAN_INFO[elegido].nombre} · ${PLAN_INFO[elegido].precioMes}€/mes`}
                  </button>
                  <p className="mt-2.5 text-center text-[12.5px] text-muted-foreground">
                    {enPrueba
                      ? `El cobro empieza hoy y tu prueba de ${TRIAL_DIAS} días se da por terminada. Puedes cancelar cuando quieras.`
                      : 'Puedes cancelar cuando quieras desde esta misma pantalla.'}
                  </p>
                </>
              ) : (
                <p className="text-center text-[13.5px] text-muted-foreground">
                  Solo la propietaria puede contratar el plan.
                </p>
              )}
            </div>

            <section className="mt-9">
              <h2 className="mb-3 text-[19px] font-extrabold tracking-tight text-foreground">Qué incluye cada plan</h2>
              <ComparativaPlanes destacado={elegido} />
            </section>

            <p className="mt-6 text-center text-[12.5px] text-muted-foreground">
              Los pagos de tus alumnas van directos a tu cuenta de Stripe — Tentare no cobra comisión sobre ellos.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
