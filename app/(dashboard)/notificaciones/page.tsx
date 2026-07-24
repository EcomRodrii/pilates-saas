'use client';

// Notification Center — vista admin del estudio: TODAS las notificaciones con su
// estado de entrega por canal (fecha, destinatario, tipo, prioridad, título,
// canales + resultado + errores). Lee /api/notifications/admin (solo staff).

import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { authHeader } from '@/lib/api-client';
import { CATEGORIA_ETIQUETA } from '@/lib/notifications/catalog';
import type { NotificationCategory } from '@/lib/notifications/types';

interface AdminItem {
  id: string;
  recipientRole: string;
  eventType: string;
  category: NotificationCategory;
  priority: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  deliveries: { channel: string; status: string; error: string | null }[];
}

const ROL_ETIQUETA: Record<string, string> = { PROPIETARIO: 'Propietaria', INSTRUCTOR: 'Instructora', SOCIA: 'Socia' };
const PRIO_COLOR: Record<string, string> = {
  CRITICA: 'text-red-600 bg-red-500/10', ALTA: 'text-amber-600 bg-amber-500/10',
  MEDIA: 'text-brand bg-brand/10', BAJA: 'text-muted-foreground bg-muted', SILENCIOSA: 'text-muted-foreground bg-muted',
};
const ESTADO_COLOR: Record<string, string> = {
  SENT: 'text-emerald-600', DELIVERED: 'text-emerald-600', PENDING: 'text-muted-foreground',
  SKIPPED: 'text-muted-foreground/70', FAILED: 'text-red-600',
};

function fecha(iso: string) {
  return new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function NotificationCenterPage() {
  const [items, setItems] = useState<AdminItem[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    const res = await fetch('/api/notifications/admin', { headers: await authHeader(), cache: 'no-store' });
    const data = res.ok ? await res.json() : { items: [] };
    setItems(data.items ?? []);
    setCargando(false);
  }, []);

  // setState tras await (asíncrono) — falso positivo del lint del compilador.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargar(); }, [cargar]);

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Notificaciones"
        description="Todo lo que el sistema ha enviado: a quién, por qué canal y con qué resultado."
      />

      {cargando ? (
        <p className="text-[13px] text-muted-foreground">Cargando…</p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card px-4 py-12 text-center text-[13px] text-muted-foreground">
          Aún no se ha enviado ninguna notificación.
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-muted-foreground border-b border-border">
                  <th className="px-4 py-2.5 font-bold">Fecha</th>
                  <th className="px-4 py-2.5 font-bold">Destinatario</th>
                  <th className="px-4 py-2.5 font-bold">Notificación</th>
                  <th className="px-4 py-2.5 font-bold">Tipo</th>
                  <th className="px-4 py-2.5 font-bold">Prioridad</th>
                  <th className="px-4 py-2.5 font-bold">Entrega</th>
                </tr>
              </thead>
              <tbody>
                {items.map(n => (
                  <tr key={n.id} className="border-b border-border/50 align-top">
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground tabular-nums">{fecha(n.createdAt)}</td>
                    <td className="px-4 py-3 whitespace-nowrap font-semibold text-foreground">{ROL_ETIQUETA[n.recipientRole] ?? n.recipientRole}</td>
                    <td className="px-4 py-3 max-w-[260px]">
                      <p className="font-semibold text-foreground truncate">{n.title}</p>
                      <p className="text-muted-foreground text-[12px] truncate">{n.body}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{CATEGORIA_ETIQUETA[n.category] ?? n.category}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${PRIO_COLOR[n.priority] ?? ''}`}>{n.priority}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        {n.deliveries.length === 0 ? <span className="text-muted-foreground/60">—</span> : n.deliveries.map((d, i) => (
                          <span key={i} className="whitespace-nowrap text-[12px]">
                            <span className="text-muted-foreground">{d.channel}</span>{' '}
                            <span className={`font-semibold ${ESTADO_COLOR[d.status] ?? ''}`}>{d.status}</span>
                            {d.error && <span className="text-red-500/70 text-[11px]"> · {d.error}</span>}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
