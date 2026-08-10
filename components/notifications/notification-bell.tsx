'use client';

// Campana + bandeja desplegable del centro de notificaciones (panel). La usan
// propietaria e instructora (ambas entran al dashboard). Lee de la tabla
// `notification` vía /api/notifications, acotada por el JWT del usuario.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Check, X, Inbox, PartyPopper } from 'lucide-react';
import { authHeader } from '@/lib/api-client';
import { fetchNotificaciones, accionNotificacion, type NotifItem, type AmbitoNotif } from '@/lib/notifications/client';
import { supabase } from '@/lib/db/supabase';
import { useAuth } from '@/lib/auth-context';
import { EVENTOS } from '@/lib/notifications/catalog';
import { reproducirChaChing } from '@/lib/notifications/sound';
import { fetchMisEstudios } from '@/lib/supabase-data';

// Esta campana es la del PANEL: enseña lo que NO es de socia, y de todas las
// sedes de la cadena (un pago fallido de la sede B tiene que verse aunque estés
// mirando la A). Sin studioId a propósito — ver lib/notifications/ambito.ts.
const AMBITO_STAFF: AmbitoNotif = { ambito: 'staff' };
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

// Fila cruda de `postgres_changes` sobre `notification` (snake_case de la
// tabla) — distinta de `NotifItem` (camelCase de /api/notifications) porque
// aquí llega directa de Realtime, sin pasar por la API.
interface FilaNotification {
  id: string; title: string; body: string; deep_link: string | null;
  category: NotifItem['category']; priority: NotifItem['priority'];
  event_type: string; resource_type: string | null; resource_id: string | null;
  created_at: string; studio_id: string | null;
}

export function NotificationBell() {
  const router = useRouter();
  const { user } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const [items, setItems] = useState<NotifItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [ventaToast, setVentaToast] = useState<{ title: string; body: string } | null>(null);
  // Nombre de sede por studio_id, SOLO para poder etiquetar cada aviso — el
  // ámbito `staff` deliberadamente no acota por sede (ver AMBITO_STAFF más
  // arriba y lib/notifications/ambito.ts), así que sin esto una propietaria
  // de varias sedes no tiene ninguna pista de a cuál pertenece cada aviso.
  // Vacío para quien solo tiene una sede: ahí etiquetar no aporta nada.
  const [nombrePorSede, setNombrePorSede] = useState<Record<string, string>>({});
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    let vivo = true;
    fetchMisEstudios().then(sedes => {
      if (!vivo || sedes.length < 2) return;
      setNombrePorSede(Object.fromEntries(sedes.map(s => [s.id, s.nombre])));
    });
    return () => { vivo = false; };
  }, [user]);

  const cargar = useCallback(async () => {
    const { items, unread } = await fetchNotificaciones(authHeader, AMBITO_STAFF);
    setItems(items); setUnread(unread);
  }, []);

  // El setState de cargar() ocurre DESPUÉS del await (asíncrono), no en cascada;
  // el lint del compilador da un falso positivo con el fetch-en-effect.
  //
  // El tic se salta con la pestaña oculta: una sesión de mostrador que se deja
  // abierta toda la noche pedía notificaciones 60 veces por hora sin que nadie
  // mirase. Para que volver a la pestaña no obligue a esperar al siguiente
  // minuto, se recarga en cuanto vuelve a ser visible.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar();
    const t = setInterval(() => { if (!document.hidden) void cargar(); }, 60_000);
    const alVolver = () => { if (!document.hidden) void cargar(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', alVolver); };
  }, [cargar]);

  // Tiempo real solo para `venta.registrada` (petición del fundador: la venta
  // tiene que verse AL MOMENTO, no esperar hasta 60s del polling de arriba).
  // No se convierte TODO el sistema a realtime — el resto sigue con el tic de
  // 60s, que ya basta para lo que no es "dinero entrando ahora mismo".
  //
  // RLS de `notification` (recipient_user_id = auth.uid(), migr
  // 20260805195208) es también la frontera de Realtime: el filtro de abajo por
  // `recipient_user_id` es defensa en profundidad, no la cerradura — cada
  // usuaria solo puede llegar a recibir SUS PROPIAS filas exista o no el
  // filtro.
  useEffect(() => {
    if (!user?.id) return;
    const uid = user.id;
    let vivo = true;
    let canal: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!vivo) return;
      await supabase.realtime.setAuth(data.session?.access_token ?? null);
      if (!vivo) return;
      canal = supabase
        .channel(`notification:${uid}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notification', filter: `recipient_user_id=eq.${uid}` },
          payload => {
            const fila = payload.new as unknown as FilaNotification;
            if (fila.event_type !== EVENTOS.VENTA_REGISTRADA) return;
            const item: NotifItem = {
              id: fila.id, title: fila.title, body: fila.body, deepLink: fila.deep_link,
              category: fila.category, priority: fila.priority, eventType: fila.event_type,
              resourceType: fila.resource_type, resourceId: fila.resource_id,
              readAt: null, createdAt: fila.created_at, studioId: fila.studio_id,
            };
            setItems(prev => (prev.some(x => x.id === item.id) ? prev : [item, ...prev]));
            setUnread(u => u + 1);
            setVentaToast({ title: fila.title, body: fila.body });
            reproducirChaChing();
          },
        )
        .subscribe();
    })();
    // Mismo motivo que studio-context.tsx (instructores en tiempo real): el JWT
    // de sesión rota cada ~1h y, sin reenviarlo al canal, la RLS deja de
    // autorizar la suscripción EN SILENCIO.
    const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' && vivo) {
        void supabase.realtime.setAuth(session?.access_token ?? null);
      }
    });
    return () => {
      vivo = false;
      authSub.subscription.unsubscribe();
      if (canal) supabase.removeChannel(canal);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!ventaToast) return;
    const t = setTimeout(() => setVentaToast(null), 6000);
    return () => clearTimeout(t);
  }, [ventaToast]);

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
      await accionNotificacion(authHeader, AMBITO_STAFF, 'read', n.id);
    }
    if (n.deepLink) { setAbierto(false); router.push(n.deepLink); }
  }

  async function archivar(e: React.MouseEvent, n: NotifItem) {
    e.stopPropagation();
    setItems(prev => prev.filter(x => x.id !== n.id));
    if (n.readAt == null) setUnread(u => Math.max(0, u - 1));
    await accionNotificacion(authHeader, AMBITO_STAFF, 'archive', n.id);
  }

  async function marcarTodas() {
    setItems(prev => prev.map(x => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })));
    setUnread(0);
    await accionNotificacion(authHeader, AMBITO_STAFF, 'read-all');
  }

  return (
    <div className="relative" ref={ref}>
      {ventaToast && (
        <div
          role="status"
          onClick={() => { setVentaToast(null); setAbierto(true); }}
          className="fixed top-4 right-4 z-[60] w-[320px] max-w-[calc(100vw-24px)] flex items-start gap-3 bg-card border border-border rounded-2xl shadow-2xl px-4 py-3 cursor-pointer animate-in fade-in slide-in-from-top-2"
        >
          <span className="mt-0.5 flex items-center justify-center w-8 h-8 rounded-full bg-brand/10 text-brand shrink-0">
            <PartyPopper size={16} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[13px] font-bold text-foreground">{ventaToast.title}</span>
            <span className="block text-[12.5px] text-muted-foreground leading-snug mt-0.5">{ventaToast.body}</span>
          </span>
          <span
            onClick={(e) => { e.stopPropagation(); setVentaToast(null); }}
            className="text-muted-foreground/60 hover:text-destructive shrink-0"
            aria-label="Cerrar"
            role="button"
          >
            <X size={14} />
          </span>
        </div>
      )}
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
              <button onClick={marcarTodas} className="flex items-center gap-1 text-[12px] font-semibold text-brand-medio hover:underline">
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
                  {n.studioId && nombrePorSede[n.studioId] && (
                    <span className="inline-block mt-1 px-1.5 py-0.5 rounded-md bg-muted text-[10px] font-semibold text-muted-foreground">
                      {nombrePorSede[n.studioId]}
                    </span>
                  )}
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
