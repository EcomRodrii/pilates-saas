'use client';

import { Suspense, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import Link from 'next/link';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useAsync } from '@/lib/student/useAsync';
import { getPagos, getRenovacionPorPagar } from '@/lib/student/datos';
import { catalogo, invalidarCatalogo } from '@/lib/student/catalogo';
import { lineaRecibo, porPagarEnLaApp, textoCobro, textoVence } from '@/lib/student/mi-plan-vista';
import { usePagarRecibo } from '@/components/student/domain/PagoPendiente';
import { Button } from '@/components/student/ui/Button';
import type { Pago } from '@/lib/student/tipos';
import { PaymentItem } from '@/components/student/domain/PaymentItem';
import { agruparPorMes, pagosPendientes, totalPendiente } from '@/lib/student/pagos-agrupados';
import { euros, hoyISO } from '@/lib/student/formato';
import { useToast } from '@/components/student/ui/Toast';
import { avisoDeRetorno } from '@/lib/student/retorno-pago';
import { esperarReciboPagado } from '@/lib/student/estado-compra';
import { EmptyState, ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';

// Recibos (§A.14; «Recibos» desde el 6-oct-2026, antes «Pagos»). Sus recibos agrupados por mes y, arriba, lo que debe.
//
// Desde el rediseño «Clase fija y bonos, ordenados», lo pendiente SE PAGA AQUÍ, con la misma hoja de Mi plan
// (`HojaPagarRecibo`). Antes esta pantalla era de solo lectura y «Pagar lo pendiente» llevaba a un sitio que no dejaba
// pagar. Quién cobra cada recibo lo decide el SERVIDOR (`lib/billing/cobro-recibo-alumna.ts`): lo que va a cobrar su banco
// o su tarjeta guardada se dice («Lo cobrará tu banco el …») y NO se ofrece pagar con tarjeta — sería cobrarlo dos veces.
//
// ⚠️ Nada optimista: «Pagado» lo dice la hoja cuando el servidor lee el recibo cobrado, y la lista se vuelve a leer.
function Pagos() {
  const { estudio } = useEstudio();
  const href = usePortalHref();
  const cargar = useCallback(async () => {
    const [pagos, renovacion, d] = await Promise.all([getPagos(estudio.slug), getRenovacionPorPagar(estudio.slug), catalogo(estudio.slug)]);
    return { pagos, renovacion, stripeAccountId: d?.studio?.stripeAccountId ?? null };
  }, [estudio.slug]);
  const { data, estado, reintentar, refrescar } = useAsync(cargar, (d) => d.pagos.length === 0);
  const pagos = data?.pagos ?? null;
  const trasPagar = useCallback(() => { invalidarCatalogo(estudio.slug, { conservarVistas: true }); void refrescar(); }, [estudio.slug, refrescar]);
  const pago = usePagarRecibo({ stripeAccountId: data?.stripeAccountId ?? null, onCambio: trasPagar });
  const { marcarConfirmando } = pago;

  const sinCobrar = pagosPendientes(pagos ?? []);
  const pendiente = totalPendiente(pagos ?? []);
  const grupos = agruparPorMes(pagos ?? []);
  const porPagar = data ? porPagarEnLaApp(data.pagos, data.renovacion) : [];
  const hoy = hoyISO();

  // Retorno de Stripe (al guardar una tarjeta, `setup-tarjeta` vuelve aquí; y el pago por la página de Stripe cuando la
  // app no puede montarlo dentro). Un éxito mudo se lee como un fallo, y un «Pagado» sin comprobar, como una mentira.
  const sp = useSearchParams();
  const { toast } = useToast();
  const yaTratado = useRef(false);
  // Solo para dejar de preguntar si se sale de la pantalla (no se reinicia con el efecto de abajo).
  const montada = useRef(true);
  useEffect(() => {
    montada.current = true;
    return () => { montada.current = false; };
  }, []);
  useEffect(() => {
    if (yaTratado.current) return;
    const aviso = avisoDeRetorno(sp);
    if (!aviso) return;
    yaTratado.current = true;
    const recibo = sp.get('recibo');
    if (!aviso.comprobar || !recibo) { toast(aviso.mensaje); return; }
    // Vuelta de Stripe con el recibo: se pregunta al servidor antes de decir «pagado».
    toast(aviso.mensaje);
    void esperarReciboPagado(estudio.id, recibo, () => montada.current).then((r) => {
      if (r.tipo === 'cancelado') return;
      toast(r.tipo === 'pagado' ? 'Pago recibido ✓' : 'Tu pago está hecho; lo estamos confirmando. No vuelvas a pagar.');
      // Sin confirmar todavía: ese recibo deja de ofrecer «Pagar» (no se marca como pagado: eso lo dice el servidor).
      if (r.tipo !== 'pagado') marcarConfirmando(recibo);
      trasPagar();
    });
  }, [sp, toast, estudio.id, trasPagar, marcarConfirmando]);

  /** El botón o la frase de UN recibo que debe. */
  const accionDe = (p: Pago, ancho: boolean) => {
    if (pago.confirmando.has(p.id)) {
      return <p role="status" className="t-meta" data-testid="confirmando-pago" style={{ margin: 0, fontWeight: 700 }}>Confirmando tu pago… No vuelvas a pagar.</p>;
    }
    const pagable = porPagar.find((x) => x.reciboId === p.id);
    if (pagable) {
      return (
        <Button
          full={ancho} size={ancho ? undefined : 'sm'} loading={pago.preparando === p.id} disabled={!!pago.preparando}
          onClick={() => void pago.pagar(pagable)} data-testid="pagar-recibo"
        >
          {pago.preparando === p.id ? 'Preparando el pago…' : `Pagar ${euros(p.importe)}`}
        </Button>
      );
    }
    // Sin entrada del servidor para una deuda: no ha podido comprobar quién la cobra. No se ofrece nada, y se dice.
    const frase = p.cobro ? textoCobro(p.cobro, hoy) : 'No hemos podido comprobar cómo se paga. Vuelve a mirarlo en un momento.';
    return frase ? <p className="t-meta" data-testid="quien-cobra" style={{ margin: 0, fontWeight: 600 }}>{frase}</p> : null;
  };

  return (
    <StudentShell>
      <PageHeader titulo="Recibos" back />

      <div className="px" style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 14 }}>
        {estado === 'loading' && <ListSkeleton n={3} h={66} />}
        {estado === 'error' && <ErrorState onRetry={reintentar} />}
        {estado === 'offline' && !data && (
          <OfflineState cuerpo="Los recibos se mostrarán cuando vuelva la conexión." />
        )}
        {estado === 'empty' && (
          <EmptyState ilustracion="recibo" titulo="Aún no tienes recibos" cuerpo="Aquí aparecerán tus recibos." />
        )}

        {/* La pregunta con la que se entra aquí: ¿debo algo? Y, si se puede, pagarlo aquí mismo. El importe en
            `--t-display`, la cifra que se viene a mirar.
            ⚠️ «Te queda por pagar» y NO «Pendiente de pago»: la fila de cada recibo ya lleva «Pendiente», y dos elementos
            con ese nombre rompieron `student-cabos.spec.ts`. */}
        {data && estado !== 'loading' && pendiente > 0 && (
          <section
            data-testid="total-pendiente" className="card card--pad stack a-up"
            style={{ ['--gap' as string]: 'var(--s-2)', borderColor: 'var(--warning)' }}
          >
            <p className="t-label" style={{ margin: 0 }}>Te queda por pagar</p>
            <p className="t-display t-num">{euros(pendiente)}</p>
            {sinCobrar.length === 1 ? (
              <>
                <p className="t-meta" style={{ margin: 0 }}>{lineaRecibo(sinCobrar[0], hoy)}</p>
                <div style={{ marginTop: 'var(--s-1)' }}>{accionDe(sinCobrar[0], true)}</div>
              </>
            ) : (
              <>
                <p className="t-meta" style={{ margin: 0, fontWeight: 600 }}>{sinCobrar.length} recibos sin cobrar</p>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {sinCobrar.map((p) => (
                    <li key={p.id} data-testid="recibo-por-pagar" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
                      <span style={{ flex: '1 1 160px', minWidth: 0 }}>
                        <b style={{ display: 'block', fontSize: 'var(--t-small)' }}>{p.concepto} · {euros(p.importe)}</b>
                        {p.vence && <span className="t-meta">{textoVence(p.vence, hoy)}</span>}
                      </span>
                      <span style={{ flex: '0 1 auto' }}>{accionDe(p, false)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}

        {data && estado !== 'loading' && grupos.map((g) => (
          <section key={g.clave} style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {/* Sin título cuando el recibo no trae fecha utilizable: un encabezado vacío separa peor que no separar. */}
            {g.titulo && <p className="t-label" style={{ marginTop: 5 }}>{g.titulo}</p>}
            {g.pagos.map((p, i) => <PaymentItem key={p.id} p={p} delay={i * 55} />)}
          </section>
        ))}
        {data && <Link href={href('/bonos')} className="t-small tap" style={{ alignSelf: 'center', marginTop: 6, fontWeight: 800, color: 'var(--accent)' }}>Ver Mi plan</Link>}
      </div>
      {pago.elemento}
    </StudentShell>
  );
}

export default function PagosPage() {
  return (
    <Suspense fallback={null}>
      <Pagos />
    </Suspense>
  );
}
