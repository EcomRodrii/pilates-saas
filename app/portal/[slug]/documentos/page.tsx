'use client';

// DOCUMENTOS — buzón de la socia (Community & Messaging OS, P2). El backend
// (esquema/RLS/`/api/public/documentos-socio`) ya está en producción; esta
// pantalla es puro consumo, mismo lenguaje visual que Mensajes/Comunidad/Perfil.
//
// Sin Realtime a propósito (decisión ya cerrada): un documento nuevo es un
// evento raro, se resuelve con la notificación normal, no con un canal en vivo.
//
// ⚠️ La URL firmada que devuelve el endpoint caduca en 60s. En vez de guardar
// la del primer listado (podría llevar minutos abierta la pantalla antes de
// que la socia pulse), se pide una URL FRESCA justo al pulsar "Ver documento"
// y se abre de inmediato — la pestaña se abre síncrona con about:blank para
// no chocar con el bloqueo de pop-ups de Safari mientras llega la respuesta.

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, FileText, ExternalLink } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { useModo } from '@/lib/portal-modo';
import { portalAuthHeader } from '@/lib/api-client';
import { display, micro, sans, texto } from '@/lib/portal-design';
import { Badge, Card, EmptyState } from '@/components/portal/ui';
import { fetchDocumentosSocia, type DocumentoSociaPortal } from '@/lib/documentos-socio-portal.ts';

const CATEGORIA_LABEL: Record<DocumentoSociaPortal['categoria'], string> = {
  PLAN: 'Plan',
  FACTURA: 'Factura',
  CONTRATO: 'Contrato',
  OTRO: 'Otro',
};
const CATEGORIA_VARIANTE: Record<DocumentoSociaPortal['categoria'], 'success' | 'neutral'> = {
  PLAN: 'success',
  FACTURA: 'success',
  CONTRATO: 'neutral',
  OTRO: 'neutral',
};

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function DocumentosPage() {
  const { studio } = useStudio();
  const { t } = useModo();

  const studioId = studio?.id ?? null;

  const [documentos, setDocumentos] = useState<DocumentoSociaPortal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abriendoId, setAbriendoId] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!studioId) return;
    setError(null);
    const headers = await portalAuthHeader();
    const r = await fetchDocumentosSocia(headers, studioId);
    if ('error' in r) { setError(r.error); return; }
    setDocumentos(r.documentos);
  }, [studioId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial, misma forma que Mensajes/Comunidad.
  useEffect(() => { void cargar(); }, [cargar]);

  async function abrirDocumento(id: string) {
    if (!studio?.id || abriendoId) return;
    setAbriendoId(id);
    // Síncrono, ANTES del await: si se abre tras la respuesta, Safari lo trata
    // como pop-up no solicitado y lo bloquea (no vino de un gesto directo).
    const pestana = window.open('about:blank', '_blank');
    const headers = await portalAuthHeader();
    const r = await fetchDocumentosSocia(headers, studio.id);
    setAbriendoId(null);
    if ('error' in r) { setError(r.error); pestana?.close(); return; }
    setDocumentos(r.documentos);
    const doc = r.documentos.find(d => d.id === id);
    if (!doc) { pestana?.close(); return; }
    if (pestana) pestana.location.href = doc.url;
    else window.open(doc.url, '_blank');
  }

  const microLabel: React.CSSProperties = { ...micro(9.5, 0.28, 600), color: t.muted };

  return (
    <div style={{ minHeight: '100%', background: t.bg, color: t.ink }}>
      <div style={{ padding: '62px 20px 32px' }}>
        <p style={microLabel}>{studio?.nombre ?? 'Tu estudio'}</p>
        <h1 style={{ ...display(34), color: t.ink, marginTop: 6 }}>Documentos</h1>

        {error && (
          <div style={{ marginTop: 24 }}>
            <EmptyState
              icon={<AlertCircle size={20} />}
              title="No se han podido cargar tus documentos"
              body={error}
              variant="error"
              action={{ label: 'Reintentar', onClick: () => void cargar() }}
            />
          </div>
        )}

        {!error && documentos === null && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 24 }} aria-hidden>
            {[0, 1].map(i => (
              <div key={i} className="animate-pulse" style={{ height: 72, borderRadius: 20, background: t.surface2 }} />
            ))}
          </div>
        )}

        {!error && documentos !== null && documentos.length === 0 && (
          <div style={{ marginTop: 24 }}>
            <EmptyState
              icon={<FileText size={20} />}
              title="Todavía no tienes documentos compartidos"
              body="Cuando el estudio comparta contigo un plan, una factura o un contrato, aparecerá aquí."
            />
          </div>
        )}

        {!error && documentos !== null && documentos.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 24 }}>
            {documentos.map(d => (
              <button
                key={d.id}
                type="button"
                onClick={() => void abrirDocumento(d.id)}
                disabled={abriendoId !== null}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none',
                  padding: 0, cursor: abriendoId !== null ? 'default' : 'pointer',
                  opacity: abriendoId !== null && abriendoId !== d.id ? 0.5 : 1,
                }}
                aria-label={`Ver documento: ${d.titulo}`}
              >
                <Card style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: t.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <FileText size={17} style={{ color: t.ink }} aria-hidden />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Badge variant={CATEGORIA_VARIANTE[d.categoria]}>{CATEGORIA_LABEL[d.categoria]}</Badge>
                    <p style={{ fontFamily: sans, fontSize: 14.5, fontWeight: 800, marginTop: 6, color: t.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.titulo}
                    </p>
                    <p style={{ ...texto.meta, color: t.muted, marginTop: 2 }}>{fechaCorta(d.creadoEn)}</p>
                  </div>
                  {abriendoId === d.id ? (
                    <span
                      aria-hidden
                      className="animate-spin"
                      style={{ width: 15, height: 15, borderRadius: 999, flexShrink: 0, border: '2px solid currentColor', borderTopColor: 'transparent', opacity: 0.6, color: t.muted }}
                    />
                  ) : (
                    <ExternalLink size={16} style={{ color: t.muted, flexShrink: 0 }} aria-hidden />
                  )}
                </Card>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
