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

/**
 * Qué subconjunto de SUS avisos pide quien llama. Obligatorio desde que se
 * separaron las dos superficies: una misma persona puede ser staff y socia con
 * la misma cuenta (ver `lib/notifications/ambito.ts`). El portal manda
 * `{ambito: 'socia', studioId}`; el panel, `{ambito: 'staff'}`.
 */
export interface AmbitoNotif {
  ambito: 'socia' | 'staff';
  studioId?: string;
}

function queryDe({ ambito, studioId }: AmbitoNotif): string {
  const p = new URLSearchParams({ ambito });
  if (studioId) p.set('studioId', studioId);
  return `?${p}`;
}

export async function fetchNotificaciones(getHeaders: Headers, scope: AmbitoNotif): Promise<{ items: NotifItem[]; unread: number }> {
  const res = await fetch(`/api/notifications${queryDe(scope)}`, { headers: await getHeaders(), cache: 'no-store' });
  if (!res.ok) return { items: [], unread: 0 };
  // Un cuerpo sin `items` (proxy, respuesta recortada) dejaba la lista en
  // `undefined` y la pantalla se caía al recorrerla. Vacío no es lo mismo que
  // roto, pero pintar "no hay nada" es mejor que no pintar nada.
  const body = await res.json();
  return { items: body?.items ?? [], unread: body?.unread ?? 0 };
}

export async function accionNotificacion(
  getHeaders: Headers, scope: AmbitoNotif, action: 'read' | 'unread' | 'read-all' | 'archive', id?: string,
): Promise<void> {
  await fetch('/api/notifications', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await getHeaders()) },
    // El ámbito viaja también en las escrituras: sin él, el `read-all` de una
    // superficie marcaba leído lo de la otra.
    body: JSON.stringify({ action, id, ...scope }),
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
