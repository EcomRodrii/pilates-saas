'use client';

// COMUNIDAD — feed de posts del estudio para la ALUMNA (Community & Messaging
// OS, P1). Puro consumo: el backend (esquema/RLS/`/api/public/comunidad/posts`,
// ya filtrado por audiencia real vía `resolverDestinatariasCampana`) está en
// producción.
//
// Esta pantalla solo tiene los DATOS; la pintura vive en
// `components/comunidad/post-card-portal.tsx` (mismo criterio que
// `components/portal/ui`), sobre el lenguaje visual de `lib/portal-design.ts`.
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
import { AlertCircle, Megaphone } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { useModo } from '@/lib/portal-modo';
import { portalAuthHeader } from '@/lib/api-client';
import { supabasePortal } from '@/lib/db/supabase-portal';
import { supabasePortalRealtime } from '@/lib/db/supabase-portal-realtime';
import { EASE, display, dur, micro, sans } from '@/lib/portal-design';
import { EmptyState, Toast, type AvisoToast } from '@/components/portal/ui';
import { PostCardPortal, SkeletonPostPortal } from '@/components/comunidad/post-card-portal';
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
  const centinela = useRef<HTMLDivElement | null>(null);

  const studioId = studio?.id ?? null;

  const cargarPrimeraPagina = useCallback(async () => {
    if (!studioId) return;
    setError(null);
    const headers = await portalAuthHeader();
    const r = await fetchFeedComunidad(headers, studioId);
    if ('error' in r) { setError(r.error); return; }
    setPosts(r.posts);
    setHayMas(r.posts.length > 0);
  }, [studioId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial, misma forma que Mensajes.
  useEffect(() => { void cargarPrimeraPagina(); }, [cargarPrimeraPagina]);

  const cargarMas = useCallback(async () => {
    if (!studioId || !posts || posts.length === 0 || cargando.current) return;
    cargando.current = true;
    setCargandoMas(true);
    const headers = await portalAuthHeader();
    const ultimo = posts[posts.length - 1];
    const r = await fetchFeedComunidad(headers, studioId, ultimo.creadoEn);
    setCargandoMas(false);
    cargando.current = false;
    if ('error' in r) { setError(r.error); return; }
    if (r.posts.length === 0) { setHayMas(false); return; }
    setPosts(prev => [...(prev ?? []), ...r.posts]);
  }, [studioId, posts]);

  // Scroll infinito: la siguiente página se pide cuando el centinela se acerca
  // al borde inferior (`rootMargin`), no cuando ya se ve — así el esqueleto
  // aparece antes de que la socia llegue al final y el feed no da tirones.
  // `cargando.current` (y no un estado) es lo que impide que dos intersecciones
  // seguidas pidan la misma página dos veces.
  useEffect(() => {
    const nodo = centinela.current;
    if (!nodo || !hayMas || error) return;
    const io = new IntersectionObserver(
      entradas => { if (entradas.some(e => e.isIntersecting)) void cargarMas(); },
      { rootMargin: '400px 0px' },
    );
    io.observe(nodo);
    return () => io.disconnect();
  }, [hayMas, error, cargarMas]);

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

  // Al llegar posts nuevos (primera carga, scroll infinito o refetch por
  // realtime), pide "¿estoy apuntada?" solo para los eventos que todavía no
  // tengan estado conocido en este render — evita sobre-pedir en cada refetch.
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

  return (
    <div style={{ minHeight: '100%', background: t.bg, color: t.ink }}>
      <div style={{ padding: '62px 20px 40px' }}>
        {/* Misma cabecera editorial que Progreso: rótulo en versalitas, título
            en serif grande y una frase en cursiva que da el tono. */}
        <p style={{ ...micro(9.5, 0.28, 600), color: t.muted }}>{studio?.nombre ?? 'Tu estudio'}</p>
        <h1 style={{ ...display(46), color: t.ink, marginTop: 8 }}>Comunidad</h1>
        <p style={{ ...display(18, true), color: t.muted, marginTop: 10 }}>Lo que pasa en el estudio.</p>

        {error && (
          <div style={{ marginTop: 28 }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 28 }}>
            <SkeletonPostPortal conImagen />
            <SkeletonPostPortal />
            <SkeletonPostPortal />
          </div>
        )}

        {!error && posts !== null && posts.length === 0 && <TablonVacio />}

        {!error && posts !== null && posts.length > 0 && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 28 }}>
              {posts.map((post, i) => (
                <PostCardPortal
                  key={post.id}
                  post={post}
                  indice={i}
                  estado={asistencia[post.id]}
                  procesando={accionEnCurso === post.id}
                  onApuntarse={() => void handleApuntarse(post.id)}
                  onDesapuntarse={() => void handleDesapuntarse(post.id)}
                />
              ))}
            </div>

            {/* Centinela del scroll infinito. Mientras carga, un esqueleto con
                la forma de la tarjeta que viene; cuando ya no hay más, un
                cierre discreto en vez de un botón muerto. */}
            {hayMas ? (
              <div ref={centinela} style={{ marginTop: 14 }} aria-live="polite">
                {cargandoMas && <SkeletonPostPortal />}
              </div>
            ) : (
              <p style={{ ...micro(9, 0.24, 500), color: t.micro, textAlign: 'center', marginTop: 28 }}>
                Has llegado al principio
              </p>
            )}
          </>
        )}
      </div>

      <Toast aviso={aviso} onDismiss={() => setAviso(null)} />
    </div>
  );
}

// ─── Vacío ──────────────────────────────────────────────────────────────────
//
// No es una lista vacía dentro de una pantalla: ES la pantalla. Por eso no usa
// el `EmptyState` compacto (que está pensado para un hueco dentro de otra cosa)
// y se permite un icono grande y una frase con la voz del portal.

function TablonVacio() {
  const { t } = useModo();
  return (
    <div
      style={{
        marginTop: 40, display: 'flex', flexDirection: 'column', alignItems: 'center',
        textAlign: 'center', padding: '8px 12px 24px',
        animation: `portal-rise-soft ${dur.card}ms ${EASE} both`,
      }}
    >
      <div
        aria-hidden
        style={{
          width: 92, height: 92, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'color-mix(in srgb, var(--portal-brand) 10%, transparent)',
          color: 'var(--portal-brand)',
        }}
      >
        <Megaphone size={36} strokeWidth={1.4} />
      </div>
      <p style={{ ...display(26, true), color: t.ink, marginTop: 22 }}>Aún no hay nada por aquí</p>
      <p style={{ fontFamily: sans, fontSize: 14, lineHeight: 1.55, color: t.muted, marginTop: 10, maxWidth: 280 }}>
        Cuando el equipo del estudio comparta novedades, avisos o un evento al que apuntarte, aparecerán aquí.
      </p>
    </div>
  );
}
