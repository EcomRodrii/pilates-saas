'use client';

// TEMPORAL — diálogos y paneles de Cobros. No se commitea.
import { AlertTriangle, Banknote, Building2, CalendarClock, Check, CreditCard, Landmark, Search, Smartphone, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, BotonC, Nota, Tarjeta } from './comun';
import { DEUDORAS, eur, totalDeuda } from './datos';

function Dialogo({ titulo, children, ancho = 'w-[460px]', nota }: { titulo: string; children: React.ReactNode; ancho?: string; nota?: React.ReactNode }) {
  return (
    <div className={cn('rounded-2xl border border-border bg-card shadow-xl', ancho)}>
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <p className="text-[16px] font-semibold text-foreground">{titulo}</p>
        {nota}
        <X size={18} className="ml-auto text-muted-foreground" aria-hidden />
      </div>
      <div className="space-y-4 p-5">{children}</div>
    </div>
  );
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-medium text-muted-foreground">{etiqueta}</span>
      <span className="mt-1 flex min-h-10 items-center rounded-lg border border-border bg-background px-3 text-[14px] text-foreground">{children}</span>
    </label>
  );
}

function Metodo({ icono: Icono, texto, activo }: { icono: typeof Banknote; texto: string; activo?: boolean }) {
  return (
    <span className={cn('flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-3 text-[13px] font-medium',
      activo ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-foreground')}>
      <Icono size={15} aria-hidden />{texto}
    </span>
  );
}

/** Un solo «Nuevo cobro» (se va «Nueva factura»): importe con IVA, ¿ya te lo ha pagado?, y cómo. */
export function DialogoNuevoCobro() {
  return (
    <Dialogo titulo="Nuevo cobro" nota={<Nota n={4} />}>
      <Campo etiqueta="Clienta"><span className="flex items-center gap-2"><Search size={14} className="text-muted-foreground" />Alba García Sánchez</span></Campo>
      <div className="grid grid-cols-[1fr_130px] gap-3">
        <Campo etiqueta="Concepto">Bono 5 clases</Campo>
        <Campo etiqueta="Importe (con IVA)"><span className="ml-auto tabular-nums">70,00 €</span></Campo>
      </div>
      <div>
        <p className="text-[12.5px] font-medium text-muted-foreground">¿Ya te lo ha pagado?</p>
        <div className="mt-1 grid grid-cols-2 gap-2">
          <span className="flex min-h-11 items-center justify-center rounded-xl border border-foreground bg-foreground text-[13px] font-medium text-background">Sí, ahora</span>
          <span className="flex min-h-11 items-center justify-center rounded-xl border border-border text-[13px] font-medium text-foreground">Lo paga después</span>
        </div>
      </div>
      <div>
        <p className="text-[12.5px] font-medium text-muted-foreground">Cómo ha pagado</p>
        <div className="mt-1 grid grid-cols-4 gap-2">
          <Metodo icono={Banknote} texto="Efectivo" />
          <Metodo icono={CreditCard} texto="Tarjeta" activo />
          <Metodo icono={Smartphone} texto="Bizum" />
          <Metodo icono={Landmark} texto="Transfer." />
        </div>
      </div>
      <label className="flex items-start gap-2 text-[13px] text-foreground">
        <span className="mt-0.5 flex size-4 items-center justify-center rounded border border-border" />
        <span>Es la renovación de su plan <span className="block text-[12px] text-muted-foreground">Sin marcar es una venta: no toca su plan.</span></span>
      </label>
      <BotonC primario grande className="w-full">Cobrar 70,00 € con tarjeta</BotonC>
      <p className="-mt-2 text-center text-[12px] text-muted-foreground">Se apunta en la caja y, si facturas con Tentare, sale su factura.</p>
    </Dialogo>
  );
}

/** La remesa, con vista previa de lo que entra y lo que no (y por qué). */
export function DialogoRemesa() {
  const entran = [['Nuria Díaz Ruiz', 'Mensual ilimitado — octubre', 89], ['Elena Navarro', 'Mensual 2 días/semana — octubre', 65], ['Irene Martín', 'Mensual ilimitado — octubre', 89], ['Carmen López', 'Mensual ilimitado — octubre', 89], ['Silvia López', 'Bono 10 clases — octubre', 130]] as const;
  return (
    <Dialogo titulo="Preparar recibos para el banco" ancho="w-[560px]" nota={<Nota n={6} />}>
      <p className="text-[13.5px] text-foreground">Entran <b>5 recibos</b> · <b className="tabular-nums">462 €</b>. El banco los cargará el <b>miércoles 7 de octubre</b>.</p>
      <div className="divide-y divide-border rounded-lg border border-border">
        {entran.map(([n, c, i]) => (
          <div key={n} className="flex items-center gap-2 px-3 py-2">
            <Check size={14} className="text-success" aria-hidden />
            <span className="text-[13px] font-medium text-foreground">{n}</span>
            <span className="truncate text-[12.5px] text-muted-foreground">{c}</span>
            <span className="ml-auto text-[13px] font-semibold tabular-nums">{eur(i)}</span>
          </div>
        ))}
      </div>
      <div>
        <p className="text-[12.5px] font-medium text-muted-foreground">Se quedan fuera</p>
        <div className="mt-1 space-y-1 text-[12.5px] text-foreground">
          <p className="flex items-center gap-1.5"><AlertTriangle size={13} className="text-warning" aria-hidden />Cristina Ortega · 89 € · no tiene el mandato firmado</p>
          <p className="flex items-center gap-1.5"><CalendarClock size={13} className="text-muted-foreground" aria-hidden />Raquel Gil · 130 € · se cobra sola con su tarjeta el 5 oct</p>
        </div>
      </div>
      <BotonC primario grande className="w-full">Generar el fichero para el banco</BotonC>
      <p className="-mt-2 text-center text-[12px] text-muted-foreground">Los 5 pasan a «En el banco» hasta que el banco conteste.</p>
    </Dialogo>
  );
}

/** «Seleccionar varias» sobre la propia lista: pregunta el método y cobra una detrás de otra. */
export function BarraSeleccion() {
  const sel = [DEUDORAS[3], DEUDORAS[5], DEUDORAS[6]];
  return (
    <Tarjeta className="w-[760px] overflow-hidden">
      <div className="divide-y divide-border">
        {DEUDORAS.slice(3).map(d => {
          const marcada = sel.includes(d);
          return (
            <div key={d.nombre} className={cn('flex items-center gap-3 px-4 py-2.5', marcada && 'bg-brand/8')}>
              <span className={cn('flex size-5 items-center justify-center rounded border', marcada ? 'border-foreground bg-foreground text-background' : 'border-border')}>{marcada && <Check size={13} />}</span>
              <Avatar ini={d.ini} tono={d.tono} />
              <span className="flex-1 text-[13.5px] font-medium text-foreground">{d.nombre}</span>
              <span className="text-[13.5px] font-semibold tabular-nums">{eur(totalDeuda(d))}</span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3 border-t border-border bg-foreground px-4 py-3 text-background">
        <span className="text-[13.5px] font-medium">3 seleccionadas · <span className="tabular-nums">{eur(sel.reduce((a, d) => a + totalDeuda(d), 0))}</span></span>
        <span className="ml-auto flex items-center gap-2 text-[13px]">
          <span className="text-background/70">Cómo pagan:</span>
          {['Efectivo', 'Tarjeta', 'Bizum', 'Transferencia'].map((m, i) => (
            <span key={m} className={cn('rounded-lg px-2.5 py-1.5', i === 1 ? 'bg-background text-foreground' : 'border border-background/30')}>{m}</span>
          ))}
          <span className="rounded-lg bg-brand px-3 py-1.5 font-semibold text-brand-foreground">Cobrar las 3</span>
        </span>
      </div>
    </Tarjeta>
  );
}

/** Lo que sustituye a «Ver las N suscripciones activas» (botones muertos): cómo se cobrará cada cuota. */
export function ProximasCuotas() {
  const filas = [
    { n: 'Elena Navarro', p: 'Mensual ilimitado', f: '1 nov', como: 'Se cobra sola con su tarjeta', icono: CreditCard },
    { n: 'Nuria Díaz Ruiz', p: 'Mensual ilimitado', f: '1 nov', como: 'Va en la remesa', icono: Building2 },
    { n: 'Cristina Ortega Gil', p: 'Mensual ilimitado', f: '1 nov', como: 'La cobras tú: no tiene tarjeta ni mandato', icono: Banknote },
    { n: 'Laura Martín Díaz', p: 'Mensual ilimitado', f: '1 nov', como: 'Su tarjeta caducó: pídele otra', icono: AlertTriangle, aviso: true },
  ];
  return (
    <Tarjeta className="w-[620px] overflow-hidden">
      <div className="flex items-center gap-2 px-4 pt-3.5 pb-2">
        <p className="text-[13.5px] font-semibold text-foreground">Próximas cuotas · 30 días · 41</p>
        <Nota n={7} />
        <span className="ml-auto text-[12.5px] text-muted-foreground">Cambiar o cancelar un plan, en la ficha de la clienta</span>
      </div>
      <div className="divide-y divide-border">
        {filas.map(f => (
          <div key={f.n} className="grid grid-cols-[1fr_130px_60px_220px] items-center gap-2 px-4 py-2.5 text-[13px]">
            <span className="font-medium text-foreground">{f.n}</span>
            <span className="text-muted-foreground">{f.p}</span>
            <span className="tabular-nums text-muted-foreground">{f.f}</span>
            <span className={cn('flex items-center gap-1.5', f.aviso ? 'text-destructive' : 'text-foreground')}><f.icono size={13} aria-hidden />{f.como}</span>
          </div>
        ))}
      </div>
    </Tarjeta>
  );
}
