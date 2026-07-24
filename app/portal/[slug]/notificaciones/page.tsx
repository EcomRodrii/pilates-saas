'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useModo } from '@/lib/portal-modo';
import { ChevronLeft, CheckCircle2, CreditCard, Bell, CalendarClock, AlertTriangle } from 'lucide-react';
import { portalAuthHeader } from '@/lib/api-client';
import { fetchNotificaciones, accionNotificacion, type NotifItem } from '@/lib/notifications/client';
import { Card, EmptyState } from '@/components/portal/ui';

// Centro de notificaciones de la socia — lee la tabla `notification` (motor de
// notificaciones) vía /api/notifications, acotada por su JWT. Sustituye al feed
// que se derivaba en el navegador de reservas/recibos + estado en localStorage.
export default function NotificacionesPage() {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();
  const { t } = useModo();
  const [items, setItems] = useState<NotifItem[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    const { items } = await fetchNotificaciones(portalAuthHeader);
    setItems(items);
    setCargando(false);
  }, []);

  // setState tras el await (asíncrono), no en cascada — falso positivo del lint.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargar(); }, [cargar]);

  // Al abrir la bandeja se marcan todas como leídas (limpia el punto de la campana).
  useEffect(() => {
    if (!cargando && items.some(i => i.readAt == null)) {
      void accionNotificacion(portalAuthHeader, 'read-all');
    }
  }, [cargando, items]);

  async function abrir(n: NotifItem) {
    if (n.readAt == null) await accionNotificacion(portalAuthHeader, 'read', n.id);
    if (n.deepLink) router.push(n.deepLink);
  }

  const grouped = useMemo(() => {
    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);
    const groups: { label: string; items: NotifItem[] }[] = [];
    for (const it of items) {
      const d = new Date(it.createdAt);
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
        {cargando ? (
          <p style={{ fontSize: 13, color: t.muted, textAlign: 'center', padding: '24px 0' }}>Cargando…</p>
        ) : grouped.length === 0 ? (
          <EmptyState icon={<Bell size={18} />} title="Sin novedades por ahora" body="Aquí verás tus reservas, cambios y pagos." />
        ) : (
          grouped.map(group => (
            <div key={group.label}>
              <p style={{ ...microLabel, marginBottom: 8, paddingLeft: 4 }}>{group.label}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {group.items.map(it => (
                  <Card key={it.id} onClick={() => abrir(it)} style={{ padding: 16, display: 'flex', gap: 12, cursor: it.deepLink ? 'pointer' : 'default', opacity: it.readAt == null ? 1 : 0.72 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: iconoBg(it, t) }}>
                      {icono(it)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 800, color: t.ink, lineHeight: 1.2 }}>{it.title}</p>
                      <p style={{ fontSize: 13, color: t.muted2, marginTop: 2, lineHeight: 1.4 }}>{it.body}</p>
                      <p style={{ fontSize: 11, color: t.muted, marginTop: 6 }}>{formatRelative(it.createdAt)}</p>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function icono(it: NotifItem) {
  if (it.category === 'pagos') return <CreditCard size={18} style={{ color: '#C0362D' }} />;
  if (it.category === 'clases' || it.priority === 'ALTA' || it.priority === 'CRITICA') return <AlertTriangle size={18} style={{ color: '#A65A0A' }} />;
  if (it.eventType.startsWith('reserva.lista_espera')) return <CalendarClock size={18} style={{ color: '#A65A0A' }} />;
  return <CheckCircle2 size={18} style={{ color: '#3E9B6C' }} />;
}
function iconoBg(it: NotifItem, t: { surface2: string }) {
  if (it.category === 'pagos') return 'rgba(192,54,45,0.12)';
  if (it.category === 'clases' || it.priority === 'ALTA' || it.priority === 'CRITICA') return 'rgba(166,90,10,0.12)';
  return it.eventType.startsWith('reserva.confirmada') ? 'rgba(62,155,108,0.14)' : t.surface2;
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
