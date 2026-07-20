'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useStudio } from '@/lib/studio-context';
import { Search, ArrowRight, Calendar, CreditCard, X, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePermisos } from '@/lib/permisos';
import { buscarTareas, rutaBase } from '@/lib/tareas';

export function GlobalSearch({
  collapsed,
  variant = 'dark',
  abierto,
  onAbiertoChange,
}: {
  collapsed?: boolean;
  variant?: 'dark' | 'light';
  /** Permite abrirlo desde fuera (botón "¿Qué quieres hacer?"). */
  abierto?: boolean;
  onAbiertoChange?: (v: boolean) => void;
} = {}) {
  const [openInterno, setOpenInterno] = useState(false);
  const open = abierto ?? openInterno;
  const setOpen = (v: boolean) => { setOpenInterno(v); onAbiertoChange?.(v); };
  const [query, setQuery] = useState('');
  const router = useRouter();
  const { socios, sesiones, recibos, tiposClase } = useStudio();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(!open);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) { setTimeout(() => inputRef.current?.focus(), 40); setQuery(''); }
  }, [open]);

  // P0-32: debounce del texto (no filtrar en cada tecla) + resultados memoizados
  // + Map socio por id (antes: socios.find() por cada recibo, en cada pulsación).
  const [debouncedQ, setDebouncedQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query.trim().toLowerCase()), 150);
    return () => clearTimeout(t);
  }, [query]);

  const q = debouncedQ;
  const socioById = useMemo(() => new Map(socios.map(s => [s.id, s])), [socios]);
  const tipoById = useMemo(() => new Map(tiposClase.map(t => [t.id, t])), [tiposClase]);

  const sociosRes = useMemo(() => q.length >= 1
    ? socios.filter(s => `${s.nombre} ${s.apellidos} ${s.email}`.toLowerCase().includes(q)).slice(0, 5)
    : socios.filter(s => s.activo).slice(0, 4),
    [socios, q]);

  const sesionesRes = useMemo(() => {
    const nowMs = Date.now();
    const futuras = sesiones.filter(s => !s.cancelada && new Date(s.inicio).getTime() > nowMs)
      .sort((a, b) => a.inicio.localeCompare(b.inicio));
    if (q.length < 1) return futuras.slice(0, 3);
    return futuras.filter(s => tipoById.get(s.tipoClaseId)?.nombre.toLowerCase().includes(q)).slice(0, 4);
  }, [sesiones, tipoById, q]);

  const recibosRes = useMemo(() => {
    const pend = recibos.filter(r => r.estado === 'PENDIENTE');
    if (q.length < 1) return pend.slice(0, 3);
    return pend.filter(r => {
      const s = socioById.get(r.socioId ?? '');
      return `${s?.nombre} ${s?.apellidos} ${r.concepto}`.toLowerCase().includes(q);
    }).slice(0, 4);
  }, [recibos, socioById, q]);

  // Las TAREAS van primero y salen incluso con la caja vacía: quien abre ⌘K sin
  // saber qué buscar ve de qué es capaz el programa. Es la vía para llegar a un
  // sitio sin conocer la estructura del menú.
  const { puedeVer } = usePermisos();
  const tareasRes = useMemo(
    () => buscarTareas(q, q ? 5 : 4).filter(t => puedeVer(rutaBase(t.href))),
    [q, puedeVer],
  );

  const hasResults = tareasRes.length > 0 || sociosRes.length > 0 || sesionesRes.length > 0 || recibosRes.length > 0;

  function go(href: string) { router.push(href); setOpen(false); }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Buscar (⌘K)"
        className={collapsed
          ? cn('flex items-center justify-center w-10 h-10 mx-auto rounded-xl transition-all', variant === 'dark' ? 'hover:bg-card/10' : 'hover:bg-muted')
          : cn('flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all', variant === 'dark' ? 'hover:bg-card/10' : 'bg-muted hover:bg-background w-full max-w-xs')}
        style={{ color: variant === 'dark' ? 'rgba(255,255,255,0.45)' : 'var(--muted-foreground)' }}
      >
        <Search size={15} className="shrink-0" />
        {!collapsed && <span className="hidden md:inline text-xs">Buscar</span>}
        {!collapsed && (
          <kbd
            className="hidden md:inline ml-auto text-[10px] px-1.5 py-0.5 rounded font-mono leading-none"
            style={variant === 'dark'
              ? { backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.3)' }
              : { backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)' }}
          >⌘K</kbd>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-lg bg-card rounded-2xl shadow-2xl border border-border overflow-hidden">
            {/* Input */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border">
              <Search size={16} style={{ color: 'var(--muted-foreground)' }} className="shrink-0" />
              <input
                ref={inputRef}
                type="text"
                placeholder="¿Qué quieres hacer? O busca una clienta, clase o pago…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="flex-1 text-sm font-medium text-foreground placeholder:text-muted-foreground focus:outline-none bg-transparent"
              />
              {query ? (
                <button onClick={() => setQuery('')} aria-label="Borrar búsqueda" className="shrink-0 w-6 h-6 flex items-center justify-center rounded-lg hover:bg-muted transition-colors">
                  <X size={13} style={{ color: 'var(--muted-foreground)' }} />
                </button>
              ) : (
                <kbd className="shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-border font-mono" style={{ color: 'var(--muted-foreground)' }}>Esc</kbd>
              )}
            </div>

            {/* Results */}
            <div className="max-h-[400px] overflow-y-auto p-2">
              {/* Tareas — primero: responde a "¿qué quiero hacer?" */}
              {tareasRes.length > 0 && (
                <div className="mb-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest px-3 py-2" style={{ color: 'var(--muted-foreground)' }}>
                    {q ? 'Acciones' : '¿Qué quieres hacer?'}
                  </p>
                  {tareasRes.map(t => (
                    <button key={t.id} onClick={() => go(t.href)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted transition-colors text-left group">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-brand/10">
                        <Zap size={14} className="text-brand" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{t.label}</p>
                        {t.pista && (
                          <p className="text-xs truncate" style={{ color: 'var(--muted-foreground)' }}>{t.pista}</p>
                        )}
                      </div>
                      <ArrowRight size={13} className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--muted-foreground)' }} />
                    </button>
                  ))}
                </div>
              )}

              {/* Socias */}
              {sociosRes.length > 0 && (
                <div className="mb-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest px-3 py-2" style={{ color: 'var(--muted-foreground)' }}>
                    {q ? 'Clientas' : 'Clientas activas'}
                  </p>
                  {sociosRes.map(s => (
                    <button key={s.id} onClick={() => go(`/clientas/${s.id}`)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted transition-colors text-left group">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-brand-secondary/10 text-brand-secondary">
                        {s.nombre[0]}{s.apellidos[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{s.nombre} {s.apellidos}</p>
                        <p className="text-xs truncate" style={{ color: 'var(--muted-foreground)' }}>{s.email}</p>
                      </div>
                      {(s.tags ?? []).length > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 bg-brand-secondary/10 text-brand-secondary">
                          {s.tags![0]}
                        </span>
                      )}
                      <ArrowRight size={13} className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--muted-foreground)' }} />
                    </button>
                  ))}
                </div>
              )}

              {/* Sesiones próximas */}
              {sesionesRes.length > 0 && (
                <div className="mb-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest px-3 py-2" style={{ color: 'var(--muted-foreground)' }}>Próximas clases</p>
                  {sesionesRes.map(s => {
                    const tipo = tipoById.get(s.tipoClaseId);
                    const d = new Date(s.inicio);
                    return (
                      <button key={s.id} onClick={() => go('/calendario')}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted transition-colors text-left group">
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: tipo?.color ?? '#C8C2E8', opacity: 0.85 }}>
                          <Calendar size={14} style={{ color: '#fff' }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{tipo?.nombre ?? 'Clase'}</p>
                          <p className="text-xs truncate" style={{ color: 'var(--muted-foreground)' }}>
                            {d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })} · {d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <ArrowRight size={13} className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--muted-foreground)' }} />
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Pagos pendientes */}
              {recibosRes.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest px-3 py-2" style={{ color: 'var(--muted-foreground)' }}>Pagos pendientes</p>
                  {recibosRes.map(r => {
                    const s = socioById.get(r.socioId ?? '');
                    return (
                      <button key={r.id} onClick={() => go('/cobros?tab=pendientes')}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted transition-colors text-left group">
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: 'color-mix(in srgb, var(--warning) 12%, var(--card))' }}>
                          <CreditCard size={14} style={{ color: 'var(--warning)' }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{r.concepto}</p>
                          <p className="text-xs truncate" style={{ color: 'var(--muted-foreground)' }}>
                            {s ? `${s.nombre} ${s.apellidos}` : '—'} · {r.importe} €
                          </p>
                        </div>
                        <ArrowRight size={13} className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--muted-foreground)' }} />
                      </button>
                    );
                  })}
                </div>
              )}

              {!hasResults && q.length > 0 && (
                <div className="py-12 text-center">
                  <p className="text-sm font-medium" style={{ color: 'var(--muted-foreground)' }}>Sin resultados para "{query}"</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-border px-4 py-2 flex items-center gap-4">
              <span className="text-[10px] font-medium" style={{ color: 'var(--muted-foreground)' }}>
                <kbd className="border border-border rounded px-1 mr-1 font-mono">↵</kbd>abrir
              </span>
              <span className="text-[10px] font-medium" style={{ color: 'var(--muted-foreground)' }}>
                <kbd className="border border-border rounded px-1 mr-1 font-mono">Esc</kbd>cerrar
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
