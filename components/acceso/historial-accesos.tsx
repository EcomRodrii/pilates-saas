'use client';

// El historial de accesos del panel: qué pasó cada vez que alguien leyó un QR de
// alumna. Lo usan «Control de acceso» (un día entero) y la ficha de la clienta
// (sus últimos accesos). Una fila por escaneo; las decisiones tras un 🟠
// («aprobó y dejó pasar», «no permitió el acceso») son su propia fila, con quién
// las tomó.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authHeader } from '@/lib/api-client';
import { cn, capitalizarPrimera } from '@/lib/utils';
import { DECISION_LEGIBLE, MOTIVO_CORTO, TITULO_VEREDICTO, fechaAcceso, horaAcceso } from '@/lib/acceso/textos-acceso';
import type { FilaHistorial } from '@/lib/acceso/historial-servidor';

const PUNTO: Record<FilaHistorial['resultado'], string> = {
  PERMITIDO: 'bg-success',
  REVISAR: 'bg-warning',
  DENEGADO: 'bg-destructive',
};

/** Trae el historial. `consulta` es `dia=YYYY-MM-DD` o `socioId=…`; `version` lo refresca. */
export function useHistorialAccesos(consulta: string, version = 0) {
  const [estado, setEstado] = useState<{ filas: FilaHistorial[] | null; error: string | null; consulta: string | null }>({ filas: null, error: null, consulta: null });
  useEffect(() => {
    let vivo = true;
    authHeader()
      .then(h => fetch(`/api/acceso/historial?${consulta}`, { headers: h }))
      .then(async r => {
        const d = await r.json().catch(() => null) as { filas?: FilaHistorial[]; error?: string } | null;
        if (!vivo) return;
        if (!r.ok || !d?.filas) setEstado({ filas: null, error: d?.error ?? 'No hemos podido cargar el historial.', consulta });
        else setEstado({ filas: d.filas, error: null, consulta });
      })
      .catch(() => { if (vivo) setEstado({ filas: null, error: 'Sin conexión: no hemos podido cargar el historial.', consulta }); });
    return () => { vivo = false; };
  }, [consulta, version]);
  // Mientras llega la consulta nueva no se enseña la anterior como si fuera suya.
  const cargando = estado.consulta !== consulta;
  return { filas: cargando ? null : estado.filas, error: cargando ? null : estado.error, cargando };
}

export function HistorialAccesos({ filas, cargando, error, conAlumna, conFecha, vacio }: {
  filas: FilaHistorial[] | null;
  cargando: boolean;
  error: string | null;
  /** En Control de acceso se dice quién; en su ficha ya se sabe. */
  conAlumna: boolean;
  /** En su ficha, varios días: la fecha delante de la hora. */
  conFecha: boolean;
  vacio: string;
}) {
  if (cargando) return <p className="text-sm text-muted-foreground py-3">Cargando…</p>;
  if (error) return <p role="alert" className="text-sm font-semibold text-destructive py-3">{error}</p>;
  if (!filas || filas.length === 0) return <p className="text-sm text-muted-foreground py-3">{vacio}</p>;

  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card" data-testid="historial-accesos">
      {filas.map(f => (
        <li key={f.id} className="flex items-start gap-3 px-4 py-3" data-resultado={f.resultado}>
          <span aria-hidden className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', PUNTO[f.resultado])} />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-foreground">
              <span className="font-semibold tabular-nums">
                {conFecha ? `${capitalizarPrimera(fechaAcceso(f.ocurridoEn))} · ` : ''}{horaAcceso(f.ocurridoEn)}
              </span>
              {conAlumna && (
                <>
                  {' · '}
                  {f.alumna
                    ? <Link href={`/clientas/${encodeURIComponent(f.alumna.id)}`} className="font-semibold hover:underline">{f.alumna.nombre}</Link>
                    : <span className="text-muted-foreground">Sin identificar</span>}
                </>
              )}
            </p>
            <p className="text-sm text-muted-foreground text-pretty">
              <span className="sr-only">{TITULO_VEREDICTO[f.resultado]}: </span>
              {MOTIVO_CORTO[f.motivo] ?? f.motivo}
              {f.clase && <> · {f.clase.nombre} {horaAcceso(f.clase.inicio)}{f.clase.sala ? ` · ${f.clase.sala}` : ''}</>}
              {f.asistenciaMarcada && ' · asistencia marcada'}
            </p>
            <p className="text-xs text-muted-foreground">
              {f.decision ? `${f.quien} ${DECISION_LEGIBLE[f.decision]}` : `Escaneó ${f.quien}`}
              {f.origen === 'APP_INSTRUCTORA' ? ' · desde su app' : ''}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
