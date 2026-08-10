'use client';

import { useState } from 'react';
import { X, ChevronDown, Search, Send, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCore } from '@/lib/core-context';
import { dbInsertSoporteSolicitud } from '@/lib/supabase-data';
import type { TipoSoporte } from '@/lib/types';
import { DashboardSheet } from '@/components/ui/dashboard-sheet';
import { FAQS } from '@/lib/faqs';

const CATEGORIAS = [...new Set(FAQS.map(f => f.categoria))];

export function HelpWidget({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { studio } = useCore();
  const [query, setQuery] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [tipo, setTipo] = useState<TipoSoporte>('DUDA');
  const [mensaje, setMensaje] = useState('');
  const [contacto, setContacto] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const q = query.trim().toLowerCase();
  const faqsFiltrados = q
    ? FAQS.filter(f => `${f.pregunta} ${f.respuesta} ${f.categoria}`.toLowerCase().includes(q))
    : FAQS;

  async function enviarSolicitud() {
    if (!mensaje.trim() || enviando) return;
    setEnviando(true);
    const solicitud = {
      id: `sup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      tipo,
      mensaje: mensaje.trim(),
      contacto: contacto.trim() || null,
      creadoEn: new Date().toISOString(),
    };
    // 1) Registro durable en BD (historial). 2) Aviso por correo a soporte para
    //    que NOS LLEGUE — antes solo se guardaba y nadie lo veía. El correo es
    //    best-effort: si falla, el registro ya está guardado.
    await dbInsertSoporteSolicitud(solicitud);
    try {
      await fetch('/api/soporte', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo, mensaje: solicitud.mensaje, contacto: solicitud.contacto,
          studioNombre: studio?.nombre ?? null,
        }),
      });
    } catch { /* el registro en BD ya persiste; el correo es best-effort */ }
    setEnviando(false);
    setEnviado(true);
    setMensaje('');
    setContacto('');
    setTimeout(() => setEnviado(false), 4000);
  }

  return (
    <DashboardSheet
      open={open}
      onClose={onClose}
      label="Preguntas frecuentes"
      portal
      backdropClassName="fixed inset-0 z-50 flex items-end lg:items-center justify-center px-0 lg:px-4 bg-black/30"
      backdropStyle={{}}
      sheetClassName="w-full lg:w-[420px] bg-card rounded-t-3xl lg:rounded-3xl shadow-2xl flex flex-col"
      sheetStyle={{ maxHeight: '85vh' }}
    >
      <>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <p className="text-[15px] font-extrabold text-foreground">Preguntas frecuentes</p>
            <p className="text-[12px] text-muted-foreground">Y contacto directo con {studio?.nombre ?? 'Tentare'}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar la ayuda" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted">
            <X size={16} className="text-muted-foreground" />
          </button>
        </div>

            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-6">
              {/* FAQ search */}
              <div>
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted mb-3">
                  <Search size={14} className="text-muted-foreground shrink-0" />
                  <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Busca en las preguntas frecuentes…"
                    className="flex-1 bg-transparent text-[13px] focus:outline-none placeholder:text-muted-foreground"
                  />
                </div>

                <div className="space-y-4">
                  {CATEGORIAS.map(cat => {
                    const items = faqsFiltrados.filter(f => f.categoria === cat);
                    if (items.length === 0) return null;
                    return (
                      <div key={cat}>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1.5">{cat}</p>
                        <div className="space-y-1.5">
                          {items.map((f, i) => {
                            const key = `${cat}-${i}`;
                            const isOpen = openFaq === FAQS.indexOf(f);
                            return (
                              <div key={key} className="rounded-xl border border-border overflow-hidden">
                                <button
                                  onClick={() => setOpenFaq(isOpen ? null : FAQS.indexOf(f))}
                                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left"
                                >
                                  <span className="text-[13px] font-semibold text-foreground">{f.pregunta}</span>
                                  <ChevronDown size={14} className={cn('shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
                                </button>
                                {isOpen && (
                                  <p className="px-3 pb-3 text-[12.5px] text-muted-foreground leading-relaxed">{f.respuesta}</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  {faqsFiltrados.length === 0 && (
                    <p className="text-[13px] text-muted-foreground text-center py-6">Sin resultados para «{query}»</p>
                  )}
                </div>
              </div>

              {/* Contact form */}
              <div className="border-t border-border pt-4">
                <p className="text-[13px] font-bold text-foreground mb-2">¿No encuentras lo que buscas?</p>
                <p className="text-[12px] text-muted-foreground mb-3">Cuéntanos tu duda, sugerencia de mejora o un problema — nos llega directamente.</p>

                {enviado ? (
                  <div className="flex items-center gap-2 px-3 py-3 rounded-xl bg-[#EFFAF3] text-[#2E7D4F]">
                    <CheckCircle2 size={16} />
                    <span className="text-[13px] font-semibold">Enviado. ¡Gracias!</span>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <div className="flex gap-1.5">
                      {([['DUDA', 'Duda'], ['MEJORA', 'Mejora'], ['BUG', 'Problema']] as [TipoSoporte, string][]).map(([val, label]) => (
                        <button
                          key={val}
                          onClick={() => setTipo(val)}
                          className={cn(
                            'px-3 py-1.5 rounded-full text-[11px] font-bold transition-all',
                            tipo === val ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={mensaje}
                      onChange={e => setMensaje(e.target.value)}
                      placeholder="Escribe aquí..."
                      rows={3}
                      className="w-full px-3 py-2.5 rounded-xl border border-border text-[13px] focus:outline-none focus:border-brand-secondary resize-none"
                    />
                    <input
                      value={contacto}
                      onChange={e => setContacto(e.target.value)}
                      placeholder="Email de contacto (opcional)"
                      className="w-full px-3 py-2.5 rounded-xl border border-border text-[13px] focus:outline-none focus:border-brand-secondary"
                    />
                    <button
                      onClick={enviarSolicitud}
                      disabled={!mensaje.trim() || enviando}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-[13px] font-bold disabled:opacity-40"
                    >
                      <Send size={14} />
                      {enviando ? 'Enviando…' : 'Enviar'}
                    </button>
                  </div>
                )}
              </div>
            </div>
      </>
    </DashboardSheet>
  );
}
