'use client';

// Registro de auditoría. Es solo lectura porque la tabla no admite otra cosa:
// rechaza UPDATE y DELETE por trigger, incluso para el service-role.

import { useCallback, useEffect, useState } from 'react';
import { fetchAuditoria, type EntradaAuditoria } from '@/lib/interno/client';

const cuando = (iso: string) =>
  new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// "Chrome en Barcelona" es ruido; lo que importa es distinguir un navegador de
// un script. Con el nombre del motor basta.
function navegador(ua: string | null): string {
  if (!ua) return '—';
  if (/Edg\//.test(ua)) return 'Edge';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Otro';
}

export default function AuditoriaInterna() {
  const [entradas, setEntradas] = useState<EntradaAuditoria[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try { setEntradas((await fetchAuditoria()).entradas); }
    catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargar(); }, [cargar]);

  if (error) return <p className="text-[13.5px] text-muted-foreground">{error}</p>;
  if (!entradas) return <p className="text-[13.5px] text-muted-foreground">Cargando…</p>;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h1 className="text-[17px] font-bold text-foreground">Auditoría</h1>
        <p className="text-[12.5px] text-muted-foreground">
          Todo lo que el equipo hace sobre los datos de un cliente. No se puede editar ni borrar.
        </p>
      </div>

      {entradas.length === 0 ? (
        <p className="text-[13px] text-muted-foreground rounded-2xl border border-border bg-card px-4 py-6 text-center">
          Todavía no hay nada registrado.
        </p>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          {entradas.map(e => (
            <div key={e.id} className="px-4 py-3 border-b border-border/60 last:border-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13.5px] text-foreground min-w-0">
                  <span className="font-semibold">{e.actor_nombre}</span>{' '}
                  <span className="text-muted-foreground">{e.resumen}</span>
                </span>
                <span className="text-[11.5px] tabular-nums text-muted-foreground shrink-0">{cuando(e.ocurrido_en)}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                <code className="font-mono">{e.accion}</code>
                {e.ip && <span>{e.ip}</span>}
                <span>{navegador(e.user_agent)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
