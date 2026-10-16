'use client';

// TEMPORAL — maqueta «Semana por franjas». No se commitea.
import { cn } from '@/lib/utils';
import { SEMANA, type Dia } from './datos';
import { Cabecera, Nota, Resumen, RESUMEN_SEMANA, TarjetaClase } from './comun';

// Cada fila es una hora en la que hay clase algún día; las horas sin ninguna
// clase en toda la semana se pliegan en una sola línea.
const FRANJAS: (number | 'hueco')[] = [8, 9, 10, 11, 'hueco', 18, 19, 20];

function ocupacion(d: Dia) {
  const vivas = d.clases.filter(c => c.marca?.tipo !== 'cancelada');
  const ap = vivas.reduce((a, c) => a + c.apuntadas, 0);
  const af = vivas.reduce((a, c) => a + c.aforo, 0);
  return af ? Math.round((ap / af) * 100) : 0;
}

export function RejillaFranjas({ compacta, alto, huecoDemo, seleccion }: { compacta?: boolean; alto?: boolean; huecoDemo?: boolean; seleccion?: Set<string> }) {
  const columnas = SEMANA.map(d => (d.clases.length ? 'minmax(0,1fr)' : (compacta ? '34px' : '58px'))).join(' ');
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="grid" style={{ gridTemplateColumns: `${compacta ? '40px' : '52px'} ${columnas}` }}>
        {/* Cabecera de días */}
        <div className="border-b border-border" />
        {SEMANA.map(d => (
          <div key={d.num} className={cn('border-b border-l border-border px-2 py-2', d.hoy && 'bg-brand/6')}>
            {d.clases.length ? (
              <>
                <p className="flex items-baseline gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {d.corto} <span className={cn('text-[15px] tabular-nums normal-case', d.hoy ? 'flex size-6 items-center justify-center rounded-full bg-brand text-[13px] text-brand-foreground' : 'text-foreground')}>{d.num}</span>
                  {d.hoy && !compacta && <span className="text-[11.5px] font-semibold normal-case tracking-normal text-brand">Hoy</span>}
                </p>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-foreground/45" style={{ width: `${ocupacion(d)}%` }} /></span>
                  <span className="text-[11.5px] tabular-nums text-muted-foreground">{compacta ? `${ocupacion(d)}%` : `${d.clases.length} · ${ocupacion(d)} %`}</span>
                </div>
              </>
            ) : (
              <p className="text-center text-[11.5px] font-semibold uppercase text-muted-foreground">{d.corto}<br /><span className="text-[15px] text-foreground/50">{d.num}</span></p>
            )}
          </div>
        ))}

        {/* Filas por franja */}
        {FRANJAS.map(f => f === 'hueco' ? (
          <div key="hueco" className="col-span-full border-b border-border bg-muted/40 px-3 py-1 text-[11.5px] text-muted-foreground">
            12:00 – 18:00 · ningún día hay clases a estas horas
          </div>
        ) : (
          <FilaFranja key={f} hora={f} compacta={compacta} alto={alto} huecoDemo={huecoDemo} seleccion={seleccion} />
        ))}
      </div>
    </div>
  );
}

function FilaFranja({ hora, compacta, alto, huecoDemo, seleccion }: { hora: number; compacta?: boolean; alto?: boolean; huecoDemo?: boolean; seleccion?: Set<string> }) {
  return (
    <>
      <div className="border-b border-border px-1.5 pt-2 text-right text-[12px] font-medium tabular-nums text-muted-foreground">{String(hora).padStart(2, '0')}:00</div>
      {SEMANA.map(d => {
        const clases = d.clases.filter(c => Number(c.hora.slice(0, 2)) === hora);
        return (
          <div key={d.num} className={cn('space-y-1.5 border-b border-l border-border p-1.5', d.hoy && 'bg-brand/6', alto && 'min-h-[64px]')}>
            {d.clases.length > 0 && clases.map(c => seleccion ? (
              <div key={c.id} className={cn('relative rounded-lg', seleccion.has(c.id) && 'ring-2 ring-brand ring-offset-1 ring-offset-card')}>
                <TarjetaClase c={c} compacta={compacta} />
                <span className={cn('absolute -left-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border-2 text-[10px] font-bold shadow-xs',
                  seleccion.has(c.id) ? 'border-brand bg-brand text-brand-foreground' : 'border-foreground/25 bg-card')}>{seleccion.has(c.id) ? '✓' : ''}</span>
              </div>
            ) : <TarjetaClase key={c.id} c={c} compacta={compacta} />)}
            {huecoDemo && d.corto === 'Sáb' && hora === 18 && (
              <div className="flex min-h-[52px] items-center justify-center gap-1 rounded-lg border border-dashed border-foreground/30 text-[12px] font-medium text-muted-foreground">
                + Clase a las 18:00
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

export function DisenoSemana() {
  return (
    <div>
      <Cabecera vista="Semana" fecha="1 – 7 oct" nota1={<Nota n={1} />} nota2={<Nota n={2} />} />
      <Resumen texto="54 clases · 61 % de ocupación" items={RESUMEN_SEMANA} />
      <div className="relative mt-3">
        <span className="absolute -left-3 -top-2 z-10"><Nota n={4} /></span>
        <RejillaFranjas huecoDemo />
      </div>
    </div>
  );
}
