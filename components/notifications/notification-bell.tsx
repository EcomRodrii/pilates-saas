'use client';

// Campana + bandeja desplegable del centro de notificaciones (panel). La usan
// propietaria e instructora (ambas entran al dashboard). Lee de la tabla
// `notification` vía /api/notifications, acotada por el JWT del usuario.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Check, X, Inbox } from 'lucide-react';
import { authHeader } from '@/lib/api-client';
import { fetchNotificaciones, accionNotificacion, type NotifItem } from '@/lib/notifications/client';
import { cn } from '@/lib/utils';

const ACENTO: Record<string, string> = {
  CRITICA: 'bg-red-500', ALTA: 'bg-amber-500', MEDIA: 'bg-brand', BAJA: 'bg-muted-foreground/40', SILENCIOSA: 'bg-muted-foreground/40',
};

function haceCuanto(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} d`;
}

export function NotificationBell() {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [items, setItems] = useState<NotifItem[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const cargar = useCallback(async () => {
    const { items, unread } = await fetchNotificaciones(authHeader);
    setItems(items); setUnread(unread);
  }, []);

  // El setState de cargar() ocurre DESPUÉS del await (asíncrono), no en cascada;
  // el lint del compilador da un falso positivo con el fetch-en-effect.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargar(); const t = setInterval(cargar, 60_000); return () => clearInterval(t); }, [cargar]);

  // Cerrar al hacer clic fuera.
  useEffect(() => {
    if (!abierto) return;
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [abierto]);

  async function abrirItem(n: NotifItem) {
    if (n.readAt == null) {
      setItems(prev => prev.map(x => x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x));
      setUnread(u => Math.max(0, u - 1));
      await accionNotificacion(authHeader, 'read', n.id);
    }
    if (n.deepLink) { setAbierto(false); router.push(n.deepLink); }
  }

  async function archivar(e: React.MouseEvent, n: NotifItem) {
    e.stopPropagation();
    setItems(prev => prev.filter(x => x.id !== n.id));
    if (n.readAt == null) setUnread(u => Math.max(0, u - 1));
    await accionNotificacion(authHeader, 'archive', n.id);
  }

  async function marcarTodas() {
    setItems(prev => prev.map(x => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })));
    setUnread(0);
    await accionNotificacion(authHeader, 'read-all');
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setAbierto(o => !o)}
        aria-label="Notificaciones"
        className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
      >
        <Bell size={18} className="text-muted-foreground" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {abierto && (
        <div className="absolute right-0 mt-2 w-[360px] max-w-[calc(100vw-24px)] bg-card border border-border rounded-2xl shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="text-[14px] font-extrabold text-foreground">Notificaciones</p>
            {unread > 0 && (
              <button onClick={marcarTodas} className="flex items-center gap-1 text-[12px] font-semibold text-brand hover:underline">
                <Check size={13} /> Marcar todas
              </button>
            )}
          </div>

          <div className="max-h-[70vh] overflow-y-auto">
            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                <Inbox size={26} />
                <p className="text-[13px]">No tienes notificaciones</p>
              </div>
            ) : items.map(n => (
              <button
                key={n.id}
                onClick={() => abrirItem(n)}
                className={cn('w-full text-left flex gap-3 px-4 py-3 border-b border-border/60 hover:bg-muted/50 transition-colors', n.readAt == null && 'bg-brand/[0.04]')}
              >
                <span className={cn('mt-1.5 w-2 h-2 rounded-full shrink-0', n.readAt == null ? ACENTO[n.priority] ?? 'bg-brand' : 'bg-transparent')} />
                <span className="flex-1 min-w-0">
                  <span className="flex items-center justify-between gap-2">
                    <span className={cn('text-[13px] truncate', n.readAt == null ? 'font-bold text-foreground' : 'font-semibold text-foreground/80')}>{n.title}</span>
                    <span className="text-[11px] text-muted-foreground shrink-0">{haceCuanto(n.createdAt)}</span>
                  </span>
                  <span className="block text-[12.5px] text-muted-foreground leading-snug mt-0.5">{n.body}</span>
                </span>
                <span
                  onClick={(e) => archivar(e, n)}
                  className="text-muted-foreground/60 hover:text-destructive shrink-0"
                  aria-label="Archivar"
                  role="button"
                >
                  <X size={14} />
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
