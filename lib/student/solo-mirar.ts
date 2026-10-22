// ─────────────────────────────────────────────────────────────────────────────
// La app de la alumna «solo para mirar»: dentro del marco del alta nueva se puede
// TOCAR (cambiar de pestaña, abrir pantallas) sin que eso escriba nada: ni una
// reserva, ni una cuenta de alumna, ni un código mandado a un correo.
//
// Quién la pide: el iframe del alta lleva `name="tentare-solo-mirar"`
// (`NOMBRE_MARCO_SOLO_MIRAR`). `window.name` es del marco, no del documento: se
// conserva al navegar dentro de él (también en una recarga completa) y no lo
// tiene ninguna otra ventana. La vista previa de «Apariencia de tu app» no lo
// lleva y sigue como siempre.
//
// La cerradura: un script en línea en el layout del portal (`SCRIPT_SOLO_MIRAR`,
// que es `instalarSoloMirar` tal cual) que, en ese marco y solo en él, sustituye
// `fetch` por uno que deja pasar lo que lee y rechaza lo que escribe, y apaga
// `sendBeacon`. Supabase resuelve `fetch` en cada llamada (`resolveFetch` de
// supabase-js y auth-js), así que también corta el envío de códigos y las
// entradas. Encima, la interfaz lo dice (`enMarcoSoloMirar` en la puerta de
// entrada y en la guardia de sesión), para que nada parezca roto.
//
// ⚠️ «Leer» no es solo GET: la app pide su catálogo con un POST
// (`/api/public/studio-data`), igual que la racha. Esas rutas, y SOLO esas, pasan
// con POST (`LECTURAS_POR_POST`). Una ruta nueva que lea por POST y deba verse en
// el marco va aquí; si no, en el marco sale su error, que es lo seguro.
//
// ⚠️ En el marco la app NO usa ninguna sesión de alumna, aunque la haya en este
// navegador (`useSesionWidget`): se ve como una recién llegada, que es lo que se
// promete, y así `/api/public/session` —que al resolver la sesión puede vincular
// una ficha— no se llama nunca. Por eso no está en la lista, ni la renovación del
// token.
//
// Import relativo con extensión `.ts`: lo prueba `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

export const NOMBRE_MARCO_SOLO_MIRAR = 'tentare-solo-mirar';

/** Lo que contesta `fetch` a una escritura en el marco (lo ve quien mira la consola, no la alumna). */
export const MOTIVO_SOLO_MIRAR = 'Vista previa del alta: aquí no se escribe nada';

/** Lo que se le dice a quien intenta entrar o mandarse un código en el marco. */
export const AVISO_SOLO_MIRAR = 'Es la vista previa de tu app: aquí no se manda ningún código ni se crea ninguna cuenta. Tus alumnas entran así, con su email.';

/** Las rutas del propio origen que LEEN con POST (ver la cabecera). */
export const LECTURAS_POR_POST: readonly string[] = [
  '/api/public/studio-data',
  '/api/public/racha',
];

export interface VentanaSoloMirar {
  name: string;
  self: unknown;
  top: unknown;
  location: { href: string; origin: string };
  fetch: (entrada: unknown, opciones?: { method?: string } | undefined) => Promise<unknown>;
  navigator?: { sendBeacon?: (...a: unknown[]) => boolean };
  document?: { documentElement?: { setAttribute: (n: string, v: string) => void } };
}

export interface ConfigSoloMirar { nombre: string; lecturas: readonly string[]; motivo: string }

/**
 * Pone la cerradura en `w` si es el marco de «solo mirar». Devuelve si la puso.
 *
 * ⚠️ Va al navegador con `toString()` (`SCRIPT_SOLO_MIRAR`): no puede usar nada
 * de fuera de su cuerpo, ni importar, ni sintaxis que un navegador de hace un par
 * de años no lea.
 */
export function instalarSoloMirar(w: VentanaSoloMirar, cfg: ConfigSoloMirar): boolean {
  try {
    if (w.self === w.top || w.name !== cfg.nombre) return false;
    const original = w.fetch;
    const permitida = (entrada: unknown, opciones?: { method?: string }) => {
      const pedido = entrada && typeof entrada === 'object' ? (entrada as { method?: string; url?: string; href?: string }) : null;
      const metodo = String((opciones && opciones.method) || (pedido && pedido.method) || 'GET').toUpperCase();
      if (metodo === 'GET' || metodo === 'HEAD') return true;
      let url: URL;
      try {
        url = new URL(typeof entrada === 'string' ? entrada : (pedido && (pedido.href || pedido.url)) || String(entrada), w.location.href);
      } catch {
        return false;
      }
      return url.origin === w.location.origin && cfg.lecturas.indexOf(url.pathname) >= 0;
    };
    w.fetch = function (this: unknown, entrada: unknown, opciones?: { method?: string }) {
      if (!permitida(entrada, opciones)) return Promise.reject(new TypeError(cfg.motivo));
      // eslint-disable-next-line prefer-rest-params
      return original.apply(this, arguments as unknown as [unknown, { method?: string } | undefined]);
    };
    if (w.navigator && w.navigator.sendBeacon) w.navigator.sendBeacon = function () { return false; };
    if (w.document && w.document.documentElement) w.document.documentElement.setAttribute('data-solo-mirar', '');
    return true;
  } catch {
    return false;
  }
}

/** El script, para un `<script>` en línea del layout del portal: lo primero que corre en el marco. */
export const SCRIPT_SOLO_MIRAR = `(${instalarSoloMirar.toString()})(window,${JSON.stringify({
  nombre: NOMBRE_MARCO_SOLO_MIRAR, lecturas: LECTURAS_POR_POST, motivo: MOTIVO_SOLO_MIRAR,
} satisfies ConfigSoloMirar)});`;

/**
 * ¿Está esta ventana en el marco de «solo mirar», CON la cerradura puesta? Fuera
 * de un marco, nunca. Exige la marca que deja el script (`data-solo-mirar`): si
 * el script no hubiera corrido, la interfaz no se abre como si lo hubiera hecho.
 * `false` en el servidor.
 */
export function enMarcoSoloMirar(
  w: { name: string; self: unknown; top: unknown; document?: { documentElement?: { hasAttribute?: (n: string) => boolean } } } | null | undefined
    = typeof window === 'undefined' ? null : window,
): boolean {
  try {
    return !!w && w.self !== w.top && w.name === NOMBRE_MARCO_SOLO_MIRAR
      && w.document?.documentElement?.hasAttribute?.('data-solo-mirar') === true;
  } catch {
    return false;
  }
}
