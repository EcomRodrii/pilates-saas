import 'server-only';
import { capturarMensaje } from '@/lib/sentry-cliente';
import { clavesDelEntorno } from './cifrado-credenciales.ts';
import { descifrarConfigIntegracion } from './config-cifrada.ts';

/**
 * La config de una fila de `integraciones`, con los secretos descifrados y
 * aviso en Sentry si alguno no se pudo (ese campo no se devuelve). Todo lo que
 * lee `config` de la tabla pasa por aquí (lo vigila config-cifrada.test.ts);
 * el recordatorio de clase usa la función pura porque corre en `node --test`.
 */
export function descifrarConfigDeFila(studioId: string, tipo: string, config: unknown): Record<string, string> {
  const r = descifrarConfigIntegracion(studioId, tipo, config, clavesDelEntorno());
  if (r.fallidos.length) {
    capturarMensaje('[integraciones] secreto de integración que no se puede descifrar', 'error', {
      tags: { area: 'integraciones', tipo },
      extra: { campos: r.fallidos, queHacer: 'Si se cambió la clave, poner la de antes en INTEGRACIONES_CLAVE_CIFRADO_ANTERIOR; si se perdió, el estudio tiene que volver a pegar su clave.' },
    });
  }
  return r.config;
}
