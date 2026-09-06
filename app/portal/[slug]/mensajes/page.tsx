'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useAsync } from '@/lib/student/useAsync';
import { fetchConversaciones, abrirConversacionConEstudio, useMiAuthUserId } from '@/lib/student/mensajeria';
import { colorPersona, selloLista, tieneSinLeer, unaLinea } from '@/lib/mensajeria/presentacion';
import { Button } from '@/components/student/ui/Button';
import { EmptyState, ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';
import { useToast } from '@/components/student/ui/Toast';

// Bandeja de la alumna. No estaba en la reconstrucción del portal (#1591/
// #1593) — el backend (RLS, RPC `abrir_conversacion`, resumen con
// previsualización/no-leído de lib/mensajeria/resumen.ts) llevaba semanas
// listo sin ninguna pantalla que lo llamara. Mismo idioma visual que
// Comunidad y Notificaciones: no hay página del paquete de diseño para esto.

function titulo(tipo: string, nombreEstudio: string): string {
  return tipo === 'ALUMNA_MOSTRADOR' ? nombreEstudio : 'Tu instructora';
}

export default function MensajesPage() {
  const { estudio } = useEstudio();
  const href = usePortalHref();
  const router = useRouter();
  const { toast } = useToast();
  const miId = useMiAuthUserId();
  const [abriendo, setAbriendo] = useState(false);

  const cargar = useCallback(async () => {
    const conversaciones = await fetchConversaciones(estudio.id);
    if (conversaciones === null) throw new Error('conversaciones');
    return conversaciones;
  }, [estudio.id]);
  const { data, estado, reintentar } = useAsync(cargar);

  const escribirAlEstudio = async () => {
    if (abriendo) return;
    setAbriendo(true);
    const r = await abrirConversacionConEstudio(estudio.id);
    setAbriendo(false);
    if (!r.ok) { toast(r.error); return; }
    router.push(href(`/mensajes/${r.id}`));
  };

  return (
    <StudentShell>
      <PageHeader
        titulo="Mensajes"
        back
        accion={<Button size="sm" onClick={() => void escribirAlEstudio()} loading={abriendo}>Escribir</Button>}
      />
      <div className="px" style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 560 }}>
        {estado === 'loading' && <ListSkeleton n={4} h={68} />}
        {estado === 'error' && <ErrorState onRetry={reintentar} />}
        {estado === 'offline' && <OfflineState cuerpo="Necesitas conexión para ver tus mensajes." />}
        {estado === 'empty' && (
          <EmptyState
            icono="💬"
            titulo="Aún no tienes conversaciones"
            cuerpo="Si tienes una duda, escríbele al estudio y te contestarán por aquí."
            accion="Escribir al estudio"
            onAccion={() => void escribirAlEstudio()}
          />
        )}
        {estado === 'ready' && data!.map((c) => {
          const sinLeer = tieneSinLeer(c, miId);
          const nombre = titulo(c.tipo, estudio.nombre);
          return (
            <Link
              key={c.id}
              href={href(`/mensajes/${c.id}`)}
              className="card card--tap a-up"
              style={{ display: 'flex', gap: 11, alignItems: 'center', padding: '12px 14px' }}
            >
              <span aria-hidden style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 999, background: colorPersona(c.id), color: '#fff', fontSize: 13.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {nombre.slice(0, 1).toUpperCase()}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <p style={{ margin: 0, fontSize: 13.5, fontWeight: sinLeer ? 800 : 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombre}</p>
                  <span className="t-mono" style={{ fontSize: 9.5, color: 'var(--subtle-foreground)', flexShrink: 0 }}>{selloLista(c.ultimo_mensaje_en ?? c.creado_en)}</span>
                </div>
                <p style={{ margin: '2px 0 0', fontSize: 12.5, color: sinLeer ? 'var(--foreground)' : 'var(--muted-foreground)', fontWeight: sinLeer ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {unaLinea(c.ultimo_cuerpo) || 'Sin mensajes todavía'}
                </p>
              </div>
              {sinLeer && <span aria-hidden style={{ width: 9, height: 9, flexShrink: 0, borderRadius: 99, background: 'var(--accent)' }} />}
            </Link>
          );
        })}
      </div>
    </StudentShell>
  );
}
