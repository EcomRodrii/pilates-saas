'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useAsync } from '@/lib/student/useAsync';
import { getBonos, getClases, getNombresTiposClase, getPagos, getPlazaFija, getProductosTienda, getRenovacionPorPagar, getReservas } from '@/lib/student/datos';
import { avisoBono, masParaCuota, reservadasConBono } from '@/lib/student/bonos-vista';
import { loQueTengo, tieneAlgo } from '@/lib/student/lo-que-tengo';
import { esCuota } from '@/lib/student/bono-cubre';
import { deudaDeLaCuota, diaMes, hayDeudaQueNoSePagaAqui, porPagarEnLaApp, subtituloTienda, textoRecuperaciones } from '@/lib/student/mi-plan-vista';
import { pagosPendientes } from '@/lib/student/pagos-agrupados';
import { euros, hoyISO } from '@/lib/student/formato';
import { useAhoraMs } from '@/lib/student/use-ahora';
import { CreditCard } from '@/components/student/domain/CreditCard';
import { TarjetaCuota } from '@/components/student/domain/TarjetaCuota';
import { TarjetaBono } from '@/components/student/domain/TarjetaBono';
import { PagoPendienteCard, usePagarRecibo } from '@/components/student/domain/PagoPendiente';
import { ESTADO_PAGO } from '@/components/student/domain/PaymentItem';
import { useToast } from '@/components/student/ui/Toast';
import { avisoDeRetorno, esperarBonoDePlan } from '@/lib/student/retorno-pago';
import { renovarPlan, CUOTA_EN_PAUSA } from '@/lib/student/pagos-acciones';
import { EmptyState, ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';
import { Ilustracion } from '@/components/student/ui/Ilustracion';
import { Icono } from '@/components/student/ui/Icono';
import { FilaAccion } from '@/components/student/ui/FilaAccion';
import { catalogo, invalidarCatalogo } from '@/lib/student/catalogo';
import { clavePublicableStripe } from '@/lib/student/comprar';
import { HojaPagarRecibo } from '@/components/student/domain/HojaPagarRecibo';
import { TirarParaActualizar } from '@/components/student/ui/TirarParaActualizar';

// Mi plan (antes «Bonos»; maqueta «Clase fija y bonos, ordenados», aprobada el 6-oct-2026). Responde UNA pregunta:
// «¿qué tengo y cuánto me queda?». En este orden: lo que hay que pagar, la cuota, el bono, las recuperaciones, y al final
// la tienda, los recibos y lo anterior plegado. La ruta sigue siendo /bonos: la llevan avisos y enlaces ya enviados.
//
// Lo que tiene sale de UN selector (`loQueTengo`, lib/student/lo-que-tengo.ts), el mismo que Inicio y Perfil: «la mensual
// gana» y el saldo de `saldoBono`, en los tres sitios igual.
//
// Lo único que mueve dinero son atajos al checkout de siempre: «Pagar» un recibo (la hoja `HojaPagarRecibo`) y «Renovar
// mi plan». El importe y a quién se cobra los decide el servidor desde el recibo; quién cobra cada recibo también
// (`lib/billing/cobro-recibo-alumna.ts`): lo que va a cobrar el banco no se ofrece a pagar con tarjeta.
//
// ⚠️ Un bono es una fila de `suscripciones` cuyo plan es de tipo BONO o PUNTUAL, y `sesiones_restantes = null` significa
// ILIMITADO, no cero. La proyección ya lo resuelve en `lib/student/mapeo.ts`; esta pantalla solo pinta.
function MiPlan() {
  const { estudio } = useEstudio();
  const href = usePortalHref();

  const cargar = useCallback(async () => {
    // Todo del MISMO payload cacheado.
    const [bonos, plazaFija, renovacion, nombresTipo, reservas, clases, pagos, productos, d] = await Promise.all([
      getBonos(estudio.slug), getPlazaFija(estudio.slug), getRenovacionPorPagar(estudio.slug), getNombresTiposClase(estudio.slug),
      getReservas(estudio.slug), getClases(estudio.slug), getPagos(estudio.slug), getProductosTienda(estudio.slug), catalogo(estudio.slug),
    ]);
    return { bonos, plazaFija, renovacion, nombresTipo, reservas, clases, pagos, productos, stripeAccountId: d?.studio?.stripeAccountId ?? null };
  }, [estudio.slug]);
  const { data: cargado, estado, reintentar, refrescar } = useAsync(cargar, () => false, `alumna:${estudio.slug}:bonos`);
  const actualizar = useCallback(async () => {
    invalidarCatalogo(estudio.slug, { conservarVistas: true });
    await refrescar();
  }, [estudio.slug, refrescar]);
  // El servidor ya leyó el recibo COBRADO: lo que cuelga de él (el plan, la renovación pendiente) ha cambiado.
  const trasPagar = useCallback(() => { invalidarCatalogo(estudio.slug, { conservarVistas: true }); void refrescar(); }, [estudio.slug, refrescar]);

  // ── Retorno de Stripe ─────────────────────────────────────────────────────
  // `?compra=ok` dice que STRIPE cobró, no que el bono esté: lo entrega el webhook y puede tardar. Así que se comprueba
  // antes de felicitar a nadie. El spinner arranca en el PRIMER render (`sp` ya está disponible), no desde un efecto.
  const sp = useSearchParams();
  const { toast } = useToast();
  const aviso = avisoDeRetorno(sp);
  const [confirmando, setConfirmando] = useState(aviso?.comprobar === true);
  const yaTratado = useRef(false);
  useEffect(() => {
    if (yaTratado.current || !aviso) return;
    yaTratado.current = true;
    if (!aviso.comprobar) { toast(aviso.mensaje); return; }
    void esperarBonoDePlan(estudio.slug, sp.get('plan')).then((r) => {
      setConfirmando(false);
      toast(r === 'confirmada'
        ? 'Compra confirmada · ya está en Mi plan ✓'
        // NO es un error: el webhook puede completarla en un minuto.
        : r === 'tardando' ? 'Pago recibido. Aparecerá en Mi plan en unos instantes.' : 'Pago recibido. Mira Mi plan en un momento.');
      reintentar();
    });
  }, [aviso, sp, estudio.slug, toast, reintentar]);

  const stripeAccountId = cargado?.stripeAccountId ?? null;
  const pago = usePagarRecibo({ stripeAccountId, onCambio: trasPagar });

  // «Renovar mi plan» (B-1): prepara el recibo de su plan más reciente y lo paga en la misma hoja. Encendido ANTES del
  // `await`: sin doble toque.
  const router = useRouter();
  const incrustado = !!stripeAccountId && !!clavePublicableStripe();
  const [hojaRenovar, setHojaRenovar] = useState(false);
  const [renovando, setRenovando] = useState(false);
  const renovar = useCallback(async () => {
    if (incrustado) { setHojaRenovar(true); return; }
    setRenovando(true);
    const r = await renovarPlan(estudio.id);
    if (!r.ok) { setRenovando(false); toast(r.error); return; }
    window.location.href = r.url;
  }, [estudio.id, toast, incrustado]);

  const hoy = hoyISO();
  const ahoraMs = useAhoraMs();
  // Plegado, salvo sin nada activo: entonces lo anterior (la cuota en pausa, el bono agotado) es lo que tiene.
  const [verAnterioresElegido, setVerAnteriores] = useState<boolean | null>(null);

  const t = cargado ? loQueTengo({ bonos: cargado.bonos, plazas: cargado.plazaFija.plazas, recuperaciones: cargado.plazaFija.recuperaciones }) : null;
  const porPagar = cargado ? porPagarEnLaApp(cargado.pagos, cargado.renovacion) : [];
  const renovacionSinPagoOnline = cargado?.renovacion && !cargado.renovacion.pagableOnline
    ? { concepto: cargado.renovacion.concepto, importe: cargado.renovacion.importe } : null;
  const nombresTipo = cargado?.nombresTipo ?? {};
  const recup = t ? textoRecuperaciones(t.recuperaciones) : null;
  const tienda = subtituloTienda(cargado?.productos ?? []);
  const mas = t?.cuota && cargado ? masParaCuota(t.cuota, cargado.productos, Object.keys(nombresTipo), nombresTipo) : null;
  const ultimo = cargado?.pagos[0] ?? null;
  const sinNadaActivo = !!t && !t.cuota && !t.bono && t.otros.length === 0;
  const verAnteriores = verAnterioresElegido ?? sinNadaActivo;
  // «Renovar mi plan» reutiliza la renovación pendiente si la hay: con una deuda que cobra otro (el banco, su tarjeta…) o
  // de la que no se sabe quién la cobra, no se ofrece (se pagaría con tarjeta lo que el servidor dice que no).
  const deudaAjena = !!cargado && hayDeudaQueNoSePagaAqui(cargado.pagos, pagosPendientes(cargado.pagos));

  return (
    <StudentShell>
      <TirarParaActualizar onRefrescar={actualizar} />
      <PageHeader titulo="Mi plan" />

      <div className="px stack" style={{ ['--gap' as string]: 'var(--s-3)', marginTop: 14 }}>
        {confirmando && (
          <div className="card card--pad row" role="status" aria-live="polite">
            <span aria-hidden style={{ width: 16, height: 16, borderRadius: 'var(--radius-round)', border: '2px solid var(--border-strong)', borderTopColor: 'var(--accent)', animation: 'apSpin .7s linear infinite' }} />
            <p className="t-small" style={{ fontWeight: 700 }}>Confirmando tu compra con el estudio…</p>
          </div>
        )}
        {estado === 'loading' && !cargado && <ListSkeleton n={2} h={120} />}
        {estado === 'error' && <ErrorState onRetry={reintentar} />}
        {estado === 'offline' && !cargado && <OfflineState />}

        {cargado && t && estado !== 'error' && (
          <>
            {/* Lo primero: lo que hay que pagar. Con un recibo, se paga aquí; con varios, en Recibos. */}
            <PagoPendienteCard
              porPagar={porPagar} hoy={hoy} preparando={pago.preparando} confirmando={pago.confirmando}
              onPagar={(p) => void pago.pagar(p)} hrefRecibos={href('/pagos')}
              renovacionSinPagoOnline={porPagar.length === 0 ? renovacionSinPagoOnline : null}
            />

            {t.cuota && (
              <TarjetaCuota
                slug={estudio.slug} cuota={t.cuota} pagos={cargado.pagos} fijas={t.fijas} nombresTipo={nombresTipo} hoy={hoy}
                hrefClaseFija={`${href('/mis-reservas')}?tab=fija`}
                debe={deudaDeLaCuota(cargado.pagos, t.cuota.id, hoy)}
              />
            )}

            {t.bono && t.saldo && (
              <TarjetaBono
                bono={t.bono} saldo={t.saldo} secundaria={!!t.cuota}
                reservadas={reservadasConBono(cargado.reservas, cargado.clases, t.bono.id, ahoraMs, hoy)}
                nombresTipo={nombresTipo} hoy={hoy}
                hrefDetalle={href(`/bonos/${t.bono.id}`)} hrefMisClases={href('/mis-reservas')}
                aviso={avisoBono(cargado.bonos.filter((b) => b.estado === 'activo'), t.bono, hoy)}
                hrefTienda={tienda ? href('/comprar') : null}
              />
            )}

            {t.otros.length > 0 && (t.cuota || t.bono) && <p className="t-label" style={{ margin: 'var(--s-1) 0 0' }}>{t.cuota && t.bono ? 'Otros' : 'También tienes'}</p>}
            {t.otros.map((b) => <CreditCard key={b.id} bono={b} />)}

            {recup && (
              <section className="card row" data-testid="mi-plan-recuperaciones" style={{ ['--gap' as string]: '12px', padding: '14px 16px' }}>
                <span aria-hidden style={{ width: 40, height: 40, borderRadius: 13, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-soft)', color: 'var(--accent-soft-foreground)' }}>
                  <Icono nombre="racha" tamano={20} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ display: 'block', fontSize: 'var(--t-body)', fontWeight: 800 }}>{recup.titulo}</b>
                  {recup.sub && <span className="t-meta" style={{ display: 'block' }}>{recup.sub}</span>}
                  {/* De cuáles se acuerda uno: las que se ganó. El nombre sale del VÍNCULO con el canje, nunca de
                      `recuperaciones.motivo` (texto libre del mostrador). */}
                  {cargado.plazaFija.recuperaciones.detalle.filter((r) => r.deRecompensa).map((r, i) => (
                    <span key={i} className="t-meta" style={{ display: 'block', color: 'var(--accent)' }}>Una es tu {r.deRecompensa}</span>
                  ))}
                </span>
                <Link href={href('/reservar')} className="btn btn--secondary btn--sm tap no-shrink">Elegir clase</Link>
              </section>
            )}

            {/* Sin nada activo: lo que había (renovar ESE plan), la cuota en pausa, o la recién llegada. */}
            {sinNadaActivo && (
              t.cuotaEnPausa ? (
                <div className="card card--pad stack" data-testid="cuota-en-pausa" style={{ ['--gap' as string]: 'var(--s-2)', alignItems: 'center', textAlign: 'center' }}>
                  <Ilustracion nombre="bono" alto={76} />
                  <p className="t-small" style={{ fontWeight: 800 }}>Tu cuota está en pausa</p>
                  <p className="t-meta">{CUOTA_EN_PAUSA}</p>
                  <Link href={href('/comprar')} className="t-small tap" style={{ fontWeight: 800, color: 'var(--accent)' }}>o comprar un bono distinto</Link>
                </div>
              ) : t.anteriores.length > 0 && !deudaAjena ? (
                // B-1: si ya tuvo un plan, renovar ESE (mismo plan, mismo precio) es más directo que elegir de nuevo.
                <div className="card card--pad stack" style={{ ['--gap' as string]: 'var(--s-2)', alignItems: 'center', textAlign: 'center' }}>
                  <Ilustracion nombre="bono" alto={76} />
                  <p className="t-small" style={{ fontWeight: 800 }}>Sin cuota ni bono activos</p>
                  <p className="t-meta">Lo que tenías está agotado o ha caducado.</p>
                  <button type="button" className="btn btn--primary btn--sm" disabled={renovando} onClick={() => void renovar()}>
                    {renovando ? 'Preparando el pago…' : esCuota(t.anteriores[0]) ? 'Renovar mi cuota' : 'Renovar mi bono'}
                  </button>
                </div>
              ) : !tieneAlgo(t) && porPagar.length === 0 && (
                // La recién llegada: no se le promete nada que su estudio no venda.
                <EmptyState
                  ilustracion="bono"
                  titulo="Aún no tienes cuota ni bono"
                  cuerpo={tienda
                    ? 'Cuando compres una cuota o un bono, aquí verás lo que te queda y hasta cuándo.'
                    : 'Cuando tu estudio te dé una cuota o un bono, aquí verás lo que te queda y hasta cuándo.'}
                  accion={tienda ? 'Ver la tienda' : undefined}
                  href={tienda ? href('/comprar') : undefined}
                />
              )
            )}

            {/* Comprar y pagar: un nombre para cada cosa. */}
            <section className="card" aria-label="Tienda y recibos" style={{ padding: '0 16px', overflow: 'hidden' }}>
              {tienda && !(sinNadaActivo && !t.cuotaEnPausa && t.anteriores.length === 0 && !tieneAlgo(t) && porPagar.length === 0) && (
                <FilaAccion
                  icono="bolsa" titulo="Tienda" href={href('/comprar')} testId={mas && mas.productos.length > 0 ? 'cuota-mas' : 'mi-plan-tienda'}
                  detalle={mas && mas.productos.length > 0 && mas.noIncluye.length > 0 ? `Para lo que tu cuota no incluye: ${mas.noIncluye.join(', ')}` : tienda}
                />
              )}
              <FilaAccion
                icono="recibo" titulo="Recibos" href={href('/pagos')} testId="mi-plan-recibos"
                detalle={ultimo ? [ultimo.fecha ? `Último: ${diaMes(ultimo.fecha)}` : 'Último', euros(ultimo.importe), ESTADO_PAGO[ultimo.estado].txt].join(' · ') : 'Aún no tienes ninguno'}
              />
            </section>

            {t.anteriores.length > 0 && (
              <div className="stack" style={{ ['--gap' as string]: 'var(--s-2)' }}>
                <button
                  type="button" className="tap" aria-expanded={verAnteriores} data-testid="mi-plan-anteriores"
                  onClick={() => setVerAnteriores(!verAnteriores)}
                  style={{ alignSelf: 'center', border: 'none', background: 'none', font: 'inherit', fontSize: 'var(--t-small)', fontWeight: 800, color: 'var(--muted-foreground)', display: 'inline-flex', alignItems: 'center', gap: 4, padding: '8px 4px', cursor: 'pointer' }}
                >
                  Anteriores ({t.anteriores.length})
                  <span aria-hidden style={{ display: 'flex', transform: verAnteriores ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }}><Icono nombre="chevron-derecha" tamano={16} /></span>
                </button>
                {verAnteriores && t.anteriores.map((b) => <CreditCard key={b.id} bono={b} />)}
              </div>
            )}
          </>
        )}
      </div>

      {pago.elemento}
      {hojaRenovar && stripeAccountId && (
        <HojaPagarRecibo
          studioId={estudio.id}
          stripeAccountId={stripeAccountId}
          que={{ renovar: true }}
          titulo={t && esCuota(t.anteriores[0]) ? 'Renovar mi cuota' : 'Renovar mi bono'}
          importe={null}
          onCerrar={() => setHojaRenovar(false)}
          onPagado={trasPagar}
          onSesionCaducada={() => router.push(href('/acceso/login'))}
          enlaceEstudio={href('/mensajes')}
        />
      )}
    </StudentShell>
  );
}

export default function MiPlanPage() {
  // `useSearchParams` exige un límite de Suspense en el App Router.
  return (
    <Suspense fallback={null}>
      <MiPlan />
    </Suspense>
  );
}
