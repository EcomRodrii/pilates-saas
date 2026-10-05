'use client';

import Link from 'next/link';
import type { BloqueAsistente, ClaseDelBloque } from '@/lib/asistente/tipos';
import { BarraPlazas } from '@/components/dashboard/barra-plazas';
import { cn } from '@/lib/utils';
import { NombrePersona } from '../referencias-ui';
import { Filas, Tarjeta, quedanMas } from './tarjeta';

// Las clases como en «Hoy en el estudio»: la hora en mono, el tipo y la sala, la
// ocupación con BarraPlazas, y lo que pide atención en su color. Cada fila abre
// la clase en el Calendario (el salto `?sesion=` que ya existe).

function Fila({ c }: { c: ClaseDelBloque }) {
  const [dia, hora] = c.hora.includes(', ') ? c.hora.split(', ') : [null, c.hora];
  return (
    <li>
      <Link
        href={`/calendario?sesion=${encodeURIComponent(c.sesionId)}`}
        className="grid grid-cols-[3.25rem_1fr_6.5rem] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60"
        data-clase={c.sesionId}
      >
        <span className="font-mono text-[13px] leading-tight tabular-nums text-foreground">
          {hora}
          {dia && <span className="block font-sans text-[11px] capitalize text-muted-foreground">{dia.split(' ').slice(0, 2).join(' ')}</span>}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-semibold text-foreground">{c.tipoClase}</span>
          <span className="block truncate text-[12px] text-muted-foreground">
            {c.sala}
            {c.sala && (c.instructora || c.motivo) ? ' · ' : ''}
            {c.instructora ? <NombrePersona referencia={c.instructora} /> : (!c.motivo && 'Sin instructora')}
          </span>
          {c.motivo && c.senal !== 'OK' && (
            <span className={cn('mt-0.5 flex items-center gap-1.5 text-[12px] font-medium', c.senal === 'PROBLEMA' ? 'text-destructive' : 'text-warning')}>
              <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
              <span className="truncate">{c.motivo}</span>
            </span>
          )}
        </span>
        <span className="min-w-0">
          <span className="block leading-none">
            <span className="font-mono text-[15px] font-semibold tabular-nums text-foreground">{c.ocupadas}</span>
            <span className="text-[11px] text-muted-foreground"> / {c.aforo}</span>
            {c.enEspera > 0 && <span className="ml-1 text-[11px] font-medium text-brand-medio">+{c.enEspera} esp.</span>}
          </span>
          <BarraPlazas ocupadas={c.ocupadas} aforo={c.aforo} />
        </span>
      </Link>
    </li>
  );
}

export function BloqueClases({ bloque }: { bloque: Extract<BloqueAsistente, { tipo: 'clases' }> }) {
  return (
    <Tarjeta
      tipo="clases"
      titulo={bloque.titulo}
      href={bloque.href}
      extra={<span className="font-mono text-[12px] tabular-nums text-muted-foreground">{bloque.total}</span>}
      pie={quedanMas(bloque.total, bloque.clases.length, 'el Calendario')}
    >
      {bloque.clases.length === 0
        ? <p className="border-t border-border px-4 py-4 text-[13.5px] text-muted-foreground">No hay ninguna.</p>
        : <Filas>{bloque.clases.map(c => <Fila key={c.sesionId} c={c} />)}</Filas>}
    </Tarjeta>
  );
}
