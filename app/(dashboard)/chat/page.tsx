'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Send, Users, AlertCircle, Clock, RotateCw } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { useAuth } from '@/lib/auth-context';
import { useTeamChat, type MensajeChat } from '@/lib/stores/use-team-chat-store';

function formatHora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

// Etiqueta de día en local: "Hoy" / "Ayer" / fecha. (Antes siempre pintaba la
// fecha aunque el comentario prometía "Hoy".)
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

  // Autor actual: la instructora vinculada al login, o la propietaria.
  const yo = instructores.find(i => i.authUserId === user?.id);
  const miInstructorId = yo?.id ?? null;
  const miNombre = yo?.nombre ?? (user ? 'Propietaria' : 'Equipo');

  const { mensajes, estadoCarga, enviar, reintentar } = useTeamChat({
    autorInstructorId: miInstructorId,
    autorNombre: miNombre,
  });

  const [texto, setTexto] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const esMio = (m: MensajeChat) =>
    miInstructorId ? m.autorInstructorId === miInstructorId : m.autorInstructorId == null && m.autorNombre === miNombre;

  // Autoscroll al fondo cuando llega/mando un mensaje.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [mensajes.length]);

  // Textarea que crece con el contenido (hasta un tope).
  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  }, [texto]);

  function onEnviar() {
    const limpio = texto.trim();
    if (!limpio) return;
    enviar(limpio);
    setTexto('');
  }

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] lg:h-[calc(100vh-90px)] max-w-3xl">
      <div className="flex items-center gap-2 mb-4">
        <Users size={18} className="text-muted-foreground" />
        <div>
          <h1 className="text-xl font-semibold text-foreground">Chat de equipo</h1>
          <p className="text-xs text-muted-foreground">Canal compartido — propietaria, recepción e instructoras</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-card border border-border rounded-xl p-4 space-y-3">
        {estadoCarga === 'cargando' ? (
          <div className="space-y-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="flex items-start gap-2.5 animate-pulse">
                <div className="w-8 h-8 rounded-full bg-muted shrink-0" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-3 w-24 bg-muted rounded" />
                  <div className="h-3 w-2/3 bg-muted rounded" />
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
          <div className="h-full flex items-center justify-center text-center">
            <p className="text-sm text-muted-foreground">
              Sin mensajes todavía. Escribe el primero para avisar al resto del equipo.
            </p>
          </div>
        ) : (
          mensajes.map((m, i) => {
            const anterior = mensajes[i - 1];
            const nuevoDia = !anterior || !mismaFechaLocal(new Date(anterior.creadoEn), new Date(m.creadoEn));
            const mio = esMio(m);
            return (
              <div key={m.id}>
                {nuevoDia && (
                  <div className="flex items-center gap-2 my-3">
                    <div className="flex-1 h-px bg-muted" />
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                      {etiquetaDia(m.creadoEn)}
                    </span>
                    <div className="flex-1 h-px bg-muted" />
                  </div>
                )}
                <div className={`flex items-start gap-2.5 ${mio ? 'flex-row-reverse' : ''}`}>
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold text-foreground"
                    style={{ backgroundColor: avatarColor(m.autorNombre) }}
                  >
                    {m.autorNombre.slice(0, 2).toUpperCase()}
                  </div>
                  <div className={`min-w-0 flex flex-col ${mio ? 'items-end' : 'items-start'}`}>
                    <div className={`flex items-baseline gap-2 ${mio ? 'flex-row-reverse' : ''}`}>
                      <span className="text-sm font-semibold text-foreground">{mio ? 'Tú' : m.autorNombre}</span>
                      <span className="text-[10px] text-muted-foreground">{formatHora(m.creadoEn)}</span>
                    </div>
                    <div
                      className={`mt-0.5 rounded-2xl px-3 py-1.5 text-sm whitespace-pre-wrap break-words ${
                        mio ? 'bg-brand/15 text-foreground' : 'bg-muted text-foreground'
                      } ${m.estado === 'enviando' ? 'opacity-60' : ''}`}
                    >
                      {m.texto}
                    </div>
                    {mio && m.estado === 'enviando' && (
                      <span className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock size={10} /> Enviando…
                      </span>
                    )}
                    {mio && m.estado === 'fallido' && (
                      <button
                        onClick={() => reintentar(m.id)}
                        className="mt-0.5 flex items-center gap-1 text-[10px] text-destructive hover:underline"
                      >
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

      <div className="flex items-end gap-2 mt-3">
        <textarea
          ref={taRef}
          rows={1}
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onEnviar();
            }
          }}
          placeholder="Escribe un mensaje al equipo…  (Enter para enviar, Shift+Enter para salto de línea)"
          className="flex-1 resize-none rounded-xl border border-border px-4 py-2.5 text-sm leading-snug focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/30 transition-all"
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
  );
}
