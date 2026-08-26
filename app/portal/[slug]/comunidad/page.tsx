'use client';

// COMUNIDAD — feed de posts del estudio para la ALUMNA (Community & Messaging
// OS, P1). Puro consumo: el backend (esquema/RLS/`/api/public/comunidad/posts`,
// ya filtrado por audiencia real vía `resolverDestinatariasCampana`) está en
// producción. Mismo lenguaje visual que Mensajes/Avisos/Perfil.
//
// SOLO LECTURA a propósito (decisión ya cerrada del diseño): sin dar like ni
// comentar. Los contadores de likes/comentarios se pintan como texto
// informativo, nunca como <button> — mismo criterio que ya aplica la pestaña
// "Comunidad" del panel de staff (app/(dashboard)/mensajeria/page.tsx).
//
// Realtime — canal `feed:{studio_id}`, evento `post_nuevo`, payload
// `{ postId }`: es SOLO una señal de invalidación (nunca la fuente del post en
// sí), así que al recibirla se refresca la primera página desde el servidor,
// que es quien de verdad sabe si la socia puede ver ese post por su audiencia.
// Sin fallback a polling si el WebSocket falla (mismo criterio que Mensajes):
// degradación aceptable, se ve al reabrir/refrescar la pantalla.
//
// `texto` se pinta SIEMPRE como texto plano — mismo criterio de seguridad que
// ya aplica el hilo de mensajería para `cuerpo`.

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CalendarDays, MapPin, Users, Megaphone } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { useModo } from '@/lib/portal-modo';
import { portalAuthHeader } from '@/lib/api-client';
import { supabasePortal } from '@/lib/db/supabase-portal';
import { supabasePortalRealtime } from '@/lib/db/supabase-portal-realtime';
import { display, micro, sans, texto } from '@/lib/portal-design';
import { Badge, Button, Card, EmptyState, Toast, type AvisoToast } from '@/components/portal/ui';
import { selloTemporal } from '@/lib/avisos-portal';
import {
  fetchFeedComunidad, fetchEstadoAsistenciaEvento, apuntarseEvento, desapuntarseEvento,
  type PostFeedPortal, type EstadoAsistenciaEvento,
} from '@/lib/comunidad-portal.ts';

export default function ComunidadPage() {
  const { studio } = useStudio();
  const { t } = useModo();

  const [posts, setPosts] = useState<PostFeedPortal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [hayMas, setHayMas] = useState(true);
  const [aviso, setAviso] = useState<AvisoToast | null>(null);

  // Estado de asistencia por evento — solo se pide para los posts EVENTO
  // visibles en pantalla (nunca para todos), y solo una vez por post: el `GET`
  // de estado individual únicamente hace falta para saber "apuntada o no",
  // porque el conteo total ya viaja en el propio listado
  // (`totalAsistentes`). Se guarda aparte de `posts` para poder actualizarlo
  // de forma optimista sin tocar la lista completa.
  const [asistencia, setAsistencia] = useState<Record<string, EstadoAsistenciaEvento | undefined>>({});
  const pidiendoEstado = useRef<Set<string>>(new Set());
  const [accionEnCurso, setAccionEnCurso] = useState<string | null>(null);

  const cargando = useRef(false);

  const cargarPrimeraPagina = useCallback(async () => {
    if (!studio?.id) return;
    setError(null);
    const headers = await portalAuthHeader();
    const r = await fetchFeedComunidad(headers, studio.id);
    if ('error' in r) { setError(r.error); return; }
    setPosts(r.posts);
    setHayMas(r.posts.length > 0);
  }, [studio?.id]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial, misma forma que Mensajes.
  useEffect(() => { void cargarPrimeraPagina(); }, [cargarPrimeraPagina]);

  async function cargarMas() {
    if (!studio?.id || !posts || posts.length === 0 || cargando.current) return;
    cargando.current = true;
    setCargandoMas(true);
    const headers = await portalAuthHeader();
    const ultimo = posts[posts.length - 1];
    const r = await fetchFeedComunidad(headers, studio.id, ultimo.creadoEn);
    setCargandoMas(false);
    cargando.current = false;
    if ('error' in r) { setError(r.error); return; }
    if (r.posts.length === 0) { setHayMas(false); return; }
    setPosts(prev => [...(prev ?? []), ...r.posts]);
  }

  // Realtime — canal `feed:{studio_id}`, evento `post_nuevo`. El payload
  // (`{ postId }`) es solo el disparador; se refetch la primera página en vez
  // de confiar en él como dato, porque el broadcast no filtra por audiencia
  // (ver comentario del trigger) y solo el servidor sabe si ESTA socia puede
  // ver ese post en concreto.
  useEffect(() => {
    if (!studio?.id) return;
    let vivo = true;
    let canal: ReturnType<typeof supabasePortalRealtime.channel> | null = null;
    const studioId = studio.id;
    (async () => {
      const { data } = await supabasePortal.auth.getSession();
      if (!vivo) return;
      await supabasePortalRealtime.realtime.setAuth(data.session?.access_token ?? null);
      if (!vivo) return;
      canal = supabasePortalRealtime
        .channel(`feed:${studioId}`, { config: { private: true } })
        .on('broadcast', { event: 'post_nuevo' }, () => { void cargarPrimeraPagina(); })
        .subscribe();
    })();

    const { data: authSub } = supabasePortal.auth.onAuthStateChange((event, s) => {
      if (event === 'TOKEN_REFRESHED' && vivo) {
        void supabasePortalRealtime.realtime.setAuth(s?.access_token ?? null);
      }
    });

    return () => {
      vivo = false;
      authSub.subscription.unsubscribe();
      if (canal) supabasePortalRealtime.removeChannel(canal);
    };
  }, [studio?.id, cargarPrimeraPagina]);

  // Al llegar posts nuevos (primera carga, "Ver más" o refetch por realtime),
  // pide "¿estoy apuntada?" solo para los eventos que todavía no tengan
  // estado conocido en este render — evita sobre-pedir en cada refetch.
  useEffect(() => {
    if (!studio?.id || !posts) return;
    const studioId = studio.id;
    const pendientes = posts.filter(p => p.tipo === 'EVENTO' && !(p.id in asistencia) && !pidiendoEstado.current.has(p.id));
    if (pendientes.length === 0) return;
    for (const p of pendientes) pidiendoEstado.current.add(p.id);
    (async () => {
      const headers = await portalAuthHeader();
      for (const p of pendientes) {
        const r = await fetchEstadoAsistenciaEvento(headers, studioId, p.id);
        pidiendoEstado.current.delete(p.id);
        if ('error' in r) continue; // se deja sin estado; el botón cae al fallback "Apuntarme"
        setAsistencia(prev => ({ ...prev, [p.id]: r }));
      }
    })();
  }, [studio?.id, posts, asistencia]);

  async function handleApuntarse(postId: string) {
    if (!studio?.id || accionEnCurso) return;
    setAccionEnCurso(postId);
    const headers = await portalAuthHeader();
    const r = await apuntarseEvento(headers, studio.id, postId);
    setAccionEnCurso(null);
    if ('error' in r) {
      setAviso({ texto: r.completo ? 'Este evento ya está completo.' : r.error, error: true });
      if (r.completo) {
        // Alguien se apuntó justo antes — se refresca el estado real en vez
        // de dejar el botón mintiendo sobre el aforo.
        const fresco = await fetchEstadoAsistenciaEvento(headers, studio.id, postId);
        if (!('error' in fresco)) setAsistencia(prev => ({ ...prev, [postId]: fresco }));
      }
      return;
    }
    setAsistencia(prev => ({ ...prev, [postId]: r }));
    setAviso({ texto: 'Te has apuntado al evento.' });
  }

  async function handleDesapuntarse(postId: string) {
    if (!studio?.id || accionEnCurso) return;
    setAccionEnCurso(postId);
    const headers = await portalAuthHeader();
    const r = await desapuntarseEvento(headers, studio.id, postId);
    setAccionEnCurso(null);
    if ('error' in r) { setAviso({ texto: r.error, error: true }); return; }
    setAsistencia(prev => ({ ...prev, [postId]: r }));
    setAviso({ texto: 'Te has dado de baja del evento.' });
  }

  const microLabel: React.CSSProperties = { ...micro(9.5, 0.28, 600), color: t.muted };

  return (
    <div style={{ minHeight: '100%', background: t.bg, color: t.ink }}>
      <div style={{ padding: '62px 20px 32px' }}>
        <p style={microLabel}>{studio?.nombre ?? 'Tu estudio'}</p>
        <h1 style={{ ...display(34), color: t.ink, marginTop: 6 }}>Comunidad</h1>

        {error && (
          <div style={{ marginTop: 24 }}>
            <EmptyState
              icon={<AlertCircle size={20} />}
              title="No se ha podido cargar el tablón"
              body={error}
              variant="error"
              action={{ label: 'Reintentar', onClick: () => void cargarPrimeraPagina() }}
            />
          </div>
        )}

        {!error && posts === null && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 24 }} aria-hidden>
            {[0, 1, 2].map(i => (
              <div key={i} className="animate-pulse" style={{ height: 128, borderRadius: 20, background: t.surface2 }} />
            ))}
          </div>
        )}

        {!error && posts !== null && posts.length === 0 && (
          <div style={{ marginTop: 24 }}>
            <EmptyState
              icon={<Megaphone size={20} />}
              title="Todavía no hay publicaciones"
              body="Aquí verás las novedades y avisos que comparta el equipo del estudio."
            />
          </div>
        )}

        {!error && posts !== null && posts.length > 0 && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 24 }}>
              {posts.map(post => (
                <PostCard
                  key={post.id}
                  post={post}
                  estado={asistencia[post.id]}
                  procesando={accionEnCurso === post.id}
                  onApuntarse={() => void handleApuntarse(post.id)}
                  onDesapuntarse={() => void handleDesapuntarse(post.id)}
                />
              ))}
            </div>

            {hayMas && (
              <Button
                variant="secondary"
                onClick={() => void cargarMas()}
                loading={cargandoMas}
                style={{ width: '100%', marginTop: 16 }}
              >
                Ver más
              </Button>
            )}
          </>
        )}
      </div>

      <Toast aviso={aviso} onDismiss={() => setAviso(null)} />
    </div>
  );
}

function PostCard({
  post,
  estado,
  procesando,
  onApuntarse,
  onDesapuntarse,
}: {
  post: PostFeedPortal;
  estado: EstadoAsistenciaEvento | undefined;
  procesando: boolean;
  onApuntarse: () => void;
  onDesapuntarse: () => void;
}) {
  const { t } = useModo();
  const esEvento = post.tipo === 'EVENTO';
  return (
    <Card style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          aria-hidden
          style={{
            width: 36, height: 36, borderRadius: 999, flexShrink: 0,
            background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: sans, fontSize: 13, fontWeight: 800,
          }}
        >
          {post.autorInicial}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontFamily: sans, fontSize: 13.5, fontWeight: 800, color: t.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {post.autorNombre}
          </p>
          <p style={{ ...texto.nota, color: t.muted, marginTop: 1 }}>{selloTemporal(post.creadoEn)}</p>
        </div>
        <Badge variant="neutral">El estudio</Badge>
      </div>

      {esEvento && <EventoBloque post={post} estado={estado} />}

      {/* Texto plano SIEMPRE: React escapa por defecto, sin dangerouslySetInnerHTML. */}
      <p style={{ fontFamily: sans, fontSize: 14.5, lineHeight: 1.5, color: t.ink, marginTop: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {post.texto}
      </p>

      {post.imagenUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- mismo criterio que el resto del portal (portal-clases-view.tsx, hoja-reserva.tsx): URL pública de Storage, sin optimización de next/image.
        <img
          src={post.imagenUrl}
          alt=""
          style={{ width: '100%', maxHeight: 320, objectFit: 'cover', borderRadius: 14, marginTop: 12, display: 'block' }}
        />
      )}

      {esEvento && (
        <EventoAccion
          post={post}
          estado={estado}
          procesando={procesando}
          onApuntarse={onApuntarse}
          onDesapuntarse={onDesapuntarse}
        />
      )}

      {/* Contadores INFORMATIVOS, no acciones — P1 es solo lectura para la
          socia (sin dar like ni comentar, decisión ya cerrada). Nunca un
          <button>: prometería una interacción que no existe. */}
      {(post.likes > 0 || post.comentariosCount > 0) && (
        <div style={{ display: 'flex', gap: 16, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${t.line}` }}>
          {post.likes > 0 && (
            <span style={{ ...texto.nota, color: t.muted }}>
              {post.likes} me gusta
            </span>
          )}
          {post.comentariosCount > 0 && (
            <span style={{ ...texto.nota, color: t.muted }}>
              {post.comentariosCount} {post.comentariosCount === 1 ? 'comentario' : 'comentarios'}
            </span>
          )}
        </div>
      )}
    </Card>
  );
}

// ─── Evento: badge + fecha/lugar/aforo ──────────────────────────────────────

function formatoFechaEvento(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  });
}

function EventoBloque({ post, estado }: { post: PostFeedPortal; estado: EstadoAsistenciaEvento | undefined }) {
  const { t } = useModo();
  // El total viene del listado (`totalAsistentes`) hasta que la socia
  // apunta/desapunta — a partir de ahí, `estado.totalAsistentes` (más fresco)
  // manda; nunca se pisan entre sí de forma inconsistente porque ambos
  // arrancan del mismo dato del servidor.
  const total = estado?.totalAsistentes ?? post.totalAsistentes ?? 0;
  const aforo = post.eventoAforo ?? null;
  return (
    <div
      style={{
        marginTop: 12, padding: 12, borderRadius: 14,
        background: 'color-mix(in srgb, var(--portal-brand) 8%, transparent)',
        border: '1px solid color-mix(in srgb, var(--portal-brand) 22%, transparent)',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}
    >
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
          fontFamily: sans, fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em',
          padding: '4px 10px', borderRadius: 999,
          background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)',
        }}
      >
        <CalendarDays size={11} aria-hidden /> Evento
      </span>
      {post.eventoFecha && (
        <p style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: sans, fontSize: 13, fontWeight: 700, color: t.ink, textTransform: 'capitalize' }}>
          <CalendarDays size={14} style={{ color: t.muted, flexShrink: 0 }} aria-hidden />
          {formatoFechaEvento(post.eventoFecha)}
        </p>
      )}
      {post.eventoLugar && (
        <p style={{ display: 'flex', alignItems: 'center', gap: 7, ...texto.nota, color: t.ink }}>
          <MapPin size={13} style={{ color: t.muted, flexShrink: 0 }} aria-hidden />
          {post.eventoLugar}
        </p>
      )}
      <p style={{ display: 'flex', alignItems: 'center', gap: 7, ...texto.nota, color: t.muted }}>
        <Users size={13} style={{ flexShrink: 0 }} aria-hidden />
        {aforo ? `${total}/${aforo} apuntadas` : `${total} apuntada${total === 1 ? '' : 's'}`}
      </p>
    </div>
  );
}

function EventoAccion({
  post,
  estado,
  procesando,
  onApuntarse,
  onDesapuntarse,
}: {
  post: PostFeedPortal;
  estado: EstadoAsistenciaEvento | undefined;
  procesando: boolean;
  onApuntarse: () => void;
  onDesapuntarse: () => void;
}) {
  const total = estado?.totalAsistentes ?? post.totalAsistentes ?? 0;
  const aforo = post.eventoAforo ?? null;
  const cargandoEstado = estado === undefined;
  const apuntada = estado?.apuntada ?? false;
  const completo = !apuntada && aforo !== null && total >= aforo;

  return (
    <div style={{ marginTop: 12 }}>
      {apuntada ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <Badge variant="success">Ya estás apuntada</Badge>
          <button
            type="button"
            onClick={onDesapuntarse}
            disabled={procesando}
            aria-busy={procesando}
            style={{
              background: 'none', border: 'none', cursor: procesando ? 'default' : 'pointer',
              fontFamily: sans, fontSize: 12.5, fontWeight: 700, textDecoration: 'underline',
              color: 'var(--portal-brand)', padding: '8px 4px', minHeight: 44,
              opacity: procesando ? 0.6 : 1,
            }}
          >
            {procesando ? 'Procesando…' : 'Darme de baja'}
          </button>
        </div>
      ) : (
        <Button
          variant="primary"
          size="small"
          onClick={onApuntarse}
          disabled={cargandoEstado || completo}
          loading={procesando}
          style={{ width: '100%' }}
        >
          {completo ? 'Evento completo' : 'Apuntarme'}
        </Button>
      )}
    </div>
  );
}
