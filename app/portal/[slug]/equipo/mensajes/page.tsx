'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useSesionInstructora } from '@/lib/student/sesion-instructora';
import { useAsync } from '@/lib/student/useAsync';
import { useMiAuthUserId } from '@/lib/student/mensajeria';
import { getHilosInstructora } from '@/lib/student/datos-instructora';
import { selloLista, tieneSinLeer, unaLinea } from '@/lib/mensajeria/presentacion';
import { AvatarSocia } from '@/components/student/domain/AvatarSocia';
import { EmptyState, ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';

// Bandeja de la instructora: sus conversaciones con alumnas de este estudio.
// Mismo idioma que la bandeja de la alumna. Se empieza una conversación desde
// la ficha de una alumna suya («Escribir»), no desde aquí: así nunca hay que
// elegir entre alumnas que no son suyas.

export default function MensajesInstructoraPage() {
  const { estudio } = useEstudio();
  const href = usePortalHref();
  const router = useRouter();
  const { instructora } = useSesionInstructora(estudio.slug, true, true);
  const esInstructora = Boolean(instructora);
  const miId = useMiAuthUserId();

  const cargar = useCallback(
    // Monta antes que su guardia (es su padre): sin confirmar, no se pide nada.
    () => (esInstructora ? getHilosInstructora(estudio.slug) : new Promise<never>(() => {})),
    [esInstructora, estudio.slug],
  );
  // Misma clave que la tarjeta de mensajes de «Hoy»: son los mismos hilos.
  const { data, estado, reintentar } = useAsync(cargar, undefined, `instr:${estudio.slug}:hilos`);
  // Cuántas esperan respuesta, arriba: es lo que viene a mirar (pasada de diseño 6).
  const pendientes = estado === 'ready' ? (data ?? []).filter((h) => tieneSinLeer(h, miId)).length : 0;
  const sub = estado !== 'ready' ? undefined
    : pendientes === 0 ? 'Con tus alumnas · todo leído'
      : pendientes === 1 ? 'Con tus alumnas · 1 sin leer'
        : `Con tus alumnas · ${pendientes} sin leer`;

  return (
    <StudentShell modo="instructora">
      {/* Sin «Volver»: es una pestaña de la barra, no una pantalla dentro de Perfil. */}
      <PageHeader titulo="Mensajes" sub={sub} />
      <div className="px" style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 560 }}>
        {estado === 'loading' && <ListSkeleton n={4} h={68} />}
        {estado === 'error' && <ErrorState titulo="No hemos podido cargar tus mensajes" onRetry={reintentar} />}
        {estado === 'offline' && <OfflineState cuerpo="Necesitas conexión para ver tus mensajes." />}
        {estado === 'empty' && (
          <EmptyState
            ilustracion="charla"
            titulo="Aún no tienes conversaciones"
            cuerpo="Para escribir a una alumna, abre su ficha en «Tus alumnas»."
            accion="Ver tus alumnas"
            onAccion={() => router.push(href('/equipo/alumnas'))}
          />
        )}
        {estado === 'ready' && data!.map((h) => {
          const sinLeer = tieneSinLeer(h, miId);
          const nombre = h.alumna?.nombre ?? 'Alumna';
          return (
            <Link
              key={h.id}
              href={href(`/equipo/mensajes/${encodeURIComponent(h.id)}`)}
              className="card card--tap a-up"
              data-testid="hilo"
              style={{ display: 'flex', gap: 11, alignItems: 'center', padding: '12px 14px' }}
            >
              <AvatarSocia nombre={nombre} fotoUrl={h.alumna?.fotoUrl ?? null} size={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <p style={{ margin: 0, fontSize: 'var(--t-body)', fontWeight: sinLeer ? 800 : 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombre}</p>
                  <span className="t-num" style={{ fontSize: 'var(--t-micro)', fontWeight: 600, color: 'var(--subtle-foreground)', flexShrink: 0 }}>{selloLista(h.ultimo_mensaje_en ?? h.creado_en)}</span>
                </div>
                <p style={{ margin: '2px 0 0', fontSize: 'var(--t-small)', color: sinLeer ? 'var(--foreground)' : 'var(--muted-foreground)', fontWeight: sinLeer ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {unaLinea(h.ultimo_cuerpo) || 'Sin mensajes todavía'}
                </p>
              </div>
              {sinLeer && <span aria-label="Sin leer" style={{ width: 9, height: 9, flexShrink: 0, borderRadius: 99, background: 'var(--accent)' }} />}
            </Link>
          );
        })}
      </div>
    </StudentShell>
  );
}
