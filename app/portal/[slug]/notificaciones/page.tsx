'use client';

import { useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { useModo } from '@/lib/portal-modo';
import { ChevronLeft, CheckCircle2, CreditCard } from 'lucide-react';
import { buildPortalNotifications, markPortalNotifsRead } from '@/lib/portal-notifications';

export default function NotificacionesPage() {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();
  const { session } = usePortalAuth();
  const { reservas, recibos, sesiones, tiposClase, instructores } = useStudio();
  const { t } = useModo();

  const items = useMemo(() => {
    if (!session?.socioId) return [];
    return buildPortalNotifications({ socioId: session.socioId, reservas, recibos, sesiones, tiposClase, instructores });
  }, [session?.socioId, reservas, recibos, sesiones, tiposClase, instructores]);

  useEffect(() => {
    if (session?.socioId && items.length > 0) markPortalNotifsRead(session.socioId, items);
  }, [session?.socioId, items]);

  const grouped = useMemo(() => {
    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);
    const groups: { label: string; items: typeof items }[] = [];
    for (const it of items) {
      const d = new Date(it.fecha);
      const dayKey = d.toISOString().slice(0, 10);
      const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
      const label = dayKey === todayKey ? 'Hoy' : diffDays <= 7 ? 'Esta semana' : 'Anteriores';
      const last = groups[groups.length - 1];
      if (last?.label === label) last.items.push(it);
      else groups.push({ label, items: [it] });
    }
    return groups;
  }, [items]);

  const microLabel: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.muted };

  return (
    <div style={{ minHeight: '100%', background: t.bg, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div style={{ padding: '24px 20px 16px', background: t.surface, display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 10, borderBottom: `1px solid ${t.line}` }}>
        <button
          onClick={() => router.push(`/portal/${slug}/home`)}
          style={{ width: 36, height: 36, borderRadius: 999, background: t.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: 'none' }}
        >
          <ChevronLeft size={18} style={{ color: t.ink }} />
        </button>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: t.ink, letterSpacing: '-0.01em', textTransform: 'uppercase' }}>Notificaciones</h1>
      </div>

      <div style={{ padding: '16px 16px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {grouped.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', textAlign: 'center' }}>
            <p style={{ fontWeight: 800, color: t.ink, fontSize: 16 }}>Sin novedades por ahora</p>
            <p style={{ fontSize: 13, color: t.muted, marginTop: 4 }}>Aquí verás tus reservas y pagos.</p>
          </div>
        ) : (
          grouped.map(group => (
            <div key={group.label}>
              <p style={{ ...microLabel, marginBottom: 8, paddingLeft: 4 }}>{group.label}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {group.items.map(it => (
                  <div key={it.id} style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 18, padding: 16, display: 'flex', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: it.tipo === 'RESERVA' ? 'rgba(62,155,108,0.14)' : t.surface2 }}>
                      {it.tipo === 'RESERVA'
                        ? <CheckCircle2 size={18} style={{ color: '#3E9B6C' }} />
                        : <CreditCard size={18} style={{ color: t.heroAccent }} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 800, color: t.ink, lineHeight: 1.2 }}>{it.titulo}</p>
                      <p style={{ fontSize: 13, color: t.muted2, marginTop: 2, lineHeight: 1.4 }}>{it.texto}</p>
                      <p style={{ fontSize: 11, color: t.muted, marginTop: 6 }}>{formatRelative(it.fecha)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diffMs / 3_600_000);
  if (h < 1) return 'hace un momento';
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}
