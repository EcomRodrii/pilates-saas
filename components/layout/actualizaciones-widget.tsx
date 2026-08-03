'use client';

// Changelog de Tentare ("Actualizaciones") — antes "Novedades", una lista
// hardcodeada en lib/novedades.ts que exigía deploy para cambiar. Ahora lee
// de Supabase (changelog_versiones/changelog_cambios, ver migr
// 20260803180000) y se suscribe a Realtime MIENTRAS está abierto: si alguien
// publica una versión desde app/interno/actualizaciones con esta sheet
// abierta, aparece sola, sin recargar. No es una suscripción global en
// studio-context.tsx a propósito — es contenido de baja frecuencia de
// publicación y esta es una sheet que se abre/cierra, no una parte siempre
// visible del panel.

import { useEffect, useRef, useState } from 'react';
import { X, Sparkles, Loader2 } from 'lucide-react';
import { cn, compararVersiones } from '@/lib/utils';
import { DashboardSheet } from '@/components/ui/dashboard-sheet';
import { supabase } from '@/lib/db/supabase';
import type { EtiquetaCambio } from '@/lib/interno/client';

interface CambioVersion {
  texto: string;
  etiqueta: EtiquetaCambio;
  orden: number;
}

interface Version {
  id: string;
  version: string;
  titulo: string;
  fecha_publicacion: string;
  cambios: CambioVersion[];
}

const META_ETIQUETA: Record<EtiquetaCambio, { label: string; className: string }> = {
  NUEVA_FUNCIONALIDAD: { label: 'Nueva funcionalidad', className: 'bg-brand/10 text-brand' },
  MEJORA: { label: 'Mejora', className: 'bg-brand/10 text-brand' },
  RENDIMIENTO: { label: 'Rendimiento', className: 'bg-success/10 text-success' },
  ARREGLO: { label: 'Bug corregido', className: 'bg-warning/10 text-warning' },
};

const PAGINA = 6;

function fechaCorta(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${d} ${MESES[m - 1]}`;
}

// `error` distingue "no hay nada" de "no se ha podido comprobar" — un fallo de
// red no debe leerse igual que un changelog vacío, ni debe borrar lo que ya
// había en pantalla (ver caller). Pide un elemento MÁS del límite pedido y lo
// recorta: así "hay más" se sabe de verdad, en vez de asumirlo por
// `length >= limite` — que da un "Cargar más" que no carga nada cuando el
// total es justo un múltiplo de la página.
async function cargarVersiones(limite: number): Promise<{ versiones: Version[]; hayMas: boolean } | { error: true }> {
  const { data, error } = await supabase
    .from('changelog_versiones')
    .select('id, version, titulo, fecha_publicacion, changelog_cambios(texto, etiqueta, orden)')
    .eq('estado', 'publicado')
    .order('fecha_publicacion', { ascending: false })
    .limit(limite + 1);
  if (error) return { error: true };
  const filas = data ?? [];
  const hayMas = filas.length > limite;
  const versiones = filas.slice(0, limite).map(v => ({
    id: v.id as string,
    version: v.version as string,
    titulo: v.titulo as string,
    fecha_publicacion: v.fecha_publicacion as string,
    cambios: ((v.changelog_cambios ?? []) as CambioVersion[]).slice().sort((a, b) => a.orden - b.orden),
  }))
    // `version` es texto: un ORDER BY de SQL la trata como texto y ordena mal
    // ("0.10" antes que "0.2"). Se reordena en JS como desempate por fecha.
    .sort((a, b) => a.fecha_publicacion === b.fecha_publicacion
      ? compararVersiones(b.version, a.version)
      : b.fecha_publicacion.localeCompare(a.fecha_publicacion));
  return { versiones, hayMas };
}

export function ActualizacionesWidget({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [versiones, setVersiones] = useState<Version[] | null>(null);
  const [hayMas, setHayMas] = useState(false);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState(false);
  // El límite vive también en un ref: la suscripción de Realtime lo lee sin
  // tener que depender de él — "Cargar más" no debe tirar abajo y recrear el
  // canal (deja un hueco donde un evento concurrente se perdería) ni disparar
  // un segundo fetch redundante además del que ya hace cargarMas().
  const limiteRef = useRef(PAGINA);

  // Fetch inicial (al abrir) + Realtime mientras está abierto. Al recibir
  // cualquier evento se hace REFETCH, no se reconstruye a mano desde el
  // payload — evita desincronías con changelog_cambios (la tabla hija no
  // está en la publicación de Realtime, solo la cabecera de versión).
  useEffect(() => {
    if (!open) return;
    let vivo = true;
    let canal: ReturnType<typeof supabase.channel> | null = null;

    const refrescar = () => {
      cargarVersiones(limiteRef.current).then(r => {
        if (!vivo) return;
        if ('error' in r) { setError(true); return; }
        setError(false);
        setVersiones(r.versiones);
        setHayMas(r.hayMas);
      });
    };
    refrescar();

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!vivo) return;
      await supabase.realtime.setAuth(data.session?.access_token ?? null);
      if (!vivo) return;
      canal = supabase
        .channel('changelog_versiones')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'changelog_versiones' }, refrescar)
        .subscribe();
    })();

    return () => {
      vivo = false;
      if (canal) supabase.removeChannel(canal);
    };
  }, [open]);

  const cargarMas = async () => {
    setCargandoMas(true);
    const siguienteLimite = limiteRef.current + PAGINA;
    const r = await cargarVersiones(siguienteLimite);
    if ('error' in r) { setError(true); setCargandoMas(false); return; }
    limiteRef.current = siguienteLimite;
    setVersiones(r.versiones);
    setHayMas(r.hayMas);
    setCargandoMas(false);
  };

  return (
    <DashboardSheet
      open={open}
      onClose={onClose}
      label="Actualizaciones"
      portal
      backdropClassName="fixed inset-0 z-50 flex items-end lg:items-center justify-center px-0 lg:px-4 bg-black/30"
      backdropStyle={{}}
      sheetClassName="w-full lg:w-[420px] bg-card rounded-t-3xl lg:rounded-3xl shadow-2xl flex flex-col"
      sheetStyle={{ maxHeight: '85vh' }}
    >
      <>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-brand" />
            <div>
              <p className="text-[15px] font-extrabold text-foreground">Actualizaciones</p>
              <p className="text-[12px] text-muted-foreground">El changelog de Tentare</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar actualizaciones" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted">
            <X size={16} className="text-muted-foreground" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4">
          {versiones === null ? (
            <p className="text-[12.5px] text-muted-foreground">{error ? 'No se ha podido cargar. Inténtalo de nuevo en un momento.' : 'Cargando…'}</p>
          ) : versiones.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground">Todavía no hay actualizaciones publicadas.</p>
          ) : (
            <div className="space-y-4">
              {error && <p className="text-[12px] text-warning">No se ha podido comprobar si hay algo nuevo — esto puede estar desactualizado.</p>}
              {versiones.map(v => (
                <div key={v.id} className="pb-4 border-b border-border last:border-0 last:pb-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-muted text-foreground">
                      v{v.version}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{fechaCorta(v.fecha_publicacion)}</span>
                  </div>
                  <p className="text-[13.5px] font-semibold text-foreground mb-1.5">{v.titulo}</p>
                  <ul className="space-y-1">
                    {v.cambios.map((c, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className={cn('mt-0.5 shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide', META_ETIQUETA[c.etiqueta].className)}>
                          {META_ETIQUETA[c.etiqueta].label}
                        </span>
                        <span className="text-[12.5px] text-muted-foreground leading-relaxed">{c.texto}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {hayMas && (
                <button
                  type="button" onClick={() => void cargarMas()} disabled={cargandoMas}
                  className="flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-medio"
                >
                  {cargandoMas && <Loader2 size={12} className="animate-spin" />}
                  Cargar más
                </button>
              )}
            </div>
          )}
        </div>
      </>
    </DashboardSheet>
  );
}
