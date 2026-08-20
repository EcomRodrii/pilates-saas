// Arranque de Sentry en el navegador.
//
// Antes esto hacía `import * as Sentry from '@sentry/nextjs'` + `Sentry.init()`
// en el propio módulo de arranque, así que el SDK entero entraba en el bundle
// inicial: 245 KB medidos de los 1.516 KB que descarga el panel en frío (16 %),
// bloqueando el primer pintado de la pantalla que la dueña abre cada mañana.
//
// Ahora el SDK entra por `import()` desde `lib/sentry-cliente`, que lo trae
// cuando el navegador está ocioso y mientras tanto encola lo que se le pida. La
// configuración de `init` vive allí, que es quien lo llama.
//
// Lo que se pierde y por qué es aceptable: una navegación que ocurra antes de
// que el SDK cargue no genera traza de rendimiento. Las EXCEPCIONES no se
// pierden — se encolan y salen al cargar. Errores > trazas.
//
// Nota: la config anterior traía `replaysSessionSampleRate: 0` y
// `replaysOnErrorSampleRate: 1.0`, pero no grababan nada: Sentry v10 elimina la
// integración de Replay si nunca se la referencia, y aquí no se referenciaba
// (comprobado: cero rastro de rrweb en el bundle de producción). Se quitan en
// vez de dejar una opción que aparenta estar activa y no lo está.
import { cargarCuandoOcioso, forzarCarga } from '@/lib/sentry-cliente';
import { cargarCuandoOcioso as cargarPosthogCuandoOcioso } from '@/lib/posthog-cliente';

cargarCuandoOcioso();
cargarPosthogCuandoOcioso();

export const onRouterTransitionStart = (...args: unknown[]): void => {
  void forzarCarga().then((m) => {
    (m?.captureRouterTransitionStart as ((...a: unknown[]) => void) | undefined)?.(...args);
  });
};
