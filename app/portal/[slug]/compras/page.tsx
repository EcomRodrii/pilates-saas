'use client';

import Link from 'next/link';

// COMPRAS — pantalla del prototipo navegable de Claude Design.
//
// La mitad «paso por caja» de lo que era `/mi-plan`: catálogo de bonos y planes,
// método de pago y facturas. El saldo y la plaza fija se quedaron en `/bonos`.
//
// DOS COSAS DEL PROTOTIPO QUE NO SE COPIAN, a propósito:
//
//  1. Allí las tarjetas de producto y las filas de factura son `role="button"`
//     con hover y SIN `onClick`: el lienzo no modela ni el cobro ni el PDF. Aquí
//     los dos existen y funcionan desde antes (`/api/stripe/checkout` deriva el
//     importe del plan en la BD; `abrirFacturaPDF` genera la factura), así que
//     se conectan. Botones muertos, no — la misma decisión que se tomó con los
//     de Apple/Google en el acceso.
//  2. Allí la flecha de volver lleva a Inicio, y como a Compras se llega desde
//     «Renovar bono», volver te dejaba lejos de donde estabas. Aquí vuelve a
//     Bonos, que es su sección padre; y el menú de abajo mantiene Bonos marcado
//     mientras estás aquí, en vez de saltar a Inicio como hacía el lienzo.

import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { useModo } from '@/lib/portal-modo';
import { iniciarDomiciliacionSepa, sepaDisponibleParaEstudio, crearCheckoutStripe, crearCheckoutPlan, crearCheckoutEmbebidoPlan, prepararRenovacionPlan, urlParaGuardarTarjeta, borrarTarjetaPublica } from '@/lib/api-client';
import { abrirFacturaPDF } from '@/lib/factura-pdf';
import { precioPorClase } from '@/lib/estudio-publico';
import { fechaLarga } from '@/lib/bonos-portal';
import { display, micro, sans, texto, radio, transicion, dur, EASE } from '@/lib/portal-design';
import { CheckoutEmbebido } from '@/components/checkout-widget/checkout-embebido';
import { BottomSheet } from '@/components/portal/ui/BottomSheet';
import type { PlanTarifa } from '@/lib/types';

// El portal SIEMPRE tiene `socioId` (ruta gateada por sesión) — a diferencia
// del widget público (`/reservar/[slug]`), que solo migra a embebido cuando
// hay socia autenticada y mantiene el redirect hosted para visitantes. Ver
// «Camino A» en `.claude/tentare-os.md`.
const STRIPE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

// Stripe manda la marca en minúscula (`visa`, `mastercard`) — no se importa
// del kit apagado (`lib/portal-tema/datos.ts`), mismo principio que separa
// `franjaLocalDe` entre motor y portal.
function nombreDeMarca(marca: string): string {
  if (!marca) return 'Tarjeta';
  if (marca.toLowerCase() === 'visa') return 'Visa';
  return marca.charAt(0).toUpperCase() + marca.slice(1);
}

export default function ComprasPage() {
  const { slug } = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const { session } = usePortalAuth();
  const { studio, socios, planesTarifa, recibos, facturas, planMasElegidoId, recargarPublico } = useStudio();
  const { t, noche } = useModo();
  const socioId = session?.socioId ?? null;

  const socia = useMemo(() => socios.find(s => s.id === socioId) ?? null, [socios, socioId]);
  const sepaActiva = socia?.metodoPagoPreferido === 'SEPA' && !!socia?.sepaMandateId;

  // Sin `tarjetaUltimos4` no hay tarjeta que enseñar — `null` en
  // `tarjeta_exp_*` significa "todavía no se le ha preguntado a Stripe", NO
  // "no caduca" (`lib/billing/caducidad-tarjeta.ts`), de ahí que `caduca` sea
  // opcional y nunca motivo para esconder la tarjeta entera.
  const tarjeta = useMemo(() => {
    const ultimos4 = socia?.tarjetaUltimos4 ?? '';
    if (!ultimos4) return null;
    const mes = socia?.tarjetaExpMes;
    const anio = socia?.tarjetaExpAnio;
    return {
      marca: nombreDeMarca(socia?.tarjetaMarca ?? ''),
      ultimos4,
      caduca: mes && anio ? `${String(mes).padStart(2, '0')}/${String(anio).slice(-2)}` : '',
    };
  }, [socia?.tarjetaUltimos4, socia?.tarjetaMarca, socia?.tarjetaExpMes, socia?.tarjetaExpAnio]);

  const [comprando, setComprando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sepaLoading, setSepaLoading] = useState(false);
  const [sepaDisponible, setSepaDisponible] = useState<boolean | null>(null);
  const [tarjetaLoading, setTarjetaLoading] = useState(false);
  const [quitandoTarjeta, setQuitandoTarjeta] = useState(false);
  const [confirmandoQuitarTarjeta, setConfirmandoQuitarTarjeta] = useState(false);
  // Checkout embebido en curso — nunca a la vez que `comprando` (uno abre un
  // PaymentIntent, el otro un redirect hosted; ver `contratar`).
  const [pago, setPago] = useState<{ plan: PlanTarifa; clientSecret: string } | null>(null);
  const [pagoExito, setPagoExito] = useState<PlanTarifa | null>(null);
  const puedeEmbebido = !!studio?.stripeAccountId && !!STRIPE_PUBLISHABLE_KEY;

  // Se comprueba antes de ofrecerlo: si el estudio no tiene SEPA activado, la
  // socia se enteraba ya dentro de Stripe.
  useEffect(() => {
    if (!studio?.id || sepaActiva) return;
    let vivo = true;
    sepaDisponibleParaEstudio(studio.id).then(d => { if (vivo) setSepaDisponible(d); });
    return () => { vivo = false; };
  }, [studio?.id, sepaActiva]);

  const catalogo = useMemo(
    () => planesTarifa.filter(p => p.activo && p.tipo !== 'PUNTUAL'),
    [planesTarifa],
  );

  // Vuelta desde Stripe (`origen: 'portal'` → lib/billing/origen-pago.ts).
  // Antes este camino devolvía a `/cobros`, el panel del STAFF, que además pide
  // login: la socia pagaba y aterrizaba en un "¿Eres del equipo?" sin una sola
  // palabra sobre su pago.
  const avisoPago = useMemo(() => {
    const v = searchParams.get('pago');
    if (v === 'ok') return 'Pago completado. Tu factura aparecerá aquí abajo en cuanto se registre.';
    if (v === 'cancelado') return 'Has salido sin completar el pago. No se te ha cobrado nada.';
    // `setup-tarjeta` redirige aquí con `?tarjeta=ok|cancel`. El guardado real
    // lo confirma el WEBHOOK (`app/api/stripe/webhook/route.ts`), pero esta
    // vuelta es una navegación completa: `useStudio()` ya reconsulta al
    // montar, así que no hace falta forzar una recarga aquí.
    const t = searchParams.get('tarjeta');
    if (t === 'ok') return 'Tarjeta guardada.';
    if (t === 'cancel') return 'No se ha guardado ninguna tarjeta.';
    return null;
  }, [searchParams]);

  const misRecibos = useMemo(() =>
    recibos.filter(r => r.socioId === socioId)
      .sort((a, b) => (b.fechaCobro ?? b.fechaVencimiento).localeCompare(a.fechaCobro ?? a.fechaVencimiento)),
  [recibos, socioId]);

  // ── Dinero: nada se da por hecho ───────────────────────────────────────────
  // Los tres caminos esperan la respuesta y cuentan el fallo. El importe lo
  // deriva SIEMPRE el servidor del plan/recibo real, así que lo que se manda
  // desde aquí no es superficie de fraude.

  async function contratar(plan: PlanTarifa) {
    if (!studio?.id || !socioId || comprando || pago) return;
    setComprando(plan.id);
    setError(null);
    // Camino A (`.claude/tentare-os.md`): el portal SIEMPRE tiene socioId (ruta
    // gateada por sesión), así que migra a embebido sin condición — a
    // diferencia del widget público, que solo lo hace con socia autenticada.
    // Sin `stripeAccountId`/publishableKey configurados, cae al hosted de
    // siempre en vez de abrir un `<CheckoutEmbebido>` que se sabe roto.
    if (!puedeEmbebido) {
      const r = await crearCheckoutPlan({
        studioId: studio.id, planId: plan.id, socioId,
        socioEmail: socia?.email ?? null, socioNombre: socia?.nombre ?? 'Socia',
        origen: 'portal',
      });
      if ('url' in r) { window.location.assign(r.url); return; }
      setError(r.error);
      setComprando(null);
      return;
    }
    const r = await crearCheckoutEmbebidoPlan({
      studioId: studio.id, planId: plan.id, socioId,
      socioEmail: socia?.email ?? null, socioNombre: socia?.nombre ?? 'Socia',
    });
    setComprando(null);
    if ('error' in r) { setError(r.error); return; }
    setPago({ plan, clientSecret: r.clientSecret });
  }

  async function pagarRecibo(reciboId: string) {
    const recibo = misRecibos.find(r => r.id === reciboId);
    if (!studio?.id || !recibo || comprando) return;
    setComprando(reciboId);
    setError(null);
    const r = await crearCheckoutStripe({
      reciboId, socioId: socioId ?? '', studioId: studio.id,
      concepto: recibo.concepto, importe: recibo.importe,
      socioEmail: socia?.email ?? null, socioNombre: socia?.nombre ?? 'Socia',
      origen: 'portal',
    });
    if ('url' in r && r.url) { window.location.assign(r.url); return; }
    setError('error' in r ? r.error : 'No se ha podido iniciar el pago.');
    setComprando(null);
  }

  async function renovar() {
    if (!studio?.id || comprando) return;
    setComprando('renovar');
    setError(null);
    const prep = await prepararRenovacionPlan(studio.id);
    if ('error' in prep) { setError(prep.error); setComprando(null); return; }
    const r = await crearCheckoutStripe({
      reciboId: prep.reciboId, socioId: socioId ?? '', studioId: studio.id,
      concepto: 'Renovación', importe: 0,
      socioEmail: socia?.email ?? null, socioNombre: socia?.nombre ?? 'Socia',
      origen: 'portal',
    });
    if ('url' in r && r.url) { window.location.assign(r.url); return; }
    setError('error' in r ? r.error : 'No se ha podido iniciar el pago.');
    setComprando(null);
  }

  async function domiciliar() {
    if (!studio?.id || !socioId || sepaLoading) return;
    setSepaLoading(true);
    setError(null);
    const r = await iniciarDomiciliacionSepa({ studioId: studio.id, socioId, slug });
    if ('url' in r && r.url) { window.location.assign(r.url); return; }
    setError(('error' in r && r.error) || 'No se ha podido iniciar la domiciliación.');
    setSepaLoading(false);
  }

  // La UI de tarjeta la aloja STRIPE: aquí no se pide nunca un número ni un
  // CVC en nuestro propio DOM — mismo comentario que ya lleva
  // `urlParaGuardarTarjeta` en `lib/api-client.ts`.
  async function anadirTarjeta() {
    if (!studio?.id || !socioId || tarjetaLoading) return;
    setTarjetaLoading(true);
    setError(null);
    const r = await urlParaGuardarTarjeta(studio.id, socioId, slug);
    if ('url' in r) { window.location.assign(r.url); return; }
    setError(r.error);
    setTarjetaLoading(false);
  }

  async function quitarTarjeta() {
    if (!studio?.id || quitandoTarjeta) return;
    setQuitandoTarjeta(true);
    setError(null);
    const err = await borrarTarjetaPublica(studio.id);
    setQuitandoTarjeta(false);
    if (err) { setError(err); return; }
    setConfirmandoQuitarTarjeta(false);
    // Se re-sincroniza para que la pantalla deje de enseñar unos dígitos que
    // ya no existen: el catálogo (`socios`) es quien trae la tarjeta.
    recargarPublico();
  }

  /** El renglón bajo el nombre del plan. Dice lo más útil que se sepa de él. */
  function subtitulo(p: PlanTarifa): string {
    if (p.tipo === 'MENSUAL') return 'Mensual · sin compromiso';
    const porClase = precioPorClase(p);
    if (porClase) return porClase;
    if (p.validezDias) return `Caduca en ${Math.round(p.validezDias / 30)} meses`;
    return p.descripcion ?? `Bono de ${p.sesiones ?? ''} clases`.trim();
  }

  return (
    <div style={{ minHeight: '100%', background: t.bg, color: t.ink }}>
      <div style={{ padding: '62px 24px 24px' }}>
        {/* ⚠️ `<Link>` y no un `<button onClick={router.push}>`, que es lo que
            había: un botón que navega con JavaScript NO HACE NADA hasta que la
            página hidrata. En un móvil lento la socia toca la flecha de volver
            y no pasa nada — la misma sensación de «la app no responde» que ya
            costó otros arreglos. Un enlace navega igual sin JS, y Next lo
            precarga.

            Es también la causa de que `portal-bonos-compras` fallara en la
            PRIMERA pasada de CI y pasara al relanzar: en frío la hidratación
            llega tarde y el clic se pierde. Se arregla en la app, no en el
            test. */}
        <Link
          href={`/portal/${slug}/bonos`}
          aria-label="Volver a Bonos"
          style={{
            width: 38, height: 38, borderRadius: '50%', border: `1px solid ${t.line}`,
            background: noche ? 'rgba(36,40,32,.7)' : 'rgba(255,255,255,.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: sans, fontSize: 13, color: t.ink, cursor: 'pointer',
            transition: transicion(['background'], dur.color),
          }}
        >
          ←
        </Link>

        <h1 style={{ ...display(50), color: t.ink, marginTop: 20 }}>Compras</h1>
        <p style={{ ...display(19, true), color: t.muted, marginTop: 10 }}>Bonos, planes y facturas.</p>

        {/* La vuelta de Stripe. El cobro lo confirma el WEBHOOK, no este
            parámetro, así que el texto no afirma que el dinero haya entrado:
            dice que se ha completado el pago y que la factura aparecerá abajo
            cuando el estudio la registre. Prometer más sería el mismo error de
            anunciar éxito sin haberlo comprobado. */}
        {avisoPago && (
          <p role="status" style={{
            fontFamily: sans, fontSize: 12.5, color: t.ink, background: t.surface2,
            borderRadius: 14, padding: '11px 14px', marginTop: 20,
          }}>
            {avisoPago}
          </p>
        )}

        {error && (
          <p role="alert" style={{
            fontFamily: sans, fontSize: 12.5, color: t.ink, background: t.surface2,
            borderRadius: 14, padding: '11px 14px', marginTop: 20,
          }}>
            {error}
          </p>
        )}

        {/* ── Catálogo ─────────────────────────────────────────────────────── */}
        {catalogo.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 32 }}>
            {catalogo.map(p => {
              // «EL MÁS ELEGIDO» lo decide el SERVIDOR sobre las suscripciones
              // del estudio entero. Calcularlo aquí con las que hay en el
              // navegador —solo las de esta socia— le enseñaría su propia compra
              // repetida como si fuera lo que elige el resto.
              const destacado = planMasElegidoId === p.id;
              const ocupado = comprando === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => void contratar(p)}
                  disabled={comprando != null || pago != null}
                  style={{
                    borderRadius: radio.card, border: 'none', textAlign: 'left',
                    background: destacado ? '#2C352C' : t.surface,
                    padding: '22px 24px', display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', gap: 16,
                    cursor: comprando != null ? 'default' : 'pointer',
                    opacity: comprando != null && !ocupado ? 0.6 : 1,
                    boxShadow: destacado
                      ? '0 20px 40px -22px rgba(34,42,30,.6)'
                      : '0 14px 32px -26px rgba(34,42,30,.5)',
                    transition: `transform ${dur.card}ms ${EASE}, opacity ${dur.color}ms ${EASE}`,
                  }}
                >
                  <span style={{ display: 'block' }}>
                    {destacado && (
                      <span style={{ ...micro(8.5, 0.24, 600), color: 'rgba(246,244,239,.7)', display: 'block' }}>
                        El más elegido
                      </span>
                    )}
                    <span style={{
                      ...display(25), color: destacado ? '#F6F4EF' : t.ink,
                      display: 'block', marginTop: destacado ? 10 : 0,
                    }}>
                      {p.nombre}
                    </span>
                    <span style={{
                      fontFamily: sans, fontSize: 11, display: 'block', marginTop: 8,
                      color: destacado ? 'rgba(246,244,239,.6)' : t.muted,
                    }}>
                      {ocupado ? 'Abriendo el pago…' : subtitulo(p)}
                    </span>
                  </span>
                  <span style={{ ...display(25), color: destacado ? '#F6F4EF' : t.ink, whiteSpace: 'nowrap' }}>
                    {p.precio} €{p.tipo === 'MENSUAL' && (
                      <span style={{ fontFamily: sans, fontSize: 12 }}>/mes</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p style={{ fontFamily: sans, fontSize: 11.5, color: t.muted, marginTop: 32, textWrap: 'pretty' } as React.CSSProperties}>
            Tu estudio todavía no vende bonos por aquí. Pregunta en recepción y te lo activan.
          </p>
        )}

        {/* ── Método de pago ───────────────────────────────────────────────── */}
        <div style={{ ...micro(9.5, 0.24), color: t.micro, marginTop: 36 }}>Método de pago</div>

        {/* Tarjeta guardada. Independiente de si el estudio ofrece SEPA: es el
            método que usa siempre Stripe para bonos/cuotas/renovaciones
            automáticas. Antes esto SOLO existía en el kit apagado
            (`components/portal-tema/`, hoja "pago") — reutiliza aquí las
            mismas funciones ya cableadas para el portal clásico en
            `components/portal/portal-tema-marco.tsx`
            (`urlParaGuardarTarjeta`/`borrarTarjetaPublica`). */}
        <div style={{
          marginTop: 12, borderRadius: radio.card, background: t.surface, padding: '20px 24px',
          boxShadow: '0 14px 32px -26px rgba(34,42,30,.5)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ ...display(21), color: t.ink }}>
                {tarjeta ? `${tarjeta.marca} ···· ${tarjeta.ultimos4}` : 'Añadir tarjeta'}
              </div>
              <div style={{ fontFamily: sans, fontSize: 11, color: t.muted, marginTop: 8, textWrap: 'pretty' } as React.CSSProperties}>
                {tarjeta
                  ? (tarjeta.caduca ? `Caduca ${tarjeta.caduca}` : 'Se usa para tus bonos, cuotas y renovaciones.')
                  : 'Guárdala para pagar bonos y cuotas sin hacerlo a mano cada vez.'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void anadirTarjeta()}
              disabled={tarjetaLoading}
              style={{
                height: 44, padding: '0 18px', borderRadius: 22, flexShrink: 0,
                border: `1px solid ${noche ? 'rgba(243,241,233,.16)' : 'rgba(34,38,31,.16)'}`,
                background: 'none', color: t.ink, ...texto.nota, fontSize: 12.5, fontWeight: 500,
                cursor: 'pointer', transition: transicion(['background'], dur.color),
              }}
            >
              {tarjetaLoading ? 'Abriendo…' : tarjeta ? 'Cambiar' : 'Añadir'}
            </button>
          </div>

          {/* Se dice PARA QUÉ se usa la tarjeta — mismo texto que llevaba la
              hoja del kit (`hojas.tsx:222-224`), sin inventar comportamiento:
              son los cobros que este repo hace de verdad. */}
          {tarjeta && (
            <p style={{ fontFamily: sans, fontSize: 11, color: t.muted, marginTop: 14, textWrap: 'pretty' } as React.CSSProperties}>
              Tu tarjeta se usa para cobrar los bonos y las cuotas que contrates
              con el estudio, y las renovaciones automáticas si tu plan las
              tiene. Nunca guardamos el número de tu tarjeta: lo custodia Stripe.
            </p>
          )}

          {tarjeta && (
            confirmandoQuitarTarjeta ? (
              <>
                {/* Dos toques para quitarla, no uno: es irreversible y tiene
                    consecuencias que la socia no tiene por qué anticipar. */}
                <p style={{ fontFamily: sans, fontSize: 11.5, color: t.ink, marginTop: 14, textWrap: 'pretty' } as React.CSSProperties}>
                  Si la quitas, tendrás que pagar a mano cada bono o cuota, y las
                  renovaciones automáticas dejarán de cobrarse.
                </p>
                <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => void quitarTarjeta()}
                    disabled={quitandoTarjeta}
                    style={{
                      height: 40, padding: '0 16px', borderRadius: 20, border: 'none',
                      background: 'var(--portal-brand)', color: t.accentInk,
                      ...texto.nota, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                    }}
                  >
                    {quitandoTarjeta ? 'Quitando…' : 'Sí, quitar la tarjeta'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmandoQuitarTarjeta(false)}
                    disabled={quitandoTarjeta}
                    style={{
                      height: 40, padding: '0 16px', borderRadius: 20,
                      border: `1px solid ${noche ? 'rgba(243,241,233,.16)' : 'rgba(34,38,31,.16)'}`,
                      background: 'none', color: t.ink, ...texto.nota, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                    }}
                  >
                    Mejor no
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmandoQuitarTarjeta(true)}
                style={{
                  marginTop: 14, background: 'none', border: 'none', padding: 0,
                  fontFamily: sans, fontSize: 11.5, color: t.muted, cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                Quitar esta tarjeta
              </button>
            )
          )}
        </div>

        {(sepaActiva || sepaDisponible !== false) && (
          <div style={{
            marginTop: 12, borderRadius: radio.card, background: t.surface, padding: '20px 24px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
            boxShadow: '0 14px 32px -26px rgba(34,42,30,.5)',
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ ...display(21), color: t.ink }}>
                {sepaActiva ? 'Domiciliación activa' : 'Domiciliar el pago'}
              </div>
              <div style={{ fontFamily: sans, fontSize: 11, color: t.muted, marginTop: 8, textWrap: 'pretty' } as React.CSSProperties}>
                {sepaActiva
                  ? 'Tus recibos se cobran solos de tu cuenta.'
                  : 'Autoriza el adeudo y no vuelvas a pagar a mano.'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void domiciliar()}
              disabled={sepaLoading}
              style={{
                height: 44, padding: '0 18px', borderRadius: 22, flexShrink: 0,
                border: `1px solid ${noche ? 'rgba(243,241,233,.16)' : 'rgba(34,38,31,.16)'}`,
                background: 'none', color: t.ink, ...texto.nota, fontSize: 12.5, fontWeight: 500,
                cursor: 'pointer', transition: transicion(['background'], dur.color),
              }}
            >
              {sepaLoading ? 'Abriendo…' : sepaActiva ? 'Cambiar' : 'Domiciliar'}
            </button>
          </div>
        )}

        {/* ── Facturas ─────────────────────────────────────────────────────── */}
        <div style={{ ...micro(9.5, 0.24), color: t.micro, marginTop: 36 }}>Facturas</div>
        {misRecibos.length === 0 ? (
          <div style={{ padding: '22px 0', borderTop: `1px solid ${t.line}`, borderBottom: `1px solid ${t.line}`, marginTop: 12 }}>
            <p style={{ fontFamily: sans, fontSize: 11.5, color: t.muted }}>
              Aquí aparecerán tus recibos y facturas cuando haya movimientos.
            </p>
          </div>
        ) : (
          <div style={{ marginTop: 12 }}>
            {misRecibos.map((rec, i) => {
              const factura = facturas.find(f => f.reciboId === rec.id);
              // FALLIDO = el dunning agotó todos los reintentos. Antes no caía
              // en ninguna categoría, así que se pintaba SIN etiqueta y SIN
              // botón: indistinguible de un recibo ya pagado. Y el push de pago
              // fallido manda justo a esta pantalla ("Revisa tu método de
              // pago"), o sea que la socia aterrizaba aquí sin nada que revisar
              // ni forma de pagar.
              const fallido = rec.estado === 'FALLIDO';
              const enCurso = rec.estado === 'EN_CURSO';
              const devuelto = rec.estado === 'DEVUELTO';
              // Se nombra el estado siempre que no sea «pagado».
              const pendiente = rec.estado === 'PENDIENTE' || enCurso || fallido;
              // EN_CURSO no lleva botón: hay un adeudo SEPA en vuelo y el
              // servidor contesta 409 a cualquier intento de volver a pagarlo,
              // así que ofrecerlo era ofrecer un botón que siempre dice que no.
              const pagable = rec.estado === 'PENDIENTE' || fallido;
              const etiqueta = devuelto ? 'Devuelto'
                : fallido ? 'Sin pagar'
                : enCurso ? 'En proceso'
                : 'Pendiente';
              return (
                <div
                  key={rec.id}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                    minHeight: 62, padding: '12px 0',
                    borderTop: `1px solid ${t.line}`,
                    borderBottom: i === misRecibos.length - 1 ? `1px solid ${t.line}` : undefined,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: sans, fontSize: 12.5, color: t.ink }}>
                      {fechaLarga(rec.fechaCobro ?? rec.fechaVencimiento)}
                    </div>
                    {/* El estado solo se nombra cuando NO es «pagado»: en una lista
                        de facturas, lo normal no necesita etiqueta. */}
                    {(pendiente || devuelto) && (
                      <div style={{ ...micro(8.5, 0.2, 600), color: t.heroAccent, marginTop: 6 }}>
                        {etiqueta}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
                    <span style={{ fontFamily: sans, fontSize: 12.5, fontWeight: 500, color: t.ink }}>
                      {rec.importe} €
                    </span>
                    {pagable ? (
                      <button
                        type="button"
                        onClick={() => void pagarRecibo(rec.id)}
                        disabled={comprando != null || pago != null}
                        style={{
                          height: 38, padding: '0 14px', borderRadius: 19, border: 'none',
                          background: 'var(--portal-brand)', color: t.accentInk,
                          ...texto.nota, fontSize: 11.5, fontWeight: 500, cursor: 'pointer',
                        }}
                      >
                        {comprando === rec.id ? 'Abriendo…' : 'Pagar'}
                      </button>
                    ) : factura ? (
                      <button
                        type="button"
                        onClick={() => abrirFacturaPDF(
                          factura,
                          {
                            nombre: studio?.nombre ?? 'Tentare',
                            nif: studio?.nif ?? '—',
                            direccion: [studio?.direccion, studio?.ciudad].filter(Boolean).join(', ') || '—',
                          },
                          { telefono: socia?.telefono, email: socia?.email },
                        )}
                        aria-label={`Descargar la factura de ${fechaLarga(rec.fechaCobro ?? rec.fechaVencimiento)}`}
                        style={{
                          ...micro(9, 0.18, 600), color: t.heroAccent, background: 'none',
                          border: 'none', cursor: 'pointer', minHeight: 38, padding: '0 2px',
                        }}
                      >
                        PDF
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Renovar en un toque: se queda accesible aunque no haya recibo
            pendiente, que es el caso de un bono que se acaba de agotar. */}
        <button
          type="button"
          onClick={() => void renovar()}
          disabled={comprando != null || pago != null}
          style={{
            height: 54, width: '100%', borderRadius: radio.botonAlto - 6, marginTop: 24,
            border: `1px solid ${noche ? 'rgba(243,241,233,.16)' : 'rgba(34,38,31,.16)'}`,
            background: 'none', color: t.ink, ...texto.boton, fontSize: 13.5, cursor: 'pointer',
            transition: transicion(['background'], dur.color),
          }}
        >
          {comprando === 'renovar' ? 'Un momento…' : 'Renovar lo que ya tenía'}
        </button>
      </div>

      {/* Preparar el checkout de Stripe es una llamada de red antes de
          redirigir — sin esto, el único aviso era el texto del botón, y el
          resto de la pantalla seguía tocable (podías pulsar otra tarjeta
          mientras la primera ya estaba en vuelo). */}
      {comprando != null && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ background: noche ? 'rgba(18,20,14,0.7)' : 'rgba(246,244,239,0.7)', zIndex: 50 }}
        >
          <div className="w-8 h-8 rounded-full animate-spin" style={{ border: `3px solid ${t.line}`, borderTopColor: t.ink }} />
        </div>
      )}

      {/* Checkout embebido — Camino A. `studio?.stripeAccountId` y
          `STRIPE_PUBLISHABLE_KEY` van garantizados no-nulos aquí: `pago` solo
          se fija tras pasar `puedeEmbebido` en `contratar`. */}
      <BottomSheet open={pago != null} onClose={() => setPago(null)}>
        {pago && studio?.stripeAccountId && STRIPE_PUBLISHABLE_KEY && (
          <CheckoutEmbebido
            t={t}
            plan={pago.plan}
            clientSecret={pago.clientSecret}
            publishableKey={STRIPE_PUBLISHABLE_KEY}
            stripeAccountId={studio.stripeAccountId}
            onExito={() => {
              setPagoExito(pago.plan);
              setPago(null);
              recargarPublico();
            }}
            onCerrar={() => setPago(null)}
          />
        )}
      </BottomSheet>

      {/* Confirmación tras el pago — mismo tono que la de `ListaPlanes`
          (Modo B): la factura la registra el webhook, así que esto confirma
          el COBRO, no da por hecho que la factura ya esté abajo en la lista. */}
      <BottomSheet open={pagoExito != null} onClose={() => setPagoExito(null)}>
        {pagoExito && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontFamily: sans, textAlign: 'center', padding: '12px 0 4px' }}>
            <p style={{ fontSize: 16, fontWeight: 800, color: t.ink }}>¡Pago confirmado!</p>
            <p style={{ fontSize: 13, color: t.muted }}>{pagoExito.nombre} ya está activo en tu cuenta.</p>
            <button type="button" onClick={() => setPagoExito(null)} style={{
              width: '100%', height: 44, borderRadius: radio.botonAlto - 6, border: 'none', fontSize: 13.5, fontWeight: 800,
              background: 'var(--portal-brand)', color: t.accentInk, cursor: 'pointer',
            }}>
              Cerrar
            </button>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
