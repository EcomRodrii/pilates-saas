'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  ArrowLeft, GraduationCap, Loader2, MessageSquarePlus, RefreshCw, Send, Store, Users,
} from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { useAuth } from '@/lib/auth-context';
import { useRol } from '@/lib/permisos';
import { puedeGestionarCalendario } from '@/lib/permisos-reglas';
import { authHeader } from '@/lib/api-client';
import { supabase } from '@/lib/db/supabase';
import { EmptyState } from '@/components/ui/empty-state';
import type { Socio, Instructor } from '@/lib/types';
import type { RowMensajes } from '@/lib/db-types';
import type { RowConversacionesConParticipantes } from '@/lib/mensajeria/tipos';

type Conversacion = RowConversacionesConParticipantes;

const TIPO_INFO: Record<string, { label: string; Icon: typeof Users }> = {
  EQUIPO: { label: 'Equipo', Icon: Users },
  ALUMNA_INSTRUCTORA: { label: 'Con instructora', Icon: GraduationCap },
  ALUMNA_MOSTRADOR: { label: 'Mostrador', Icon: Store },
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `hace ${days}d`;
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

function nombreConversacion(row: Conversacion, socios: Socio[], instructores: Instructor[]): string {
  if (row.tipo === 'EQUIPO') return row.titulo || 'Equipo';
  const socioId = row.conversacion_participantes.find(p => p.rol_en_conversacion === 'SOCIO')?.socio_id;
  const socio = socioId ? socios.find(s => s.id === socioId) : undefined;
  const nombreSocia = socio ? `${socio.nombre} ${socio.apellidos}`.trim() : 'Socia';
  if (row.tipo === 'ALUMNA_MOSTRADOR') return nombreSocia;
  const staffAuthId = row.conversacion_participantes.find(p => p.rol_en_conversacion === 'STAFF')?.auth_user_id;
  const instructor = staffAuthId ? instructores.find(i => i.authUserId === staffAuthId) : undefined;
  return instructor ? `${nombreSocia} · ${instructor.nombre}` : nombreSocia;
}

async function api<T>(url: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(await authHeader()), ...(init?.headers ?? {}) },
    });
    if (res.status === 204) return { ok: true, data: undefined as T };
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: (body as { error?: string }).error ?? 'Ha ocurrido un error.' };
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, error: 'No se ha podido conectar con el servidor.' };
  }
}

// ── Nueva conversación ─────────────────────────────────────────────────────

function NuevaConversacion({
  socios, instructores, puedeMostrador, onCreada, onCerrar,
}: {
  socios: Socio[];
  instructores: Instructor[];
  puedeMostrador: boolean;
  onCreada: (id: string) => void;
  onCerrar: () => void;
}) {
  const uid = useId();
  const [tipo, setTipo] = useState<'ALUMNA_INSTRUCTORA' | 'ALUMNA_MOSTRADOR'>('ALUMNA_INSTRUCTORA');
  const [socioId, setSocioId] = useState('');
  const [instructorId, setInstructorId] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const instructoresActivos = instructores.filter(i => i.activo);

  async function abrir() {
    if (!socioId) return;
    if (tipo === 'ALUMNA_INSTRUCTORA' && puedeMostrador && !instructorId) return;
    setEnviando(true);
    setError(null);
    const resultado = await api<{ id: string; creada: boolean }>('/api/mensajeria/conversaciones', {
      method: 'POST',
      body: JSON.stringify({ tipo, socioId, instructorId: instructorId || undefined }),
    });
    setEnviando(false);
    if (!resultado.ok) { setError(resultado.error); return; }
    onCreada(resultado.data.id);
  }

  return (
    <div className="p-4 border-b border-border space-y-3 bg-muted/40">
      <div>
        <label htmlFor={`${uid}-tipo`} className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1 block">Tipo</label>
        <select id={`${uid}-tipo`}
          value={tipo}
          onChange={e => { setTipo(e.target.value as typeof tipo); setInstructorId(''); }}
          className="w-full border border-border rounded-lg px-2.5 py-2 text-sm text-foreground bg-card outline-none focus:border-brand"
        >
          <option value="ALUMNA_INSTRUCTORA">Con una instructora</option>
          {puedeMostrador && <option value="ALUMNA_MOSTRADOR">Con el mostrador</option>}
        </select>
      </div>
      <div>
        <label htmlFor={`${uid}-socio`} className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1 block">Socia</label>
        <select id={`${uid}-socio`}
          value={socioId}
          onChange={e => setSocioId(e.target.value)}
          className="w-full border border-border rounded-lg px-2.5 py-2 text-sm text-foreground bg-card outline-none focus:border-brand"
        >
          <option value="">Elige una socia</option>
          {socios.map(s => <option key={s.id} value={s.id}>{s.nombre} {s.apellidos}</option>)}
        </select>
      </div>
      {tipo === 'ALUMNA_INSTRUCTORA' && puedeMostrador && (
        <div>
          <label htmlFor={`${uid}-instr`} className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1 block">Instructora</label>
          <select id={`${uid}-instr`}
            value={instructorId}
            onChange={e => setInstructorId(e.target.value)}
            className="w-full border border-border rounded-lg px-2.5 py-2 text-sm text-foreground bg-card outline-none focus:border-brand"
          >
            <option value="">Elige una instructora</option>
            {instructoresActivos.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
          </select>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          onClick={abrir}
          disabled={enviando || !socioId || (tipo === 'ALUMNA_INSTRUCTORA' && puedeMostrador && !instructorId)}
          className="px-3.5 py-2 rounded-lg text-white text-xs font-bold disabled:opacity-40 transition-opacity"
          style={{ backgroundColor: 'var(--brand)' }}
        >
          {enviando ? 'Abriendo…' : 'Abrir conversación'}
        </button>
        <button onClick={onCerrar} className="px-3 py-2 rounded-lg text-xs font-semibold text-muted-foreground hover:bg-muted">
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ── Skeleton ────────────────────────────────────────────────────────────────

function SkeletonLista() {
  return (
    <div className="divide-y divide-muted">
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <div className="w-9 h-9 rounded-full bg-muted animate-pulse shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-2/3 rounded bg-muted animate-pulse" />
            <div className="h-2.5 w-1/3 rounded bg-muted animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Hilo ────────────────────────────────────────────────────────────────────

function Hilo({
  conversacion, authUserId, onVolver, onEnviado,
}: {
  conversacion: Conversacion;
  authUserId: string | null;
  onVolver: () => void;
  onEnviado: () => void;
}) {
  const { socios, instructores } = useStudio();
  const [mensajes, setMensajes] = useState<RowMensajes[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cuerpo, setCuerpo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const conversacionId = conversacion.id;

  const cargar = useCallback(async () => {
    const resultado = await api<{ mensajes: RowMensajes[] }>(`/api/mensajeria/conversaciones/${conversacionId}/mensajes?limite=50`);
    if (resultado.ok) {
      setMensajes(resultado.data.mensajes);
      setError(null);
      void api(`/api/mensajeria/conversaciones/${conversacionId}/leido`, { method: 'PATCH' });
    } else {
      setError(resultado.error);
    }
  }, [conversacionId]);

  // Carga inicial vía fetch tal cual; el refresco continuo pasa de polling a
  // Realtime Broadcast-from-DB (diseño validado por tentare-arquitecto,
  // Community & Messaging OS). Canal `conversacion:{id}` (`private: true`,
  // broadcast con la fila `mensajes` completa en el evento `INSERT`) — mismo
  // patrón `setAuth` antes de suscribir + reenvío en `TOKEN_REFRESHED` que ya
  // usan lib/studio-context.tsx / use-team-chat-store.ts / notification-bell.tsx.
  // Sin fallback a polling si el WebSocket falla (decisión ya tomada):
  // degradación aceptable, se ve al reabrir/refrescar el hilo.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- cambio de conversación: limpia el hilo anterior antes de cargar el nuevo.
    setMensajes(null);
    setError(null);
    void cargar();

    let vivo = true;
    let canal: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!vivo) return;
      await supabase.realtime.setAuth(data.session?.access_token ?? null);
      if (!vivo) return;
      canal = supabase
        .channel(`conversacion:${conversacionId}`, { config: { private: true } })
        .on('broadcast', { event: 'INSERT' }, ({ payload }) => {
          const fila = payload.record as RowMensajes;
          setMensajes(prev => (prev?.some(m => m.id === fila.id) ? prev : [...(prev ?? []), fila]));
          void api(`/api/mensajeria/conversaciones/${conversacionId}/leido`, { method: 'PATCH' });
        })
        .subscribe();
    })();

    const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' && vivo) {
        void supabase.realtime.setAuth(session?.access_token ?? null);
      }
    });

    return () => {
      vivo = false;
      authSub.subscription.unsubscribe();
      if (canal) supabase.removeChannel(canal);
    };
  }, [conversacionId, cargar]);

  useEffect(() => {
    if (!mensajes) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mensajes]);

  async function enviar() {
    const texto = cuerpo.trim();
    if (!texto || enviando) return;
    setEnviando(true);
    const resultado = await api<{ mensaje: RowMensajes }>(`/api/mensajeria/conversaciones/${conversacion.id}/mensajes`, {
      method: 'POST',
      body: JSON.stringify({ cuerpo: texto }),
    });
    setEnviando(false);
    if (!resultado.ok) { setError(resultado.error); return; }
    setCuerpo('');
    setMensajes(prev => [...(prev ?? []), resultado.data.mensaje]);
    onEnviado();
  }

  const titulo = nombreConversacion(conversacion, socios, instructores);
  const { label, Icon } = TIPO_INFO[conversacion.tipo] ?? TIPO_INFO.EQUIPO;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border shrink-0">
        <button onClick={onVolver} aria-label="Volver a la lista de conversaciones" className="md:hidden p-1.5 -ml-1.5 rounded-lg hover:bg-muted text-muted-foreground">
          <ArrowLeft size={18} />
        </button>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: 'color-mix(in srgb, var(--brand) 12%, var(--card))' }}>
          <Icon size={14} style={{ color: 'var(--brand)' }} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground truncate">{titulo}</p>
          <p className="text-[11px] text-muted-foreground">{label}</p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-2.5">
        {mensajes === null ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={18} className="animate-spin text-muted-foreground" />
          </div>
        ) : mensajes.length === 0 ? (
          <EmptyState compacto icono={Icon} titulo="Todavía no hay mensajes" descripcion="Escribe el primero." />
        ) : (
          mensajes.map(m => {
            const mio = m.remitente_auth_user_id === authUserId;
            return (
              <div key={m.id} className={`flex ${mio ? 'justify-end' : 'justify-start'}`}>
                <div
                  className="max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words"
                  style={mio
                    ? { backgroundColor: 'var(--brand)', color: 'var(--brand-foreground)', borderBottomRightRadius: 4 }
                    : { backgroundColor: 'var(--muted)', color: 'var(--foreground)', borderBottomLeftRadius: 4 }}
                >
                  {m.cuerpo}
                  <div className={`text-[10px] mt-1 ${mio ? 'opacity-70' : 'text-muted-foreground'}`}>{timeAgo(m.creado_en)}</div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {error && (
        <div className="px-4 py-2 text-xs text-destructive border-t border-border shrink-0">{error}</div>
      )}

      <div className="flex items-end gap-2 px-3 py-3 border-t border-border shrink-0">
        <textarea
          value={cuerpo}
          onChange={e => setCuerpo(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar(); }
          }}
          rows={1}
          maxLength={4000}
          placeholder="Escribe un mensaje…"
          aria-label="Mensaje"
          className="flex-1 resize-none border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-brand bg-card max-h-32"
        />
        <button
          onClick={enviar}
          disabled={enviando || !cuerpo.trim()}
          aria-label="Enviar mensaje"
          className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 disabled:opacity-40 transition-opacity"
          style={{ backgroundColor: 'var(--brand)' }}
        >
          {enviando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>
    </div>
  );
}

// ── Pestaña ─────────────────────────────────────────────────────────────────

export function ConversacionesTab() {
  const { socios, instructores } = useStudio();
  const { user } = useAuth();
  const authUserId = user?.id ?? null;
  const rol = useRol();
  const puedeMostrador = puedeGestionarCalendario(rol);

  const [conversaciones, setConversaciones] = useState<Conversacion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abiertaId, setAbiertaId] = useState<string | null>(null);
  const [mostrarNueva, setMostrarNueva] = useState(false);

  const cargarLista = useCallback(async () => {
    const resultado = await api<{ conversaciones: Conversacion[] }>('/api/mensajeria/conversaciones');
    if (resultado.ok) { setConversaciones(resultado.data.conversaciones); setError(null); }
    else setError(resultado.error);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de la bandeja.
  useEffect(() => { void cargarLista(); }, [cargarLista]);

  const abierta = conversaciones?.find(c => c.id === abiertaId) ?? null;

  if (error && !conversaciones) {
    return (
      <div className="bg-card rounded-2xl border border-border p-8 text-center space-y-3">
        <p className="text-sm text-destructive">{error}</p>
        <button onClick={() => void cargarLista()} className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-medio hover:underline">
          <RefreshCw size={12} /> Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <div className="flex h-[70vh] min-h-[420px] max-h-[720px]">
        {/* Lista */}
        <div className={`${abiertaId ? 'hidden md:flex' : 'flex'} w-full md:w-80 md:border-r md:border-border flex-col shrink-0`}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <p className="text-sm font-bold text-foreground">Conversaciones</p>
            <button
              onClick={() => setMostrarNueva(v => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-brand-medio hover:bg-muted transition-colors"
            >
              <MessageSquarePlus size={14} /> Nueva
            </button>
          </div>

          {mostrarNueva && (
            <NuevaConversacion
              socios={socios}
              instructores={instructores}
              puedeMostrador={puedeMostrador}
              onCerrar={() => setMostrarNueva(false)}
              onCreada={id => { setMostrarNueva(false); void cargarLista(); setAbiertaId(id); }}
            />
          )}

          <div className="flex-1 min-h-0 overflow-y-auto">
            {conversaciones === null ? (
              <SkeletonLista />
            ) : conversaciones.length === 0 ? (
              <EmptyState compacto icono={Users} titulo="No hay conversaciones" descripcion="Abre una nueva para empezar a hablar con una socia." />
            ) : (
              <ul className="divide-y divide-muted">
                {conversaciones.map(c => {
                  const { label, Icon } = TIPO_INFO[c.tipo] ?? TIPO_INFO.EQUIPO;
                  const titulo = nombreConversacion(c, socios, instructores);
                  const activa = c.id === abiertaId;
                  return (
                    <li key={c.id}>
                      <button
                        onClick={() => setAbiertaId(c.id)}
                        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted transition-colors"
                        style={activa ? { backgroundColor: 'color-mix(in srgb, var(--brand) 8%, var(--card))' } : undefined}
                      >
                        <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: 'color-mix(in srgb, var(--brand) 12%, var(--card))' }}>
                          <Icon size={15} style={{ color: 'var(--brand)' }} aria-hidden="true" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[13px] font-semibold text-foreground truncate">{titulo}</p>
                            <span className="text-[11px] text-muted-foreground shrink-0">{timeAgo(c.ultimo_mensaje_en)}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground truncate">{label}</p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Hilo */}
        <div className={`${abiertaId ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0`}>
          {abierta ? (
            <Hilo
              conversacion={abierta}
              authUserId={authUserId}
              onVolver={() => setAbiertaId(null)}
              onEnviado={() => void cargarLista()}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center p-8">
              <EmptyState compacto icono={MessageSquarePlus} titulo="Selecciona una conversación" descripcion="Elige un hilo de la lista o abre uno nuevo." />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
