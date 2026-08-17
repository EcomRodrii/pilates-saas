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
// PRIVACIDAD (la app maneja datos de salud):
//   · `autocapture: false` — el autocapture de PostHog manda el texto visible
//     de lo que se pulsa (nombre de un botón, texto de un enlace...), y en
//     este panel eso puede ser el nombre de una socia. Solo eventos manuales.
//   · Grabación de sesión APAGADA por defecto; se enciende explícitamente
//     solo en el widget público de reserva (`iniciarGrabacionSiCorresponde`,
//     llamado desde el layout de /reservar) — nunca en /clientas, /portal ni
//     /mi-perfil, que muestran datos personales/de salud de una socia.
//   · `identificar()` es solo para PERSONAL (propietaria/instructora/
//     recepción) — nunca una socia. Mismo criterio que `identificarEnSentry`
//     en lib/auth-context.tsx: se llama con el id (UUID) nada más, nunca
//     email ni nombre.
// ─────────────────────────────────────────────────────────────────────────────
import { crearCola, type Destino } from '@/lib/sentry-cola';

type PostHogSDK = typeof import('posthog-js').default;

const enNavegador = typeof window !== 'undefined';
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com';

let sdk: PostHogSDK | null = null;
let cargando: Promise<PostHogSDK | null> | null = null;
const cola = crearCola();

function envolverDestino(instancia: PostHogSDK): Destino {
  // Cierres explícitos, no destructuring: los métodos de posthog-js dependen
  // de `this` internamente, y la cola genérica los invoca sin `.call(destino,…)`.
  return {
    capture: (...a: unknown[]) => (instancia.capture as (...a: unknown[]) => unknown)(...a),
    identify: (...a: unknown[]) => (instancia.identify as (...a: unknown[]) => unknown)(...a),
    reset: (...a: unknown[]) => (instancia.reset as (...a: unknown[]) => unknown)(...a),
    startSessionRecording: (...a: unknown[]) => (instancia.startSessionRecording as (...a: unknown[]) => unknown)(...a),
    stopSessionRecording: (...a: unknown[]) => (instancia.stopSessionRecording as (...a: unknown[]) => unknown)(...a),
  };
}

function forzarCarga(): Promise<PostHogSDK | null> {
  if (!enNavegador) return Promise.resolve(null);
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return Promise.resolve(null);
  if (sdk) return Promise.resolve(sdk);
  if (cargando) return cargando;

  cargando = import('posthog-js')
    .then((m) => {
      const instancia = m.default;
      instancia.init(key, {
        api_host: HOST,
        autocapture: false,        // solo eventos manuales — ver nota de privacidad arriba
        capture_pageview: true,    // solo URL/referrer, sin contenido de DOM
        disable_session_recording: true, // se enciende a mano solo donde no hay datos de una socia
        person_profiles: 'identified_only',
        // El botón de feedback flotante (encuesta por defecto de PostHog)
        // salía en todas las pantallas del panel sin que nadie lo pidiera —
        // una propietaria lo reportó como ruido. Sin encuestas configuradas
        // hoy en este proyecto de PostHog, desactivarlas todas no pierde nada.
        disable_surveys: true,
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
  if (!enNavegador) return;
  const w = window as typeof window & {
    requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
  };
  if (w.requestIdleCallback) w.requestIdleCallback(() => void forzarCarga(), { timeout: 5000 });
  else window.setTimeout(() => void forzarCarga(), 2000); // Safari
}

function encolar(metodo: string, args: unknown[]) {
  if (!enNavegador || !process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
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

/**
 * Enciende grabación de sesión SOLO en rutas sin datos personales de una
 * socia — hoy únicamente el widget público de reserva. Nunca llamar en
 * /clientas, /portal ni /mi-perfil.
 */
export function iniciarGrabacionSiCorresponde(): void {
  encolar('startSessionRecording', []);
}

export function detenerGrabacion(): void {
  encolar('stopSessionRecording', []);
}
