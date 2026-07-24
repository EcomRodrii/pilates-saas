// ─────────────────────────────────────────────────────────────────────────────
// Notification Engine — cliente (browser). Fetchers del centro de notificaciones
// in-app. Reciben la función que aporta la cabecera Authorization (authHeader del
// panel o portalAuthHeader del portal) → el mismo código sirve a los 3 roles.
// ─────────────────────────────────────────────────────────────────────────────
import type { NotificationCategory, NotificationPriority } from './types.ts';

export interface NotifItem {
  id: string;
  title: string;
  body: string;
  deepLink: string | null;
  category: NotificationCategory;
  priority: NotificationPriority;
  eventType: string;
  resourceType: string | null;
  resourceId: string | null;
  readAt: string | null;
  createdAt: string;
}

type Headers = () => Promise<Record<string, string>>;

export async function fetchNotificaciones(getHeaders: Headers): Promise<{ items: NotifItem[]; unread: number }> {
  const res = await fetch('/api/notifications', { headers: await getHeaders(), cache: 'no-store' });
  if (!res.ok) return { items: [], unread: 0 };
  return res.json();
}

export async function accionNotificacion(
  getHeaders: Headers, action: 'read' | 'unread' | 'read-all' | 'archive', id?: string,
): Promise<void> {
  await fetch('/api/notifications', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await getHeaders()) },
    body: JSON.stringify({ action, id }),
  });
}

export async function fetchPreferencias(getHeaders: Headers): Promise<Record<string, { inapp: boolean; push: boolean }>> {
  const res = await fetch('/api/notifications/preferences', { headers: await getHeaders(), cache: 'no-store' });
  if (!res.ok) return {};
  const { prefs } = await res.json();
  return prefs ?? {};
}

export async function guardarPreferencia(
  getHeaders: Headers, studioId: string, category: string, valores: { inapp: boolean; push: boolean },
): Promise<void> {
  await fetch('/api/notifications/preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(await getHeaders()) },
    body: JSON.stringify({ studioId, category, ...valores }),
  });
}
