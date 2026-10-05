'use client';

// Notification Center — vista admin del estudio: TODAS las notificaciones con su
// estado de entrega por canal (fecha, destinatario, tipo, prioridad, título,
// canales + resultado + errores). Lee /api/notifications/admin (solo staff).

import { useCallback, useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { authHeader } from '@/lib/api-client';
import { CATEGORIA_ETIQUETA } from '@/lib/notifications/catalog';
import type { NotificationCategory } from '@/lib/notifications/types';

interface AdminItem {
  id: string;
  recipientRole: string;
  recipientName?: string | null;
  eventType: string;
  category: NotificationCategory;
  priority: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  deliveries: { channel: string; status: string; error: string | null; detalle?: string | null; entregadaEn?: string | null }[];
}

const ROL_ETIQUETA: Record<string, string> = { PROPIETARIO: 'Propietaria', INSTRUCTOR: 'Instructora', SOCIA: 'Socia' };
const PRIO_COLOR: Record<string, string> = {
  CRITICA: 'text-destructive bg-red-500/10', ALTA: 'text-warning bg-amber-500/10',
  MEDIA: 'text-brand-medio bg-brand/10', BAJA: 'text-muted-foreground bg-muted', SILENCIOSA: 'text-muted-foreground bg-muted',
};
// Lo que significa cada estado, sin jerga. SENT NO es «le llegó»: es que el servicio
// de push (Apple, Google) aceptó el mensaje. «Mostrado» sí lo confirma el móvil.
const ESTADO_TEXTO: Record<string, string> = {
  SENT: 'aceptado', DELIVERED: 'mostrado en el dispositivo', PENDING: 'pendiente',
  SKIPPED: 'no enviado', FAILED: 'falló',
};
const ESTADO_COLOR: Record<string, string> = {
  SENT: 'text-success', DELIVERED: 'text-success', PENDING: 'text-muted-foreground',
  SKIPPED: 'text-muted-foreground/70', FAILED: 'text-destructive',
};

function fecha(iso: string) {
  return new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function NotificationCenterPage() {
  const [items, setItems] = useState<AdminItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [reintentando, setReintentando] = useState<string | null>(null);
  const [errorReintento, setErrorReintento] = useState<string | null>(null);
  const [buscar, setBuscar] = useState('');

  const cargar = useCallback(async () => {
    const res = await fetch('/api/notifications/admin', { headers: await authHeader(), cache: 'no-store' });
    const data = res.ok ? await res.json() : { items: [] };
    setItems(data.items ?? []);
    setCargando(false);
  }, []);

  // setState tras await (asíncrono) — falso positivo del lint del compilador.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargar(); }, [cargar]);

  // ⚠️ Este botón no miraba la respuesta. `fetch` no lanza con un 4xx/5xx —solo
  // con la red caída—, así que un 403 (rol sin permiso) o un 500 pasaban de
  // largo: se recargaba la lista, el aviso seguía FAILED y no había forma de
  // distinguir «lo he reintentado y ha vuelto a fallar» de «el botón no hace
  // nada». Justo en la pantalla a la que se entra cuando algo ya ha fallado.
  const reintentar = useCallback(async (notificationId: string) => {
    setReintentando(notificationId);
    setErrorReintento(null);
    try {
      const r = await fetch('/api/notifications/admin', {
        method: 'POST', headers: { ...(await authHeader()), 'content-type': 'application/json' },
        body: JSON.stringify({ notificationId }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setErrorReintento(d?.error ?? 'No se ha podido reintentar el envío.');
        return;
      }
      await cargar();
    } catch {
      setErrorReintento('No se ha podido reintentar: revisa la conexión.');
    } finally {
      setReintentando(null);
    }
  }, [cargar]);

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Notificaciones"
        description="Todo lo que el sistema ha enviado: a quién, por qué canal y con qué resultado."
      />

      <input
        type="search" value={buscar} onChange={e => setBuscar(e.target.value)}
        placeholder="Buscar por destinatario, aviso o error (p. ej. el nombre de una alumna)…"
        aria-label="Buscar notificaciones"
        className="mt-3 w-full max-w-md rounded-xl border border-border bg-card px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground"
      />

      {errorReintento && (
        <p role="alert" className="mt-3 px-3 py-2.5 rounded-xl text-[12px] font-semibold bg-destructive/10 text-destructive">
          {errorReintento}
        </p>
      )}

      {cargando ? (
        <p className="text-[13px] text-muted-foreground">Cargando…</p>
      ) : items.length === 0 ? (
        <EmptyState icono={Bell} titulo="Aún no se ha enviado ninguna notificación." />
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
                {items.filter(n => !buscar.trim() || [n.recipientName, n.recipientRole, n.title, n.body, n.eventType, ...n.deliveries.map(d => d.error), ...n.deliveries.map(d => d.detalle)].some(t => (t ?? '').toLowerCase().includes(buscar.trim().toLowerCase()))).map(n => (
                  <tr key={n.id} className="border-b border-border/50 align-top">
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground tabular-nums">{fecha(n.createdAt)}</td>
                    <td className="px-4 py-3 whitespace-nowrap font-semibold text-foreground">
                      {n.recipientName || (ROL_ETIQUETA[n.recipientRole] ?? n.recipientRole)}
                      {n.recipientName && <span className="block text-[11px] font-normal text-muted-foreground">{ROL_ETIQUETA[n.recipientRole] ?? n.recipientRole}</span>}
                    </td>
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
                            <span className={`font-semibold ${ESTADO_COLOR[d.status] ?? ''}`} title={d.status}>{ESTADO_TEXTO[d.status] ?? d.status}</span>
                            {d.entregadaEn && <span className="text-muted-foreground text-[11px]"> · {fecha(d.entregadaEn)}</span>}
                            {d.error && <span className="text-destructive/70 text-[11px]"> · {d.error}</span>}
                            {d.detalle && d.channel === 'PUSH' && <span className="block text-[10.5px] text-muted-foreground/80">{d.detalle}</span>}
                          </span>
                        ))}
                        {n.deliveries.some(d => d.status === 'FAILED') && (
                          <button
                            type="button"
                            onClick={() => reintentar(n.id)}
                            disabled={reintentando === n.id}
                            className="mt-1 self-start text-[11px] font-semibold text-brand-medio hover:underline disabled:opacity-50"
                          >
                            {reintentando === n.id ? 'Reintentando…' : 'Reintentar'}
                          </button>
                        )}
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
