'use client';

// HILO de una conversación (Community & Messaging OS). Realtime Broadcast-
// from-DB (diseño validado por tentare-arquitecto) sustituye el polling que
// tenía esta pantalla — canal `conversacion:{id}` (`private: true`, broadcast
// con la fila `mensajes` completa en el evento `INSERT`), vía
// `supabasePortalRealtime` (reutiliza la sesión de `supabasePortal.auth` sin
// duplicar login). Sin fallback a polling si el WebSocket falla (decisión ya
// tomada): degradación aceptable, se ve al reabrir/refrescar el hilo.
//
// `cuerpo` se pinta SIEMPRE como texto plano (React escapa por defecto; nunca
// se usa dangerouslySetInnerHTML aquí) — mismo criterio que ya aplica el lado
// staff para este mismo campo.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, ArrowUp, MessageCircle, Store } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { useCore } from '@/lib/core-context';
import { useModo } from '@/lib/portal-modo';
import { supabasePortal } from '@/lib/db/supabase-portal';
import { supabasePortalRealtime } from '@/lib/db/supabase-portal-realtime';
import { portalAuthHeader } from '@/lib/api-client';
import { semantic } from '@/lib/portal-tokens';
import { sans, EASE, dur } from '@/lib/portal-design';
import { EmptyState } from '@/components/portal/ui';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import {
  fetchConversaciones, fetchMensajes, enviarMensaje, marcarConversacionLeida,
  instructorRecordadoDe, recordarInstructorDeConversacion,
} from '@/lib/mensajeria-portal.ts';
import type { RowMensajes, RowConversaciones } from '@/lib/db-types';

const LIMITE_CUERPO = 4000;

function formatoHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function mismoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function etiquetaDia(iso: string, ahora: Date): string {
  const d = new Date(iso);
  if (mismoDia(d, ahora)) return 'Hoy';
  const ayer = new Date(ahora);
  ayer.setDate(ayer.getDate() - 1);
  if (mismoDia(d, ayer)) return 'Ayer';
  return `${d.getDate()} de ${MESES_CORTO[d.getMonth()]}${d.getFullYear() !== ahora.getFullYear() ? ` de ${d.getFullYear()}` : ''}`;
}

export default function HiloMensajePage() {
  const { slug, id } = useParams<{ slug: string; id: string }>();
  const { studio, instructores } = useStudio();
  const { barraClasica } = useCore();
  const { t } = useModo();
  const studioId = studio?.id ?? null;

  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [conversacion, setConversacion] = useState<RowConversaciones | null | undefined>(undefined); // undefined = aún no se sabe
  const [mensajes, setMensajes] = useState<RowMensajes[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [texto1, setTexto1] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [teclado, setTeclado] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const ultimoIdRef = useRef<string | null>(null);
  const cercaDelFinalRef = useRef(true);

  // El JWT no llega a través de PortalSession — se lee directo de la sesión de
  // Supabase, igual que `portalAuthHeader()`. Es lo único que permite decidir
  // "este mensaje es mío" sin pedirle nada nuevo al servidor.
  useEffect(() => {
    let vivo = true;
    void supabasePortal.auth.getSession().then(({ data }) => {
      if (vivo) setAuthUserId(data.session?.user.id ?? null);
    });
    return () => { vivo = false; };
  }, []);

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

  // Realtime — canal `conversacion:{id}` (`private: true`, broadcast con la
  // fila `mensajes` completa en el evento `INSERT`). Mismo patrón `setAuth`
  // antes de suscribir + reenvío en `TOKEN_REFRESHED` que ya usan las
  // suscripciones del lado staff (studio-context.tsx/notification-bell.tsx),
  // pero contra `supabasePortalRealtime` — el JWT es el de la socia, no el de
  // staff. Sin fallback a polling si el WebSocket falla (decisión ya tomada).
  useEffect(() => {
    let vivo = true;
    let canal: ReturnType<typeof supabasePortalRealtime.channel> | null = null;
    (async () => {
      const { data } = await supabasePortal.auth.getSession();
      if (!vivo) return;
      await supabasePortalRealtime.realtime.setAuth(data.session?.access_token ?? null);
      if (!vivo) return;
      canal = supabasePortalRealtime
        .channel(`conversacion:${id}`, { config: { private: true } })
        .on('broadcast', { event: 'INSERT' }, ({ payload }) => {
          const fila = payload.record as RowMensajes;
          setMensajes(prev => (prev?.some(m => m.id === fila.id) ? prev : [...(prev ?? []), fila]));
        })
        .subscribe();
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
    };
  }, [id]);

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
  const nombreCabecera = esMostrador ? 'El estudio' : (instructora?.nombre ?? 'Tu instructora');

  // Autoscroll: solo si ya estábamos cerca del final (no interrumpe a quien
  // ha subido a leer un mensaje antiguo).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !mensajes) return;
    if (cercaDelFinalRef.current) el.scrollTop = el.scrollHeight;
  }, [mensajes]);

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
    const cuerpo = texto1.trim();
    if (!cuerpo || !studioId || enviando) return;
    setEnviando(true);
    setErrorEnvio(null);
    const headers = await portalAuthHeader();
    const r = await enviarMensaje(headers, id, studioId, cuerpo);
    setEnviando(false);
    if ('error' in r) { setErrorEnvio(r.error); return; }
    setTexto1('');
    cercaDelFinalRef.current = true;
    setMensajes(prev => [...(prev ?? []), r.mensaje]);
  }

  const grupos = useMemo(() => {
    if (!mensajes) return [];
    const ahora = new Date();
    const out: { etiqueta: string; items: RowMensajes[] }[] = [];
    for (const m of mensajes) {
      const etiqueta = etiquetaDia(m.creado_en, ahora);
      const grupo = out[out.length - 1];
      if (grupo && grupo.etiqueta === etiqueta) grupo.items.push(m);
      else out.push({ etiqueta, items: [m] });
    }
    return out;
  }, [mensajes]);

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
      {/* ── Cabecera ─────────────────────────────────────────────────────── */}
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
          <div style={{ width: 36, height: 36, borderRadius: 999, background: 'var(--portal-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Store size={15} style={{ color: 'var(--portal-brand-foreground)' }} aria-hidden />
          </div>
        ) : (
          <ProfileAvatar nombre={instructora?.nombre ?? '?'} color={instructora?.color} avatarId={instructora?.avatar} fotoUrl={instructora?.fotoUrl} size="sm" />
        )}
        <div style={{ minWidth: 0 }}>
          <p style={{ fontFamily: sans, fontSize: 15, fontWeight: 800, color: t.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {conversacion === undefined ? 'Cargando…' : nombreCabecera}
          </p>
          {!esMostrador && conversacion?.tipo === 'ALUMNA_INSTRUCTORA' && (
            <p style={{ fontFamily: sans, fontSize: 11.5, color: t.muted }}>Instructora</p>
          )}
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
            <div className="animate-pulse" style={{ height: 40, width: '60%', borderRadius: 16, background: t.surface2, alignSelf: 'flex-start' }} />
            <div className="animate-pulse" style={{ height: 40, width: '45%', borderRadius: 16, background: t.surface2, alignSelf: 'flex-end' }} />
          </div>
        )}

        {!error && mensajes !== null && mensajes.length === 0 && (
          <EmptyState
            icon={esMostrador ? <Store size={18} /> : <MessageCircle size={18} />}
            title="Todavía no hay mensajes"
            body={`Escribe el primer mensaje a ${esMostrador ? 'el estudio' : (instructora?.nombre ?? 'tu instructora')}.`}
          />
        )}

        {!error && grupos.map(grupo => (
          <div key={grupo.etiqueta}>
            <p style={{ textAlign: 'center', fontFamily: sans, fontSize: 11, fontWeight: 700, color: t.muted, margin: '14px 0 10px', textTransform: 'uppercase', letterSpacing: '.04em' }}>
              {grupo.etiqueta}
            </p>
            {grupo.items.map(m => {
              const mio = m.remitente_auth_user_id === authUserId;
              return (
                <div key={m.id} style={{ display: 'flex', justifyContent: mio ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
                  <div
                    style={{
                      maxWidth: '78%', padding: '10px 14px', borderRadius: 18,
                      borderBottomRightRadius: mio ? 4 : 18, borderBottomLeftRadius: mio ? 18 : 4,
                      background: mio ? 'var(--portal-brand)' : t.surface2,
                      color: mio ? 'var(--portal-brand-foreground)' : t.ink,
                    }}
                  >
                    <p style={{ fontFamily: sans, fontSize: 14.5, lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {m.cuerpo}
                    </p>
                    <p style={{ fontFamily: sans, fontSize: 10, marginTop: 4, opacity: 0.7, textAlign: 'right' }}>
                      {formatoHora(m.creado_en)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* ── Compositor ───────────────────────────────────────────────────── */}
      <div
        style={{
          flexShrink: 0, display: 'flex', alignItems: 'flex-end', gap: 8,
          padding: `10px 12px calc(10px + env(safe-area-inset-bottom))`,
          borderTop: `1px solid ${t.line}`, background: t.bg,
          transform: teclado > 0 ? `translateY(-${teclado}px)` : undefined,
        }}
      >
        <textarea
          value={texto1}
          onChange={e => setTexto1(e.target.value.slice(0, LIMITE_CUERPO))}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar(); }
          }}
          placeholder="Escribe un mensaje…"
          aria-label="Escribe un mensaje"
          rows={1}
          disabled={conversacion === undefined || enviando}
          style={{
            flex: 1, resize: 'none', maxHeight: 120, minHeight: 44,
            borderRadius: 20, border: `1.5px solid ${t.line}`, background: t.surface, color: t.ink,
            padding: '11px 16px', fontFamily: sans, fontSize: 16,
          }}
        />
        <button
          type="button"
          onClick={() => void enviar()}
          disabled={!texto1.trim() || enviando || conversacion === undefined}
          aria-label="Enviar mensaje"
          style={{
            width: 44, height: 44, borderRadius: '50%', border: 'none', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)',
            opacity: !texto1.trim() || enviando ? 0.45 : 1,
            cursor: !texto1.trim() || enviando ? 'default' : 'pointer',
          }}
        >
          {enviando
            ? <span aria-hidden className="animate-spin" style={{ width: 16, height: 16, borderRadius: 999, border: '2px solid currentColor', borderTopColor: 'transparent' }} />
            : <ArrowUp size={18} aria-hidden />}
        </button>
      </div>
      {errorEnvio && (
        <p role="alert" style={{ fontFamily: sans, fontSize: 12, color: semantic.danger.text, padding: '0 16px 10px', background: t.bg }}>
          {errorEnvio}
        </p>
      )}
    </div>
  );
}
