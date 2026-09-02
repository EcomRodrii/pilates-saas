'use client';

// MIS COMPAÑERAS — social graph "compañeras de clase" (Community & Messaging
// OS, última pieza de P2). El backend (esquema/RLS/RPC/rutas
// `/api/public/social/companeras`) ya está en producción; esta pantalla es
// puro consumo, mismo lenguaje visual que Mensajes/Comunidad/Documentos.
//
// Sin polling/Realtime a propósito (mismo criterio que Mensajes/Documentos):
// una solicitud nueva se resuelve con la notificación normal, no con un canal
// en vivo.
//
// Privacidad: un bloqueo (propio o ajeno) nunca se anuncia como tal. El error
// de una acción que choca con un bloqueo llega ya genérico desde el servidor
// (`errorPeticion`), y aquí se muestra tal cual — nunca se traduce a nada más
// específico.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Users2, Check, Ban, Clock3 } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { usePortalAuth } from '@/lib/portal-auth';
import { useModo } from '@/lib/portal-modo';
import { portalAuthHeader } from '@/lib/api-client';
import { display, micro, sans, texto } from '@/lib/portal-design';
import { Badge, BottomSheet, Button, Card, EmptyState, Tabs, Toast, type AvisoToast } from '@/components/portal/ui';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import {
  fetchListaCompaneras, aceptarSolicitudCompanera, bloquearCompanera,
  type ListaCompaneras, type RowSocioCompanerasConNombre,
} from '@/lib/social-companeras-portal.ts';

type Pestana = 'recibidas' | 'enviadas' | 'aceptadas';

export default function CompanerasPage() {
  const { studio } = useStudio();
  const { session } = usePortalAuth();
  const { t } = useModo();

  void session; // el id de la socia lo resuelve el servidor (socioAutenticado), no hace falta aquí.
  const studioId = studio?.id ?? null;

  const [lista, setLista] = useState<ListaCompaneras | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pestana, setPestana] = useState<Pestana>('recibidas');
  const [aviso, setAviso] = useState<AvisoToast | null>(null);
  const [enCurso, setEnCurso] = useState<string | null>(null);
  const [aBloquear, setABloquear] = useState<RowSocioCompanerasConNombre | null>(null);

  const cargar = useCallback(async () => {
    if (!studioId) return;
    setError(null);
    const headers = await portalAuthHeader();
    const r = await fetchListaCompaneras(headers, studioId);
    if ('error' in r) { setError(r.error); return; }
    setLista(r);
  }, [studioId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial, misma forma que Mensajes/Comunidad.
  useEffect(() => { void cargar(); }, [cargar]);

  async function aceptar(fila: RowSocioCompanerasConNombre) {
    if (!studio?.id || enCurso) return;
    setEnCurso(fila.id);
    const headers = await portalAuthHeader();
    const r = await aceptarSolicitudCompanera(headers, studio.id, fila.id);
    setEnCurso(null);
    if ('error' in r) { setAviso({ texto: r.error, error: true }); return; }
    setAviso({ texto: `Ahora ${fila.otraParteNombre} y tú sois compañeras.` });
    void cargar();
  }

  async function bloquear(fila: RowSocioCompanerasConNombre) {
    if (!studio?.id || enCurso) return;
    setEnCurso(fila.id);
    const headers = await portalAuthHeader();
    const r = await bloquearCompanera(headers, studio.id, fila.id);
    setEnCurso(null);
    setABloquear(null);
    if ('error' in r) { setAviso({ texto: r.error, error: true }); return; }
    setAviso({ texto: 'Hecho. No volverá a contactarte por aquí.' });
    void cargar();
  }

  const microLabel: React.CSSProperties = { ...micro(9.5, 0.28, 600), color: t.muted };

  const items = useMemo(() => ([
    { id: 'recibidas' as const, label: 'Recibidas', count: lista?.pendientesRecibidas.length ?? 0 },
    { id: 'enviadas' as const, label: 'Enviadas', count: lista?.pendientesEnviadas.length ?? 0 },
    { id: 'aceptadas' as const, label: 'Compañeras', count: lista?.aceptadas.length ?? 0 },
  ]), [lista]);

  return (
    <div style={{ minHeight: '100%', background: t.bg, color: t.ink }}>
      <div style={{ padding: '62px 20px 32px' }}>
        <p style={microLabel}>{studio?.nombre ?? 'Tu estudio'}</p>
        <h1 style={{ ...display(34), color: t.ink, marginTop: 6 }}>Mis compañeras</h1>

        {error && (
          <div style={{ marginTop: 24 }}>
            <EmptyState
              icon={<AlertCircle size={20} />}
              title="No se ha podido cargar"
              body={error}
              variant="error"
              action={{ label: 'Reintentar', onClick: () => void cargar() }}
            />
          </div>
        )}

        {!error && lista === null && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 24 }} aria-hidden>
            {[0, 1].map(i => (
              <div key={i} className="animate-pulse" style={{ height: 72, borderRadius: 20, background: t.surface2 }} />
            ))}
          </div>
        )}

        {!error && lista !== null && (
          <>
            <div style={{ marginTop: 24 }}>
              <Tabs items={items} active={pestana} onChange={setPestana} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
              {pestana === 'recibidas' && (
                lista.pendientesRecibidas.length === 0 ? (
                  <EmptyState
                    icon={<Users2 size={20} />}
                    title="Nada pendiente"
                    body="Cuando alguien quiera ser tu compañera de clase, la solicitud aparecerá aquí."
                  />
                ) : lista.pendientesRecibidas.map(fila => (
                  <Card key={fila.id} style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <ProfileAvatar nombre={fila.otraParteNombre} size="md" />
                    <p style={{ flex: 1, minWidth: 0, fontFamily: sans, fontSize: 14.5, fontWeight: 800, color: t.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {fila.otraParteNombre}
                    </p>
                    <Button
                      size="small"
                      onClick={() => void aceptar(fila)}
                      disabled={enCurso !== null}
                      loading={enCurso === fila.id}
                      aria-label={`Aceptar a ${fila.otraParteNombre} como compañera`}
                    >
                      <Check size={14} aria-hidden /> Aceptar
                    </Button>
                    <button
                      type="button"
                      onClick={() => setABloquear(fila)}
                      disabled={enCurso !== null}
                      aria-label={`Bloquear a ${fila.otraParteNombre}`}
                      style={{
                        width: 40, height: 40, borderRadius: 999, border: `1px solid ${t.line}`, background: 'none',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        color: t.muted, cursor: enCurso !== null ? 'default' : 'pointer',
                      }}
                    >
                      <Ban size={15} aria-hidden />
                    </button>
                  </Card>
                ))
              )}

              {pestana === 'enviadas' && (
                lista.pendientesEnviadas.length === 0 ? (
                  <EmptyState
                    icon={<Clock3 size={20} />}
                    title="Nada enviado"
                    body="Las solicitudes que envíes desde el detalle de una clase aparecerán aquí mientras esperan respuesta."
                  />
                ) : lista.pendientesEnviadas.map(fila => (
                  <Card key={fila.id} style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <ProfileAvatar nombre={fila.otraParteNombre} size="md" />
                    <p style={{ flex: 1, minWidth: 0, fontFamily: sans, fontSize: 14.5, fontWeight: 800, color: t.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {fila.otraParteNombre}
                    </p>
                    <Badge variant="neutral">Pendiente</Badge>
                  </Card>
                ))
              )}

              {pestana === 'aceptadas' && (
                lista.aceptadas.length === 0 ? (
                  <EmptyState
                    icon={<Users2 size={20} />}
                    title="Todavía no tienes compañeras"
                    body="Cuando reserves clase con alguien y aceptéis conoceros, aparecerá aquí."
                  />
                ) : lista.aceptadas.map(fila => (
                  <Card key={fila.id} style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <ProfileAvatar nombre={fila.otraParteNombre} size="md" />
                    <p style={{ flex: 1, minWidth: 0, fontFamily: sans, fontSize: 14.5, fontWeight: 800, color: t.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {fila.otraParteNombre}
                    </p>
                    <button
                      type="button"
                      onClick={() => setABloquear(fila)}
                      disabled={enCurso !== null}
                      aria-label={`Bloquear a ${fila.otraParteNombre}`}
                      style={{
                        width: 40, height: 40, borderRadius: 999, border: `1px solid ${t.line}`, background: 'none',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        color: t.muted, cursor: enCurso !== null ? 'default' : 'pointer',
                      }}
                    >
                      <Ban size={15} aria-hidden />
                    </button>
                  </Card>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* Bloquear tiene peso — confirmación simple antes de ejecutar. El texto
          NUNCA dice "dejará de verte"/"no lo sabrá": eso ya lo garantiza el
          servidor, no hace falta prometerlo aquí también. */}
      <BottomSheet open={aBloquear !== null} onClose={() => setABloquear(null)}>
        <h2 style={{ ...display(24), color: t.ink }}>¿Bloquear a {aBloquear ? aBloquear.otraParteNombre : ''}?</h2>
        <p style={{ ...texto.meta, color: t.muted }}>
          No podrá enviarte más solicitudes ni contactarte como compañera de clase.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={() => setABloquear(null)} style={{ flex: 1 }}>Volver</Button>
          <Button
            variant="danger"
            onClick={() => { if (aBloquear) void bloquear(aBloquear); }}
            disabled={enCurso !== null}
            loading={aBloquear ? enCurso === aBloquear.id : false}
            style={{ flex: 1 }}
          >
            Sí, bloquear
          </Button>
        </div>
      </BottomSheet>

      <Toast aviso={aviso} onDismiss={() => setAviso(null)} />
    </div>
  );
}
