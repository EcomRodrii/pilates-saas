'use client';

import type { BloqueAsistente } from '@/lib/asistente/tipos';
import { CifraPrivada } from '@/components/ui/cifra-privada';
import { cn } from '@/lib/utils';
import { NombrePersona } from '../referencias-ui';
import { Filas, Tarjeta, quedanMas } from './tarjeta';

// Las listas de personas: alumnas (sin venir, las que más vienen), bonos que
// caducan y recibos sin cobrar. El nombre enlaza a la ficha; el detalle va a la
// derecha; el dinero, con CifraPrivada y en mono.

function Fila({ referencia, principal, detalle, derecha }: { referencia: string | null; principal?: string; detalle?: string; derecha?: React.ReactNode }) {
  return (
    <li className="flex min-h-12 items-center justify-between gap-3 px-4 py-2.5">
      <span className="min-w-0">
        <span className="block truncate text-[14px]">
          {referencia ? <NombrePersona referencia={referencia} /> : <span className="font-semibold text-foreground">{principal}</span>}
        </span>
        {detalle && <span className="block truncate text-[12px] text-muted-foreground">{detalle}</span>}
      </span>
      {derecha && <span className="shrink-0 text-right">{derecha}</span>}
    </li>
  );
}

export function BloqueAlumnas({ bloque }: { bloque: Extract<BloqueAsistente, { tipo: 'alumnas' }> }) {
  return (
    <Tarjeta tipo="alumnas" titulo={bloque.titulo} href={bloque.href}
      extra={<span className="font-mono text-[12px] tabular-nums text-muted-foreground">{bloque.total}</span>}
      pie={quedanMas(bloque.total, bloque.alumnas.length, 'Clientas')}>
      {bloque.alumnas.length === 0
        ? <p className="border-t border-border px-4 py-4 text-[13.5px] text-muted-foreground">Ninguna.</p>
        : <Filas>{bloque.alumnas.map(a => (
          <Fila key={a.socioId} referencia={a.ref} derecha={<span className="font-mono text-[12.5px] tabular-nums text-muted-foreground">{a.detalle}</span>} />
        ))}</Filas>}
    </Tarjeta>
  );
}

export function BloqueBonos({ bloque }: { bloque: Extract<BloqueAsistente, { tipo: 'bonos' }> }) {
  return (
    <Tarjeta tipo="bonos" titulo={bloque.titulo} href={bloque.href}
      extra={<span className="font-mono text-[12px] tabular-nums text-muted-foreground">{bloque.total}</span>}
      pie={quedanMas(bloque.total, bloque.bonos.length, 'Clientas')}>
      {bloque.bonos.length === 0
        ? <p className="border-t border-border px-4 py-4 text-[13.5px] text-muted-foreground">Ninguno.</p>
        : <Filas>{bloque.bonos.map(b => (
          <Fila key={b.suscripcionId} referencia={b.alumna} detalle={b.plan} derecha={<>
            <span className="block font-mono text-[13px] font-semibold tabular-nums text-foreground">{b.restantes} {b.restantes === 1 ? 'sesión' : 'sesiones'}</span>
            <span className="block text-[11.5px] text-muted-foreground">caduca el {b.caduca}</span>
          </>} />
        ))}</Filas>}
    </Tarjeta>
  );
}

const SITUACION = {
  IMPAGADO: { texto: 'Impagado', clase: 'bg-destructive/10 text-destructive' },
  POR_COBRAR: { texto: 'Por cobrar', clase: 'bg-muted text-foreground' },
  EN_CURSO: { texto: 'En el banco', clase: 'bg-muted text-muted-foreground' },
} as const;

export function BloqueRecibos({ bloque }: { bloque: Extract<BloqueAsistente, { tipo: 'recibos' }> }) {
  return (
    <Tarjeta tipo="recibos" titulo={bloque.titulo} href={bloque.href}
      extra={<CifraPrivada inline className="font-mono text-[12.5px] font-semibold tabular-nums text-foreground">{bloque.importeTotal}</CifraPrivada>}
      pie={quedanMas(bloque.total, bloque.recibos.length, 'Cobros')}>
      {bloque.recibos.length === 0
        ? <p className="border-t border-border px-4 py-4 text-[13.5px] text-muted-foreground">Nada sin cobrar.</p>
        : <Filas>{bloque.recibos.map(r => {
          const s = SITUACION[r.situacion];
          return (
            <Fila key={r.reciboId} referencia={r.alumna} principal="Venta sin clienta" detalle={`Vence el ${r.vence}`} derecha={<>
              <CifraPrivada inline className="block font-mono text-[13.5px] font-semibold tabular-nums text-foreground">{r.importe}</CifraPrivada>
              <span className={cn('mt-0.5 inline-block rounded-full px-2 py-px text-[11px] font-medium', s.clase)}>{s.texto}</span>
            </>} />
          );
        })}</Filas>}
    </Tarjeta>
  );
}
