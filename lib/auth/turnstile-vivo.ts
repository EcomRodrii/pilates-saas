// Sin imports ni `@/` (ver push-estado.ts).
//
// Hablar con un widget de Turnstile que puede haber DEJADO DE EXISTIR.
//
// Cloudflare guarda los widgets en un registro propio, y `getResponse`,
// `execute` y `reset` LANZAN un `TurnstileError` si el id que se les da ya no
// está en él: «Could not find widget for provided container», «Please provide 2
// parameters to execute…», «Nothing to reset found…». Medido con el script real
// y la clave de prueba de Cloudflare: pasa tras `remove()` (y, según Cloudflare,
// cuando el widget se cae por dentro — el `300031` que ya documenta
// `useCaptcha`). NO pasa por volver a montar el `<div>` contenedor: ahí las
// tres siguen funcionando.
//
// Sin esto, en `/reservar` el botón «Continuar» moría en silencio: la excepción
// salía de `pedirToken` como un rechazo sin capturar y la alumna no veía nada
// (Sentry JAVASCRIPT-NEXTJS-2T: 44 eventos, iPhone). Y peor: `captchaGastado()`
// llama a `reset` sin capturar tras cada login o alta, así que un widget muerto
// hacía lanzar a mitad de la propia petición de auth.

interface ConGetResponse { getResponse: (id: string) => string | undefined }
interface ConExecute { execute: (id: string) => void }
interface ConReset { reset: (id: string) => void }

export type LecturaWidget =
  | { estado: 'vivo'; token: string | null }
  | { estado: 'muerto' };

/** El token ya emitido y sin gastar (`null` si aún no hay), o `muerto`. */
export function leerTokenDelWidget(api: ConGetResponse, id: string): LecturaWidget {
  try {
    const token = api.getResponse(id);
    return { estado: 'vivo', token: token ? token : null };
  } catch {
    return { estado: 'muerto' };
  }
}

/** Dispara la verificación. `muerto` si el widget ya no existe. */
export function ejecutarWidget(api: ConExecute, id: string): 'vivo' | 'muerto' {
  try {
    api.execute(id);
    return 'vivo';
  } catch {
    return 'muerto';
  }
}

/** Devuelve el widget a cero. `false` si ya no existe (no hay nada que devolver a cero). */
export function reiniciarWidget(api: ConReset, id: string): boolean {
  try {
    api.reset(id);
    return true;
  } catch {
    return false;
  }
}
