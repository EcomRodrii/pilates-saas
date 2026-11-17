'use client';

// «Mi suscripción» (Fase 3 de Billing & Revenue, 17-nov-2026). Lo que la propietaria ve de lo que
// paga a Tentare, LEÍDO DE STRIPE (nada de números nuestros): plan, importe, renovación, tarjeta,
// estado y facturas descargables, y lo que puede hacer. Reglas de cuándo se aplica cada cambio en
// lib/billing/mi-suscripcion/reglas.ts.
//
// Es dinero: ningún cambio se anuncia hasta que el servidor lo confirma, y antes de pagar se
// enseña lo que Stripe dice que se cobrará (vista previa) y cuándo.

import { useCallback, useEffect, useState } from 'react';
import { CreditCard, Download, Loader2 } from 'lucide-react';
import {
  cambiarAPagoAnual, cambiarBaja, gestionarSuscripcion, miSuscripcion, pasarAEstudio, vistaPreviaCambio,
  type MiSuscripcionApi, type VistaPreviaCambio,
} from '@/lib/api-client';
import { ADDONS, PLAN_INFO, type Addon, type Plan } from '@/lib/billing/entitlements';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const dinero = (cents: number, moneda = 'eur') =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: moneda.toUpperCase() }).format(cents / 100);
const dia = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' }) : null;

const TONO_ESTADO: Record<MiSuscripcionApi['estado'], string> = {
  al_dia: 'bg-success/10 text-success',
  prueba: 'bg-muted text-foreground',
  impago: 'bg-warning/10 text-warning',
  baja_programada: 'bg-warning/10 text-warning',
  cancelada: 'bg-muted text-muted-foreground',
  sin_suscripcion: 'bg-muted text-muted-foreground',
};

const ESTADO_FACTURA: Record<string, string> = { paid: 'Pagada', open: 'Pendiente', void: 'Anulada', uncollectible: 'Sin cobrar' };

type Cambio = 'anual' | 'estudio';

export function MiSuscripcion({
  ocultarEstudio = false, onCambio, className,
}: {
  /** Quien paga complementos aparte ya tiene su propio «Pasar a Estudio» (components/billing/complementos). */
  ocultarEstudio?: boolean;
  /** Tras un cambio confirmado por el servidor: la pantalla vuelve a leer su estado. */
  onCambio?: () => void;
  className?: string;
}) {
  const [d, setD] = useState<MiSuscripcionApi | null>(null);
  const [sinDatos, setSinDatos] = useState(false);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelar, setCancelar] = useState(false);
  const [cambio, setCambio] = useState<Cambio | null>(null);
  const [previa, setPrevia] = useState<VistaPreviaCambio | { error: string } | null>(null);
  const [aplicando, setAplicando] = useState(false);

  const cargar = useCallback(async () => {
    const r = await miSuscripcion();
    if ('error' in r) { setSinDatos(true); return; }
    setSinDatos(false); setD(r);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargar(); }, [cargar]);

  // La vista previa se pide al abrir el diálogo, no antes: es una llamada a Stripe.
  useEffect(() => {
    if (!cambio) return;
    let vivo = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrevia(null);
    vistaPreviaCambio(cambio).then((r) => { if (vivo) setPrevia(r); });
    return () => { vivo = false; };
  }, [cambio]);

  if (sinDatos && !d) {
    return <p className={cn('text-[12.5px] text-muted-foreground', className)}>No se ha podido cargar el detalle de tu suscripción. Recarga la página en unos segundos.</p>;
  }
  if (!d) return null;

  const plan = d.plan && d.plan in PLAN_INFO ? PLAN_INFO[d.plan as Plan].nombre : 'Tu plan';
  const complementos = d.complementos.filter((a): a is Addon => a in ADDONS).map((a) => ADDONS[a].nombre);
  const periodo = d.intervalo === 'anual' ? 'al año' : 'al mes';

  async function abrirTarjeta() {
    setError(null); setTrabajando('tarjeta');
    const r = await gestionarSuscripcion('metodo_pago');
    if ('url' in r) { window.location.assign(r.url); return; }
    setError(r.error); setTrabajando(null);
  }

  async function aplicarBaja(accion: 'programar' | 'reactivar') {
    setError(null); setTrabajando(accion);
    const r = await cambiarBaja(accion);
    setTrabajando(null);
    if ('error' in r) { setError(r.error); return; }
    await cargar(); onCambio?.();
  }

  async function aplicarCambio() {
    if (!cambio || aplicando) return;
    setAplicando(true); setError(null);
    const r = cambio === 'anual' ? await cambiarAPagoAnual() : await pasarAEstudio();
    setAplicando(false);
    if ('error' in r) { setError(r.error); setCambio(null); return; }
    setCambio(null);
    await cargar(); onCambio?.();
  }

  const a = d.acciones;
  const verEstudio = a.pasarAEstudio && !ocultarEstudio;
  const previaLista = previa && !('error' in previa) ? previa : null;

  return (
    <section className={cn('rounded-2xl border border-border bg-card p-6 sm:p-7', className)} aria-labelledby="mi-suscripcion-titulo">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 id="mi-suscripcion-titulo" className="text-[16px] font-bold text-foreground">Mi suscripción</h2>
        <span className={cn('inline-flex rounded-full px-3 py-1 text-[12.5px] font-bold', TONO_ESTADO[d.estado])}>{d.estadoTexto}</span>
      </div>

      {d.estado === 'baja_programada' && (
        <p className="mt-4 rounded-xl bg-warning/10 px-4 py-3 text-[13.5px] text-foreground">
          Tu suscripción termina el <strong>{dia(d.accesoHasta) ?? 'final del periodo'}</strong>. Hasta entonces sigues teniendo todo.
          Si cambias de idea, puedes reactivarla sin coste.
        </p>
      )}
      {d.estado === 'impago' && (
        <p className="mt-4 rounded-xl bg-warning/10 px-4 py-3 text-[13.5px] text-foreground">
          Tu último cobro no ha salido. Actualiza la tarjeta y Stripe lo volverá a intentar.
        </p>
      )}

      <dl className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Plan</dt>
          <dd className="mt-1 text-[14.5px] font-semibold text-foreground">
            {plan}{complementos.length > 0 ? ` + ${complementos.join(', ')}` : ''}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Importe</dt>
          <dd className="mt-1 text-[14.5px] font-semibold tabular-nums text-foreground">
            {dinero(d.importePeriodoCents, d.moneda)} <span className="font-normal text-muted-foreground">{periodo}</span>
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {d.estado === 'baja_programada' ? 'Acceso hasta' : 'Próxima renovación'}
          </dt>
          <dd className="mt-1 text-[14.5px] font-semibold text-foreground">{dia(d.estado === 'baja_programada' ? d.accesoHasta : d.proximaRenovacion) ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Método de pago</dt>
          <dd className="mt-1 flex items-center gap-2 text-[14.5px] font-semibold text-foreground">
            <CreditCard size={15} className="text-muted-foreground" aria-hidden="true" />
            {d.metodoPago
              ? `${d.metodoPago.marca.toUpperCase()} •••• ${d.metodoPago.ultimos4}${d.metodoPago.caduca ? ` · caduca ${d.metodoPago.caduca}` : ''}`
              : 'Sin método de pago'}
          </dd>
        </div>
      </dl>

      <div className="mt-6 flex flex-wrap gap-2.5">
        {a.actualizarTarjeta && (
          <Button variant="outline" onClick={() => void abrirTarjeta()} disabled={trabajando !== null}>
            {trabajando === 'tarjeta' && <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
            Actualizar el método de pago
          </Button>
        )}
        {a.cambiarAAnual && <Button variant="outline" onClick={() => setCambio('anual')}>Pasar a pago anual</Button>}
        {verEstudio && <Button variant="outline" onClick={() => setCambio('estudio')}>Pasar a Estudio</Button>}
        {a.reactivar && (
          <Button onClick={() => void aplicarBaja('reactivar')} disabled={trabajando !== null}>
            {trabajando === 'reactivar' && <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
            Reactivar mi suscripción
          </Button>
        )}
        {a.cancelar && <Button variant="ghost" onClick={() => setCancelar(true)} disabled={trabajando !== null}>Cancelar suscripción</Button>}
      </div>
      {d.mensajeSinCambios && (a.cambiarAAnual === false && !a.pasarAEstudio) && (
        <p className="mt-3 text-[12.5px] text-muted-foreground">{d.mensajeSinCambios}</p>
      )}
      {error && <p role="alert" className="mt-3 text-[13px] text-destructive">{error}</p>}
      <p className="mt-3 text-[12.5px] text-muted-foreground">
        Bajar de plan o pasar de anual a mensual se programa para el final del periodo desde «Facturas, tarjeta y cambio de plan», sin ningún cobro.
      </p>

      <div className="mt-6 border-t border-border pt-5">
        <h3 className="text-[13px] font-bold text-foreground">Historial de pagos y facturas</h3>
        {d.facturas.length === 0 ? (
          <p className="mt-2 text-[13px] text-muted-foreground">Todavía no hay ninguna factura.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {d.facturas.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-[13.5px]">
                <span className="text-foreground">
                  {dia(f.fecha) ?? '—'}{f.numero ? <span className="text-muted-foreground"> · {f.numero}</span> : null}
                </span>
                <span className="flex items-center gap-3">
                  <span className="tabular-nums font-semibold text-foreground">{dinero(f.importeCents, f.moneda)}</span>
                  <span className="text-[12px] text-muted-foreground">{ESTADO_FACTURA[f.estado] ?? f.estado}</span>
                  {(f.urlPdf || f.urlFactura) && (
                    <a
                      href={(f.urlPdf ?? f.urlFactura) as string} target="_blank" rel="noopener noreferrer"
                      aria-label={`Descargar la factura ${f.numero ?? ''} del ${dia(f.fecha) ?? ''}`}
                      className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-medio hover:underline"
                    >
                      <Download size={13} aria-hidden="true" /> Descargar
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={cancelar} onOpenChange={setCancelar} destructivo
        titulo="¿Cancelar tu suscripción?"
        descripcion={`Seguirás teniendo todo hasta el ${dia(d.proximaRenovacion) ?? 'final del periodo ya pagado'} y no se te cobrará más. Puedes reactivarla cuando quieras antes de esa fecha.`}
        textoConfirmar="Sí, cancelar al final del periodo" textoCancelar="Mantener mi suscripción"
        onConfirm={() => void aplicarBaja('programar')}
      />

      <Dialog open={cambio !== null} onOpenChange={(v) => { if (!v && !aplicando) setCambio(null); }}>
        <DialogContent className="max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{cambio === 'anual' ? 'Pasar a pago anual' : 'Pasar a Estudio'}</DialogTitle>
            <DialogDescription>
              {cambio === 'anual'
                ? 'Pagas el año por adelantado (dos meses gratis). Se cobra ahora y se te descuenta lo que ya pagaste de este periodo.'
                : 'El cambio es inmediato. La parte proporcional se suma a tu próxima factura.'}
            </DialogDescription>
          </DialogHeader>
          {!previa && <p className="text-[13.5px] text-muted-foreground" aria-live="polite">Calculando lo que pagarías…</p>}
          {previa && 'error' in previa && <p role="alert" className="text-[13.5px] text-destructive">{previa.error}</p>}
          {previaLista && (
            <div aria-live="polite">
              <ul className="divide-y divide-border rounded-xl border border-border text-[13.5px]">
                {previaLista.lineas.map((l, i) => (
                  <li key={i} className="flex justify-between gap-3 px-3 py-2">
                    <span className="text-foreground">{l.descripcion}</span>
                    <span className="tabular-nums text-foreground">{dinero(l.importeCents, d.moneda)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[14px] font-semibold text-foreground">
                {previaLista.cuando === 'ahora'
                  ? <>Pagarás hoy {dinero(previaLista.importeCents, d.moneda)}</>
                  : <>Tu próxima factura{previaLista.fecha ? ` (${dia(previaLista.fecha)})` : ''} será de {dinero(previaLista.importeCents, d.moneda)}</>}
              </p>
            </div>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={aplicando} />}>Volver</DialogClose>
            <Button onClick={() => void aplicarCambio()} disabled={!previaLista || aplicando}>
              {aplicando && <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              {aplicando ? 'Aplicando…' : 'Confirmar el cambio'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
