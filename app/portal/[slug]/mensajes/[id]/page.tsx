'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio } from '@/components/student/contexto';
import { useAsync } from '@/lib/student/useAsync';
import {
  fetchConversaciones, fetchMensajes, enviarMensaje, marcarConversacionLeida, useMiAuthUserId,
} from '@/lib/student/mensajeria';
import { agruparHilo, etiquetaDia, horaCorta } from '@/lib/mensajeria/presentacion';
import type { RowMensajes } from '@/lib/db-types';
import { ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';
import { useToast } from '@/components/student/ui/Toast';

// Hilo de una conversación. Sin Realtime a propósito (ver lib/student/
// mensajeria.ts): se refresca al montar, al enviar, y al volver a la pestaña
// — mismo criterio que el resto de la Student PWA (comunidad, notificaciones),
// que tampoco llevan websocket.

function tituloDe(tipo: string | null, nombreEstudio: string): string {
  if (tipo === 'ALUMNA_MOSTRADOR') return nombreEstudio;
  if (tipo === 'ALUMNA_INSTRUCTORA') return 'Tu instructora';
  return 'Mensajes';
}

export default function HiloMensajesPage() {
  const { id } = useParams<{ id: string }>();
  const { estudio } = useEstudio();
  const { toast } = useToast();
  const miId = useMiAuthUserId();
  const [tipo, setTipo] = useState<string | null>(null);
  const [borrador, setBorrador] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [extra, setExtra] = useState<RowMensajes[]>([]);
  const finRef = useRef<HTMLDivElement>(null);

  const cargar = useCallback(async () => {
    const [mensajes, conversaciones] = await Promise.all([
      fetchMensajes(estudio.id, id),
      fetchConversaciones(estudio.id),
    ]);
    if (mensajes === null) throw new Error('mensajes');
    const conv = conversaciones?.find((c) => c.id === id);
    setTipo(conv?.tipo ?? null);
    return mensajes;
  }, [estudio.id, id]);
  const { data, estado, reintentar } = useAsync(cargar, () => false);

  const mensajes = [...(data ?? []), ...extra];

  // Marcar leído al abrir. Best-effort (ver marcarConversacionLeida): si
  // falla, la próxima carga de la bandeja seguirá enseñándola sin leer, que es
  // el fallo seguro correcto — nunca al revés.
  useEffect(() => {
    if (estado === 'ready' || estado === 'empty') void marcarConversacionLeida(estudio.id, id);
  }, [estado, estudio.id, id]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: 'end' });
  }, [mensajes.length]);

  const enviar = async () => {
    const cuerpo = borrador.trim();
    if (!cuerpo || enviando) return;
    setEnviando(true);
    const r = await enviarMensaje(estudio.id, id, cuerpo);
    setEnviando(false);
    if (!r.ok) { toast(r.error); return; }
    setExtra((e) => [...e, r.mensaje]);
    setBorrador('');
  };

  const dias = agruparHilo(mensajes, new Date());

  return (
    <StudentShell>
      <PageHeader titulo={tituloDe(tipo, estudio.nombre)} back />
      {/* `--nav-height` (74px) es la altura de `BottomNavigation`, siempre
          montada por `StudentShell` — no hay forma de ocultarla pantalla por
          pantalla, así que el compositor flota JUSTO ENCIMA de ella en vez de
          reemplazarla, y este padding extra es lo que evita que el último
          mensaje quede tapado detrás de los dos. */}
      <div className="px" style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 560, paddingBottom: 90 }}>
        {estado === 'loading' && <ListSkeleton n={5} h={40} />}
        {estado === 'error' && <ErrorState onRetry={reintentar} />}
        {estado === 'offline' && <OfflineState cuerpo="Necesitas conexión para ver este hilo." />}
        {(estado === 'ready' || estado === 'empty') && dias.map((dia) => (
          <div key={dia.etiqueta}>
            <p className="t-mono" style={{ textAlign: 'center', margin: '10px 0', fontSize: 10, color: 'var(--subtle-foreground)' }}>{dia.etiqueta}</p>
            {dia.bloques.map((bloque, i) => {
              const mio = bloque.remitenteAuthUserId === miId;
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: mio ? 'flex-end' : 'flex-start', gap: 3, marginTop: 6 }}>
                  {bloque.items.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        maxWidth: '80%', padding: '9px 12px', borderRadius: 16,
                        borderBottomRightRadius: mio ? 4 : 16, borderBottomLeftRadius: mio ? 16 : 4,
                        background: mio ? 'var(--accent)' : 'var(--muted)', color: mio ? 'var(--accent-foreground)' : 'var(--foreground)',
                        fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      }}
                    >
                      {m.cuerpo}
                    </div>
                  ))}
                  <span className="t-mono" style={{ fontSize: 9, color: 'var(--subtle-foreground)' }}>{horaCorta(bloque.items[bloque.items.length - 1].creado_en)}</span>
                </div>
              );
            })}
          </div>
        ))}
        {estado === 'empty' && (
          <p className="t-meta" style={{ textAlign: 'center', margin: '20px 0' }}>Este es el comienzo de tu conversación.</p>
        )}
        <div ref={finRef} />
      </div>

      {(estado === 'ready' || estado === 'empty') && (
        <div
          style={{
            position: 'fixed', left: 0, right: 0, bottom: 'var(--nav-height)', zIndex: 40,
            background: 'rgba(250,249,245,.94)', backdropFilter: 'blur(16px)', borderTop: '1px solid var(--border)',
          }}
        >
          <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', gap: 8, alignItems: 'flex-end', padding: '10px 16px' }}>
            <textarea
              value={borrador}
              onChange={(e) => setBorrador(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar(); }
              }}
              rows={1}
              placeholder="Escribe un mensaje…"
              aria-label="Escribe un mensaje"
              className="input"
              style={{ flex: 1, resize: 'none', fontSize: 13.5, minHeight: 40, maxHeight: 120, padding: '9px 12px' }}
            />
            <button
              type="button"
              onClick={() => void enviar()}
              disabled={!borrador.trim() || enviando}
              aria-label="Enviar"
              style={{
                width: 40, height: 40, flexShrink: 0, borderRadius: 999, border: 'none',
                background: 'var(--accent)', color: 'var(--accent-foreground)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: !borrador.trim() || enviando ? 0.5 : 1,
              }}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </StudentShell>
  );
}
