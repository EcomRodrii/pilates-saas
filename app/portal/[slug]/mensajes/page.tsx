'use client';

// MENSAJES — bandeja de conversaciones de la socia (Community & Messaging OS).
//
// Rediseño completo: la primera versión pintaba un `Badge` con el tipo técnico,
// el nombre y un sello temporal — ni previsualización, ni marca de no leído, ni
// un motivo para volver. Ahora usa el lenguaje visual del portal con el mismo
// cuidado que Progreso o Instructores.
//
// Valores literales del kit real ("Tentare Studio App", docs/diseno-
// referencia-portal/): mismo `--ap-*`/hex que ya usa
// `app/portal/[slug]/compras/page.tsx` y `portal-clases-view.tsx`/
// `portal-perfil-view.tsx`, en vez de `useModo()`/`display()`/`micro()`/
// `texto.*`. `var(--portal-brand)` se mantiene donde ya vivía (avatar de
// mostrador) — el portal sigue siendo white-label, y ese es el único
// elemento realmente "de marca" de esta pantalla.
//
// ⚠️ Sin captura de referencia directa para esta pantalla (la única del
// paquete "Mensajes" es el HILO de conversación, no la bandeja) — el
// tratamiento de las filas/etiquetas de aquí es EXTRAPOLADO por consistencia
// con el resto del portal ya convertido, no un calco 1:1 de un diseño visto.
//
// Sin Realtime a propósito en la LISTA (decisión ya cerrada): no hace polling —
// se recarga al entrar y al volver del hilo, que es cuando puede haber
// cambiado algo. El hilo sí es Realtime.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { AlertCircle, MessageCircle, Store, Plus, Search } from 'lucide-react';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { supabasePortal } from '@/lib/db/supabase-portal';
import { portalAuthHeader } from '@/lib/api-client';
import { sans, EASE, dur } from '@/lib/portal-design';
import { BottomSheet, Button, EmptyState } from '@/components/portal/ui';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { FilaConversacionPortal } from '@/components/portal/mensajeria-piezas';
import { tieneSinLeer } from '@/lib/mensajeria/presentacion';
import {
  abrirConversacion, fetchConversaciones, instructorasConRelacion, instructorRecordadoDe,
  recordarInstructorDeConversacion,
} from '@/lib/mensajeria-portal.ts';
import type { ConversacionConResumen } from '@/lib/mensajeria/presentacion';

export default function MensajesPage() {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();
  const { session } = usePortalAuth();
  const { studio, instructores, reservas, sesiones } = useStudio();

  const socioId = session?.socioId ?? null;
  const studioId = studio?.id ?? null;

  const [conversaciones, setConversaciones] = useState<ConversacionConResumen[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nueva, setNueva] = useState(false);
  const [abriendo, setAbriendo] = useState<string | null>(null); // 'mostrador' | instructorId
  const [errorNueva, setErrorNueva] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [authUserId, setAuthUserId] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!studioId) return;
    setError(null);
    const headers = await portalAuthHeader();
    const r = await fetchConversaciones(headers, studioId);
    if ('error' in r) { setError(r.error); return; }
    setConversaciones(r.conversaciones);
  }, [studioId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial, misma forma que Avisos.
  useEffect(() => { void cargar(); }, [cargar]);

  // Quién soy, para no marcarme como "sin leer" mi propio último mensaje. Mismo
  // camino que usa el hilo: la sesión de Supabase, no PortalSession.
  useEffect(() => {
    let vivo = true;
    void supabasePortal.auth.getSession().then(({ data }) => {
      if (vivo) setAuthUserId(data.session?.user.id ?? null);
    });
    return () => { vivo = false; };
  }, []);

  const instructorasValidas = useMemo(
    () => instructorasConRelacion(instructores, reservas, sesiones, socioId),
    [instructores, reservas, sesiones, socioId],
  );

  async function abrir(tipo: 'ALUMNA_MOSTRADOR' | 'ALUMNA_INSTRUCTORA', instructorId?: string) {
    if (!studio?.id) return;
    setAbriendo(tipo === 'ALUMNA_MOSTRADOR' ? 'mostrador' : (instructorId ?? null));
    setErrorNueva(null);
    const headers = await portalAuthHeader();
    const r = await abrirConversacion(headers, studio.id, tipo, instructorId);
    setAbriendo(null);
    if ('error' in r) { setErrorNueva(r.error); return; }
    if (instructorId) recordarInstructorDeConversacion(r.id, instructorId);
    setNueva(false);
    router.push(`/portal/${slug}/mensajes/${r.id}`);
  }

  // Fila del sheet "¿A quién escribes?" — mismo tratamiento `ap-card` que
  // cualquier fila del kit (CHEATSHEET-CSS.md, "Fila de clase"): tarjeta
  // blanca, borde fino, radio 16px (los da la clase).
  const fila: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
    padding: '12px 14px', border: '1px solid #E5E3DA', background: '#FFFFFF', cursor: 'pointer',
    transition: `border-color ${dur.color}ms ${EASE}, opacity ${dur.color}ms ${EASE}`,
  };

  const instructorasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return q ? instructorasValidas.filter(i => i.nombre.toLowerCase().includes(q)) : instructorasValidas;
  }, [instructorasValidas, busqueda]);

  return (
    <div style={{ minHeight: '100%', background: '#FAF9F5', color: '#1A1A1A' }}>
      <div style={{ padding: '62px 20px 24px' }}>
        <div className="ap-label">{studio?.nombre ?? 'Tu estudio'}</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.025em', color: '#1A1A1A', marginTop: 10 }}>Mensajes</h1>

        {error && (
          <div style={{ marginTop: 24 }}>
            <EmptyState
              icon={<AlertCircle size={20} />}
              title="No se han podido cargar tus mensajes"
              body={error}
              variant="error"
              action={{ label: 'Reintentar', onClick: () => void cargar() }}
            />
          </div>
        )}

        {!error && conversaciones === null && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 24 }} aria-hidden>
            {[0, 1].map(i => (
              <div key={i} className="animate-pulse" style={{ height: 84, borderRadius: 16, background: '#EFEDE4' }} />
            ))}
          </div>
        )}

        {/* Vacío con carácter: un círculo grande con el acento del portal y una
            frase que invita, en vez del icono gris de 20 px de siempre. */}
        {!error && conversaciones !== null && conversaciones.length === 0 && (
          <div
            className="ap-anim-up"
            style={{
              marginTop: 28, display: 'flex', flexDirection: 'column', alignItems: 'center',
              textAlign: 'center', padding: '18px 8px 8px',
            }}
          >
            <div
              style={{
                width: 96, height: 96, borderRadius: 999, display: 'flex',
                alignItems: 'center', justifyContent: 'center', marginBottom: 18,
                background: '#EAF0E7', color: '#3E6B4A',
              }}
              aria-hidden
            >
              <MessageCircle size={40} strokeWidth={1.4} />
            </div>
            <h2 style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-.02em', color: '#1A1A1A' }}>Aquí empieza la conversación</h2>
            <p style={{ fontFamily: sans, fontSize: 12.5, color: '#5A5A52', marginTop: 8, maxWidth: 260, lineHeight: 1.5 }}>
              Escribe al estudio o a tu instructora cuando lo necesites — una duda, un cambio de hora,
              una molestia. Te responden aquí mismo.
            </p>
            <Button onClick={() => setNueva(true)} style={{ marginTop: 22, minWidth: 220, gap: 8 }}>
              <Plus size={16} aria-hidden />
              Escribir
            </Button>
          </div>
        )}

        {!error && conversaciones !== null && conversaciones.length > 0 && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 24 }}>
              {conversaciones.map((c, i) => {
                const esMostrador = c.tipo === 'ALUMNA_MOSTRADOR';
                const instructorId = !esMostrador ? instructorRecordadoDe(c.id) : null;
                const instructora = instructorId ? instructores.find(x => x.id === instructorId) : null;
                const nombreMostrado = esMostrador ? (studio?.nombre ?? 'El estudio') : (instructora?.nombre ?? 'Tu instructora');
                const contexto = esMostrador ? 'Mostrador · dudas y horarios' : 'Tu instructora';
                const sinLeer = tieneSinLeer(c, authUserId);
                const mio = Boolean(c.ultimo_remitente_auth_user_id && c.ultimo_remitente_auth_user_id === authUserId);
                return (
                  <FilaConversacionPortal
                    key={c.id}
                    indice={i}
                    nombre={nombreMostrado}
                    contexto={contexto}
                    ultimoCuerpo={c.ultimo_cuerpo}
                    ultimoMensajeEn={c.ultimo_mensaje_en}
                    sinLeer={sinLeer}
                    mio={mio}
                    onClick={() => router.push(`/portal/${slug}/mensajes/${c.id}`)}
                    avatar={esMostrador ? (
                      <div
                        style={{
                          width: 46, height: 46, borderRadius: 999, background: 'var(--portal-brand)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}
                      >
                        <Store size={19} style={{ color: 'var(--portal-brand-foreground)' }} aria-hidden />
                      </div>
                    ) : (
                      <ProfileAvatar
                        nombre={instructora?.nombre ?? '?'}
                        color={instructora?.color}
                        avatarId={instructora?.avatar}
                        fotoUrl={instructora?.fotoUrl}
                        size="md"
                      />
                    )}
                  />
                );
              })}
            </div>

            <Button
              onClick={() => setNueva(true)}
              variant="secondary"
              style={{ width: '100%', marginTop: 18, gap: 8 }}
            >
              <Plus size={16} aria-hidden />
              Nueva conversación
            </Button>
          </>
        )}
      </div>

      {/* ── A quién escribo ─────────────────────────────────────────────────
          Nada de <select>: caras y nombres, con buscador en cuanto la lista
          deja de caber de un vistazo. */}
      <BottomSheet open={nueva} onClose={() => { setNueva(false); setErrorNueva(null); setBusqueda(''); }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em', color: '#1A1A1A' }}>¿A quién escribes?</h2>
        <p style={{ fontFamily: sans, fontSize: 12.5, color: '#5A5A52', marginTop: -6 }}>
          Te responden desde el estudio, sin salir de aquí.
        </p>

        <button
          type="button"
          onClick={() => void abrir('ALUMNA_MOSTRADOR')}
          disabled={abriendo !== null}
          className="ap-card"
          style={{ ...fila, cursor: abriendo !== null ? 'default' : 'pointer', opacity: abriendo !== null && abriendo !== 'mostrador' ? 0.45 : 1 }}
        >
          <div style={{ width: 44, height: 44, borderRadius: 999, background: 'var(--portal-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Store size={18} style={{ color: 'var(--portal-brand-foreground)' }} aria-hidden />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontFamily: sans, fontSize: 14.5, fontWeight: 700, color: '#1A1A1A' }}>
              {studio?.nombre ?? 'El estudio'}
            </p>
            <p style={{ fontFamily: sans, fontSize: 11, color: '#5A5A52', marginTop: 1 }}>Mostrador · dudas generales, horarios</p>
          </div>
          {abriendo === 'mostrador' && <SpinnerChip />}
        </button>

        {instructorasValidas.length === 0 ? (
          <p style={{ fontFamily: sans, fontSize: 11, color: '#5A5A52', lineHeight: 1.5 }}>
            Todavía no has tenido clase con ninguna instructora — en cuanto asistas a una, podrás escribirle directamente.
          </p>
        ) : (
          <>
            <p className="ap-label">Tus instructoras</p>

            {instructorasValidas.length > 5 && (
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                  borderRadius: 999, border: '1.5px solid #E5E3DA', background: '#FFFFFF',
                }}
              >
                <Search size={15} style={{ color: '#5A5A52', flexShrink: 0 }} aria-hidden />
                <input
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  placeholder="Busca por nombre…"
                  aria-label="Buscar instructora"
                  style={{
                    flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
                    fontFamily: sans, fontSize: 15, color: '#1A1A1A',
                  }}
                />
              </div>
            )}

            {instructorasFiltradas.length === 0 ? (
              <p style={{ fontFamily: sans, fontSize: 11, color: '#5A5A52' }}>Ninguna instructora se llama así.</p>
            ) : instructorasFiltradas.map((ins, i) => (
              <button
                key={ins.id}
                type="button"
                onClick={() => void abrir('ALUMNA_INSTRUCTORA', ins.id)}
                disabled={abriendo !== null}
                className="ap-card ap-anim-up"
                style={{
                  ...fila, padding: '10px 14px',
                  cursor: abriendo !== null ? 'default' : 'pointer',
                  opacity: abriendo !== null && abriendo !== ins.id ? 0.45 : 1,
                  animationDelay: `${Math.min(i, 6) * 40}ms`,
                }}
              >
                <ProfileAvatar nombre={ins.nombre} color={ins.color} avatarId={ins.avatar} fotoUrl={ins.fotoUrl} size="md" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: sans, fontSize: 14.5, fontWeight: 700, color: '#1A1A1A' }}>{ins.nombre}</p>
                  <p style={{ fontFamily: sans, fontSize: 11, color: '#5A5A52', marginTop: 1 }}>Instructora de tus clases</p>
                </div>
                {abriendo === ins.id && <SpinnerChip />}
              </button>
            ))}
          </>
        )}

        {errorNueva && (
          <p role="alert" style={{ fontFamily: sans, fontSize: 12.5, color: '#C2503A' }}>{errorNueva}</p>
        )}
      </BottomSheet>
    </div>
  );
}

function SpinnerChip() {
  return (
    <span
      aria-hidden
      className="animate-spin"
      style={{ width: 15, height: 15, borderRadius: 999, flexShrink: 0, border: '2px solid currentColor', borderTopColor: 'transparent', opacity: 0.6 }}
    />
  );
}
