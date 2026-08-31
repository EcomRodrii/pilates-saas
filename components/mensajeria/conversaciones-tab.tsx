'use client';

// CONVERSACIONES — bandeja del panel (Community & Messaging OS).
//
// Este fichero es el CONTENEDOR: estado, fetch, Realtime y permisos. Todo lo
// que se ve vive en `./piezas.tsx`, que no sabe de red y por eso se puede
// mirar en un navegador sin sesión de staff (ver la cabecera de ese fichero).
//
// El rediseño toca presentación y la forma de PEDIR datos que ya existían
// (previsualización del último mensaje y estado de lectura, ver
// lib/mensajeria/resumen.ts). El transporte —Realtime Broadcast, canal
// `conversacion:{id}`— y las rutas de escritura no se tocan.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquarePlus, RefreshCw, Search } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { useAuth } from '@/lib/auth-context';
import { useRol } from '@/lib/permisos';
import { puedeGestionarCalendario } from '@/lib/permisos-reglas';
import { authHeader } from '@/lib/api-client';
import { supabase } from '@/lib/db/supabase';
import { EmptyState } from '@/components/ui/empty-state';
import { tieneSinLeer } from '@/lib/mensajeria/presentacion';
import {
  BandejaVacia, FilaConversacion, HiloVista, NuevaConversacion, SinHiloElegido, SkeletonLista,
  identidadDe, type ContextoAncla,
} from './piezas';
import type { RowMensajes } from '@/lib/db-types';
import type { ConversacionStaff } from '@/lib/mensajeria/tipos';

type Conversacion = ConversacionStaff;

// Mismos valores que el portal (app/portal/[slug]/mensajes/[id]/page.tsx):
// como mucho un broadcast `typing` cada 2s mientras se escribe, y el
// receptor lo apaga solo si no llega otro evento en 3s.
const TYPING_THROTTLE_MS = 2000;
const TYPING_TIMEOUT_MS = 3000;

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

// ── Hilo (datos + Realtime) ─────────────────────────────────────────────────

function Hilo({
  conversacion, authUserId, onVolver, onEnviado,
}: {
  conversacion: Conversacion;
  authUserId: string | null;
  onVolver: () => void;
  onEnviado: () => void;
}) {
  const { socios, instructores, sesiones, tiposClase } = useStudio();
  // El token de sesión sale del contexto (ya resuelto al arrancar la app),
  // NUNCA de un `supabase.auth.getSession()` nuevo aquí: ese cliente es un
  // singleton compartido por toda la app (lib/db/supabase.ts), y
  // `getSession()` usa un lock interno de supabase-js — si CUALQUIER otra
  // llamada a getSession()/refreshSession() en la app se queda colgada, este
  // await se queda colgado con ella para siempre, sin lanzar ningún error.
  // Encontrado en producción: el hilo cargaba mensajes por fetch pero el
  // canal de Realtime nunca llegaba a crearse — cero intentos de WebSocket,
  // cero errores en consola, porque el código nunca pasaba de esta línea.
  const { session } = useAuth();
  const [mensajes, setMensajes] = useState<RowMensajes[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cuerpo, setCuerpo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const conversacionId = conversacion.id;
  // Mismo mecanismo "escribiendo…" que ya vive en el portal
  // (app/portal/[slug]/mensajes/[id]/page.tsx): broadcast efímero `typing`
  // sobre el MISMO canal — nunca se había construido en este lado, así que
  // ninguno de los dos extremos veía nunca al otro escribir.
  const [escribiendoOtros, setEscribiendoOtros] = useState(false);
  const canalRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const ultimoTypingEnviadoRef = useRef(0);
  const escribiendoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      // Síncrono desde el contexto — nada de `await getSession()` aquí (ver
      // comentario de arriba del componente).
      await supabase.realtime.setAuth(session?.access_token ?? null);
      if (!vivo) return;
      canal = supabase
        .channel(`conversacion:${conversacionId}`, { config: { private: true } })
        .on('broadcast', { event: 'INSERT' }, ({ payload }) => {
          const fila = payload.record as RowMensajes;
          setMensajes(prev => (prev?.some(m => m.id === fila.id) ? prev : [...(prev ?? []), fila]));
          void api(`/api/mensajeria/conversaciones/${conversacionId}/leido`, { method: 'PATCH' });
          // Un mensaje real es señal más fuerte que el "escribiendo…" que lo
          // precedió — se apaga en vez de esperar a que expire solo.
          if (fila.remitente_auth_user_id !== authUserId) {
            if (escribiendoTimeoutRef.current) clearTimeout(escribiendoTimeoutRef.current);
            setEscribiendoOtros(false);
          }
        })
        .on('broadcast', { event: 'typing' }, ({ payload }) => {
          const de = (payload as { authUserId?: string | null })?.authUserId ?? null;
          if (!de || de === authUserId) return; // el propio eco, o sin identificar: se ignora
          setEscribiendoOtros(true);
          if (escribiendoTimeoutRef.current) clearTimeout(escribiendoTimeoutRef.current);
          escribiendoTimeoutRef.current = setTimeout(() => setEscribiendoOtros(false), TYPING_TIMEOUT_MS);
        })
        .subscribe();
      canalRef.current = canal;
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
      canalRef.current = null;
      if (escribiendoTimeoutRef.current) clearTimeout(escribiendoTimeoutRef.current);
      setEscribiendoOtros(false);
    };
  // `session` a propósito fuera de deps: solo hace falta para el join inicial
  // del canal — un refresco de token no debe tirar el canal y reabrirlo, ya
  // lo cubre el listener de TOKEN_REFRESHED de aquí dentro.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversacionId, cargar]);

  // Emite el broadcast `typing`, con throttle: como mucho uno cada
  // `TYPING_THROTTLE_MS` mientras se sigue escribiendo. Efímero a propósito:
  // si `send` falla (canal aún no suscrito, sin red) no pasa nada, sin
  // reintento ni cola — mismo criterio que el portal.
  const notificarEscribiendo = useCallback(() => {
    const canal = canalRef.current;
    if (!canal || !authUserId) return;
    const ahora = Date.now();
    if (ahora - ultimoTypingEnviadoRef.current < TYPING_THROTTLE_MS) return;
    ultimoTypingEnviadoRef.current = ahora;
    void canal.send({ type: 'broadcast', event: 'typing', payload: { authUserId } });
  }, [authUserId]);

  function alCambiarCuerpo(v: string) {
    setCuerpo(v);
    if (v.trim()) notificarEscribiendo();
  }

  async function enviar() {
    const texto = cuerpo.trim();
    if (!texto || enviando) return;
    setEnviando(true);
    const resultado = await api<{ mensaje: RowMensajes }>(`/api/mensajeria/conversaciones/${conversacionId}/mensajes`, {
      method: 'POST',
      body: JSON.stringify({ cuerpo: texto }),
    });
    setEnviando(false);
    if (!resultado.ok) { setError(resultado.error); return; }
    setCuerpo('');
    setError(null);
    setMensajes(prev => [...(prev ?? []), resultado.data.mensaje]);
    onEnviado();
  }

  const identidad = identidadDe(conversacion, socios, instructores);

  // Fase 7 — el contexto real de la conversación, si lo hay. Sin ancla no se
  // inventa ninguno.
  const sesionAncla = conversacion.ancla_sesion_id
    ? sesiones.find(s => s.id === conversacion.ancla_sesion_id)
    : undefined;
  const tipoAncla = sesionAncla ? tiposClase.find(tc => tc.id === sesionAncla.tipoClaseId) : undefined;
  const ancla: ContextoAncla | null = sesionAncla
    ? {
      titulo: tipoAncla?.nombre ?? 'reservada',
      detalle: new Date(sesionAncla.inicio).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }),
    }
    : null;

  return (
    <HiloVista
      conversacion={conversacion}
      identidad={identidad}
      mensajes={mensajes}
      authUserId={authUserId}
      error={error}
      ancla={ancla}
      cuerpo={cuerpo}
      enviando={enviando}
      onCuerpo={alCambiarCuerpo}
      onEnviar={() => void enviar()}
      onVolver={onVolver}
      onReintentar={() => void cargar()}
      escribiendoOtros={escribiendoOtros}
    />
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
  const [errorNueva, setErrorNueva] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('');

  const cargarLista = useCallback(async () => {
    const resultado = await api<{ conversaciones: Conversacion[] }>('/api/mensajeria/conversaciones');
    if (resultado.ok) { setConversaciones(resultado.data.conversaciones); setError(null); }
    else setError(resultado.error);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de la bandeja.
  useEffect(() => { void cargarLista(); }, [cargarLista]);

  const abierta = conversaciones?.find(c => c.id === abiertaId) ?? null;

  const filas = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return (conversaciones ?? []).map(c => ({ c, identidad: identidadDe(c, socios, instructores) }))
      .filter(({ c, identidad }) => !q
        || identidad.nombre.toLowerCase().includes(q)
        || (c.ultimo_cuerpo ?? '').toLowerCase().includes(q));
  }, [conversaciones, socios, instructores, filtro]);

  const sinLeerTotal = (conversaciones ?? []).filter(c => tieneSinLeer(c, authUserId)).length;

  async function abrirConversacion(
    tipo: 'ALUMNA_INSTRUCTORA' | 'ALUMNA_MOSTRADOR', socioId: string, instructorId?: string,
  ) {
    setErrorNueva(null);
    const resultado = await api<{ id: string; creada: boolean }>('/api/mensajeria/conversaciones', {
      method: 'POST',
      body: JSON.stringify({ tipo, socioId, instructorId }),
    });
    if (!resultado.ok) { setErrorNueva(resultado.error); return; }
    setMostrarNueva(false);
    void cargarLista();
    setAbiertaId(resultado.data.id);
  }

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
      <div className="flex h-[70vh] min-h-[440px] max-h-[720px]">
        {/* Lista */}
        <div className={`${abiertaId ? 'hidden md:flex' : 'flex'} w-full md:w-[340px] md:border-r md:border-border flex-col shrink-0`}>
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <p className="text-sm font-bold text-foreground">Conversaciones</p>
              {sinLeerTotal > 0 && (
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                  style={{ backgroundColor: 'var(--brand)', color: 'var(--brand-foreground)' }}
                >
                  {sinLeerTotal}
                </span>
              )}
            </div>
            <button
              onClick={() => setMostrarNueva(v => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-brand-medio hover:bg-muted transition-colors shrink-0"
            >
              <MessageSquarePlus size={14} aria-hidden="true" /> Nueva
            </button>
          </div>

          {mostrarNueva && (
            <NuevaConversacion
              socios={socios}
              instructores={instructores}
              puedeMostrador={puedeMostrador}
              error={errorNueva}
              onCerrar={() => { setMostrarNueva(false); setErrorNueva(null); }}
              onAbrir={abrirConversacion}
            />
          )}

          {(conversaciones?.length ?? 0) > 6 && (
            <div className="px-3 py-2 border-b border-border shrink-0">
              <div className="flex items-center gap-2 bg-muted border border-border rounded-xl px-2.5 py-1.5 focus-within:border-brand transition-colors">
                <Search size={13} className="text-muted-foreground shrink-0" aria-hidden="true" />
                <input
                  value={filtro}
                  onChange={e => setFiltro(e.target.value)}
                  placeholder="Filtrar conversaciones…"
                  aria-label="Filtrar conversaciones"
                  className="bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground outline-none flex-1 min-w-0"
                />
              </div>
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto">
            {conversaciones === null ? (
              <SkeletonLista />
            ) : conversaciones.length === 0 ? (
              <BandejaVacia onNueva={() => setMostrarNueva(true)} />
            ) : filas.length === 0 ? (
              <EmptyState compacto icono={Search} titulo="Ninguna coincide" descripcion={`Nada con «${filtro.trim()}».`} />
            ) : (
              <ul>
                {filas.map(({ c, identidad }, i) => (
                  <li key={c.id} className="border-b border-muted last:border-b-0">
                    <FilaConversacion
                      row={c}
                      identidad={identidad}
                      indice={i}
                      activa={c.id === abiertaId}
                      sinLeer={tieneSinLeer(c, authUserId)}
                      esMio={Boolean(c.ultimo_remitente_auth_user_id && c.ultimo_remitente_auth_user_id === authUserId)}
                      onClick={() => setAbiertaId(c.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Hilo */}
        <div className={`${abiertaId ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0`}>
          {abierta ? (
            <Hilo
              key={abierta.id}
              conversacion={abierta}
              authUserId={authUserId}
              onVolver={() => setAbiertaId(null)}
              onEnviado={() => void cargarLista()}
            />
          ) : (
            <SinHiloElegido />
          )}
        </div>
      </div>
    </div>
  );
}
