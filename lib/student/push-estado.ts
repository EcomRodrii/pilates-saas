// Qué se le dice a la alumna sobre los avisos push en ESTE dispositivo.
//
// ⚠️ Sin imports ni `@/`: `node --test --experimental-strip-types` no resuelve
// ese alias — un test que lo use no falla, deja de ejecutarse.
//
// Web Push tiene más estados de los que parece, y cada uno pide una frase
// distinta y una acción distinta. Pintar un solo interruptor «Notificaciones»
// que no hace nada en la mitad de ellos —iPhone sin instalar, permiso
// bloqueado— es justo el control muerto que no queremos. La copia de los
// estados es la MISMA que ya usa el panel (`notification-preferences.tsx`),
// para que estudio y alumna lean lo mismo cuando algo no va.

export type EstadoPush =
  | 'unsupported'   // el navegador no tiene PushManager
  | 'ios-sin-instalar' // iPhone/iPad en Safari, sin añadir a inicio: iOS solo da push a la PWA instalada
  | 'denied'        // la alumna bloqueó el permiso
  | 'sin-clave'     // el servidor no tiene VAPID: no es culpa suya
  | 'default'       // aún no ha decidido
  | 'granted-off'   // permiso dado pero sin suscripción en este dispositivo
  | 'granted-on';   // suscrita en este dispositivo

export interface ContextoPush {
  permiso: 'unsupported' | 'default' | 'denied' | 'granted';
  esIOS: boolean;
  esStandalone: boolean;
  hayClave: boolean;
  suscrita: boolean;
}

/**
 * Del estado bruto del navegador al estado que la pantalla sabe pintar.
 *
 * El orden importa: en iPhone, Safari SIN instalar no expone PushManager, así
 * que llegaría como `unsupported` — y decirle «tu navegador no admite push» a
 * alguien que puede arreglarlo en dos toques es rendirse antes de tiempo. Por
 * eso iOS se comprueba ANTES de dar por perdido el soporte.
 */
export function estadoPush(c: ContextoPush): EstadoPush {
  if (c.esIOS && !c.esStandalone) return 'ios-sin-instalar';
  if (c.permiso === 'unsupported') return 'unsupported';
  if (c.permiso === 'denied') return 'denied';
  if (!c.hayClave) return 'sin-clave';
  if (c.permiso === 'default') return 'default';
  return c.suscrita ? 'granted-on' : 'granted-off';
}

export interface TextoPush {
  titulo: string;
  cuerpo: string;
  /** Qué hace el botón, o `null` si no hay nada que la alumna pueda hacer aquí. */
  accion: 'activar' | 'desactivar' | null;
  /** El interruptor se pinta encendido. */
  encendido: boolean;
}

export function textoPush(e: EstadoPush): TextoPush {
  switch (e) {
    case 'granted-on':
      return { titulo: 'Avisos activados en este dispositivo', cuerpo: 'Te avisaremos aunque tengas la app cerrada.', accion: 'desactivar', encendido: true };
    case 'granted-off':
    case 'default':
      return { titulo: 'Avisos en este dispositivo', cuerpo: 'Recibe plazas liberadas y recordatorios aunque la app esté cerrada.', accion: 'activar', encendido: false };
    case 'denied':
      return { titulo: 'Avisos bloqueados', cuerpo: 'Has bloqueado las notificaciones. Actívalas desde los ajustes del navegador para este sitio.', accion: null, encendido: false };
    case 'ios-sin-instalar':
      return { titulo: 'Instala la app para recibir avisos', cuerpo: 'En iPhone los avisos solo llegan desde la app instalada: Compartir → Añadir a pantalla de inicio, y ábrela desde ahí.', accion: null, encendido: false };
    case 'sin-clave':
      return { titulo: 'Avisos no disponibles todavía', cuerpo: 'El estudio aún no tiene los avisos configurados. No es cosa tuya.', accion: null, encendido: false };
    case 'unsupported':
      return { titulo: 'Este navegador no admite avisos', cuerpo: 'Prueba desde Chrome o Safari actualizados.', accion: null, encendido: false };
  }
}

// ── Renovar la suscripción al abrir la app ──────────────────────────────────
//
// Un móvil puede quedarse con una suscripción que el servicio de push acepta y
// no entrega (reinstalar la app, una suscripción antigua): el servidor dice
// «enviado» y a la alumna no le llega nada, sin que nadie lo sepa. Pasó en
// producción el 21-sep con un iPhone suscrito el 6-sep. Al abrir la app se
// vuelve a mandar la suscripción de ESTE dispositivo, como mucho una vez al día.

export const RENOVAR_PUSH_CADA_MS = 24 * 60 * 60 * 1000;

/** `ultimaMs` null o ilegible = nunca se renovó en este dispositivo. */
export function tocaRenovarPush(ultimaMs: number | null, ahoraMs: number): boolean {
  if (ultimaMs == null || !Number.isFinite(ultimaMs)) return true;
  // Un reloj que ha ido hacia atrás no puede dejarla sin renovar para siempre.
  if (ultimaMs > ahoraMs) return true;
  return ahoraMs - ultimaMs >= RENOVAR_PUSH_CADA_MS;
}
