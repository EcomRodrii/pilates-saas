'use client';

// TEMPORAL — maquetas de Informes. No se commitea.
import { ChevronDown, ChevronLeft, ChevronRight, Compass, Download, FileText, Info, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, BotonC, IconoBoton, Nota, Tarjeta } from './comun';
import { Telefono } from './movil';
import { CLASES, COHORTES, FRANJAS_BARRE, LAS_QUE_MAS_VIENEN, MES, POR_DIA, POR_DIA_ANTES, VENTAS_TIPO, eur } from './datos';

function Periodo({ compacto }: { compacto?: boolean }) {
  return (
    <span className={cn('gap-2', compacto ? 'grid' : 'inline-flex items-center')}>
      <span className="inline-flex items-center gap-0.5 rounded-xl bg-muted p-1">
        {(compacto ? ['Mes', 'Trimestre', 'Año'] : ['Semana', 'Mes', 'Trimestre', 'Año']).map(p => (
          <span key={p} className={cn('rounded-lg px-3 py-1.5 text-[13px] font-medium', p === 'Mes' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground')}>{p}</span>
        ))}
      </span>
      <span className={cn('items-center rounded-lg border border-border bg-card', compacto ? 'flex' : 'inline-flex')}>
        <span className="flex size-9 items-center justify-center text-muted-foreground"><ChevronLeft size={16} /></span>
        <span className={cn('whitespace-nowrap border-x border-border px-3 py-1.5 text-[13px] font-semibold text-foreground', compacto && 'flex-1 text-center')}>Septiembre 2026</span>
        <span className="flex size-9 items-center justify-center text-muted-foreground"><ChevronRight size={16} /></span>
      </span>
    </span>
  );
}

/** El titular: tres hechos con su base. Sin adjetivos y sin «todo va bien». */
function Titular({ compacto }: { compacto?: boolean }) {
  const dif = MES.cobrado - MES.anterior;
  const cifras = [
    { t: 'Dinero', v: eur(MES.cobrado), c: `+${eur(dif)} que agosto (+${((dif / MES.anterior) * 100).toFixed(1).replace('.', ',')} %)`, base: 'Cobrado, neto de lo devuelto' },
    { t: 'Clientas', v: `${MES.activas} activas`, c: `+${MES.activas - MES.activasAntes} que a final de agosto`, base: 'Pueden reservar o han venido en 30 días' },
    { t: 'Clases', v: `${MES.ocupacion} % ocupadas`, c: `+${MES.ocupacion - MES.ocupacionAntes} puntos que agosto`, base: '104 clases · 1.618 plazas ocupadas de 2.247' },
  ];
  return (
    <div>
      <p className={cn('font-semibold tracking-tight text-foreground text-pretty', compacto ? 'text-[17px]' : 'text-[21px]')}>
        Septiembre: {eur(MES.cobrado)} cobrados, {eur(dif)} más que agosto · {MES.activas} clientas activas · clases al {MES.ocupacion} %
      </p>
      {compacto ? (
        <Tarjeta className="mt-3 divide-y divide-border">
          {cifras.map(c => (
            <div key={c.t} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
              <span className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{c.t}</span>
              <span className="text-right"><b className="block text-[17px] font-semibold tabular-nums text-foreground">{c.v}</b><span className="text-[12px] font-medium text-success">{c.c}</span></span>
            </div>
          ))}
        </Tarjeta>
      ) : (
      <div className="mt-3 grid grid-cols-3 gap-3">
        {cifras.map(c => (
          <Tarjeta key={c.t} className="px-4 py-3">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{c.t}</p>
            <p className="mt-0.5 text-[22px] font-semibold tracking-tight tabular-nums text-foreground">{c.v}</p>
            <p className="text-[12.5px] font-medium text-success">{c.c}</p>
            <p className="text-[12px] text-muted-foreground">{c.base}</p>
          </Tarjeta>
        ))}
      </div>
      )}
    </div>
  );
}

function Grafico({ alto = 150 }: { alto?: number }) {
  const max = Math.max(...POR_DIA, ...POR_DIA_ANTES);
  return (
    <div>
      <div className="flex items-end gap-[3px]" style={{ height: alto }}>
        {POR_DIA.map((v, i) => (
          <div key={i} className="relative flex flex-1 items-end" style={{ height: alto }}>
            <span className="absolute inset-x-0 rounded-t-sm border-t-2 border-dashed border-foreground/25" style={{ bottom: `${(POR_DIA_ANTES[i] / max) * 100}%` }} aria-hidden />
            <span className="w-full rounded-t-sm bg-foreground/75" style={{ height: `${(v / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground tabular-nums"><span>1</span><span>8</span><span>15</span><span>22</span><span>30</span></div>
      <p className="mt-1.5 flex items-center gap-3 text-[12px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-3 rounded-sm bg-foreground/75" />Septiembre</span>
        <span className="flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-foreground/35" />Agosto, el mismo día</span>
        <span className="ml-auto">Las cuotas entran a principio de mes</span>
      </p>
    </div>
  );
}

function BloqueDinero({ notas }: { notas?: boolean }) {
  return (
    <Tarjeta className="p-5">
      <div className="flex items-center gap-2">
        <h2 className="text-[16px] font-semibold text-foreground">Dinero · de dónde sale</h2>
        {notas && <Nota n={12} />}
        <span className="ml-auto text-[12.5px] text-muted-foreground">Cobrado, con IVA y neto de lo devuelto</span>
      </div>
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_380px] gap-6">
        <Grafico />
        <div className="divide-y divide-border">
          {VENTAS_TIPO.map(v => {
            const d = v.total - v.antes;
            return (
              <div key={v.tipo} className="grid grid-cols-[1fr_40px_80px_70px] items-center gap-2 py-1.5 text-[13px]">
                <span className="text-foreground">{v.tipo}</span>
                <span className="text-right tabular-nums text-muted-foreground">{v.n}</span>
                <span className="text-right font-semibold tabular-nums text-foreground">{eur(v.total)}</span>
                <span className={cn('text-right tabular-nums', d > 0 ? 'text-success' : 'text-muted-foreground')}>{d === 0 ? '=' : `${d > 0 ? '+' : ''}${eur(d)}`}</span>
              </div>
            );
          })}
          <div className="grid grid-cols-[1fr_40px_80px_70px] items-center gap-2 pt-2 text-[13px] font-semibold">
            <span>Total</span><span className="text-right tabular-nums text-muted-foreground">71</span><span className="text-right tabular-nums">{eur(MES.cobrado)}</span><span className="text-right tabular-nums text-success">+{eur(MES.cobrado - MES.anterior)}</span>
          </div>
          <p className="pt-2 text-[12px] text-muted-foreground">Plataformas: ClassPass 12 visitas · Urban Sports Club 5 <span className="font-medium text-brand-medio">· Ver detalle</span></p>
        </div>
      </div>
    </Tarjeta>
  );
}

function BloqueClases() {
  return (
    <Tarjeta className="p-5">
      <div className="flex items-center gap-2">
        <h2 className="text-[16px] font-semibold text-foreground">Clases · qué se llena y qué compensa</h2>
        <span className="ml-auto text-[12.5px] text-muted-foreground">Margen sobre el coste de la instructora (no incluye la sala)</span>
      </div>
      <div className="mt-3 overflow-hidden rounded-lg border border-border">
        <div className="grid grid-cols-[1.4fr_70px_1.2fr_90px_90px_90px_110px] gap-3 bg-muted/50 px-3 py-2 text-[12px] font-semibold text-muted-foreground">
          <span>Tipo de clase</span><span className="text-right">Clases</span><span>Ocupación</span><span className="text-right">Ingreso</span><span className="text-right">Coste</span><span className="text-right">Margen</span><span className="text-right">Equilibrio</span>
        </div>
        {CLASES.map(c => (
          <div key={c.tipo} className="border-t border-border">
            <div className="grid grid-cols-[1.4fr_70px_1.2fr_90px_90px_90px_110px] items-center gap-3 px-3 py-2.5 text-[13px]">
              <span className="flex items-center gap-2 font-medium text-foreground">
                {c.aviso ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
                <span className="size-2.5 rounded-full" style={{ background: c.color }} />{c.tipo}
              </span>
              <span className="text-right tabular-nums text-muted-foreground">{c.sesiones}</span>
              <span className="flex items-center gap-2"><span className="h-1.5 flex-1 rounded-full bg-muted"><span className="block h-1.5 rounded-full bg-foreground/70" style={{ width: `${c.ocupacion}%` }} /></span><span className="w-9 text-right tabular-nums">{c.ocupacion} %</span></span>
              <span className="text-right tabular-nums">{eur(c.ingreso)}</span>
              <span className="text-right tabular-nums text-muted-foreground">{eur(c.coste)}</span>
              <span className="text-right font-semibold tabular-nums">{eur(c.ingreso - c.coste)}</span>
              <span className="text-right tabular-nums text-muted-foreground">{c.equilibrio} alumnas</span>
            </div>
            {c.aviso && (
              <div className="bg-muted/30 pb-2">
                {FRANJAS_BARRE.map(f => (
                  <div key={f.franja} className="grid grid-cols-[1.4fr_70px_1.2fr_90px_90px_90px_110px] items-center gap-3 px-3 py-1.5 text-[12.5px]">
                    <span className="pl-9 text-foreground">{f.franja}</span><span />
                    <span className="flex items-center gap-2"><span className="h-1.5 flex-1 rounded-full bg-muted"><span className="block h-1.5 rounded-full bg-foreground/50" style={{ width: `${f.ocupacion}%` }} /></span><span className="w-9 text-right tabular-nums">{f.ocupacion} %</span></span>
                    <span /><span />
                    <span className={cn('text-right font-semibold tabular-nums', f.margen < 0 ? 'text-destructive' : 'text-foreground')}>{eur(f.margen)}</span>
                    <span />
                  </div>
                ))}
                <p className="mt-1 flex items-center gap-1.5 px-3 pl-12 text-[12.5px] text-foreground">
                  <Compass size={13} className="text-muted-foreground" aria-hidden />Martes 20:00 no llega al equilibrio. Hay una propuesta en el Centro de Control
                  <span className="font-medium text-brand-medio">· Verla</span>
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </Tarjeta>
  );
}

function BloqueClientas() {
  return (
    <Tarjeta className="p-5">
      <h2 className="text-[16px] font-semibold text-foreground">Clientas · se quedan o se van</h2>
      <div className="mt-3 grid grid-cols-[260px_1fr_300px] gap-6">
        <div className="space-y-2 text-[13.5px]">
          {[['Activas', '64', ''], ['Pausadas', '3', ''], ['Sin renovar', '6', 'Se las puede recuperar'], ['Nuevas en septiembre', '9', '4 vienen de su clase de prueba']].map(([t, n, s]) => (
            <div key={t} className="flex items-baseline justify-between gap-2 border-b border-border pb-1.5">
              <span className="text-foreground">{t}{s && <span className="block text-[12px] text-muted-foreground">{s}</span>}</span>
              <span className="flex items-baseline gap-2"><b className="text-[16px] tabular-nums">{n}</b><span className="text-[12px] font-medium text-brand-medio">Ver</span></span>
            </div>
          ))}
        </div>
        <div>
          <p className="text-[13px] font-medium text-foreground">Siguen viniendo, según el mes en que empezaron</p>
          <div className="mt-2 grid grid-cols-[1fr_70px_80px_80px] gap-2 text-[12px] font-semibold text-muted-foreground"><span>Empezaron</span><span className="text-right">Cuántas</span><span className="text-right">2.º mes</span><span className="text-right">3.er mes</span></div>
          {COHORTES.map(c => (
            <div key={c.mes} className="grid grid-cols-[1fr_70px_80px_80px] gap-2 border-t border-border py-1.5 text-[13px]">
              <span className="text-foreground">{c.mes}</span><span className="text-right tabular-nums">{c.empezaron}</span>
              <span className="text-right tabular-nums">{c.segundo == null ? <span className="text-muted-foreground">—</span> : `${c.segundo} %`}</span>
              <span className="text-right tabular-nums">{c.tercero == null ? <span className="text-muted-foreground">—</span> : `${c.tercero} %`}</span>
            </div>
          ))}
          <p className="mt-1 text-[12px] text-muted-foreground">«—»: ese mes aún no ha pasado entero para todas.</p>
        </div>
        <div>
          <p className="text-[13px] font-medium text-foreground">Las que más vienen · clases a las que vinieron</p>
          <div className="mt-2 space-y-1.5">
            {LAS_QUE_MAS_VIENEN.map((c, i) => (
              <div key={c.nombre} className="flex items-center gap-2.5">
                <Avatar ini={c.ini} tono={i} /><span className="flex-1 truncate text-[13px] text-foreground">{c.nombre}</span><b className="text-[13px] tabular-nums">{c.clases}</b>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Tarjeta>
  );
}

export function DisenoInformes() {
  return (
    <div>
      <div className="flex items-center gap-1">
        <h1 className="mr-1 text-[24px] font-semibold tracking-tight text-foreground">Informes</h1>
        <IconoBoton icono={Info} titulo="Qué es esta pantalla" />
        <IconoBoton icono={Maximize2} titulo="Ampliar a toda la pantalla" />
        <span className="ml-auto flex items-center gap-2">
          <BotonC icono={Download}>Descargar</BotonC>
          <BotonC icono={FileText}>Cierre para la gestoría</BotonC>
        </span>
      </div>
      <div className="mt-2.5 flex items-center gap-2"><Periodo /><Nota n={10} /></div>
      <div className="mt-4 flex items-start gap-2"><div className="flex-1"><Titular /></div><Nota n={9} /></div>
      <div className="relative mt-4 space-y-4">
        <span className="absolute -left-3 -top-3 z-10"><Nota n={11} /></span>
        <BloqueDinero notas />
        <BloqueClases />
        <BloqueClientas />
      </div>
    </div>
  );
}

export function DisenoInformesMovil() {
  return (
    <Telefono activo="Más">
      <div className="min-h-0 flex-1 overflow-hidden px-4">
        <div className="flex items-center gap-2">
          <h1 className="text-[22px] font-semibold text-foreground">Informes</h1>
          <Info size={17} className="text-muted-foreground" aria-label="Qué es esta pantalla" />
          <Download size={19} className="ml-auto text-muted-foreground" aria-label="Descargar" />
        </div>
        <div className="mt-2"><Periodo compacto /></div>
        <div className="mt-3"><Titular compacto /></div>
        <Tarjeta className="mt-3 p-3">
          <p className="text-[13.5px] font-semibold text-foreground">Dinero · de dónde sale</p>
          <div className="mt-2"><Grafico alto={80} /></div>
        </Tarjeta>
      </div>
    </Telefono>
  );
}
