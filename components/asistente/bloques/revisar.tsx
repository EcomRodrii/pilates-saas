'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { BloqueAsistente } from '@/lib/asistente/tipos';
import { Filas, Tarjeta } from './tarjeta';

// La bandeja («qué espera tu visto bueno» y «lo que Tentare tiene en marcha»),
// la misma de Inicio, con su enlace; y el mensaje del día si lo hay.

export function BloqueRevisar({ bloque }: { bloque: Extract<BloqueAsistente, { tipo: 'revisar' }> }) {
  const grupos = [
    { titulo: 'Espera tu visto bueno', lineas: bloque.lineas.filter(l => l.bandeja === 'decidir') },
    { titulo: 'Tentare lo tiene en marcha', lineas: bloque.lineas.filter(l => l.bandeja === 'enMarcha') },
  ].filter(g => g.lineas.length);
  return (
    <Tarjeta tipo="revisar" titulo="Lo que hay hoy" href="/dashboard">
      {bloque.veredicto && (
        <Link href={bloque.veredicto.href} className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 transition-colors hover:bg-muted/60">
          <span className="min-w-0">
            <span className="block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Mensaje del día</span>
            <span className="block text-[14px] font-semibold text-foreground">{bloque.veredicto.titulo}</span>
          </span>
          <ArrowRight size={15} aria-hidden="true" className="shrink-0 text-muted-foreground" />
        </Link>
      )}
      {grupos.length === 0 && !bloque.veredicto && <p className="border-t border-border px-4 py-4 text-[13.5px] text-muted-foreground">Nada pendiente ahora mismo.</p>}
      {grupos.map(g => (
        <div key={g.titulo}>
          <p className="border-t border-border px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{g.titulo}</p>
          <Filas className="border-t-0">
            {g.lineas.map(l => {
              const dentro = (
                <>
                  <span className="min-w-6 rounded-full bg-muted px-2 py-0.5 text-center font-mono text-[12px] font-semibold tabular-nums text-foreground">{l.n}</span>
                  <span className="min-w-0 flex-1 truncate text-[14px] text-foreground">{l.texto}</span>
                  {l.href && <ArrowRight size={14} aria-hidden="true" className="shrink-0 text-muted-foreground" />}
                </>
              );
              return (
                <li key={l.id}>
                  {l.href
                    ? <Link href={l.href} className="flex min-h-11 items-center gap-3 px-4 py-2 transition-colors hover:bg-muted/60">{dentro}</Link>
                    : <span className="flex min-h-11 items-center gap-3 px-4 py-2">{dentro}</span>}
                </li>
              );
            })}
          </Filas>
        </div>
      ))}
    </Tarjeta>
  );
}
