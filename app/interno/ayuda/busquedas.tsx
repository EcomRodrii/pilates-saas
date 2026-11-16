'use client';

// Lo que se busca en el Centro de ayuda y Academy y no se encuentra (últimos 90 días, anonimizado, con su frecuencia): la lista de qué
// guía escribir o qué sinónimo añadir a una que ya existe (`terminos` en lib/ayuda/registro.ts). No hay usuario, estudio ni IP detrás.

import { useEffect, useState } from 'react';
import { Loader2, SearchX } from 'lucide-react';
import { fetchAyudaBusquedas, SinAcceso, type BusquedaSinResultado } from '@/lib/interno/client';

export function SeccionBusquedas() {
  const [datos, setDatos] = useState<{ terminos: BusquedaSinResultado[]; total: number; sinTabla: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetchAyudaBusquedas()
      .then(r => { if (vivo) setDatos({ terminos: r.terminos, total: r.totalBusquedas, sinTabla: r.sinTabla === true }); })
      .catch(e => { if (vivo) setError(e instanceof SinAcceso ? e.message : 'No se han podido cargar las búsquedas.'); });
    return () => { vivo = false; };
  }, []);

  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if (!datos) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" /> Cargando búsquedas…</div>;
  if (datos.sinTabla) return <p className="text-[13px] text-muted-foreground">Falta aplicar la migración de Academy: hasta entonces no se guardan búsquedas.</p>;
  if (datos.terminos.length === 0) return <p className="text-[13.5px] text-muted-foreground">Todavía no hay búsquedas sin resultado. Cuando alguien busque algo que no se encuentre, aparecerá aquí.</p>;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-muted-foreground">{datos.total} búsquedas sin resultado en los últimos 90 días, anonimizadas. Las más repetidas, primero.</p>
      <ul className="flex flex-col gap-2">
        {datos.terminos.map(t => (
          <li key={t.termino} className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-2.5">
            <span className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-foreground"><SearchX size={14} aria-hidden className="shrink-0 text-muted-foreground" /><span className="truncate">{t.termino}</span></span>
            <span className="shrink-0 text-[12px] text-muted-foreground">{t.veces} {t.veces === 1 ? 'vez' : 'veces'} · último {t.ultimoDia}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
