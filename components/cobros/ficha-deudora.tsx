'use client';

// La ficha de quien debe (decisión 2 de las maquetas aprobadas el 2-oct-2026):
// con qué se le puede cobrar —lo que hoy solo se descubre cuando algo falla— y
// SOLO los botones que funcionan para ella. Al lado de la lista desde 1180 px; en
// un cajón o una hoja por debajo (lo decide quien la pinta).

import { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, Banknote, Building2, CalendarClock, ChevronRight, CreditCard, Link2, Loader2, MessageCircle, X,
} from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import type { MetodoCobro, Recibo } from '@/lib/types';
import { cn, formatEuro } from '@/lib/utils';
import { fechaCorta, colorDeAvatar } from '@/lib/clientas/textos';
import { estadoVisible, notaDeRecibo, type GrupoDeDeuda } from '@/lib/cobros/deudas';
import { TEXTO_PEDIR_TARJETA } from '@/lib/cobros/medio-de-cobro';
import { mensajeDeudaWhatsApp } from '@/lib/cobros/mensaje-deuda';
import { resumenDeLote, textoLoteCobrado } from '@/lib/cobros/marcar-cobrado';
import { enlaceWhatsApp } from '@/lib/decision/mensajes-socia';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { CifraPrivada } from '@/components/ui/cifra-privada';
import { DialogoMetodoCobro } from './dialogo-metodo-cobro';
import { MenuRecibo } from './menu-recibo';
import { PastillaEstado } from './piezas';
import type { AccionesRecibo, AvisosCobros } from './use-acciones-recibo';
import type { DatosCobros } from './use-datos-cobros';

export function FichaDeudora({ grupo, datos, acciones, avisos, onCerrar }: {
  grupo: GrupoDeDeuda<Recibo>;
  datos: DatosCobros;
  acciones: AccionesRecibo;
  avisos: AvisosCobros;
  onCerrar: () => void;
}) {
  const { studio, cobrarRecibosDeUnaClienta } = useStudio();
  const [eligiendo, setEligiendo] = useState(false);
  const [cobrando, setCobrando] = useState(false);
  const socio = datos.socioDe(grupo.socioId);
  const nombre = datos.nombreDe(grupo.socioId);
  const esClienta = grupo.tipo === 'CLIENTA' && !!socio;
  const medio = esClienta ? datos.medioDe(socio.id) : null;

  // «Cobrar con su tarjeta»: solo lo que el servidor cobra así y nadie más va a cobrar.
  const cobrablesSinElla = grupo.recibos.filter(r =>
    (r.estado === 'PENDIENTE' || r.estado === 'FALLIDO')
    && !datos.seCobraSoloEl(r)
    && datos.cuotaDe(r.suscripcionId)?.estado !== 'PAUSADA');
  const totalSinElla = cobrablesSinElla.reduce((t, r) => t + r.importe, 0);
  // Lo que se está cobrando en el datáfono no entra en «Cobrar X €». Un enlace de pago
  // abierto sí: el servidor lo cierra en Stripe antes de cobrar, para que ella no
  // pueda pagarlo también online (y si ya lo pagó, no lo cobra).
  const enMarcha = grupo.recibos.filter(r => !!r.cobroMostradorPi);
  const conEnlaceAbierto = grupo.recibos.some(r => !!r.checkoutSessionId && !r.cobroMostradorPi);
  const aCobrar = grupo.recibos.filter(r => !enMarcha.includes(r));
  const totalACobrar = aCobrar.reduce((t, r) => t + r.importe, 0);

  // Lo que el cobro automático ya va a hacer (o no) con sus recibos.
  const reintentos = grupo.recibos.map(r => ({ r, x: datos.reintentoDe(r) })).filter(({ x }) => x !== null);
  const seCobraSolo = reintentos.find(({ x }) => x?.tipo === 'SE_COBRA_SOLO');
  const noSeCobraSolo = reintentos.find(({ x }) => x?.tipo === 'NO_SE_COBRA_SOLO');

  const mensaje = esClienta ? mensajeDeudaWhatsApp({ nombre, estudio: studio?.nombre ?? 'el estudio', recibos: grupo.recibos }) : null;
  const whatsapp = esClienta && mensaje ? enlaceWhatsApp(socio.telefono, mensaje) : null;

  async function cobrarTodo(metodo: MetodoCobro) {
    if (cobrando) return;
    setCobrando(true);
    const desenlaces = await cobrarRecibosDeUnaClienta(aCobrar.map(r => r.id), metodo);
    setCobrando(false);
    const resumen = resumenDeLote(desenlaces);
    // Nunca «todo cobrado» si fue parcial.
    if (!resumen.ok) { avisos.error(resumen.error); return; }
    // Las penalizaciones anuladas no se cobran: se dice cuáles y cuánto.
    const anulados = new Set(desenlaces.filter(d => d.resultado === 'penalizacion_anulada').map(d => d.reciboId));
    const saltados = aCobrar.filter(r => anulados.has(r.id));
    if (resumen.cobrados === 0 && resumen.yaEstaban > 0 && saltados.length === 0) { avisos.ok('Ya estaba cobrado.'); return; }
    const texto = aCobrar.length === 1 && resumen.cobrados === 1
      ? `Cobro registrado: ${formatEuro(totalACobrar)} de ${nombre}.`
      : `${textoLoteCobrado(resumen, saltados)} · ${nombre}.`;
    if (resumen.cobrados === 0) avisos.error(texto); else avisos.ok(texto);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="ficha-deudora">
      <div className="flex items-start gap-3 border-b border-border p-4">
        {socio
          ? <ProfileAvatar avatarId={socio.avatar} nombre={socio.nombre} apellidos={socio.apellidos} color={colorDeAvatar(`${socio.nombre}${socio.apellidos}`)} size="md" />
          : <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"><Banknote size={18} aria-hidden /></span>}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-semibold text-foreground">{nombre}</p>
          <p className="text-[13.5px] text-muted-foreground">
            Debe <b className="font-semibold tabular-nums text-foreground"><CifraPrivada inline>{formatEuro(grupo.total)}</CifraPrivada></b> · desde el {fechaCorta(grupo.desde, datos.hoy)}
          </p>
          {esClienta && (
            <Link href={`/clientas/${socio.id}`} className="mt-1 inline-flex items-center gap-0.5 text-[12.5px] font-medium text-brand-medio hover:underline">
              Ver su ficha completa <ChevronRight size={12} aria-hidden />
            </Link>
          )}
        </div>
        <button type="button" onClick={onCerrar} aria-label="Cerrar la ficha" className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
          <X size={18} />
        </button>
      </div>

      {/* Margen abajo (y al desplazarse): el botón flotante del panel vive en esa esquina y
          tapaba el ⋯ del último recibo. */}
      <div className="min-h-0 flex-1 scroll-pb-24 space-y-3 overflow-y-auto overscroll-contain p-4 pb-24">
        {esClienta && medio && (
          <div className="rounded-lg border border-border px-3 py-2.5">
            <p className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">Cómo se le puede cobrar</p>
            {medio.estado === 'COMPROBANDO' && <p className="mt-1 text-[13px] text-muted-foreground">Comprobando sus datos de pago…</p>}
            {medio.estado === 'SIN_LEER' && <p className="mt-1 text-[13px] text-muted-foreground">No hemos podido leer sus datos de pago. Recarga la página para verlos.</p>}
            {medio.estado === 'LISTO' && (
              <ul className="mt-1 space-y-0.5">
                {medio.lineas.map(l => (
                  <li key={l} className="flex items-center gap-1.5 text-[13px] text-foreground">
                    {l.startsWith('Domiciliación') ? <Building2 size={15} className="text-muted-foreground" aria-hidden />
                      : l.startsWith('Sin tarjeta') ? <Banknote size={15} className="text-muted-foreground" aria-hidden />
                      : <CreditCard size={15} className="text-muted-foreground" aria-hidden />}
                    {l}
                  </li>
                ))}
              </ul>
            )}
            {medio.estado === 'LISTO' && medio.aviso && (
              <p className="mt-1.5 flex items-start gap-1.5 text-[12.5px] text-foreground">
                <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warning" aria-hidden />
                {medio.aviso}: con la tarjeta caducada no se le puede cobrar sin ella. Pídele una nueva.
              </p>
            )}
            {seCobraSolo?.x?.tipo === 'SE_COBRA_SOLO' && (
              <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                <CalendarClock size={13} aria-hidden />Se reintenta sola {datos.seCobraSoloEl(seCobraSolo.r)} por la mañana
              </p>
            )}
            {noSeCobraSolo?.x?.tipo === 'NO_SE_COBRA_SOLO' && (
              <p className="mt-1.5 flex items-start gap-1.5 text-[12.5px] text-foreground">
                <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warning" aria-hidden />{noSeCobraSolo.x.motivo}
              </p>
            )}
          </div>
        )}

        <div className="grid gap-2">
          <button
            type="button"
            onClick={() => setEligiendo(true)}
            disabled={cobrando || aCobrar.length === 0}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-[14px] font-semibold text-brand-foreground transition-colors hover:brightness-95 disabled:opacity-60"
          >
            {cobrando && <Loader2 size={15} className="animate-spin" aria-hidden />}
            Cobrar <CifraPrivada inline>{formatEuro(totalACobrar)}</CifraPrivada>
          </button>
          <p className="-mt-1 text-[12px] text-muted-foreground">Eliges cómo te paga: efectivo, tarjeta del mostrador, Bizum o transferencia.</p>
          {enMarcha.length > 0 && (
            <p className="-mt-1 flex items-start gap-1.5 text-[12px] text-foreground">
              <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warning" aria-hidden />
              {enMarcha.length === 1 ? '1 recibo se está' : `${enMarcha.length} recibos se están`} cobrando en el datáfono
              {' '}(<CifraPrivada inline>{formatEuro(enMarcha.reduce((t, r) => t + r.importe, 0))}</CifraPrivada>) y no {enMarcha.length === 1 ? 'entra' : 'entran'}: cobrarlo aquí también serían dos cobros.
            </p>
          )}
          {conEnlaceAbierto && (
            <p className="-mt-1 flex items-start gap-1.5 text-[12px] text-muted-foreground">
              <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warning" aria-hidden />
              Tiene abierto un enlace de pago: al cobrarlo aquí se cierra, para que no pueda pagarlo también online.
            </p>
          )}
          {medio?.estado === 'LISTO' && medio.online && cobrablesSinElla.length > 0 && (
            <button
              type="button"
              onClick={() => acciones.cobrarSinEllaTodo(cobrablesSinElla, `Cobrar ${formatEuro(totalSinElla)}`)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-[14px] font-medium text-foreground transition-colors hover:bg-muted"
            >
              <CreditCard size={15} aria-hidden />{medio.online.boton}
            </button>
          )}
          {medio?.estado === 'LISTO' && medio.pedirTarjeta && socio && (
            <button
              type="button"
              onClick={() => acciones.pedirTarjeta(socio.id)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-[14px] font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Link2 size={15} aria-hidden />{TEXTO_PEDIR_TARJETA[medio.pedirTarjeta]}
            </button>
          )}
          {whatsapp && (
            <>
              <a
                href={whatsapp} target="_blank" rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-[14px] font-medium text-foreground transition-colors hover:bg-muted"
              >
                <MessageCircle size={15} aria-hidden />Escribirle por WhatsApp
              </a>
              <p className="-mt-1 rounded-lg bg-muted px-3 py-2 text-[12px] text-muted-foreground text-pretty">«{mensaje}»</p>
            </>
          )}
        </div>

        <div>
          <p className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">{grupo.recibos.length === 1 ? 'Su recibo' : 'Sus recibos'}</p>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {grupo.recibos.map(r => {
              const nota = notaDeRecibo(r, datos.hoy);
              const estado = estadoVisible(r);
              return (
                <li key={r.id} data-recibo={r.id} className="flex items-start gap-2 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-foreground">{r.concepto}</p>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">Vence el {fechaCorta(r.fechaVencimiento, datos.hoy)}{nota ? ` · ${nota}` : ''}</p>
                  </div>
                  <div className={cn('flex flex-col items-end gap-1')}>
                    <span className="text-[13px] font-semibold tabular-nums text-foreground"><CifraPrivada inline>{formatEuro(r.importe)}</CifraPrivada></span>
                    {estado && <PastillaEstado estado={estado} />}
                  </div>
                  <MenuRecibo recibo={r} datos={datos} acciones={acciones} titulo={r.concepto} />
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <DialogoMetodoCobro
        abierto={eligiendo}
        titulo={aCobrar.length === 1 ? '¿Cómo te ha pagado?' : `¿Cómo te ha pagado sus ${aCobrar.length} recibos?`}
        sinEspecificar={false}
        detalle={<>{nombre} — <span className="font-semibold text-foreground">{formatEuro(totalACobrar)}</span></>}
        onCerrar={() => setEligiendo(false)}
        onElegir={m => { setEligiendo(false); if (m) void cobrarTodo(m); }}
      />
    </div>
  );
}
