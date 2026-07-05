'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useStudio } from '@/lib/studio-context';
import { Search, ArrowRight, Calendar, CreditCard, X } from 'lucide-react';

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const router = useRouter();
  const { socios, sesiones, recibos, tiposClase } = useStudio();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(v => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) { setTimeout(() => inputRef.current?.focus(), 40); setQuery(''); }
  }, [open]);

  const q = query.toLowerCase();
  const now = new Date();

  const sociosRes = q.length >= 1
    ? socios.filter(s => `${s.nombre} ${s.apellidos} ${s.email}`.toLowerCase().includes(q)).slice(0, 5)
    : socios.filter(s => s.activo).slice(0, 4);

  const sesionesRes = (() => {
    const futuras = sesiones.filter(s => !s.cancelada && new Date(s.inicio) > now)
      .sort((a, b) => a.inicio.localeCompare(b.inicio));
    if (q.length < 1) return futuras.slice(0, 3);
    return futuras.filter(s => {
      const tipo = tiposClase.find(t => t.id === s.tipoClaseId);
      return tipo?.nombre.toLowerCase().includes(q);
    }).slice(0, 4);
  })();

  const recibosRes = (() => {
    const pend = recibos.filter(r => r.estado === 'PENDIENTE');
    if (q.length < 1) return pend.slice(0, 3);
    return pend.filter(r => {
      const s = socios.find(x => x.id === r.socioId);
      return `${s?.nombre} ${s?.apellidos} ${r.concepto}`.toLowerCase().includes(q);
    }).slice(0, 4);
  })();

  const hasResults = sociosRes.length > 0 || sesionesRes.length > 0 || recibosRes.length > 0;

  function go(href: string) { router.push(href); setOpen(false); }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all hover:bg-white/10"
        style={{ color: 'rgba(255,255,255,0.45)' }}
      >
        <Search size={15} />
        <span className="hidden md:inline text-xs">Buscar</span>
        <kbd className="hidden md:inline text-[10px] px-1.5 py-0.5 rounded font-mono leading-none" style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.3)' }}>⌘K</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-[#EBEBF0] overflow-hidden">
            {/* Input */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#EBEBF0]">
              <Search size={16} style={{ color: '#9898A6' }} className="shrink-0" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Buscar socias, clases, pagos…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="flex-1 text-sm font-medium text-[#1A1A2E] placeholder:text-[#9898A6] focus:outline-none bg-transparent"
              />
              {query ? (
                <button onClick={() => setQuery('')} className="shrink-0 w-6 h-6 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors">
                  <X size={13} style={{ color: '#9898A6' }} />
                </button>
              ) : (
                <kbd className="shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-[#EBEBF0] font-mono" style={{ color: '#9898A6' }}>Esc</kbd>
              )}
            </div>

            {/* Results */}
            <div className="max-h-[400px] overflow-y-auto p-2">
              {/* Socias */}
              {sociosRes.length > 0 && (
                <div className="mb-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest px-3 py-2" style={{ color: '#9898A6' }}>
                    {q ? 'Socias' : 'Socias activas'}
                  </p>
                  {sociosRes.map(s => (
                    <button key={s.id} onClick={() => go(`/socios/${s.id}`)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-left group">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ backgroundColor: '#EDF9C8', color: '#6B4FA8' }}>
                        {s.nombre[0]}{s.apellidos[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#1A1A2E] truncate">{s.nombre} {s.apellidos}</p>
                        <p className="text-xs truncate" style={{ color: '#9898A6' }}>{s.email}</p>
                      </div>
                      {(s.tags ?? []).length > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ backgroundColor: '#EDF9C8', color: '#6B4FA8' }}>
                          {s.tags![0]}
                        </span>
                      )}
                      <ArrowRight size={13} className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#9898A6' }} />
                    </button>
                  ))}
                </div>
              )}

              {/* Sesiones próximas */}
              {sesionesRes.length > 0 && (
                <div className="mb-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest px-3 py-2" style={{ color: '#9898A6' }}>Próximas clases</p>
                  {sesionesRes.map(s => {
                    const tipo = tiposClase.find(t => t.id === s.tipoClaseId);
                    const d = new Date(s.inicio);
                    return (
                      <button key={s.id} onClick={() => go('/calendario')}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-left group">
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: tipo?.color ?? '#C8C2E8', opacity: 0.85 }}>
                          <Calendar size={14} style={{ color: '#fff' }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[#1A1A2E] truncate">{tipo?.nombre ?? 'Clase'}</p>
                          <p className="text-xs truncate" style={{ color: '#9898A6' }}>
                            {d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })} · {d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <ArrowRight size={13} className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#9898A6' }} />
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Pagos pendientes */}
              {recibosRes.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest px-3 py-2" style={{ color: '#9898A6' }}>Pagos pendientes</p>
                  {recibosRes.map(r => {
                    const s = socios.find(x => x.id === r.socioId);
                    return (
                      <button key={r.id} onClick={() => go('/pagos')}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-left group">
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: '#FEF3C7' }}>
                          <CreditCard size={14} style={{ color: '#92400E' }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[#1A1A2E] truncate">{r.concepto}</p>
                          <p className="text-xs truncate" style={{ color: '#9898A6' }}>
                            {s ? `${s.nombre} ${s.apellidos}` : '—'} · {r.importe} €
                          </p>
                        </div>
                        <ArrowRight size={13} className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#9898A6' }} />
                      </button>
                    );
                  })}
                </div>
              )}

              {!hasResults && q.length > 0 && (
                <div className="py-12 text-center">
                  <p className="text-sm font-medium" style={{ color: '#9898A6' }}>Sin resultados para "{query}"</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-[#EBEBF0] px-4 py-2 flex items-center gap-4">
              <span className="text-[10px] font-medium" style={{ color: '#C6C6BE' }}>
                <kbd className="border border-[#EBEBF0] rounded px-1 mr-1 font-mono">↵</kbd>abrir
              </span>
              <span className="text-[10px] font-medium" style={{ color: '#C6C6BE' }}>
                <kbd className="border border-[#EBEBF0] rounded px-1 mr-1 font-mono">Esc</kbd>cerrar
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
