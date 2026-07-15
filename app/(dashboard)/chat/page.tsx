'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Send, Hash, Plus, AlertCircle, Clock, RotateCw, X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { useAuth } from '@/lib/auth-context';
import { useTeamChat, type MensajeChat } from '@/lib/stores/use-team-chat-store';

function formatHora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}
function mismaFechaLocal(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}
function etiquetaDia(iso: string) {
  const d = new Date(iso);
  const hoy = new Date();
  const ayer = new Date();
  ayer.setDate(hoy.getDate() - 1);
  if (mismaFechaLocal(d, hoy)) return 'Hoy';
  if (mismaFechaLocal(d, ayer)) return 'Ayer';
  return d.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    ...(d.getFullYear() !== hoy.getFullYear() ? { year: 'numeric' } : {}),
  });
}

const AVATAR_COLORS = ['#FFC8E2', '#A7F3D0', '#BFDBFE', '#FDE68A', '#DDD6FE', '#FECACA'];
function avatarColor(nombre: string) {
  let hash = 0;
  for (let i = 0; i < nombre.length; i++) hash = nombre.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function ChatEquipoPage() {
  const { instructores } = useStudio();
  const { user } = useAuth();

  const yo = instructores.find(i => i.authUserId === user?.id);
  const miInstructorId = yo?.id ?? null;
  const miNombre = yo?.nombre ?? (user ? 'Propietaria' : 'Equipo');

  const { canales, canalActivo, setCanalActivo, mensajes, estadoCarga, enviar, reintentar, crearCanal } =
    useTeamChat({ autorInstructorId: miInstructorId, autorNombre: miNombre });

  const [texto, setTexto] = useState('');
  const [creando, setCreando] = useState(false);
  const [nuevoCanal, setNuevoCanal] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const esMio = (m: MensajeChat) =>
    miInstructorId ? m.autorInstructorId === miInstructorId : m.autorInstructorId == null && m.autorNombre === miNombre;
  const canalNombre = canales.find(c => c.id === canalActivo)?.nombre ?? '';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [mensajes.length, canalActivo]);

  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  }, [texto]);

  function onEnviar() {
    if (!texto.trim()) return;
    enviar(texto);
    setTexto('');
  }
  function onCrearCanal() {
    const n = nuevoCanal.trim();
    if (!n) return;
    crearCanal(n);
    setNuevoCanal('');
    setCreando(false);
  }

  return (
    <div className="flex h-[calc(100vh-140px)] lg:h-[calc(100vh-90px)] border border-border rounded-xl overflow-hidden bg-card">
      {/* ── Sidebar de canales ─────────────────────────────────────────────── */}
      <div className="w-44 sm:w-56 shrink-0 border-r border-border bg-background flex flex-col">
        <div className="px-3 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Canales</h2>
          <button
            onClick={() => setCreando(true)}
            title="Nuevo canal"
            className="w-6 h-6 rounded-md hover:bg-card flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus size={15} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {canales.map(c => (
            <button
              key={c.id}
              onClick={() => setCanalActivo(c.id)}
              className={cn(
                'w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-left transition-colors',
                c.id === canalActivo
                  ? 'bg-brand/15 text-brand font-semibold'
                  : 'text-muted-foreground hover:bg-card hover:text-foreground',
              )}
            >
              <Hash size={14} className="shrink-0 opacity-70" />
              <span className="truncate">{c.nombre}</span>
            </button>
          ))}
          {creando && (
            <div className="flex items-center gap-1 px-1 py-1">
              <Hash size={14} className="shrink-0 text-muted-foreground" />
              <input
                autoFocus
                value={nuevoCanal}
                onChange={e => setNuevoCanal(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); onCrearCanal(); }
                  if (e.key === 'Escape') { setCreando(false); setNuevoCanal(''); }
                }}
                placeholder="nombre-del-canal"
                className="flex-1 min-w-0 text-sm bg-card border border-border rounded px-1.5 py-1 outline-none focus:border-brand"
              />
              <button onClick={onCrearCanal} className="text-brand hover:opacity-80" title="Crear"><Check size={15} /></button>
              <button onClick={() => { setCreando(false); setNuevoCanal(''); }} className="text-muted-foreground hover:text-foreground" title="Cancelar"><X size={14} /></button>
            </div>
          )}
        </div>
      </div>

      {/* ── Panel de mensajes ──────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2 shrink-0">
          <Hash size={16} className="text-muted-foreground" />
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-foreground truncate">{canalNombre || 'Chat de equipo'}</h1>
            <p className="text-[11px] text-muted-foreground">Propietaria, recepción e instructoras</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
          {estadoCarga === 'cargando' ? (
            <div className="space-y-3">
              {[0, 1, 2].map(i => (
                <div key={i} className="flex items-start gap-2 animate-pulse">
                  <div className="w-8 h-8 rounded-full bg-muted shrink-0" />
                  <div className="flex-1 space-y-2 py-1">
                    <div className="h-3 w-24 bg-muted rounded" />
                    <div className="h-6 w-1/2 bg-muted rounded-2xl" />
                  </div>
                </div>
              ))}
            </div>
          ) : estadoCarga === 'error' ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-2">
              <AlertCircle size={22} className="text-destructive" />
              <p className="text-sm text-muted-foreground">No se pudieron cargar los mensajes.</p>
            </div>
          ) : mensajes.length === 0 ? (
            <div className="h-full flex items-center justify-center text-center px-6">
              <p className="text-sm text-muted-foreground">
                Aún no hay mensajes en <span className="font-semibold text-foreground">#{canalNombre}</span>. Escribe el primero.
              </p>
            </div>
          ) : (
            mensajes.map((m, i) => {
              const prev = mensajes[i - 1];
              const nuevoDia = !prev || !mismaFechaLocal(new Date(prev.creadoEn), new Date(m.creadoEn));
              const mio = esMio(m);
              const mismoGrupo = !!prev && !nuevoDia && esMio(prev) === mio && prev.autorNombre === m.autorNombre;
              return (
                <div key={m.id}>
                  {nuevoDia && (
                    <div className="flex items-center gap-2 my-3">
                      <div className="flex-1 h-px bg-muted" />
                      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{etiquetaDia(m.creadoEn)}</span>
                      <div className="flex-1 h-px bg-muted" />
                    </div>
                  )}
                  <div className={cn('flex gap-2', mio ? 'flex-row-reverse' : '', mismoGrupo ? 'mt-0.5' : 'mt-2')}>
                    {!mio && (
                      mismoGrupo ? (
                        <div className="w-8 shrink-0" />
                      ) : (
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold text-foreground"
                          style={{ backgroundColor: avatarColor(m.autorNombre) }}
                        >
                          {m.autorNombre.slice(0, 2).toUpperCase()}
                        </div>
                      )
                    )}
                    <div className={cn('flex flex-col max-w-[75%]', mio ? 'items-end' : 'items-start')}>
                      {!mismoGrupo && (
                        <div className={cn('flex items-baseline gap-2 mb-0.5 px-1', mio && 'flex-row-reverse')}>
                          <span className="text-[13px] font-semibold text-foreground">{mio ? 'Tú' : m.autorNombre}</span>
                          <span className="text-[10px] text-muted-foreground">{formatHora(m.creadoEn)}</span>
                        </div>
                      )}
                      <div
                        className={cn(
                          'rounded-2xl px-3 py-1.5 text-sm whitespace-pre-wrap break-words',
                          mio ? 'bg-brand text-brand-foreground rounded-tr-sm' : 'bg-muted text-foreground rounded-tl-sm',
                          m.estado === 'enviando' && 'opacity-60',
                        )}
                      >
                        {m.texto}
                      </div>
                      {mio && m.estado === 'enviando' && (
                        <span className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground px-1"><Clock size={10} /> Enviando…</span>
                      )}
                      {mio && m.estado === 'fallido' && (
                        <button onClick={() => reintentar(m.id)} className="mt-0.5 flex items-center gap-1 text-[10px] text-destructive hover:underline px-1">
                          <RotateCw size={10} /> No se envió · Reintentar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-border p-3 flex items-end gap-2 shrink-0">
          <textarea
            ref={taRef}
            rows={1}
            value={texto}
            onChange={e => setTexto(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onEnviar(); }
            }}
            placeholder={canalNombre ? `Escribe en #${canalNombre}…  (Enter para enviar)` : 'Escribe un mensaje…'}
            disabled={!canalActivo}
            className="flex-1 resize-none rounded-xl border border-border px-4 py-2.5 text-sm leading-snug focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/30 transition-all disabled:opacity-50"
          />
          <button
            onClick={onEnviar}
            disabled={!texto.trim()}
            className="shrink-0 w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-[#333] transition-colors disabled:opacity-40"
            aria-label="Enviar mensaje"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
