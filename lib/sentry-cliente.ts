// ─────────────────────────────────────────────────────────────────────────────
// Puerta a Sentry. En el navegador lo carga tarde; en el servidor pasa de largo.
//
// POR QUÉ: medido con dos builds idénticos salvo por esto, el SDK de Sentry son
// 245 KB de los 1.516 KB que el panel descarga en una carga fría — un 16 %. Y el
// panel es lo primero que abre la dueña cada mañana, muchas veces desde el móvil
// del estudio. Sentry no hace falta para que la app FUNCIONE: hace falta para
// contar lo que se ha roto. No tiene por qué llegar antes que la app.
//
// CÓMO: este módulo es diminuto y síncrono, y es la única puerta a Sentry desde
// código que también corre en cliente. El SDK entra por `import()` cuando el
// navegador está ocioso; hasta entonces, lo que se le pida se guarda en una cola
// que se vuelca —en orden— en cuanto llega.
//
// NO ES 'use client' A PROPÓSITO: `lib/supabase-data.ts` lo usa desde los dos
// lados. En servidor el SDK ya está inicializado por `sentry.server.config.ts`,
// así que aquí sólo se reenvía; el `init()` es exclusivo del navegador.
//
// LO IMPORTANTE: una captura NUNCA se pierde por llegar pronto. Un sistema de
// monitorización que deja de reportar en silencio es peor que no tenerlo, porque
// crees que estás cubierta. Por eso además:
//   · `forzarCarga()` lo trae ya, sin esperar al idle (lo usa global-error: si
//     la app se ha caído entera, ese informe no puede esperar a nada).
//   · si el `import()` falla (red, bloqueador), se reintenta en la siguiente
//     captura en vez de quedarse muerto para siempre.
// ─────────────────────────────────────────────────────────────────────────────
import type { CaptureContext, SeverityLevel } from '@sentry/nextjs';

type SDK = typeof import('@sentry/nextjs');
type Llamada = { metodo: keyof SDK; args: unknown[] };

const enNavegador = typeof window !== 'undefined';

let sdk: SDK | null = null;
let cargando: Promise<SDK | null> | null = null;

// Tope de la cola: si algo entra en bucle de errores antes de que cargue el SDK,
// no queremos que el buffer se coma la memoria del móvil. 100 sobra para el
// primer segundo de vida de la página.
const MAX_COLA = 100;
const cola: Llamada[] = [];
let descartadas = 0;

function aplicar(m: SDK, { metodo, args }: Llamada) {
  const fn = m[metodo];
  if (typeof fn === 'function') (fn as (...a: unknown[]) => unknown)(...args);
}

function encolar(metodo: keyof SDK, args: unknown[]) {
  if (sdk) { aplicar(sdk, { metodo, args }); return; }
  if (cola.length < MAX_COLA) cola.push({ metodo, args });
  else descartadas++;
  // Que haya algo que reportar es razón suficiente para traerlo ya: esperar al
  // idle retrasaría justo los errores del arranque, que son los que importan.
  void forzarCarga();
}

/** Trae el SDK ahora mismo (sin esperar al idle) y vuelca la cola. */
export function forzarCarga(): Promise<SDK | null> {
  if (sdk) return Promise.resolve(sdk);
  if (cargando) return cargando;

  cargando = import('@sentry/nextjs')
    .then((m) => {
      // En servidor `sentry.server.config.ts` ya llamó a init: repetirlo aquí
      // pisaría su configuración (que sí manda PII de servidor, entre otras).
      if (enNavegador) {
        m.init({
          dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
          enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
          tracesSampleRate: 0.1,
          sendDefaultPii: false,
        });
      }
      sdk = m;
      for (const ll of cola) aplicar(m, ll);   // el orden importa
      cola.length = 0;
      if (descartadas > 0) {
        m.captureMessage(`Cola de Sentry desbordada: ${descartadas} eventos perdidos antes de cargar`, 'warning');
        descartadas = 0;
      }
      return m;
    })
    .catch(() => {
      cargando = null;   // que un fallo puntual no lo deje mudo para siempre
      return null;
    });

  return cargando;
}

// En SERVIDOR no se difiere nada: se pide el SDK al cargar el módulo, que ocurre
// al arrancar la ruta, mucho antes de atender ninguna petición. Diferirlo allí
// sería una regresión de verdad — `captureException` era síncrono, y en una
// función serverless fría el proceso puede terminar antes de que resuelva el
// `import()`, perdiendo justo el error que la provocó. Aquí no hay bundle que
// adelgazar: el peso que nos importaba es el que viaja al navegador.
if (!enNavegador) void forzarCarga();

/** Carga en cuanto el navegador no tenga nada mejor que hacer. */
export function cargarCuandoOcioso(): void {
  if (!enNavegador) return;
  const w = window as typeof window & {
    requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
  };
  if (w.requestIdleCallback) w.requestIdleCallback(() => void forzarCarga(), { timeout: 5000 });
  else window.setTimeout(() => void forzarCarga(), 2000);   // Safari
}

// ── Superficie que usa el resto de la app ───────────────────────────────────
// Mismos argumentos que el SDK, para que sustituir `Sentry.captureException` por
// `capturarExcepcion` sea un cambio de nombre y nada más.

export function capturarExcepcion(error: unknown, contexto?: CaptureContext): void {
  encolar('captureException', contexto === undefined ? [error] : [error, contexto]);
}

export function capturarMensaje(
  mensaje: string,
  nivel: SeverityLevel = 'info',
  contexto?: { tags?: Record<string, string>; extra?: Record<string, unknown> },
): void {
  encolar('captureMessage', [mensaje, contexto ? { level: nivel, ...contexto } : nivel]);
}

export function fijarUsuario(usuario: { id: string } | null): void {
  encolar('setUser', [usuario]);
}

export function fijarEtiqueta(clave: string, valor: string | undefined): void {
  encolar('setTag', [clave, valor]);
}
