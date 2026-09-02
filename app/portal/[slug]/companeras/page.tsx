'use client';

// MIS COMPAÑERAS — social graph "compañeras de clase" (Community & Messaging
// OS, última pieza de P2). El backend (esquema/RLS/RPC/rutas
// `/api/public/social/companeras`) ya está en producción; esta pantalla es
// puro consumo, mismo lenguaje visual que Mensajes/Comunidad/Documentos.
//
// Valores literales del kit real ("Tentare Studio App",
// docs/diseno-referencia-portal/): `--ap-*`/hex en vez de
// `useModo()`/`display()`/`micro()`/`texto.*`, mismo idioma que ya usa
// `app/portal/[slug]/mensajes/page.tsx` tras su conversión. ⚠️ SIN captura de
// referencia directa para esta pantalla (el paquete de capturas no cubre
// Compañeras) — el tratamiento de abajo es EXTRAPOLADO por consistencia con
// el resto del portal ya convertido, no un calco 1:1 de un diseño visto.
// `<Card>` (components/portal/ui) se sustituye por className="ap-card"
// directo, mismo patrón que portal-clases-view.tsx/mensajeria-piezas.tsx tras
// su conversión.
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
import { AlertCircle, Users2, Check, Ban, Clock3, ShieldOff } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { usePortalAuth } from '@/lib/portal-auth';
import { portalAuthHeader } from '@/lib/api-client';
import { sans } from '@/lib/portal-design';
import { Badge, BottomSheet, Button, EmptyState, Tabs, Toast, type AvisoToast } from '@/components/portal/ui';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import {
  fetchListaCompaneras, aceptarSolicitudCompanera, bloquearCompanera, desbloquearCompanera,
  type ListaCompaneras, type RowSocioCompanerasConNombre,
} from '@/lib/social-companeras-portal.ts';

type Pestana = 'recibidas' | 'enviadas' | 'aceptadas' | 'bloqueadas';

export default function CompanerasPage() {
  const { studio } = useStudio();
  const { session } = usePortalAuth();

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

  // La pestaña "Bloqueadas" desaparece cuando se vacía (ver `items`): si era
  // la activa (se acaba de desbloquear a la última), vuelve a "Compañeras"
  // en vez de dejar la pantalla en una pestaña que ya no existe.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza la pestaña activa con una lista que cambia por red (desbloquear a la última), no con el propio render.
    if (pestana === 'bloqueadas' && lista && lista.bloqueadasPorMi.length === 0) setPestana('aceptadas');
  }, [pestana, lista]);

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

  // F-25: bloquear ya no es un callejón sin salida. Desbloquear no restaura
  // la relación anterior (ver comentario del endpoint) — si alguna de las
  // dos quiere volver a conectar, se envía una solicitud nueva.
  async function desbloquear(fila: RowSocioCompanerasConNombre) {
    if (!studio?.id || enCurso) return;
    setEnCurso(fila.id);
    const headers = await portalAuthHeader();
    const r = await desbloquearCompanera(headers, studio.id, fila.id);
    setEnCurso(null);
    if ('error' in r) { setAviso({ texto: r.error, error: true }); return; }
    setAviso({ texto: `${fila.otraParteNombre} ya no está bloqueada.` });
    void cargar();
  }

  const nombreFila: React.CSSProperties = {
    flex: 1, minWidth: 0, fontFamily: sans, fontSize: 14.5, fontWeight: 800, color: '#1A1A1A',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  };

  const items = useMemo(() => ([
    { id: 'recibidas' as const, label: 'Recibidas', count: lista?.pendientesRecibidas.length ?? 0 },
    { id: 'enviadas' as const, label: 'Enviadas', count: lista?.pendientesEnviadas.length ?? 0 },
    { id: 'aceptadas' as const, label: 'Compañeras', count: lista?.aceptadas.length ?? 0 },
    // F-25: solo se enseña si hay algo que ver — con la lista vacía, una
    // pestaña "Bloqueadas" permanente sería ruido para la inmensa mayoría
    // de socias, que nunca bloquean a nadie.
    ...(lista && lista.bloqueadasPorMi.length > 0
      ? [{ id: 'bloqueadas' as const, label: 'Bloqueadas', count: lista.bloqueadasPorMi.length }]
      : []),
  ]), [lista]);

  return (
    <div style={{ minHeight: '100%', background: '#FAF9F5', color: '#1A1A1A' }}>
      <div style={{ padding: '62px 20px 32px' }}>
        <div className="ap-label">{studio?.nombre ?? 'Tu estudio'}</div>
        <h1 className="ap-h1" style={{ color: '#1A1A1A', marginTop: 6 }}>Mis compañeras</h1>

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
              <div key={i} className="animate-pulse" style={{ height: 72, borderRadius: 16, background: '#EFEDE4' }} />
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
                  <div key={fila.id} className="ap-card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <ProfileAvatar nombre={fila.otraParteNombre} size="md" />
                    <p style={nombreFila}>{fila.otraParteNombre}</p>
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
                        width: 40, height: 40, borderRadius: 999, border: '1px solid #E5E3DA', background: 'none',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        color: '#5A5A52', cursor: enCurso !== null ? 'default' : 'pointer',
                      }}
                    >
                      <Ban size={15} aria-hidden />
                    </button>
                  </div>
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
                  <div key={fila.id} className="ap-card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <ProfileAvatar nombre={fila.otraParteNombre} size="md" />
                    <p style={nombreFila}>{fila.otraParteNombre}</p>
                    <Badge variant="neutral">Pendiente</Badge>
                  </div>
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
                  <div key={fila.id} className="ap-card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <ProfileAvatar nombre={fila.otraParteNombre} size="md" />
                    <p style={nombreFila}>{fila.otraParteNombre}</p>
                    <button
                      type="button"
                      onClick={() => setABloquear(fila)}
                      disabled={enCurso !== null}
                      aria-label={`Bloquear a ${fila.otraParteNombre}`}
                      style={{
                        width: 40, height: 40, borderRadius: 999, border: '1px solid #E5E3DA', background: 'none',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        color: '#5A5A52', cursor: enCurso !== null ? 'default' : 'pointer',
                      }}
                    >
                      <Ban size={15} aria-hidden />
                    </button>
                  </div>
                ))
              )}

              {pestana === 'bloqueadas' && (
                lista.bloqueadasPorMi.length === 0 ? (
                  <EmptyState
                    icon={<ShieldOff size={20} />}
                    title="No hay nadie bloqueada"
                    body="Cuando bloquees a alguien, podrás deshacerlo desde aquí."
                  />
                ) : lista.bloqueadasPorMi.map(fila => (
                  <div key={fila.id} className="ap-card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <ProfileAvatar nombre={fila.otraParteNombre} size="md" />
                    <p style={nombreFila}>{fila.otraParteNombre}</p>
                    <Button
                      size="small"
                      variant="secondary"
                      onClick={() => void desbloquear(fila)}
                      disabled={enCurso !== null}
                      loading={enCurso === fila.id}
                      aria-label={`Desbloquear a ${fila.otraParteNombre}`}
                    >
                      Desbloquear
                    </Button>
                  </div>
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
        <h2 style={{ fontFamily: sans, fontSize: 22, fontWeight: 800, letterSpacing: '-.02em', color: '#1A1A1A' }}>
          ¿Bloquear a {aBloquear ? aBloquear.otraParteNombre : ''}?
        </h2>
        <p style={{ fontFamily: sans, fontSize: 12.5, color: '#5A5A52' }}>
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
