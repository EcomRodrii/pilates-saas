// ─────────────────────────────────────────────────────────────────────────────
// Puerta a PostHog (producto, cliente) — mismo patrón que lib/sentry-cliente.ts
// y por el mismo motivo: el panel es lo primero que abre la dueña cada mañana,
// muchas veces desde el móvil del estudio, y un SDK de analítica no tiene por
// qué llegar antes que la app. Se difiere con `import()` al idle del navegador
// y reutiliza la MISMA cola genérica y ya testeada (`lib/sentry-cola.ts`) para
// no perder eventos pedidos antes de que el SDK esté listo.
//
// APAGADO por defecto: sin NEXT_PUBLIC_POSTHOG_KEY es un no-op total.
//
// PRIVACIDAD (la app maneja datos de salud). Lo que garantiza ESTE fichero, no
// lo que se espera de la configuración del proyecto en PostHog:
//   · DÓNDE: nunca en la app de la alumna, la página ni el widget de reservas
//     (tampoco incrustado en la web de un estudio), los enlaces firmados, las
//     pantallas de acceso ni /interno. La lista vive en
//     `lib/posthog-privacidad.ts` y se pregunta al programar la carga, al
//     cargar y antes de encolar cada llamada: la SPA cambia de ruta sin recargar.
//   · QUÉ: `before_send` (`sanearEventoPosthog`) vuelve a descartar cualquier
//     evento cuya ruta esté excluida, tira los que llevan texto del DOM o
//     errores, y sanea toda URL: sin fragmento (ahí vuelve la sesión de Supabase
//     tras un enlace mágico u OAuth), sin query salvo `utm_*`, ids como `:id`.
//   · NADA en el dispositivo: `persistence: 'memory'`, ni cookie ni
//     localStorage. El id anónimo dura lo que dura la página.
//   · Sin autocapture, dead clicks, heatmaps, rage clicks, excepciones,
//     grabación de sesión, logs de consola, encuestas, tours, chat ni
//     experimentos. Tres cerrojos independientes para que encender algo en el
//     panel de PostHog no llegue aquí: cada opción va a `false` explícito (el
//     SDK solo hace caso a la config remota cuando la local está sin definir),
//     `advanced_disable_flags` impide descargar esa config remota, y
//     `disable_external_dependency_loading` impide cargar los scripts que esas
//     funciones necesitan (grabación, toolbar, logs...).
//   · Los errores de cliente los recoge Sentry (lib/sentry-cliente.ts), no esto.
//   · `identificar()` es solo para PERSONAL (propietaria/instructora/
//     recepción) — nunca una socia. Mismo criterio que `identificarEnSentry`
//     en lib/auth-context.tsx: se llama con el id (UUID) nada más, nunca
//     email ni nombre.
// ─────────────────────────────────────────────────────────────────────────────
import { crearCola, type Destino } from '@/lib/sentry-cola';
import { debeCargarseAnalitica, esVistaIncrustada, sanearEventoPosthog } from '@/lib/posthog-privacidad';

type PostHogSDK = typeof import('posthog-js').default;

const enNavegador = typeof window !== 'undefined';
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com';

let sdk: PostHogSDK | null = null;
let cargando: Promise<PostHogSDK | null> | null = null;
const cola = crearCola();

/** ¿Se puede medir en la vista actual? */
function analiticaPermitidaAqui(): boolean {
  return enNavegador && debeCargarseAnalitica(window.location.pathname, esVistaIncrustada());
}

function envolverDestino(instancia: PostHogSDK): Destino {
  // Cierres explícitos, no destructuring: los métodos de posthog-js dependen
  // de `this` internamente, y la cola genérica los invoca sin `.call(destino,…)`.
  return {
    capture: (...a: unknown[]) => (instancia.capture as (...a: unknown[]) => unknown)(...a),
    identify: (...a: unknown[]) => (instancia.identify as (...a: unknown[]) => unknown)(...a),
    reset: (...a: unknown[]) => (instancia.reset as (...a: unknown[]) => unknown)(...a),
  };
}

function forzarCarga(): Promise<PostHogSDK | null> {
  if (!enNavegador) return Promise.resolve(null);
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return Promise.resolve(null);
  if (sdk) return Promise.resolve(sdk);
  if (!analiticaPermitidaAqui()) return Promise.resolve(null);
  if (cargando) return cargando;

  cargando = import('posthog-js')
    .then((m) => {
      const instancia = m.default;
      instancia.init(key, {
        api_host: HOST,
        persistence: 'memory',          // ni cookie ni localStorage
        autocapture: false,             // solo eventos manuales
        capture_pageview: true,         // la URL la sanea before_send
        capture_dead_clicks: false,
        capture_heatmaps: false,
        capture_exceptions: false,
        rageclick: false,
        capture_performance: false,
        disable_session_recording: true,
        enable_recording_console_log: false,
        logs: { captureConsoleLogs: false },
        // El botón de feedback flotante (encuesta por defecto de PostHog)
        // salía en todas las pantallas del panel sin que nadie lo pidiera —
        // una propietaria lo reportó como ruido.
        disable_surveys: true,
        disable_product_tours: true,
        disable_conversations: true,
        disable_web_experiments: true,
        // Sin config remota ni scripts externos: lo que no está aquí no existe.
        advanced_disable_flags: true,
        disable_external_dependency_loading: true,
        advanced_disable_toolbar_metrics: true,
        disable_capture_url_hashes: true,
        mask_personal_data_properties: true,
        person_profiles: 'identified_only',
        before_send: sanearEventoPosthog,
      });
      sdk = instancia;
      cola.conectar(envolverDestino(instancia));
      return instancia;
    })
    .catch(() => {
      cargando = null;
      return null;
    });

  return cargando;
}

/** Carga en cuanto el navegador no tenga nada mejor que hacer. */
export function cargarCuandoOcioso(): void {
  if (!analiticaPermitidaAqui()) return;
  const w = window as typeof window & {
    requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
  };
  if (w.requestIdleCallback) w.requestIdleCallback(() => void forzarCarga(), { timeout: 5000 });
  else window.setTimeout(() => void forzarCarga(), 2000); // Safari
}

function encolar(metodo: string, args: unknown[]) {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY || !analiticaPermitidaAqui()) return;
  cola.pedir(metodo, args);
  if (!cola.conectada) void forzarCarga();
}

/** Evento de producto manual — nunca autocapture. */
export function capturarEvento(nombre: string, props?: Record<string, unknown>): void {
  encolar('capture', props === undefined ? [nombre] : [nombre, props]);
}

/** Identifica a un miembro del PERSONAL (nunca una socia) por su UUID, sin PII. */
export function identificar(usuarioId: string): void {
  encolar('identify', [usuarioId]);
}

/** Al cerrar sesión de personal — desvincula la sesión del navegador de esa persona. */
export function resetear(): void {
  encolar('reset', []);
}
