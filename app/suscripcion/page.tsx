'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Check, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { PLAN_ENTITLEMENTS, PLAN_INFO, entitlementsDe, precioMensual, type Plan } from '@/lib/billing/entitlements';
import { Complementos } from '@/components/billing/complementos';
import { usoDelTope } from '@/lib/billing/uso-tope';
import { useEstadosClientas } from '@/lib/clientas/use-estados-clientas';
import { DIAS_VINO_HACE_POCO } from '@/lib/clientas/estado';
import { TRIAL_DIAS } from '@/lib/billing/trial';
import { estadoBilling, iniciarSuscripcion, gestionarSuscripcion, type EstadoBilling } from '@/lib/api-client';
import { AyudaDePantalla } from '@/components/ayuda/AyudaDePantalla';
import { SelectorPlan } from '@/components/planes/selector-plan';
import { ComparativaPlanes } from '@/components/planes/comparativa-planes';
import { ExportarDatosEstudio } from '@/components/billing/exportar-datos-estudio';
import { BorrarDatosEstudio } from '@/components/billing/borrar-datos-estudio';
import { TZ_ESTUDIO } from '@/lib/utils';
import { NombrePlan } from '@/components/planes/nombre-plan';
import { ConsultasDeTentare } from '@/components/asistente/packs-consultas';
import { CabeceraPlanGratis, UsoPlanGratis } from '@/components/billing/plan-gratis';
import { cn } from '@/lib/utils';
import type { OpcionesDePlan } from '@/lib/billing/sede-incluida-en-cadena';
import type { PlanSueltoQueCancelaCadena } from '@/lib/billing/cancelar-suscripcion-anterior';

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

// ⚠️ `trial` es un campo NUEVO de /api/billing/status. Si no viene —un cliente
// con el bundle viejo en caché, o el endpoint todavía sin desplegar— esta
// pantalla NO puede quedarse enseñando el estado equivocado: es la factura del
// estudio. De ahí el respaldo sobre los campos de siempre, que llevan ahí desde
// el principio.
function yaPagaSegun(e: EstadoBilling | null): boolean {
  if (e?.trial) return e.trial.fase === 'SUSCRITO';
  const status = e?.subscriptionStatus ?? null;
  return status === 'active' || status === 'past_due' || status === 'trialing';
}

// Stripe vuelve aquí al acabar el Checkout con `?suscripcion=ok|cancel` (antes
// volvía a Configuración, que no lo leía nadie). «ok» significa que Stripe ha
// ACEPTADO el pago, no que el plan esté activo: eso lo escribe el webhook, que
// puede llegar unos segundos después. Por eso el aviso sale del estado real y
// se vuelve a preguntar un rato, en vez de felicitar a ciegas.
const REINTENTOS_CONFIRMACION = 10;
const ESPERA_CONFIRMACION_MS = 3000;

/**
 * Cuántas cuentan para el tope de su plan: las «Activa», el mismo número que
 * «Clientas activas» del Resumen. Se enseña y no bloquea ninguna alta (decisión
 * del 1-oct-2026, `.claude/tentare-os.md`): aquí no se promete ningún bloqueo.
 */
function UsoDelPlan({ estado, className }: { estado: EstadoBilling | null; className?: string }) {
  const { conteos } = useEstadosClientas();
  // Sin el estado de la suscripción no se sabe el plan, y caer a Base le
  // pintaría «de 150» a un estudio en Estudio, que no tiene límite.
  const uso = estado ? usoDelTope(conteos?.ACTIVA ?? null, entitlementsDe({ plan: estado.plan }).maxSocios) : null;
  if (!uso) return null;
  return (
    <div data-uso-tope className={className}>
      <Link href="/clientas?estado=ACTIVA" className="text-[14px] font-bold text-foreground underline-offset-2 hover:underline tabular-nums">
        {uso.texto}
      </Link>
      <p className="mt-0.5 text-[12.5px] text-muted-foreground text-pretty">
        Cuentan las que pueden reservar ahora (cuota vigente o bono con sesiones) o han venido en los últimos {DIAS_VINO_HACE_POCO} días.
        {uso.excedido && ' Has pasado el tope de tu plan: el plan Estudio no tiene límite.'}
      </p>
    </div>
  );
}

const fechaLarga = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ_ESTUDIO }) : null;

/** «Tu plan Founding Studio, de 29 €/mes, se cancela al activar Cadena…»: lo que cancelará el webhook, dicho antes. */
function fraseSueltoQueSeCancela(s: PlanSueltoQueCancelaCadena): string {
  const info = PLAN_INFO[s.plan];
  const cual = !s.otraSede ? `Tu plan ${info.nombre}`
    : s.nombreSede ? `El plan ${info.nombre} de tu sede «${s.nombreSede}»` : `El plan ${info.nombre} de otra de tus sedes`;
  // Un primer pago aún en curso (un adeudo SEPA) no lo para cancelar: no se promete que deje de cobrarse.
  if (s.pagoEnCurso) {
    return `${cual}, de ${info.precioMes} €/mes, se cancela al activar Cadena. Su primer pago todavía se está procesando `
      + 'y cancelar no lo detiene: si llega a cobrarse, ese mes no se devuelve.';
  }
  const pagado = fechaLarga(s.pagadoHasta);
  return `${cual}, de ${info.precioMes} €/mes, se cancela al activar Cadena: dejas de pagarlo desde ese momento`
    + (pagado ? `, y el mes que ya has pagado (hasta el ${pagado}) no se devuelve.` : '.');
}

/**
 * Contratar Cadena cancela, al confirmarse y sin prorrateo, los planes sueltos de
 * sus sedes (decisión del fundador, 15-oct-2026): se dice ANTES del botón de
 * pagar, y solo si hay alguno. Si el servidor no pudo leerlo (`null`), en
 * condicional; sin el dato (un servidor anterior), nada.
 */
function AvisoAlPasarACadena({ opciones }: { opciones: OpcionesDePlan | null | undefined }) {
  if (opciones === undefined) return null;
  const sueltos = opciones?.sueltosQueCancelaCadena ?? null;
  if (sueltos?.length === 0) return null;
  return (
    <div role="note" aria-label="Al activar Cadena" data-aviso-cadena className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-[13px] leading-relaxed text-foreground">
      {sueltos ? (
        <ul className="space-y-1">
          {sueltos.map((s, i) => <li key={i} className="text-pretty">{fraseSueltoQueSeCancela(s)}</li>)}
        </ul>
      ) : (
        <p className="text-pretty">Si alguna de tus sedes paga ahora Founding Studio o Estudio, ese plan se cancela al activar Cadena, y el mes que ya está pagado no se devuelve.</p>
      )}
    </div>
  );
}

export default function SuscripcionPage() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const [estado, setEstado] = useState<EstadoBilling | null>(null);
  const [cargando, setCargando] = useState(true);
  const [elegido, setElegido] = useState<Plan>('ESTUDIO');
  const [accion, setAccion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Se lee una vez: la página no se pinta hasta tener sesión (ni en el
  // servidor), así que no hay HTML que pueda desajustarse con esto.
  const [retornoCheckout] = useState(() =>
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('suscripcion'));
  const [confirmacionAgotada, setConfirmacionAgotada] = useState(false);

  useEffect(() => {
    if (!loading && !session) router.replace('/login');
  }, [loading, session, router]);

  // Quitado de la URL en cuanto se ha leído: recargar mañana no debe repetir
  // «estamos confirmando tu pago».
  useEffect(() => {
    if (retornoCheckout) window.history.replaceState(null, '', '/suscripcion');
  }, [retornoCheckout]);

  useEffect(() => {
    if (!session) return;
    let vivo = true;
    let intentos = 0;
    let espera: ReturnType<typeof setTimeout> | undefined;
    const cargar = () => estadoBilling().then((e) => {
      if (!vivo) return;
      setEstado(e);
      // Se preselecciona el plan que ya está probando: es el que ha estado
      // usando estos días, y el que menos sorpresas le va a dar.
      // Un estudio gratis que ha pasado un límite: Founding Studio de pago, que
      // es lo que le toca (plan-gratis.ts); dentro del límite, a lo que puede subir.
      // Crecer desde el gratis es Founding Studio de pago, 29 €/mes (fundador, 15-oct-2026), pase lo que pase.
      // Una sede secundaria de una cadena solo puede contratar Cadena (`decidirPlanSuelto`).
      if (e?.opcionesDePlan?.soloCadena) setElegido('CADENA');
      else if (e?.gratis) setElegido('BASE');
      else if (e?.plan === 'BASE' || e?.plan === 'ESTUDIO' || e?.plan === 'CADENA') setElegido(e.plan);
      setCargando(false);
      if (retornoCheckout !== 'ok' || yaPagaSegun(e)) return;
      if (++intentos >= REINTENTOS_CONFIRMACION) { setConfirmacionAgotada(true); return; }
      espera = setTimeout(cargar, ESPERA_CONFIRMACION_MS);
    });
    cargar();
    return () => { vivo = false; clearTimeout(espera); };
  }, [session, retornoCheckout]);

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

  const yaPaga = yaPagaSegun(estado);
  // Un cobro que no salió (Stripe `past_due`) sigue siendo una suscripción viva,
  // pero «Está al día» y «Activa» serían mentira: la tarjeta hay que arreglarla.
  const enImpago = estado?.subscriptionStatus === 'past_due';
  // Founding Studio gratis (lib/billing/plan-gratis.ts): su uso, fase y margen, ya derivados.
  const gratis = estado?.gratis ?? null;
  // Ha pasado un límite del gratis: le toca Founding Studio de pago (plan-gratis.ts).
  const seHaPasado = gratis?.fase === 'MARGEN' || gratis?.fase === 'CERRADO';
  const enPrueba = trial
    ? trial.fase !== 'SUSCRITO' && trial.fase !== 'EXPIRADA' && trial.fase !== 'SIN_PRUEBA'
    : false;
  const pruebaAgotada = trial?.fase === 'EXPIRADA';
  // Prueba de STRIPE (con tarjeta ya dada): todavía no ha pagado ni un euro, así
  // que su fecha es el PRIMER cobro, no el próximo. Son las suscripciones
  // anteriores a que la prueba pasara a ser local — ya no se crean nuevas, pero
  // las que hay siguen vivas y esta pantalla es donde las mira su dueña.
  const primerCobro = !!estado?.enPrueba;
  // Qué se le ofrece y qué cancelaría Cadena (lo deriva /api/billing/status). Una
  // sede secundaria de una cadena: solo Cadena, y se dice por qué.
  const opciones = estado?.opcionesDePlan;
  const soloCadena = opciones?.soloCadena === true;

  const fecha = fechaLarga;

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
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[27px] font-extrabold leading-tight tracking-tight text-foreground sm:text-[34px]">
              {gratis ? 'Tu plan' : yaPaga ? 'Tu suscripción' : pruebaAgotada ? 'Tu prueba ha terminado' : 'Elige tu plan'}
            </h1>
            {/* Esta pantalla vive fuera del panel y no usa PageHeader, así que
                su (i) va a mano y con la ruta escrita: el título cambia según
                el estado ("Elige tu plan", "Tu suscripción") y no siempre dice
                de qué pantalla se trata. */}
            <AyudaDePantalla ruta="/suscripcion" />
          </div>
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
            {gratis
              ? 'Gratis mientras tu estudio crece. Cuando pase de los límites, eliges cómo seguir en un momento.'
              : yaPaga && enImpago
              ? 'Tu último cobro no ha salido. Actualiza la tarjeta en «Facturas, tarjeta y cambio de plan» para ponerte al día.'
              : yaPaga
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
          {retornoCheckout === 'ok' && !cargando && (
            yaPaga ? (
              <div className="mb-5 rounded-xl border border-success/25 bg-success/10 px-4 py-3 text-[13.5px] font-medium text-success">
                Listo: tu suscripción está activa.
              </div>
            ) : confirmacionAgotada ? (
              <div className="mb-5 rounded-xl border border-warning/25 bg-warning/10 px-4 py-3 text-[13.5px] text-warning">
                Stripe ha aceptado el pago, pero su confirmación todavía no nos ha llegado y tu plan aún no aparece activo.
                Vuelve a mirar en unos minutos; si sigue igual, escríbenos a soporte@tentare.app.
              </div>
            ) : (
              <div className="mb-5 flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-[13.5px] text-muted-foreground">
                <Loader2 size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
                Stripe ha aceptado el pago. Estamos esperando su confirmación para activar tu plan.
              </div>
            )
          )}
          {retornoCheckout === 'cancel' && (
            <div className="mb-5 rounded-xl border border-border bg-card px-4 py-3 text-[13.5px] text-muted-foreground">
              Has salido del pago sin terminarlo: no se ha cobrado nada.
            </div>
          )}
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
        ) : gratis ? (
          /* ── Founding Studio gratis, como «Planes» de Bonsai ───────────── */
          <div className="flex flex-col gap-4">
            <CabeceraPlanGratis />
            <UsoPlanGratis gratis={gratis} />
            <section aria-label={seHaPasado ? 'Elige cómo seguir' : 'Cuando quieras crecer'} className="rounded-t-card border border-border bg-card p-5 shadow-t-card sm:p-6">
              <h2 className="text-[16px] font-semibold text-foreground">{seHaPasado ? 'Elige cómo seguir' : 'Cuando quieras crecer'}</h2>
              <p className="text-[12.5px] text-muted-foreground">{seHaPasado ? 'Lo mismo que ya usas, sin límites. Sin permanencia.' : 'Sin permanencia. Si un día pasas de los límites, te lo decimos antes.'}</p>
              {/* Crecer es Founding Studio de pago, 29 €/mes y lo mismo sin límites (fundador, 15-oct-2026:
                  «cuando pasa de esos limites cuesta 29€»): va el primero y elegido, también dentro del gratis.
                  Estudio y Cadena se ofrecen, pero nunca se eligen solos. */}
              <div role="radiogroup" aria-label="Plan" className="mt-4 grid gap-3 sm:grid-cols-3">
                {(['BASE', 'ESTUDIO', 'CADENA'] as const).map(p => (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={elegido === p}
                    onClick={() => setElegido(p)}
                    className={cn(
                      'rounded-[14px] border px-4 py-3.5 text-left transition-colors',
                      elegido === p ? 'border-foreground/60 bg-muted/60' : 'border-border hover:bg-muted/40',
                    )}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-[16px] font-bold text-foreground"><NombrePlan plan={p} /></span>
                      <span className="text-[15px] font-bold tabular-nums text-foreground">{PLAN_INFO[p].precioMes} €<span className="text-[12.5px] font-medium text-muted-foreground">/mes</span></span>
                    </span>
                    <span className="mt-1 block text-[12.5px] text-muted-foreground">
                      {p === 'BASE' ? 'Sin límite de alumnas ni de reservas. Centro de Control, sustituciones automáticas y redacción con IA, aparte.' : p === 'ESTUDIO' ? `Todo lo de Founding Studio con Centro de Control, sustituciones automáticas y redacción con IA incluidos, y ${PLAN_ENTITLEMENTS.ESTUDIO.consultasAsistenteMes} consultas al asistente al mes.` : 'Varias sedes, cada una con lo suyo, en una sola cuenta.'}
                    </span>
                  </button>
                ))}
              </div>
              {elegido === 'CADENA' && <div className="mt-4"><AvisoAlPasarACadena opciones={opciones} /></div>}
              {esPropietaria ? (
                <>
                  <button
                    onClick={suscribir}
                    disabled={accion !== null || !stripeListo}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3.5 text-[15px] font-bold text-brand-foreground transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none sm:w-auto"
                  >
                    {accion === 'suscribir' && <Loader2 size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                    {accion === 'suscribir' ? 'Redirigiendo a Stripe…' : `Pasarme a ${PLAN_INFO[elegido].nombre} · ${PLAN_INFO[elegido].precioMes} €/mes`}
                  </button>
                  <p className="mt-2 text-[12.5px] text-muted-foreground">Tus datos y tu app siguen igual. Puedes cancelar cuando quieras desde esta misma pantalla.</p>
                </>
              ) : (
                <p className="mt-4 rounded-xl bg-muted px-4 py-3 text-[13.5px] text-muted-foreground">Solo la propietaria puede cambiar de plan.</p>
              )}
            </section>
          </div>
        ) : yaPaga ? (
          <>
          {/* ── Ya paga ──────────────────────────────────────────────────── */}
          <div className="rounded-2xl border border-border bg-card p-6 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Plan actual</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-[26px] font-extrabold tracking-tight text-foreground">
                    <NombrePlan plan={(estado?.plan as Plan) ?? 'BASE'} />
                  </span>
                  <span className="text-[15px] font-semibold text-muted-foreground tabular-nums">
                    {precioMensual((estado?.plan as Plan) ?? 'BASE', estado?.complementos?.pagaAparte ? estado.complementos.contratados : [])}€
                  </span>
                </div>
                {/* «al mes, IVA incluido» literal: es la frase que pidió P2-20
                    («es mi factura mensual, quiero ver 149 €, la fecha y la
                    tarjeta») y que su test fija. */}
                <p className="mt-1 text-[13.5px] text-muted-foreground">al mes, IVA incluido · sin permanencia</p>
              </div>
              {enImpago ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/10 px-3 py-1.5 text-[12.5px] font-bold text-warning">
                  Cobro pendiente
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1.5 text-[12.5px] font-bold text-success">
                  <Check size={14} strokeWidth={3} aria-hidden="true" /> Activa
                </span>
              )}
            </div>

            <UsoDelPlan estado={estado} className="mt-4 border-t border-border pt-4" />

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
            {/* Los complementos de Founding, solo para quien los paga aparte. */}
            {estado?.complementos?.pagaAparte && (
              <Complementos
                className="mt-6"
                contratados={estado.complementos.contratados}
                disponibles={estado.complementos.disponibles}
                esPropietaria={esPropietaria}
                onCambio={(addons) => setEstado((e) => (e && e.complementos ? { ...e, complementos: { ...e.complementos, contratados: addons } } : e))}
                onPlanCambiado={() => { void estadoBilling().then((e) => { if (e) setEstado(e); }); }}
              />
            )}
          </>
        ) : (
          /* ── Elegir plan ──────────────────────────────────────────────── */
          <>
            <UsoDelPlan estado={estado} className="mb-4 rounded-xl border border-border bg-card px-4 py-3" />
            {soloCadena && (
              <p data-solo-cadena className="mb-4 max-w-2xl rounded-xl border border-border bg-card px-4 py-3 text-[13.5px] leading-relaxed text-muted-foreground text-pretty">
                <strong className="font-semibold text-foreground">Esta sede forma parte de tu cadena,</strong> así que se contrata con el plan Cadena:
                una sola suscripción para todas tus sedes. Founding Studio y Estudio son para un solo estudio, y solo los puede contratar tu sede principal.
              </p>
            )}
            <SelectorPlan valor={elegido} onCambio={setElegido} enPrueba={enPrueba} planes={soloCadena ? ['CADENA'] : undefined} />

            <div className="mt-6 rounded-2xl border border-border bg-card p-4 sm:p-5">
              {elegido === 'CADENA' && <div className="mb-4"><AvisoAlPasarACadena opciones={opciones} /></div>}
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

        {/* Las consultas del asistente y sus packs. Solo con el producto activo
            (en prueba o pagando): con la prueba agotada no se venden consultas
            de algo que no se puede usar. La sección se oculta sola si quien
            mira no usa el asistente o no está encendido para el estudio. */}
        {!cargando && activo && <ConsultasDeTentare className="mt-9" />}

        {/* Con la prueba agotada el panel entero redirige aquí, así que esta es
            la única puerta a la exportación que prometen los avisos de borrado
            (enlace `/suscripcion#exportar-datos`). Solo para la propietaria:
            la API exige ese rol y a nadie más le serviría el botón. */}
        {!cargando && estado?.esPropietaria === true && (
          <ExportarDatosEstudio id="exportar-datos" className="mt-9 rounded-2xl border border-border bg-card p-5 sm:p-6" />
        )}
        {/* Con la suscripción terminada (contrato de encargo): borrar antes de
            los 30 días. Se pinta solo si el servidor dice que terminó. */}
        {!cargando && estado?.esPropietaria === true && (
          <BorrarDatosEstudio className="mt-4 rounded-2xl border border-destructive/30 bg-card p-5 sm:p-6" />
        )}
      </div>
    </div>
  );
}
