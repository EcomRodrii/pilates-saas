'use client';

// TEMPORAL — maqueta «Horario» como semana tipo. No se commitea.
import { CalendarClock, ChevronDown, HeartPulse, Pause, Plus, RefreshCw, MoreHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TIPOS, type TipoId } from './datos';
import { Avatar, BotonC, Cabecera, tinte } from './comun';

interface Franja { hora: string; tipo: TipoId; quien: string; fijas: number; aforo: number; hasta: string; sola: boolean; ocup: number[] }

const PLANTILLA: Omit<Franja, 'ocup' | 'hasta' | 'sola'>[] = [
  { hora: '08:00', tipo: 'reformer', quien: 'Cloe', fijas: 3, aforo: 6 },
  { hora: '09:00', tipo: 'mat', quien: 'Irene', fijas: 4, aforo: 12 },
  { hora: '09:15', tipo: 'reformer', quien: 'Marta', fijas: 2, aforo: 6 },
  { hora: '10:30', tipo: 'reformer', quien: 'Marta', fijas: 4, aforo: 6 },
  { hora: '11:00', tipo: 'prenatal', quien: 'Irene', fijas: 3, aforo: 12 },
  { hora: '18:00', tipo: 'reformer', quien: 'Lucía', fijas: 4, aforo: 6 },
  { hora: '18:30', tipo: 'barre', quien: 'Irene', fijas: 2, aforo: 12 },
  { hora: '19:15', tipo: 'reformer', quien: 'Lucía', fijas: 4, aforo: 6 },
  { hora: '19:45', tipo: 'mat', quien: 'Marta', fijas: 5, aforo: 12 },
  { hora: '20:30', tipo: 'reformer', quien: 'Cloe', fijas: 2, aforo: 6 },
];
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function franjasDe(dia: number): Franja[] {
  const lista = dia === 5 ? PLANTILLA.filter(p => ['09:00', '09:15', '10:30', '11:00'].includes(p.hora)) : PLANTILLA;
  return lista.map((p, k) => {
    const semilla = (dia * 7 + k * 3) % 10;
    const media = p.tipo === 'barre' || (p.hora === '20:30' && dia === 0) ? 0.35 : p.tipo === 'reformer' ? 0.82 : 0.62;
    return {
      ...p,
      hasta: ['31 oct', '19 dic', '30 nov', '15 ene'][(dia + k) % 4],
      sola: (dia + k) % 3 !== 0,
      ocup: Array.from({ length: 8 }, (_, i) => Math.min(1, Math.max(0.1, media + (((semilla + i * 7) % 9) - 4) / 25))),
    };
  });
}

function Barras({ v, ancho = 56, alto = 18 }: { v: number[]; ancho?: number; alto?: number }) {
  const w = ancho / v.length;
  return (
    <svg width={ancho} height={alto} aria-hidden className="shrink-0">
      {v.map((x, i) => <rect key={i} x={i * w + 0.5} y={alto - x * alto} width={w - 1.5} height={x * alto} rx={1} className={x < 0.45 ? 'fill-warning' : 'fill-foreground/40'} />)}
    </svg>
  );
}

function TarjetaFranja({ f, elegida }: { f: Franja; elegida?: boolean }) {
  const media = Math.round((f.ocup.reduce((a, b) => a + b, 0) / f.ocup.length) * 100);
  return (
    <div className={cn('relative overflow-hidden rounded-lg border pl-2.5 pr-2 py-1.5', elegida ? 'border-foreground/70 ring-2 ring-foreground/15' : 'border-transparent')} style={{ background: tinte(TIPOS[f.tipo].color, 32) }}>
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: TIPOS[f.tipo].color }} aria-hidden />
      <div className="flex items-center gap-1.5 text-[12.5px] leading-tight">
        <span className="font-semibold tabular-nums text-foreground">{f.hora}</span>
        <span className="min-w-0 truncate font-semibold text-foreground">{TIPOS[f.tipo].nombre}</span>
        <span className="ml-auto" title="Ocupación, últimas 8 semanas"><Barras v={f.ocup} ancho={40} alto={14} /></span>
      </div>
      <p className="mt-0.5 flex items-center gap-1 text-[12px] leading-tight text-foreground/70">
        <span className="truncate">{f.quien} · {f.fijas}/{f.aforo} fijas</span>
        <span className={cn('ml-auto shrink-0 tabular-nums font-semibold', media < 45 ? 'text-warning' : 'text-foreground/85')} title="Ocupación media, últimas 8 semanas">{media} %</span>
      </p>
    </div>
  );
}

const FILAS: (number | 'hueco')[] = [8, 9, 10, 11, 'hueco', 18, 19, 20];

export function DetalleSerie() {
  const f = franjasDe(0).find(x => x.hora === '18:00')!;
  const media = Math.round((f.ocup.reduce((a, b) => a + b, 0) / f.ocup.length) * 100);
  const fijas = [
    { ini: 'MG', n: 'María García', d: 'desde marzo' },
    { ini: 'LM', n: 'Laura Martín', d: 'en pausa hasta el 15 oct', pausa: true },
    { ini: 'PR', n: 'Paula Romero', d: 'desde junio', salud: true },
    { ini: 'ST', n: 'Sara Torres', d: 'desde septiembre' },
  ];
  return (
    <aside className="w-[400px] rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-5 pt-4 pb-3.5">
        <div className="flex items-center gap-2">
          <span className="size-3 rounded-full" style={{ background: TIPOS.reformer.color }} aria-hidden />
          <h2 className="text-[19px] font-semibold text-foreground">Reformer · lunes 18:00</h2>
          <span className="ml-auto flex gap-0.5 text-muted-foreground"><span className="flex size-8 items-center justify-center"><MoreHorizontal size={17} /></span><span className="flex size-8 items-center justify-center"><X size={17} /></span></span>
        </div>
        <p className="mt-1 text-[13px] text-muted-foreground">18:00 – 18:50 · Sala Reformer · Lucía Gómez</p>
        <div className="mt-3 space-y-2 rounded-lg bg-muted/60 px-3 py-2.5 text-[13.5px] text-foreground">
          <p className="flex items-center gap-2"><RefreshCw size={15} className="shrink-0 text-muted-foreground" />Programada hasta el <b>31 de octubre</b></p>
          <p className="flex items-center justify-between gap-2 pl-[23px]">Se renueva sola cada mes <span className="flex h-5 w-9 shrink-0 items-center rounded-full bg-brand p-0.5"><span className="ml-auto size-4 rounded-full bg-white" /></span></p>
        </div>
      </div>
      <div className="border-b border-border px-5 py-3.5">
        <p className="flex items-baseline justify-between text-[13px] font-semibold text-foreground">Cómo ha ido · últimas 8 semanas <span className="font-normal text-muted-foreground">media <b className="text-foreground">{media} %</b></span></p>
        <div className="mt-2.5"><Barras v={f.ocup} ancho={348} alto={44} /></div>
        <p className="mt-1.5 text-[12.5px] text-muted-foreground">Se llena casi siempre: 3 de las últimas 8 semanas hubo lista de espera.</p>
      </div>
      <div className="px-5 py-3.5">
        <p className="flex items-baseline justify-between text-[13px] font-semibold text-foreground">Plazas fijas <span className="font-normal text-muted-foreground"><b className="text-foreground">4 de 6</b> · 2 libres</span></p>
        <ul className="mt-2 space-y-2">
          {fijas.map((a, i) => (
            <li key={a.n} className="flex items-center gap-3">
              <Avatar ini={a.ini} tono={i} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[14px] font-medium text-foreground">{a.n}{a.salud && <HeartPulse size={14} className="text-destructive" aria-label="Tiene notas de salud" />}</p>
                <p className={cn('flex items-center gap-1 text-[12.5px]', a.pausa ? 'text-warning' : 'text-muted-foreground')}>{a.pausa && <Pause size={12} />}{a.d}</p>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-info/30 bg-info/8 px-3 py-2 text-[13px] text-foreground">
          <span className="flex-1">Elena Navarro la ha pedido desde la app.</span>
          <BotonC peque>Ver petición</BotonC>
        </div>
        <div className="mt-3 flex gap-2">
          <BotonC icono={Plus}>Añadir plaza fija</BotonC>
          <BotonC icono={CalendarClock}>Cambiar desde una fecha</BotonC>
        </div>
      </div>
    </aside>
  );
}

export function DisenoHorario() {
  return (
    <div>
      <Cabecera vista="Horario" fecha="" />
      <p className="mt-3 text-[13px] text-muted-foreground">La semana tipo: lo que se repite cada semana. Toca una clase para ver quién viene fija, hasta cuándo va y cómo ha ido.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5">
        <span className="text-[13px] font-semibold text-foreground">Clases fijas con nombre</span>
        {['Reformer mañanas · L-X-V 9:15', 'Mat tardes · M-J 19:45'].map(g => (
          <span key={g} className="rounded-full bg-muted px-2.5 py-1 text-[12.5px] text-foreground">{g}</span>
        ))}
        <span className="inline-flex items-center gap-1 text-[12.5px] font-medium text-foreground"><Plus size={13} />Agrupar con nombre</span>
        <span className="mx-1 h-5 w-px bg-border" />
        <span className="inline-flex items-center gap-1.5 text-[12.5px] text-foreground">Aprobar peticiones solas si caben <span className="flex h-5 w-9 items-center rounded-full bg-brand p-0.5"><span className="ml-auto size-4 rounded-full bg-white" /></span></span>
        <span className="ml-auto inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-info/30 bg-info/8 px-3 text-[12.5px] font-medium text-foreground">2 peticiones · Ver</span>
      </div>
      <div className="mt-3">
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="grid" style={{ gridTemplateColumns: '52px repeat(6, minmax(0,1fr))' }}>
            <div className="border-b border-border" />
            {DIAS.map(d => (
              <div key={d} className="border-b border-l border-border px-2 py-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                {d === 'Lun' ? 'Lunes' : d === 'Mar' ? 'Martes' : d === 'Mié' ? 'Miérc.' : d === 'Jue' ? 'Jueves' : d === 'Vie' ? 'Viernes' : 'Sábado'}
                <span className="ml-1.5 font-normal normal-case tracking-normal">{d === 'Sáb' ? '4 clases' : '10 clases'}</span>
              </div>
            ))}
            {FILAS.map(h => h === 'hueco' ? (
              <div key="hueco" className="col-span-full border-b border-border bg-muted/40 px-3 py-1 text-[11.5px] text-muted-foreground">12:00 – 18:00 · sin clases</div>
            ) : (
              <Fila key={h} h={h} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Fila({ h }: { h: number }) {
  return (
    <>
      <div className="border-b border-border px-1.5 pt-2 text-right text-[12px] font-medium tabular-nums text-muted-foreground">{h}:00</div>
      {DIAS.map((d, i) => (
        <div key={d} className="space-y-1.5 border-b border-l border-border p-1.5">
          {franjasDe(i).filter(f => Number(f.hora.slice(0, 2)) === h).map(f => <TarjetaFranja key={f.hora} f={f} elegida={i === 0 && f.hora === '18:00'} />)}
        </div>
      ))}
    </>
  );
}
