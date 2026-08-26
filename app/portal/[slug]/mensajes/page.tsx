'use client';

// MENSAJES — bandeja de conversaciones de la socia (Community & Messaging OS,
// P1). El backend (esquema/RLS/RPC/rutas /api/public/mensajeria) ya está en
// producción; esta pantalla es puro consumo, con el mismo lenguaje visual que
// Avisos/Perfil (lib/portal-design + components/portal/ui + useModo).
//
// Sin Realtime a propósito (decisión ya cerrada): la lista no hace polling —
// solo se recarga al entrar y al volver del hilo, que es cuando puede haber
// cambiado algo.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { AlertCircle, MessageCircle, Store, ChevronRight, Plus } from 'lucide-react';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { useModo } from '@/lib/portal-modo';
import { portalAuthHeader } from '@/lib/api-client';
import { semantic } from '@/lib/portal-tokens';
import { display, micro, sans, texto } from '@/lib/portal-design';
import { Badge, BottomSheet, Button, Card, EmptyState } from '@/components/portal/ui';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { selloTemporal } from '@/lib/avisos-portal';
import {
  abrirConversacion, fetchConversaciones, instructorasConRelacion, instructorRecordadoDe,
  recordarInstructorDeConversacion,
} from '@/lib/mensajeria-portal.ts';
import type { RowConversaciones } from '@/lib/db-types';

export default function MensajesPage() {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();
  const { session } = usePortalAuth();
  const { studio, instructores, reservas, sesiones } = useStudio();
  const { t } = useModo();

  const socioId = session?.socioId ?? null;

  const [conversaciones, setConversaciones] = useState<RowConversaciones[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nueva, setNueva] = useState(false);
  const [abriendo, setAbriendo] = useState<string | null>(null); // 'mostrador' | instructorId
  const [errorNueva, setErrorNueva] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!studio?.id) return;
    setError(null);
    const headers = await portalAuthHeader();
    const r = await fetchConversaciones(headers, studio.id);
    if ('error' in r) { setError(r.error); return; }
    setConversaciones(r.conversaciones);
  }, [studio?.id]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial, misma forma que Avisos.
  useEffect(() => { void cargar(); }, [cargar]);

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

  const microLabel: React.CSSProperties = { ...micro(9.5, 0.28, 600), color: t.muted };
  const fila: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
    padding: '14px 12px', borderRadius: 16, border: `1.5px solid ${t.line}`,
    background: 'none', cursor: 'pointer',
  };

  return (
    <div style={{ minHeight: '100%', background: t.bg, color: t.ink }}>
      <div style={{ padding: '62px 20px 24px' }}>
        <p style={microLabel}>{studio?.nombre ?? 'Tu estudio'}</p>
        <h1 style={{ ...display(34), color: t.ink, marginTop: 6 }}>Mensajes</h1>

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
              <div key={i} className="animate-pulse" style={{ height: 78, borderRadius: 20, background: t.surface2 }} />
            ))}
          </div>
        )}

        {!error && conversaciones !== null && conversaciones.length === 0 && (
          <div style={{ marginTop: 24 }}>
            <EmptyState
              icon={<MessageCircle size={20} />}
              title="Todavía no tienes conversaciones"
              body="Escribe al estudio o a tu instructora cuando lo necesites — te responderán aquí."
              action={{ label: 'Nueva conversación', onClick: () => setNueva(true) }}
            />
          </div>
        )}

        {!error && conversaciones !== null && conversaciones.length > 0 && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 24 }}>
              {conversaciones.map(c => {
                const esMostrador = c.tipo === 'ALUMNA_MOSTRADOR';
                const instructorId = !esMostrador ? instructorRecordadoDe(c.id) : null;
                const instructora = instructorId ? instructores.find(i => i.id === instructorId) : null;
                const nombreMostrado = esMostrador ? 'El estudio' : (instructora?.nombre ?? 'Tu instructora');
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => router.push(`/portal/${slug}/mensajes/${c.id}`)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                    aria-label={`Abrir conversación con ${nombreMostrado}`}
                  >
                    <Card style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
                      {esMostrador ? (
                        <div style={{ width: 44, height: 44, borderRadius: 999, background: 'var(--portal-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Store size={18} style={{ color: 'var(--portal-brand-foreground)' }} />
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
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Badge variant="neutral">{esMostrador ? 'El estudio' : 'Tu instructora'}</Badge>
                        <p style={{ fontFamily: sans, fontSize: 14.5, fontWeight: 800, marginTop: 6, color: t.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {nombreMostrado}
                        </p>
                        <p style={{ ...texto.meta, color: t.muted, marginTop: 2 }}>
                          {selloTemporal(c.ultimo_mensaje_en)}
                        </p>
                      </div>
                      <ChevronRight size={16} style={{ color: t.muted, flexShrink: 0 }} aria-hidden />
                    </Card>
                  </button>
                );
              })}
            </div>

            <Button
              onClick={() => setNueva(true)}
              style={{ width: '100%', marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              <Plus size={16} aria-hidden />
              Nueva conversación
            </Button>
          </>
        )}
      </div>

      <BottomSheet open={nueva} onClose={() => { setNueva(false); setErrorNueva(null); }}>
        <h2 style={{ ...display(24), color: t.ink, marginBottom: 4 }}>Escribir</h2>
        <p style={{ ...texto.meta, color: t.muted, marginBottom: 8 }}>
          Elige a quién quieres escribir.
        </p>

        <button
          type="button"
          onClick={() => void abrir('ALUMNA_MOSTRADOR')}
          disabled={abriendo !== null}
          style={{ ...fila, cursor: abriendo !== null ? 'default' : 'pointer', opacity: abriendo !== null && abriendo !== 'mostrador' ? 0.5 : 1 }}
        >
          <div style={{ width: 40, height: 40, borderRadius: 999, background: 'var(--portal-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Store size={16} style={{ color: 'var(--portal-brand-foreground)' }} aria-hidden />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontFamily: sans, fontSize: 14, fontWeight: 700, color: t.ink }}>Escribir al estudio</p>
            <p style={{ fontFamily: sans, fontSize: 12, color: t.muted }}>Mostrador, dudas generales, horarios</p>
          </div>
          {abriendo === 'mostrador' && <SpinnerChip />}
        </button>

        {instructorasValidas.length === 0 ? (
          <p style={{ ...texto.nota, color: t.muted, marginTop: 4 }}>
            Todavía no has tenido clase con ninguna instructora — en cuanto asistas a una, podrás escribirle directamente.
          </p>
        ) : (
          <>
            <p style={{ ...micro(9.5, 0.24, 600), color: t.muted, marginTop: 6 }}>Tus instructoras</p>
            {instructorasValidas.map(ins => (
              <button
                key={ins.id}
                type="button"
                onClick={() => void abrir('ALUMNA_INSTRUCTORA', ins.id)}
                disabled={abriendo !== null}
                style={{ ...fila, padding: '10px 12px', cursor: abriendo !== null ? 'default' : 'pointer', opacity: abriendo !== null && abriendo !== ins.id ? 0.5 : 1 }}
              >
                <ProfileAvatar nombre={ins.nombre} color={ins.color} avatarId={ins.avatar} fotoUrl={ins.fotoUrl} size="sm" />
                <p style={{ flex: 1, fontFamily: sans, fontSize: 14, fontWeight: 700, color: t.ink }}>{ins.nombre}</p>
                {abriendo === ins.id && <SpinnerChip />}
              </button>
            ))}
          </>
        )}

        {errorNueva && (
          <p role="alert" style={{ fontFamily: sans, fontSize: 12.5, color: semantic.danger.text, marginTop: 4 }}>{errorNueva}</p>
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
      style={{ width: 14, height: 14, borderRadius: 999, flexShrink: 0, border: '2px solid currentColor', borderTopColor: 'transparent', opacity: 0.6 }}
    />
  );
}
