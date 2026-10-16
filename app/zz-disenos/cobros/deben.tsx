'use client';

// TEMPORAL — «Quién me debe» con la ficha de la clienta al lado. No se commitea.
import { AlertTriangle, CalendarClock, CheckSquare, ChevronRight, CreditCard, Landmark, Link2, MessageCircle, MoreHorizontal, RefreshCw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Avatar, BotonC, Buscador, CabeceraCobros, Chip, LineaResumen, MedioPago, Nota, PastillaRecibo, Pestanas, Tarjeta,
} from './comun';
import { DEUDORAS, EN_EL_BANCO, N_RECIBOS, TE_DEBEN, eur, totalDeuda, type Deudora, type EstadoRecibo } from './datos';

const ORDEN: EstadoRecibo[] = ['devuelto-banco', 'no-se-pudo', 'sin-cobrar', 'en-el-banco'];
export const peor = (d: Deudora) => ORDEN.find(e => d.recibos.some(r => r.estado === e))!;

export function FilaDeudora({ d, activa, compacta }: { d: Deudora; activa?: boolean; compacta?: boolean }) {
  return (
    <div className={cn('flex items-center gap-3 px-4 py-3', activa && 'bg-brand/8')}>
      <Avatar ini={d.ini} tono={d.tono} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold text-foreground">{d.nombre}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-muted-foreground">
          <span>{d.recibos.length === 1 ? d.recibos[0].concepto : `${d.recibos.length} recibos`}</span>
          <span>· desde el {d.desde}{d.dias >= 30 && <b className="font-semibold text-destructive"> · {d.dias} días</b>}</span>
          {!compacta && <MedioPago d={d} corto />}
        </p>
        {d.solo && <p className="mt-0.5 flex items-center gap-1 text-[12px] text-muted-foreground"><CalendarClock size={12} aria-hidden />{d.solo}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-[14.5px] font-semibold text-foreground tabular-nums">{eur(totalDeuda(d))}</span>
        <PastillaRecibo estado={peor(d)} />
      </div>
      {!compacta && <BotonC className="ml-2 w-[92px]" grande>Cobrar</BotonC>}
    </div>
  );
}

export function ListaDeudoras({ compacta, activa = 0 }: { compacta?: boolean; activa?: number }) {
  return (
    <Tarjeta className="overflow-hidden">
      <div className="divide-y divide-border">
        {DEUDORAS.map((d, i) => <FilaDeudora key={d.nombre} d={d} activa={i === activa} compacta={compacta} />)}
      </div>
      <div className="flex items-center justify-between border-t border-border bg-muted/40 px-4 py-2.5 text-[12.5px] text-muted-foreground">
        <span>{DEUDORAS.length} clientas · {N_RECIBOS} recibos · la deuda más antigua primero</span>
        <span className="font-semibold text-foreground tabular-nums">{eur(TE_DEBEN)}</span>
      </div>
    </Tarjeta>
  );
}

/** Lo enviado al banco: todavía no es deuda, y ahora tiene salida. */
export function EnElBanco({ nota }: { nota?: React.ReactNode }) {
  const b = EN_EL_BANCO;
  return (
    <Tarjeta className="p-4">
      <div className="flex items-center gap-2">
        <Landmark size={15} className="text-muted-foreground" aria-hidden />
        <p className="text-[13.5px] font-semibold text-foreground">En el banco · 1 recibo · {eur(b.importe)}</p>
        <span className="text-[12.5px] text-muted-foreground">Todavía no es deuda: el banco no ha contestado.</span>
        <span className="ml-auto">{nota}</span>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Avatar ini={b.ini} tono={2} />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-medium text-foreground">{b.nombre}</p>
          <p className="text-[12.5px] text-muted-foreground">{b.concepto} · {b.enviado} · {b.cargo}</p>
        </div>
        <span className="text-[14px] font-semibold tabular-nums text-foreground">{eur(b.importe)}</span>
        <BotonC peque>El banco lo ha cobrado</BotonC>
        <BotonC peque>El banco lo devolvió</BotonC>
      </div>
    </Tarjeta>
  );
}

/** La ficha de la clienta: cómo se le puede cobrar y SOLO lo que puede funcionar. */
export function FichaDeudora({ d, notas }: { d: Deudora; notas?: boolean }) {
  const caducada = !!d.medio.aviso;
  // Con un reintento ya programado lo cobra el sistema, no el mostrador: no se ofrece otra vez la tarjeta.
  const conTarjeta = d.medio.tipo === 'tarjeta' && !caducada && !d.solo;
  const total = totalDeuda(d);
  return (
    <Tarjeta className="w-[400px] shrink-0 overflow-hidden">
      <div className="flex items-start gap-3 border-b border-border p-4">
        <Avatar ini={d.ini} tono={d.tono} grande />
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-semibold text-foreground">{d.nombre}</p>
          <p className="text-[13.5px] text-muted-foreground">Debe <b className="font-semibold text-foreground tabular-nums">{eur(total)}</b> · desde el {d.desde}</p>
          <p className="mt-1 text-[12.5px] font-medium text-brand-medio">Ver su ficha completa <ChevronRight size={12} className="inline" aria-hidden /></p>
        </div>
        <X size={18} className="text-muted-foreground" aria-hidden />
      </div>

      <div className="space-y-3 p-4">
        <div className="rounded-lg border border-border px-3 py-2.5">
          <p className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">Cómo se le puede cobrar</p>
          <p className="mt-1"><MedioPago d={d} /></p>
          {caducada && (
            <p className="mt-1.5 flex items-start gap-1.5 text-[12.5px] text-foreground">
              <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warning" aria-hidden />
              Con la tarjeta caducada no se le puede cobrar online: pídele una nueva.
            </p>
          )}
          {d.solo && <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-muted-foreground"><CalendarClock size={13} aria-hidden />{d.solo}</p>}
        </div>

        <div className="grid gap-2">
          <span className="flex items-center gap-2">
            <BotonC primario grande className="flex-1">Cobrar {eur(total)}</BotonC>
            {notas && <Nota n={2} />}
          </span>
          <p className="-mt-1 text-[12px] text-muted-foreground">Eliges cómo te paga: efectivo, tarjeta del mostrador, Bizum o transferencia.</p>
          {conTarjeta && <BotonC grande icono={CreditCard}>Cobrar con su tarjeta {d.medio.texto.split(' · ')[0].replace('Tarjeta ', '')}</BotonC>}
          {d.medio.tipo !== 'mandato' && (
            <BotonC grande icono={Link2}>{caducada ? 'Pedirle una tarjeta nueva' : d.medio.tipo === 'nada' ? 'Pedirle la tarjeta' : 'Cambiar su tarjeta'}</BotonC>
          )}
          <BotonC grande icono={MessageCircle}>Escribirle por WhatsApp</BotonC>
          <p className="-mt-1 rounded-lg bg-muted px-3 py-2 text-[12px] text-muted-foreground text-pretty">
            «Hola {d.nombre.split(' ')[0]}, te escribo de Pilates Centro: tienes pendiente {eur(total)} ({d.recibos.map(r => r.concepto.split(' — ')[1] ?? r.concepto).join(' y ')}). ¿Te viene bien pasarte por recepción o te mando el enlace para pagar?»
          </p>
        </div>

        <div>
          <p className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">Sus recibos</p>
          <div className="divide-y divide-border rounded-lg border border-border">
            {d.recibos.map(r => (
              <div key={r.concepto} className="flex items-start gap-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-foreground">{r.concepto}</p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">Vence el {r.vence}{r.nota && ` · ${r.nota}`}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[13px] font-semibold tabular-nums">{eur(r.importe)}</span>
                  <PastillaRecibo estado={r.estado} />
                </div>
                <MoreHorizontal size={16} className="mt-0.5 text-muted-foreground" aria-label="Más acciones" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </Tarjeta>
  );
}

/** El ⋯ de un recibo: lo que se puede hacer con ESE recibo, según su estado. */
export function MenuRecibo() {
  const items: [string, string][] = [
    ['Cobrar solo este recibo', 'Eliges el método'],
    ['Reintentar por el banco', 'Lo devolvió el banco: vuelve a la próxima remesa'],
    ['Eliminar el recibo', 'Con su motivo; no se puede si está cobrado o facturado'],
  ];
  return (
    <div className="w-[300px] rounded-xl border border-border bg-card p-1.5 shadow-lg">
      {items.map(([t, n], i) => (
        <div key={t} className={cn('rounded-lg px-3 py-2', i === 0 && 'bg-muted')}>
          <p className={cn('text-[13.5px] font-medium', t.startsWith('Eliminar') ? 'text-destructive' : 'text-foreground')}>{t}</p>
          <p className="text-[12px] text-muted-foreground">{n}</p>
        </div>
      ))}
    </div>
  );
}

export function DisenoDeben() {
  return (
    <div>
      <CabeceraCobros nota={<Nota n={4} />} />
      <LineaResumen nota={<Nota n={1} />} />
      <Pestanas activa="Quién me debe" />
      <div className="mt-4 flex items-start gap-5">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Chip activo n={7}>Todas</Chip>
            <Chip n={1}>Devuelto por el banco</Chip>
            <Chip n={3}>No se pudo cobrar</Chip>
            <Chip n={4}>Sin cobrar</Chip>
            <Chip n={1}><RefreshCw size={12} aria-hidden />Se reintenta solo</Chip>
            <span className="ml-auto flex items-center gap-2">
              <Buscador texto="Buscar clienta" ancho="w-[200px]" />
              <BotonC icono={CheckSquare}>Seleccionar varias</BotonC>
              <Nota n={5} />
            </span>
          </div>
          <div className="relative">
            <span className="absolute -left-3 -top-3 z-10"><Nota n={2} /></span>
            <ListaDeudoras />
          </div>
          <EnElBanco nota={<Nota n={6} />} />
        </div>
        <FichaDeudora d={DEUDORAS[0]} />
      </div>
    </div>
  );
}
