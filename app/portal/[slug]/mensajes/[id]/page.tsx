'use client';

// HILO de una conversación (Community & Messaging OS). Realtime Broadcast-
// from-DB (diseño validado por tentare-arquitecto) — canal `conversacion:{id}`
// (`private: true`, broadcast con la fila `mensajes` completa en el evento
// `INSERT`), vía `supabasePortalRealtime` (reutiliza la sesión de
// `supabasePortal.auth` sin duplicar login). Sin fallback a polling si el
// WebSocket falla (decisión ya tomada): degradación aceptable, se ve al
// reabrir/refrescar el hilo. NADA de eso cambia en este rediseño.
//
// Lo que sí cambia es cómo se LEE el hilo: mensajes seguidos de la misma
// persona agrupados en un bloque (una hora y una cola por turno, no por
// burbuja), separadores de día, cabecera con el contexto de la relación y un
// compositor que crece con lo que escribes.
//
// `cuerpo` se pinta SIEMPRE como texto plano (React escapa por defecto; nunca
// se usa dangerouslySetInnerHTML aquí) — mismo criterio que ya aplica el lado
// staff para este mismo campo.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, MessageCircle, Store } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { useCore } from '@/lib/core-context';
import { useModo } from '@/lib/portal-modo';
import { supabasePortal } from '@/lib/db/supabase-portal';
import { supabasePortalRealtime } from '@/lib/db/supabase-portal-realtime';
import { portalAuthHeader } from '@/lib/api-client';
import { semantic } from '@/lib/portal-tokens';
import { sans, micro, EASE, dur } from '@/lib/portal-design';
import { EmptyState } from '@/components/portal/ui';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { CompositorPortal, HiloMensajes, IndicadorEscribiendo } from '@/components/portal/mensajeria-piezas';
import {
  fetchConversaciones, fetchMensajes, enviarMensaje, marcarConversacionLeida,
  instructorRecordadoDe, recordarInstructorDeConversacion,
} from '@/lib/mensajeria-portal.ts';
import type { RowMensajes } from '@/lib/db-types';
import type { ConversacionConResumen } from '@/lib/mensajeria/presentacion';

// Indicador de "escribiendo…" — broadcast EFÍMERO sobre el MISMO canal
// Realtime del hilo (`conversacion:{id}`), sin tabla ni persistencia: se
// pierde si nadie está conectado, y eso es correcto (no es una función
// crítica). No se emite en cada tecla — con throttle de 2s mientras se sigue
// escribiendo — y el receptor lo apaga solo si no llega otro evento en 3s.
const TYPING_THROTTLE_MS = 2000;
const TYPING_TIMEOUT_MS = 3000;

export default function HiloMensajePage() {
  const { slug, id } = useParams<{ slug: string; id: string }>();
  const { studio, instructores } = useStudio();
  const { barraClasica } = useCore();
  const { t } = useModo();
  const studioId = studio?.id ?? null;

  const [authUserId, setAuthUserId] = useState<string | null>(null);
  // Distingue "todavía no se sabe" de "no hay sesión": el efecto de Realtime
  // espera a que esto sea true antes de crear el canal, para no arrancar con
  // un token que aún no ha llegado del único getSession() del componente.
  const [authResuelto, setAuthResuelto] = useState(false);
  const [conversacion, setConversacion] = useState<ConversacionConResumen | null | undefined>(undefined); // undefined = aún no se sabe
  const [mensajes, setMensajes] = useState<RowMensajes[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [borrador, setBorrador] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [teclado, setTeclado] = useState(0);
  const [escribiendoOtros, setEscribiendoOtros] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const ultimoIdRef = useRef<string | null>(null);
  const cercaDelFinalRef = useRef(true);
  // El canal Realtime del hilo, para poder emitir el broadcast `typing` desde
  // el compositor sin recrear la suscripción — se rellena en el efecto de
  // Realtime de más abajo.
  const canalRef = useRef<ReturnType<typeof supabasePortalRealtime.channel> | null>(null);
  // `authUserId` en un ref: el listener de `typing` vive dentro de un efecto
  // con dependencia `[id]` (no se quiere recrear el canal cada vez que
  // resuelve la sesión), así que necesita el valor VIVO sin que el efecto se
  // vuelva a ejecutar cuando cambie.
  const authUserIdRef = useRef<string | null>(null);
  const ultimoTypingEnviadoRef = useRef(0);
  const escribiendoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Token de acceso cacheado del ÚNICO `getSession()` de este componente — el
  // efecto de Realtime de más abajo lo reutiliza en vez de pedir su propia
  // sesión. `supabasePortal`/`supabasePortalRealtime` comparten cliente
  // (mismo storageKey), y `getSession()` serializa contra un lock interno de
  // supabase-js: encontrado en producción que un segundo `getSession()`
  // concurrente se quedaba colgado para siempre sin lanzar ningún error, así
  // que el canal de Realtime nunca llegaba a crearse (cero WebSocket, cero
  // error en consola). Un solo `getSession()` por montaje quita el riesgo.
  const accessTokenRef = useRef<string | null>(null);

  // El JWT no llega a través de PortalSession — se lee directo de la sesión de
  // Supabase, igual que `portalAuthHeader()`. Es lo único que permite decidir
  // "este mensaje es mío" sin pedirle nada nuevo al servidor.
  useEffect(() => {
    let vivo = true;
    void supabasePortal.auth.getSession().then(({ data }) => {
      if (!vivo) return;
      setAuthUserId(data.session?.user.id ?? null);
      accessTokenRef.current = data.session?.access_token ?? null;
      setAuthResuelto(true);
    });
    return () => { vivo = false; };
  }, []);

  useEffect(() => { authUserIdRef.current = authUserId; }, [authUserId]);

  const cargarConversacion = useCallback(async () => {
    if (!studioId) return;
    const headers = await portalAuthHeader();
    const r = await fetchConversaciones(headers, studioId);
    if ('error' in r) { setConversacion(null); return; }
    setConversacion(r.conversaciones.find(c => c.id === id) ?? null);
  }, [studioId, id]);

  const cargarMensajes = useCallback(async (silencioso = false) => {
    if (!studioId) return;
    if (!silencioso) setError(null);
    const headers = await portalAuthHeader();
    const r = await fetchMensajes(headers, id, studioId);
    if ('error' in r) { if (!silencioso) setError(r.error); return; }
    setMensajes(prev => {
      const cambiaron = !prev || prev.length !== r.mensajes.length
        || prev[prev.length - 1]?.id !== r.mensajes[r.mensajes.length - 1]?.id;
      return cambiaron ? r.mensajes : prev;
    });
    return r.mensajes;
  }, [studioId, id]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial.
  useEffect(() => { void cargarConversacion(); void cargarMensajes(); }, [cargarConversacion, cargarMensajes]);

  // Realtime — mismo patrón `setAuth` antes de suscribir + reenvío en
  // `TOKEN_REFRESHED` que ya usan las suscripciones del lado staff
  // (studio-context.tsx/notification-bell.tsx), pero contra
  // `supabasePortalRealtime`: el JWT es el de la socia, no el de staff.
  useEffect(() => {
    if (!authResuelto) return; // token aún no cacheado — este efecto se repite en cuanto lo esté.
    let vivo = true;
    let canal: ReturnType<typeof supabasePortalRealtime.channel> | null = null;
    (async () => {
      await supabasePortalRealtime.realtime.setAuth(accessTokenRef.current);
      if (!vivo) return;
      canal = supabasePortalRealtime
        .channel(`conversacion:${id}`, { config: { private: true } })
        .on('broadcast', { event: 'INSERT' }, ({ payload }) => {
          const fila = payload.record as RowMensajes;
          setMensajes(prev => (prev?.some(m => m.id === fila.id) ? prev : [...(prev ?? []), fila]));
          // Un mensaje real que llega es señal más fuerte que el "escribiendo…"
          // que lo precedió — apaga el indicador en vez de dejarlo hasta que
          // expire solo por los 3s del timeout.
          if (fila.remitente_auth_user_id !== authUserIdRef.current) {
            if (escribiendoTimeoutRef.current) clearTimeout(escribiendoTimeoutRef.current);
            setEscribiendoOtros(false);
          }
        })
        .on('broadcast', { event: 'typing' }, ({ payload }) => {
          const de = (payload as { authUserId?: string | null })?.authUserId ?? null;
          if (!de || de === authUserIdRef.current) return; // el propio eco, o sin identificar: se ignora
          setEscribiendoOtros(true);
          if (escribiendoTimeoutRef.current) clearTimeout(escribiendoTimeoutRef.current);
          escribiendoTimeoutRef.current = setTimeout(() => setEscribiendoOtros(false), TYPING_TIMEOUT_MS);
        })
        .subscribe();
      canalRef.current = canal;
    })();

    const { data: authSub } = supabasePortal.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' && vivo) {
        void supabasePortalRealtime.realtime.setAuth(session?.access_token ?? null);
      }
    });

    return () => {
      vivo = false;
      authSub.subscription.unsubscribe();
      if (canal) supabasePortalRealtime.removeChannel(canal);
      canalRef.current = null;
      if (escribiendoTimeoutRef.current) clearTimeout(escribiendoTimeoutRef.current);
      setEscribiendoOtros(false);
    };
  }, [id, authResuelto]);

  // Emite el broadcast `typing`, con throttle: como mucho uno cada
  // `TYPING_THROTTLE_MS` mientras la socia sigue escribiendo — nunca en cada
  // tecla. Efímero a propósito: si `send` falla (canal aún no suscrito, sin
  // red) no pasa nada, no hay reintento ni cola.
  const notificarEscribiendo = useCallback(() => {
    const canal = canalRef.current;
    const authUserId = authUserIdRef.current;
    if (!canal || !authUserId) return;
    const ahora = Date.now();
    if (ahora - ultimoTypingEnviadoRef.current < TYPING_THROTTLE_MS) return;
    ultimoTypingEnviadoRef.current = ahora;
    void canal.send({ type: 'broadcast', event: 'typing', payload: { authUserId } });
  }, []);

  const alCambiarBorrador = useCallback((v: string) => {
    setBorrador(v);
    if (v.trim()) notificarEscribiendo();
  }, [notificarEscribiendo]);

  // Marca leído al abrir y cada vez que llega un mensaje nuevo que no es mío
  // mientras el hilo sigue abierto.
  useEffect(() => {
    if (!studioId || !mensajes || mensajes.length === 0) return;
    const ultimo = mensajes[mensajes.length - 1];
    if (ultimo.id === ultimoIdRef.current) return;
    ultimoIdRef.current = ultimo.id;
    void (async () => {
      const headers = await portalAuthHeader();
      await marcarConversacionLeida(headers, id, studioId);
    })();
  }, [mensajes, studioId, id]);

  // Si aún no sabemos qué instructora es (deep link desde otro dispositivo,
  // o conversación abierta antes de este cambio), en cuanto llega el primer
  // mensaje de STAFF se puede deducir cruzando remitente_auth_user_id contra
  // el equipo del estudio — y se recuerda para la próxima vez.
  useEffect(() => {
    if (!mensajes || conversacion?.tipo !== 'ALUMNA_INSTRUCTORA') return;
    if (instructorRecordadoDe(id)) return;
    const deStaff = mensajes.find(m => instructores.some(i => i.authUserId === m.remitente_auth_user_id));
    if (!deStaff) return;
    const instructora = instructores.find(i => i.authUserId === deStaff.remitente_auth_user_id);
    if (instructora) recordarInstructorDeConversacion(id, instructora.id);
  }, [mensajes, conversacion, instructores, id]);

  const instructoraId = conversacion?.tipo === 'ALUMNA_INSTRUCTORA' ? instructorRecordadoDe(id) : null;
  const instructora = instructoraId ? instructores.find(i => i.id === instructoraId) : null;
  const esMostrador = conversacion?.tipo === 'ALUMNA_MOSTRADOR';
  const nombreCabecera = esMostrador
    ? (studio?.nombre ?? 'El estudio')
    : (instructora?.nombre ?? 'Tu instructora');
  // Fase 7 — de qué va esta conversación, no solo con quién es.
  const contextoCabecera = conversacion === undefined
    ? ' '
    : esMostrador
      ? 'Mostrador · dudas y horarios'
      : 'Tu instructora';

  // Autoscroll: solo si ya estábamos cerca del final (no interrumpe a quien
  // ha subido a leer un mensaje antiguo). También cuando aparece/desaparece
  // el indicador de "escribiendo…": si no, la burbuja de puntos puede quedar
  // fuera de la vista justo debajo del último mensaje.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !mensajes) return;
    if (cercaDelFinalRef.current) el.scrollTop = el.scrollHeight;
  }, [mensajes, escribiendoOtros]);

  function alHacerScroll() {
    const el = scrollRef.current;
    if (!el) return;
    cercaDelFinalRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  // Evita que el teclado de iOS tape el compositor: la app vive en un marco
  // `position:fixed` (portal-shell.tsx) que no se redimensiona cuando aparece
  // el teclado — solo el visualViewport lo hace. Sin esto, el compositor
  // queda anclado al fondo del LAYOUT viewport (bajo el teclado) en vez del
  // visual. No verificable con el navegador de este entorno (no simula
  // teclado real): revisar en un dispositivo de verdad antes de dar por
  // cerrado este punto.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const ajustar = () => setTeclado(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    vv.addEventListener('resize', ajustar);
    vv.addEventListener('scroll', ajustar);
    ajustar();
    return () => { vv.removeEventListener('resize', ajustar); vv.removeEventListener('scroll', ajustar); };
  }, []);

  async function enviar() {
    const cuerpo = borrador.trim();
    if (!cuerpo || !studioId || enviando) return;
    setEnviando(true);
    setErrorEnvio(null);
    const headers = await portalAuthHeader();
    const r = await enviarMensaje(headers, id, studioId, cuerpo);
    setEnviando(false);
    if ('error' in r) { setErrorEnvio(r.error); return; }
    setBorrador('');
    cercaDelFinalRef.current = true;
    setMensajes(prev => [...(prev ?? []), r.mensaje]);
  }

  // Este hilo pinta a pantalla completa (cabecera + composer propios), a
  // diferencia del resto de pantallas del portal que fluyen dentro de `main`.
  // Con la barra inferior FLOTANTE (tema Bloom: `position:absolute` encima de
  // `main`, portal-shell.tsx) el composer quedaría debajo de ella si no se le
  // reserva el mismo hueco que ya reserva el resto de páginas — con la barra
  // CLÁSICA (en flujo, debajo de `main`) no hace falta nada, `main` ya excluye
  // ese espacio de su propia altura.
  const huecoBarraFlotante = !barraClasica
    ? 'calc(var(--portal-tabbar-height, 58px) + 38px + env(safe-area-inset-bottom))'
    : 0;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: t.bg, color: t.ink, paddingBottom: huecoBarraFlotante }}>
      {/* ── Cabecera con contexto ────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '58px 16px 14px', borderBottom: `1px solid ${t.line}`, flexShrink: 0 }}>
        <Link
          href={`/portal/${slug}/mensajes`}
          aria-label="Volver a Mensajes"
          style={{
            width: 38, height: 38, borderRadius: '50%', border: `1px solid ${t.line}`,
            background: t.surface, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: t.ink, flexShrink: 0, transition: `background ${dur.color}ms ${EASE}`,
          }}
        >
          <ArrowLeft size={16} aria-hidden />
        </Link>
        {esMostrador ? (
          <div style={{ width: 40, height: 40, borderRadius: 999, background: 'var(--portal-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Store size={17} style={{ color: 'var(--portal-brand-foreground)' }} aria-hidden />
          </div>
        ) : (
          <ProfileAvatar nombre={instructora?.nombre ?? '?'} color={instructora?.color} avatarId={instructora?.avatar} fotoUrl={instructora?.fotoUrl} size="md" />
        )}
        <div style={{ minWidth: 0 }}>
          <p style={{ fontFamily: sans, fontSize: 15.5, fontWeight: 800, color: t.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {conversacion === undefined ? 'Cargando…' : nombreCabecera}
          </p>
          <p style={{ ...micro(8.5, 0.2, 700), color: t.micro, marginTop: 2 }}>{contextoCabecera}</p>
        </div>
      </div>

      {/* ── Mensajes ─────────────────────────────────────────────────────── */}
      <div
        ref={scrollRef} onScroll={alHacerScroll}
        role="log" aria-live="polite" aria-label="Mensajes de la conversación"
        style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '16px 16px 8px' }}
      >
        {error && (
          <EmptyState
            icon={<AlertCircle size={18} />}
            title="No se han podido cargar los mensajes"
            body={error}
            variant="error"
            action={{ label: 'Reintentar', onClick: () => void cargarMensajes() }}
          />
        )}

        {!error && mensajes === null && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} aria-hidden>
            <div className="animate-pulse" style={{ height: 40, width: '60%', borderRadius: 20, background: t.surface2, alignSelf: 'flex-start' }} />
            <div className="animate-pulse" style={{ height: 40, width: '45%', borderRadius: 20, background: t.surface2, alignSelf: 'flex-end' }} />
          </div>
        )}

        {!error && mensajes !== null && mensajes.length === 0 && (
          <EmptyState
            icon={esMostrador ? <Store size={18} /> : <MessageCircle size={18} />}
            title="Todavía no hay mensajes"
            body={`Escribe el primero a ${nombreCabecera}. Lo verá en cuanto lo envíes.`}
          />
        )}

        {!error && mensajes !== null && mensajes.length > 0 && (
          <HiloMensajes
            mensajes={mensajes}
            authUserId={authUserId}
            leidoHastaOtros={conversacion?.leido_hasta_otros}
          />
        )}

        {!error && escribiendoOtros && <IndicadorEscribiendo />}
      </div>

      {/* ── Compositor ───────────────────────────────────────────────────── */}
      <CompositorPortal
        valor={borrador}
        onValor={alCambiarBorrador}
        onEnviar={() => void enviar()}
        enviando={enviando}
        deshabilitado={conversacion === undefined}
        nombre={nombreCabecera}
        desplazamientoTeclado={teclado}
      />
      {errorEnvio && (
        <p role="alert" style={{ fontFamily: sans, fontSize: 12, color: semantic.danger.text, padding: '0 16px 10px', background: t.bg }}>
          {errorEnvio}
        </p>
      )}
    </div>
  );
}
