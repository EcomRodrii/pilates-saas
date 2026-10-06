'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useAsync } from '@/lib/student/useAsync';
import { getBonos, getClases, getNombresTiposClase, getPagos, getPlazaFija, getProductosTienda, getRenovacionPorPagar, getReservas } from '@/lib/student/datos';
import { MovimientosBono } from '@/components/student/domain/MovimientosBono';
import { BonoHero } from '@/components/student/domain/BonoHero';
import { CuotaHero } from '@/components/student/domain/CuotaHero';
import { avisoBono, esBonoDeSesiones, masParaCuota, reservadasConBono } from '@/lib/student/bonos-vista';
import { hoyISO } from '@/lib/student/formato';
import { useAhoraMs } from '@/lib/student/use-ahora';
import { Icono } from '@/components/student/ui/Icono';
import { PlazaFijaCard } from '@/components/student/domain/PlazaFijaCard';
import { CreditCard } from '@/components/student/domain/CreditCard';
import { useToast } from '@/components/student/ui/Toast';
import { avisoDeRetorno, esperarBonoDePlan } from '@/lib/student/retorno-pago';
import { pagarRenovacion, renovarPlan } from '@/lib/student/pagos-acciones';
import { euros } from '@/lib/student/formato';
import { EmptyState, ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';
import { Ilustracion } from '@/components/student/ui/Ilustracion';
import { catalogo, invalidarCatalogo } from '@/lib/student/catalogo';
import { clavePublicableStripe } from '@/lib/student/comprar';
import { HojaPagarRecibo } from '@/components/student/domain/HojaPagarRecibo';
import { compararPorElegibilidad, esCuota } from '@/lib/student/bono-cubre';
import { CUOTA_EN_PAUSA } from '@/lib/student/pagos-acciones';
import { TirarParaActualizar } from '@/components/student/ui/TirarParaActualizar';

// Bonos (§A.12). Lo único que mueve dinero son dos atajos al checkout de
// siempre: «Renovar mi plan» y «Pagar ahora» de una renovación que no se cobra
// sola. El importe y a quién se cobra los decide el servidor desde el recibo.
//
// ⚠️ Un bono es una fila de `suscripciones` cuyo plan es de tipo BONO o PUNTUAL,
// y `sesiones_restantes = null` significa ILIMITADO, no cero (el mensual). La
// proyección ya lo resuelve en `lib/student/mapeo.ts`; esta pantalla solo pinta.
function Bonos() {
  const { estudio } = useEstudio();
  const href = usePortalHref();

  const cargar = useCallback(async () => {
    // Todo del MISMO payload cacheado: el héroe del bono, la cuota y «Si quieres más» no piden nada más.
    const [bonos, plazaFija, renovacion, nombresTipo, reservas, clases, pagos, productos, d] = await Promise.all([
      getBonos(estudio.slug), getPlazaFija(estudio.slug), getRenovacionPorPagar(estudio.slug), getNombresTiposClase(estudio.slug),
      getReservas(estudio.slug), getClases(estudio.slug), getPagos(estudio.slug), getProductosTienda(estudio.slug), catalogo(estudio.slug),
    ]);
    // La cuenta de Stripe del estudio: con ella se paga DENTRO de la app (RECIBOS); sin ella, como siempre.
    return { bonos, plazaFija, renovacion, nombresTipo, reservas, clases, pagos, productos, stripeAccountId: d?.studio?.stripeAccountId ?? null };
  }, [estudio.slug]);
  const { data: cargado, estado, reintentar, refrescar } = useAsync(
    cargar, (d) => d.bonos.length === 0 && d.plazaFija.recuperaciones.disponibles === 0 && !d.renovacion,
    `alumna:${estudio.slug}:bonos`,
  );
  const actualizar = useCallback(async () => {
    invalidarCatalogo(estudio.slug, { conservarVistas: true });
    await refrescar();
  }, [estudio.slug, refrescar]);
  const data = cargado?.bonos ?? null;
  const plazaFija = cargado?.plazaFija ?? null;
  const renovacion = cargado?.renovacion ?? null;

  // ── Retorno de Stripe ─────────────────────────────────────────────────────
  // `?compra=ok` dice que STRIPE cobró, no que el bono esté: lo entrega el
  // webhook y puede tardar. Así que se comprueba antes de felicitar a nadie.
  const sp = useSearchParams();
  const { toast } = useToast();
  const aviso = avisoDeRetorno(sp);
  // El spinner arranca en el PRIMER render, no desde un efecto: `sp` está
  // disponible durante el render, así que el valor inicial ya es el correcto.
  // Además, poner este `setState` dentro del efecto es justo lo que el lint
  // rechaza (render en cascada) — y aquí ni siquiera hacía falta.
  const [confirmando, setConfirmando] = useState(aviso?.comprobar === true);
  const yaTratado = useRef(false);
  const [renovando, setRenovando] = useState(false);
  const router = useRouter();
  // RECIBOS (6-oct-2026): el pago va dentro de la app, en una hoja con el Checkout de Stripe incrustado. Solo si el
  // estudio tiene Stripe y la app la clave pública; si no, el enlace a la página de Stripe de siempre.
  const stripeAccountId = cargado?.stripeAccountId ?? null;
  const incrustado = !!stripeAccountId && !!clavePublicableStripe();
  const [hojaPago, setHojaPago] = useState<null | { que: { reciboId: string } | { renovar: true }; titulo: string; importe: number | null }>(null);

  // B-1 (auditoría 24ª pasada): "Renovar en un toque" — prepara el recibo de
  // su plan más reciente y la lleva DIRECTA al mismo checkout que ya usa el
  // panel para cobrar un recibo pendiente, sin pantalla intermedia de "¿qué
  // plan quieres?" (es el MISMO plan que ya tenía). Encender `renovando` ANTES
  // del `await` para que no se pueda pulsar dos veces mientras la red va y
  // vuelve (mismo motivo que el resto de escrituras de este portal).
  const renovar = useCallback(async () => {
    if (incrustado) { setHojaPago({ que: { renovar: true }, titulo: 'Renovar mi plan', importe: null }); return; }
    setRenovando(true);
    const r = await renovarPlan(estudio.id);
    if (!r.ok) {
      setRenovando(false);
      toast(r.error);
      return;
    }
    // Redirección real a Stripe: no hay nada más que pintar aquí, así que no
    // se apaga `renovando` — la pantalla se sustituye por el checkout.
    window.location.href = r.url;
  }, [estudio.id, toast, incrustado]);

  // «Pagar ahora» de su renovación pendiente: a ESE recibo, no a «Renovar mi
  // plan» (ver `pagarRenovacion`). Encendido antes del `await`: sin doble toque.
  const [pagando, setPagando] = useState(false);
  const pagar = useCallback(async () => {
    if (!renovacion) return;
    if (incrustado) { setHojaPago({ que: { reciboId: renovacion.reciboId }, titulo: renovacion.concepto, importe: renovacion.importe }); return; }
    setPagando(true);
    const r = await pagarRenovacion(estudio.id, renovacion.reciboId);
    if (!r.ok) {
      setPagando(false);
      toast(r.error);
      return;
    }
    window.location.href = r.url;
  }, [estudio.id, renovacion, toast, incrustado]);

  useEffect(() => {
    if (yaTratado.current || !aviso) return;
    yaTratado.current = true;

    if (!aviso.comprobar) { toast(aviso.mensaje); return; }

    void esperarBonoDePlan(estudio.slug, sp.get('plan')).then((r) => {
      setConfirmando(false);
      toast(r === 'confirmada'
        ? 'Compra confirmada · tu bono ya está aquí ✓'
        : r === 'tardando'
          // NO es un error: el webhook puede completarla en un minuto. Decirle
          // que ha fallado sería peor que decirle que está tardando.
          ? 'Pago recibido. Tu bono aparecerá en unos instantes.'
          : 'Pago recibido. Revisa tus bonos en un momento.');
      reintentar();
    });
  }, [aviso, sp, estudio.slug, toast, reintentar]);

  const activos = data?.filter((b) => b.estado === 'activo') ?? [];
  const otros = data?.filter((b) => b.estado !== 'activo') ?? [];
  // Decisión del fundador (5-oct-2026): sin nada activo y con la cuota EN PAUSA no se ofrece «Renovar mi plan».
  // `renovar-plan` renueva la suscripción ACTIVA o, si no hay, la más reciente, y esa puede ser la cuota en pausa:
  // el botón le cobraría la renovación de algo que el estudio ha parado. Se lo decimos y que lo hable con su estudio.
  const cuotaEnPausa = activos.length === 0 && otros.some((b) => b.estado === 'pausado' && esCuota(b));
  // Los movimientos (P4-D) del bono que el servidor gastaría primero (`compararPorElegibilidad`, como Inicio): solo un
  // bono de sesiones activo; una cuota no gasta sesiones.
  const bonoPrincipal = activos.filter(esBonoDeSesiones).sort(compararPorElegibilidad)[0] ?? null;
  const nombresTipo = cargado?.nombresTipo ?? {};
  const hoy = hoyISO();
  const ahoraMs = useAhoraMs();
  // P4-C y E: la cuota y el bono principal, en grande; lo demás que esté activo, con su tarjeta de siempre.
  const cuotas = activos.filter((b) => esCuota(b));
  const tambien = activos.filter((b) => !esCuota(b) && b.id !== bonoPrincipal?.id);
  const avisoDelBono = avisoBono(activos, bonoPrincipal, hoy);

  return (
    <StudentShell>
      <TirarParaActualizar onRefrescar={actualizar} />
      <PageHeader
        titulo="Bonos"
        sub="Tus sesiones y su caducidad"
        accion={<Link href={href('/pagos')} className="btn btn--secondary btn--sm">Pagos</Link>}
      />

      <div className="px stack" style={{ ['--gap' as string]: 'var(--s-3)', marginTop: 14 }}>
        {confirmando && (
          <div className="card card--pad row" role="status" aria-live="polite">
            <span aria-hidden style={{ width: 16, height: 16, borderRadius: 'var(--radius-round)', border: '2px solid var(--border-strong)', borderTopColor: 'var(--accent)', animation: 'apSpin .7s linear infinite' }} />
            <p className="t-small" style={{ fontWeight: 700 }}>Confirmando tu compra con el estudio…</p>
          </div>
        )}
        {estado === 'loading' && <ListSkeleton n={2} h={96} />}
        {estado === 'error' && <ErrorState onRetry={reintentar} />}
        {estado === 'offline' && !data && <OfflineState />}
        {/* Una renovación que no se cobra sola (sin tarjeta guardada): antes se
            quedaba pendiente sin que nadie se enterase. Va la primera: es lo único
            de esta pantalla que tiene una fecha encima. */}
        {renovacion && estado !== 'loading' && (
          <div className="card card--pad" data-testid="renovacion-por-pagar" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p className="t-label" style={{ margin: 0 }}>Renovación pendiente</p>
            <p style={{ margin: 0, fontSize: 'var(--t-body)', fontWeight: 800 }}>{renovacion.concepto} · {euros(renovacion.importe)}</p>
            <p className="t-meta" style={{ margin: 0 }}>No se ha podido cobrar sola porque no tienes una tarjeta guardada.</p>
            {renovacion.pagableOnline ? (
              <>
                <p className="t-meta" style={{ margin: 0 }}>Al pagarla con tarjeta, queda guardada y las próximas renovaciones se cobran solas.</p>
                <div>
                  <button type="button" className="btn btn--primary btn--sm" disabled={pagando} onClick={() => void pagar()}>
                    {pagando ? 'Preparando el pago…' : 'Pagar ahora'}
                  </button>
                </div>
              </>
            ) : (
              <p className="t-meta" style={{ margin: 0 }}>Págala en el estudio.</p>
            )}
          </div>
        )}
        {estado === 'empty' && (
          <EmptyState
            ilustracion="bono"
            titulo="No tienes ningún bono"
            cuerpo="Compra uno aquí mismo, o reserva clases sueltas desde el horario."
            accion="Comprar un bono"
            href={href('/comprar')}
          />
        )}

        {data && estado === 'ready' && (
          <>
            {activos.length === 0 && (
              cuotaEnPausa ? (
                <div className="card card--pad stack" data-testid="cuota-en-pausa" style={{ ['--gap' as string]: 'var(--s-2)', alignItems: 'center', textAlign: 'center' }}>
                  <Ilustracion nombre="bono" alto={76} />
                  <p className="t-small" style={{ fontWeight: 800 }}>Sin bono activo</p>
                  <p className="t-meta">{CUOTA_EN_PAUSA}</p>
                  <Link href={href('/comprar')} className="t-small tap" style={{ fontWeight: 800, color: 'var(--accent)' }}>o comprar un bono distinto</Link>
                </div>
              ) : otros.length > 0 ? (
                // B-1: si ya tuvo un plan (aunque hoy esté agotado/caducado),
                // ofrecerle renovar ESE plan es más directo que mandarla a
                // "Comprar" a elegir de nuevo entre todos — mismo plan, mismo
                // precio, un toque menos.
                <div className="card card--pad stack" style={{ ['--gap' as string]: 'var(--s-2)', alignItems: 'center', textAlign: 'center' }}>
                  {/* La ilustración del sistema y no un emoji: el emoji lo
                      dibuja el sistema operativo, así que ni toma la tinta del
                      estudio ni se parece al del estado vacío de tres líneas
                      más abajo —que ya usa `ilustracion="bono"` para decir
                      exactamente lo mismo. */}
                  <Ilustracion nombre="bono" alto={76} />
                  <p className="t-small" style={{ fontWeight: 800 }}>Sin bono activo</p>
                  <p className="t-meta">Tus bonos anteriores están agotados o han caducado.</p>
                  <button type="button" className="btn btn--primary btn--sm" disabled={renovando} onClick={renovar}>
                    {renovando ? 'Preparando el pago…' : 'Renovar mi plan'}
                  </button>
                  <Link href={href('/comprar')} className="t-small tap" style={{ fontWeight: 800, color: 'var(--accent)' }}>o comprar un bono distinto</Link>
                </div>
              ) : (
                <EmptyState
                  ilustracion="bono"
                  titulo="Sin bono activo"
                  cuerpo="Tus bonos anteriores están agotados o han caducado."
                  accion="Comprar un bono"
                  href={href('/comprar')}
                />
              )
            )}
            {/* Sus clases fijas viven en «Mis clases → Fijas» (aquí eran un lío, quejas de
                estudios 23-sep). En Bonos solo queda lo que es saldo: las recuperaciones. */}
            {plazaFija && <PlazaFijaCard compacta plazas={[]} recuperaciones={plazaFija.recuperaciones} hrefHorario={href('/reservar')} />}
            {/* Su cuota (P4-E): pagos, lo que incluye, vigencia, «Esta semana», su clase fija, sus recibos y «Si quieres
                más» solo si algo da clases que la cuota no incluye. */}
            {cuotas.map((b) => (
              <CuotaHero
                key={b.id}
                slug={estudio.slug}
                cuota={b}
                pagos={cargado?.pagos ?? []}
                plazas={plazaFija?.plazas ?? []}
                nombresTipo={nombresTipo}
                mas={masParaCuota(b, cargado?.productos ?? [], Object.keys(nombresTipo), nombresTipo)}
                href={href}
              />
            ))}
            {/* El bono que se gasta primero (P4-C), con el anillo; sus movimientos (P4-D) debajo. */}
            {bonoPrincipal && (
              <>
                <BonoHero
                  bono={bonoPrincipal}
                  reservadas={reservadasConBono(cargado?.reservas ?? [], cargado?.clases ?? [], bonoPrincipal.id, ahoraMs, hoy)}
                  nombresTipo={nombresTipo}
                  hoy={hoy}
                  hrefDetalle={href(`/bonos/${bonoPrincipal.id}`)}
                  hrefMisClases={href('/mis-reservas')}
                />
                {avisoDelBono && (
                  <div className="card" data-testid="bono-aviso" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderColor: 'var(--accent)' }}>
                    <span aria-hidden style={{ width: 40, height: 40, borderRadius: 13, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-soft)', color: 'var(--accent-soft-foreground)' }}>
                      <Icono nombre="alerta" tamano={20} />
                    </span>
                    <span className="t-small" style={{ flex: 1, minWidth: 0, fontWeight: 700 }}>{avisoDelBono}</span>
                    <Link href={href('/comprar')} className="btn btn--secondary btn--sm tap">Ver bonos</Link>
                  </div>
                )}
                <MovimientosBono slug={estudio.slug} bonoId={bonoPrincipal.id} compacta hrefTodo={href(`/bonos/${bonoPrincipal.id}`)} />
              </>
            )}
            {tambien.length > 0 && (cuotas.length > 0 || bonoPrincipal) && <p className="t-label" style={{ margin: 'var(--s-2) 0 0' }}>También tienes</p>}
            {tambien.map((b) => <CreditCard key={b.id} bono={b} />)}
            {otros.length > 0 && <p className="t-label" style={{ margin: 'var(--s-2) 0 0' }}>Anteriores</p>}
            {otros.map((b) => <CreditCard key={b.id} bono={b} />)}

            {/* La salida. Con un bono activo, esta pantalla se quedaba en una
                tarjeta y el resto de la pantalla en blanco, sin decir qué se
                puede hacer con lo que acaba de mirar: el siguiente paso natural
                —reservar— estaba a dos toques por el menú y a ninguno desde
                aquí. No se inventa nada; son dos rutas que ya existen. */}
            {activos.length > 0 && (
              <div className="stack" style={{ ['--gap' as string]: 'var(--s-2)', marginTop: 'var(--s-2)', alignItems: 'center' }}>
                <Link href={href('/reservar')} className="btn btn--primary btn--full tap">Reservar una clase</Link>
                <Link href={href('/comprar')} className="t-meta tap" style={{ color: 'var(--accent)', fontWeight: 800 }}>
                  Ver bonos y suscripciones →
                </Link>
              </div>
            )}
          </>
        )}
      </div>
      {hojaPago && stripeAccountId && (
        <HojaPagarRecibo
          studioId={estudio.id}
          stripeAccountId={stripeAccountId}
          que={hojaPago.que}
          titulo={hojaPago.titulo}
          importe={hojaPago.importe}
          onCerrar={() => setHojaPago(null)}
          // El servidor ya leyó el recibo COBRADO: lo que cuelga de él (el plan, la renovación pendiente) ha cambiado.
          onPagado={() => { invalidarCatalogo(estudio.slug, { conservarVistas: true }); void refrescar(); }}
          onSesionCaducada={() => router.push(href('/acceso/login'))}
          enlaceEstudio={href('/mensajes')}
        />
      )}
    </StudentShell>
  );
}

export default function BonosPage() {
  // `useSearchParams` exige un límite de Suspense en el App Router.
  return (
    <Suspense fallback={null}>
      <Bonos />
    </Suspense>
  );
}
