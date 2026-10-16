'use client';

// TEMPORAL — maqueta «Día» con el panel fijo al lado (modo mostrador). No se commitea.
import { CheckCircle2, Clock3, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SEMANA, TIPOS, type Clase } from './datos';
import { Cabecera, Nota, Resumen, tinte } from './comun';
import { PanelEnCurso } from './panel';

const PX_HORA = 64;
// Dos tramos con clase; lo de en medio se pliega.
const TRAMOS = [{ desde: 8, hasta: 12 }, { desde: 18, hasta: 21.5 }];
const HUECO = 26;

function y(hora: string) {
  const [h, m] = hora.split(':').map(Number);
  const t = h + m / 60;
  if (t < 12) return (t - 8) * PX_HORA;
  return (12 - 8) * PX_HORA + HUECO + (t - 18) * PX_HORA;
}
const ALTO = (12 - 8) * PX_HORA + HUECO + (21.5 - 18) * PX_HORA;

function Bloque({ c, seleccionada }: { c: Clase; seleccionada?: boolean }) {
  const tipo = TIPOS[c.tipo];
  const m = c.marca;
  const top = y(c.hora);
  const alto = y(c.fin) - top;
  return (
    <div
      className={cn(
        'absolute inset-x-1.5 overflow-hidden rounded-lg border pl-3 pr-2.5 py-1.5',
        seleccionada ? 'border-foreground/70 ring-2 ring-foreground/20' : 'border-transparent',
        c.pasada && 'opacity-75',
      )}
      style={{ top, height: alto - 3, background: tinte(tipo.color, c.pasada ? 16 : 40) }}
    >
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: tipo.color }} aria-hidden />
      <div className="flex items-baseline gap-1.5 text-[13px] leading-tight">
        <span className="font-semibold tabular-nums text-foreground">{c.hora}</span>
        <span className="truncate font-semibold text-foreground">{tipo.nombre}</span>
        <span className={cn('ml-auto shrink-0 font-semibold tabular-nums', m?.tipo === 'floja' ? 'text-warning' : 'text-foreground')}>
          {c.apuntadas}/{c.aforo}{c.espera > 0 && <span className="ml-0.5 rounded bg-info/15 px-1 text-[11px] text-info">+{c.espera}</span>}
        </span>
      </div>
      <p className="mt-0.5 flex items-center gap-1 truncate text-[12px] leading-tight text-foreground/70">
        {m?.tipo === 'en-curso' && <><span className="size-1.5 rounded-full bg-success" aria-hidden /><b className="font-semibold text-success">En curso</b> · </>}
        {m?.tipo === 'pasar-lista' && <><CheckCircle2 size={12} className="text-warning" aria-hidden /><b className="font-semibold text-warning">Pasar lista</b> · </>}
        {m?.tipo === 'lista-pasada' && <><CheckCircle2 size={12} aria-hidden />{m.vinieron} vinieron · </>}
        {m?.tipo === 'siguiente' && <><Clock3 size={12} aria-hidden />{m.texto} · </>}
        {m?.tipo === 'floja' && <><TrendingDown size={12} className="text-warning" aria-hidden /><span className="text-warning">floja</span> · </>}
        {c.instructora}
      </p>
    </div>
  );
}

export function DisenoDia() {
  const hoy = SEMANA[0];
  const salas: Clase['sala'][] = ['Reformer', 'Mat'];
  return (
    <div>
      <Cabecera vista="Día" fecha="Jueves 1 oct" compacta />
      <Resumen
        texto="10 clases · 72 %"
        items={[
          { icono: CheckCircle2, n: 2, texto: 'por pasar lista', tono: 'aviso' },
          { icono: TrendingDown, n: 1, texto: 'floja', tono: 'neutro' },
        ]}
        extra={<span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground"><Clock3 size={14} aria-hidden />Siguiente: <b className="font-semibold text-foreground">Prenatal 11:00</b> · en 20 min · 9 de 12</span>}
      />
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_380px] gap-3">
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="grid grid-cols-[44px_1fr_1fr] border-b border-border">
            <div />
            {salas.map(s => (
              <div key={s} className="border-l border-border px-3 py-2">
                <p className="text-[13px] font-semibold text-foreground">Sala {s}</p>
                <p className="text-[11.5px] text-muted-foreground">{hoy.clases.filter(c => c.sala === s).length} clases · {s === 'Reformer' ? '6' : '12'} plazas</p>
              </div>
            ))}
          </div>
          <div className="relative grid grid-cols-[44px_1fr_1fr]" style={{ height: ALTO }}>
            {/* Horas */}
            <div className="relative">
              {[8, 9, 10, 18, 19, 20, 21].map(h => (
                <span key={h} className="absolute right-1.5 -translate-y-1/2 text-[11.5px] tabular-nums text-muted-foreground" style={{ top: y(`${h}:00`) + (h === 8 || h === 18 ? 8 : 0) }}>{h}:00</span>
              ))}
            </div>
            {/* Ahora: detrás de las clases, con la hora en el margen */}
            <span className="absolute left-0.5 z-0 -translate-y-1/2 rounded-full bg-destructive px-1 text-[10.5px] font-semibold text-white tabular-nums" style={{ top: y('10:40') }}>10:40</span>
            {salas.map(s => (
              <div key={s} className="relative border-l border-border">
                {[9, 10, 11, 19, 20, 21].map(h => <span key={h} className="absolute inset-x-0 border-t border-border/70" style={{ top: y(`${h}:00`) }} />)}
                <span className="absolute inset-x-0 h-0.5 bg-destructive/80" style={{ top: y('10:40') }} aria-hidden />
                {hoy.clases.filter(c => c.sala === s).map(c => <Bloque key={c.id} c={c} seleccionada={c.marca?.tipo === 'en-curso'} />)}
              </div>
            ))}
            {/* Hueco plegado */}
            <div className="absolute inset-x-0 flex items-center border-y border-border bg-muted/50 pl-14 text-[11.5px] text-muted-foreground" style={{ top: y('12:00'), height: HUECO }}>
              12:00 – 18:00 · sin clases
            </div>
          </div>
        </div>
        <div className="relative">
          <span className="absolute -left-2.5 -top-2.5 z-10"><Nota n={5} /></span>
          <PanelEnCurso />
        </div>
      </div>
    </div>
  );
}
