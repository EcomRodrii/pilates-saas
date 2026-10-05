'use client';

import type { BloqueAsistente } from '@/lib/asistente/tipos';
import { BarraPlazas } from '@/components/dashboard/barra-plazas';
import { Filas, Tarjeta } from './tarjeta';

// Las franjas recurrentes (Martes 18:00 · Reformer) con su ocupación, en la
// misma barra que las clases (aquí en porcentaje: 100 segmentos son una barra).

export function BloqueFranjas({ bloque }: { bloque: Extract<BloqueAsistente, { tipo: 'franjas' }> }) {
  return (
    <Tarjeta tipo="franjas" titulo={bloque.titulo} href={bloque.href}>
      {bloque.franjas.length === 0
        ? <p className="border-t border-border px-4 py-4 text-[13.5px] text-muted-foreground">No hay franjas con clases suficientes para comparar.</p>
        : <Filas>{bloque.franjas.map(f => (
          <li key={f.clave} className="grid grid-cols-[1fr_6.5rem] items-center gap-3 px-4 py-3">
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-semibold text-foreground">{f.texto}</span>
              <span className="block truncate text-[12px] text-muted-foreground">
                {f.tipoClase} · {f.nClases} {f.nClases === 1 ? 'clase' : 'clases'}
                {f.enEspera > 0 && <span className="font-medium text-brand-medio"> · {f.enEspera} en espera</span>}
              </span>
            </span>
            <span>
              <span className="block font-mono text-[15px] font-semibold leading-none tabular-nums text-foreground">
                {f.ocupacion === null ? '—' : `${f.ocupacion} %`}
              </span>
              <BarraPlazas ocupadas={f.ocupacion ?? 0} aforo={100} />
            </span>
          </li>
        ))}</Filas>}
    </Tarjeta>
  );
}
