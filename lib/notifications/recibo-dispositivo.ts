// «¿Llegó de verdad al dispositivo?» — el service worker avisa al servidor cuando
// MUESTRA un aviso y cuando la usuaria lo PULSA. Sin esto, `SENT` solo quería
// decir «el servicio de push aceptó el mensaje» (Apple lo acepta aunque el móvil
// ya no exista) y no había forma de contestar «esta notificación no le llegó».
//
// Sin imports de `@/`: se prueba con `node --test`.

export type EventoDispositivo = 'shown' | 'click';

/** `not-<uuid>` (lib/notifications/inapp.ts). Nada más largo ni con otros caracteres. */
const ID_NOTIFICACION = /^not-[0-9a-f-]{36}$/i;

export function interpretarRecibo(cuerpo: unknown): { nid: string; evento: EventoDispositivo } | null {
  if (!cuerpo || typeof cuerpo !== 'object') return null;
  const { nid, evento } = cuerpo as { nid?: unknown; evento?: unknown };
  if (typeof nid !== 'string' || !ID_NOTIFICACION.test(nid)) return null;
  if (evento !== 'shown' && evento !== 'click') return null;
  return { nid, evento };
}
