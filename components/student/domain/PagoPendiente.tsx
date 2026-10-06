'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useToast } from '@/components/student/ui/Toast';
import { Button } from '@/components/student/ui/Button';
import { HojaPagarRecibo } from '@/components/student/domain/HojaPagarRecibo';
import { pagarRenovacion } from '@/lib/student/pagos-acciones';
import { clavePublicableStripe } from '@/lib/student/comprar';
import { euros } from '@/lib/student/formato';
import { textoVence, type PorPagar } from '@/lib/student/mi-plan-vista';

/**
 * Pagar UN recibo desde la app, con la hoja de siempre (`HojaPagarRecibo`): Mi plan y Recibos la comparten.
 *
 * ⚠️ Nada optimista. «Pagado» lo dice la hoja cuando el SERVIDOR lee el recibo cobrado; aquí solo se abre. Sin la clave
 * pública o sin la cuenta de Stripe del estudio, el enlace a la página de Stripe de siempre (`pagarRenovacion`, que va a
 * ESE recibo), con el botón apagado mientras va y vuelve la red: sin doble toque.
 */
export function usePagarRecibo({ stripeAccountId, onCambio }: {
  stripeAccountId: string | null;
  /** Releer lo que dependa de los recibos: tras pagar, y también al cerrar la hoja (un 409 o un pago que aún se confirma). */
  onCambio: () => void;
}) {
  const { estudio } = useEstudio();
  const href = usePortalHref();
  const router = useRouter();
  const { toast } = useToast();
  const incrustado = !!stripeAccountId && !!clavePublicableStripe();
  const [hoja, setHoja] = useState<{ reciboId: string; titulo: string; importe: number } | null>(null);
  const [preparando, setPreparando] = useState<string | null>(null);
  // Recibos con el pago HECHO y sin confirmar todavía por el servidor: en vez de «Pagar» se dice «Confirmando tu pago…».
  // No marca nada como pagado (eso solo lo dice el servidor): solo deja de invitar a pagar dos veces.
  const [confirmando, setConfirmando] = useState<ReadonlySet<string>>(new Set());
  const marcarConfirmando = useCallback((reciboId: string) => setConfirmando((s) => new Set(s).add(reciboId)), []);

  // Volver con «atrás» desde la página de Stripe saca la pantalla de la caché del navegador con el botón en «Preparando el
  // pago…»: se suelta.
  useEffect(() => {
    const alVolver = (e: PageTransitionEvent) => { if (e.persisted) setPreparando(null); };
    window.addEventListener('pageshow', alVolver);
    return () => window.removeEventListener('pageshow', alVolver);
  }, []);

  const pagar = useCallback(async (p: Pick<PorPagar, 'reciboId' | 'concepto' | 'importe'>) => {
    if (preparando || hoja || confirmando.has(p.reciboId)) return;
    if (incrustado) { setHoja({ reciboId: p.reciboId, titulo: p.concepto, importe: p.importe }); return; }
    setPreparando(p.reciboId);
    const r = await pagarRenovacion(estudio.id, p.reciboId);
    if (!r.ok) { setPreparando(null); toast(r.error); onCambio(); return; }
    // Redirección real a Stripe: la pantalla se sustituye por el pago, así que no se apaga `preparando`.
    window.location.href = r.url;
  }, [preparando, hoja, confirmando, incrustado, estudio.id, toast, onCambio]);

  const elemento: ReactNode = hoja && stripeAccountId ? (
    <HojaPagarRecibo
      studioId={estudio.id}
      stripeAccountId={stripeAccountId}
      que={{ reciboId: hoja.reciboId }}
      titulo={hoja.titulo}
      importe={hoja.importe}
      onCerrar={() => { setHoja(null); onCambio(); }}
      onPagado={onCambio}
      onTarda={marcarConfirmando}
      onSesionCaducada={() => router.push(href('/acceso/login'))}
      enlaceEstudio={href('/mensajes')}
    />
  ) : null;

  return { pagar, preparando, confirmando, marcarConfirmando, elemento };
}

/**
 * Lo primero de Mi plan cuando hay algo que pagar (maqueta: «Pago pendiente · Cuota de octubre · 89 € · [Pagar 89 €]»).
 * Con un recibo, se paga aquí mismo; con varios, a Recibos, donde se ve cada uno.
 */
export function PagoPendienteCard({ porPagar, hoy, preparando, confirmando, onPagar, hrefRecibos, renovacionSinPagoOnline }: {
  porPagar: PorPagar[];
  hoy: string;
  preparando: string | null;
  /** Pagados y aún sin confirmar por el servidor (`usePagarRecibo`). */
  confirmando: ReadonlySet<string>;
  onPagar: (p: PorPagar) => void;
  hrefRecibos: string;
  /** Su renovación no se cobra sola y el estudio no cobra online: se dice dónde pagarla. */
  renovacionSinPagoOnline?: { concepto: string; importe: number } | null;
}) {
  const uno = porPagar.length === 1 ? porPagar[0] : null;
  if (porPagar.length === 0 && !renovacionSinPagoOnline) return null;
  const total = porPagar.reduce((s, p) => s + p.importe, 0);
  const esRenovacion = uno?.esRenovacion || (porPagar.length === 0 && !!renovacionSinPagoOnline);
  return (
    <section
      className="card card--pad stack" data-testid={esRenovacion ? 'renovacion-por-pagar' : 'pago-pendiente'}
      aria-label="Pago pendiente"
      style={{ ['--gap' as string]: 'var(--s-2)', borderColor: 'var(--warning)' }}
    >
      <p className="t-label" style={{ margin: 0 }}>{esRenovacion ? 'Renovación pendiente' : 'Pago pendiente'}</p>
      {uno ? (
        <>
          <p className="t-card-title t-num" style={{ margin: 0 }}>{uno.concepto} · {euros(uno.importe)}</p>
          {uno.esRenovacion ? (
            <>
              <p className="t-meta" style={{ margin: 0 }}>No se ha podido cobrar sola porque no tienes una tarjeta guardada.</p>
              <p className="t-meta" style={{ margin: 0 }}>Al pagarla con tarjeta, queda guardada y las próximas renovaciones se cobran solas.</p>
            </>
          ) : uno.vence && <p className="t-meta" style={{ margin: 0 }}>{textoVence(uno.vence, hoy)}</p>}
          {confirmando.has(uno.reciboId) ? (
            <p role="status" className="note note--info" style={{ marginTop: 'var(--s-1)' }}>Confirmando tu pago… No vuelvas a pagar.</p>
          ) : (
            <Button full loading={preparando === uno.reciboId} disabled={!!preparando} onClick={() => onPagar(uno)} style={{ marginTop: 'var(--s-1)' }}>
              {preparando === uno.reciboId ? 'Preparando el pago…' : `Pagar ${euros(uno.importe)}`}
            </Button>
          )}
        </>
      ) : porPagar.length > 1 ? (
        <>
          <p className="t-card-title t-num" style={{ margin: 0 }}>{porPagar.length} recibos · {euros(total)}</p>
          <p className="t-meta" style={{ margin: 0 }}>Págalos en Recibos, uno a uno.</p>
          <Link href={hrefRecibos} className="btn btn--primary btn--full tap" style={{ marginTop: 'var(--s-1)' }}>Ver y pagar</Link>
        </>
      ) : renovacionSinPagoOnline && (
        <>
          <p className="t-card-title t-num" style={{ margin: 0 }}>{renovacionSinPagoOnline.concepto} · {euros(renovacionSinPagoOnline.importe)}</p>
          <p className="t-meta" style={{ margin: 0 }}>No se ha podido cobrar sola porque no tienes una tarjeta guardada. Págala en el estudio.</p>
        </>
      )}
    </section>
  );
}
