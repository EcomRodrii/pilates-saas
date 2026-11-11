// Los endpoints de la API pública v1, para la página «API de desarrollador».
//
// Salen de `RUTAS` (lib/api-publica/openapi.ts), la especificación que ya cruza
// `openapi.test.ts` con `app/api/v1` en los dos sentidos: lo que se enseña aquí
// no puede inventar una ruta ni dejar una fuera. Puro y sin `@/`.

import { RUTAS } from '../api-publica/openapi.ts';
import { LEGAL } from '../legal-info.ts';

// El origen sale de `LEGAL.url`, la única fuente (lib/seo/paginas.test.ts prohíbe escribir el dominio a mano).
export const BASE_API = `${LEGAL.url}/api/v1`;

export interface EndpointApi {
  metodo: 'GET' | 'POST';
  ruta: string;
  resumen: string;
  /** El permiso que exige la clave (o el token) para llamarlo; `null` si basta estar autenticada. */
  scope: string | null;
  /** Obsoleto: no se enseña. */
  obsoleto: boolean;
  /** El recurso al que pertenece, para agrupar la lista. */
  grupo: string;
}

/** El grupo de cada ruta por su primer tramo. Una ruta nueva sin grupo falla en el test. */
const GRUPO_DE: Record<string, string> = {
  estudio: 'Tu estudio', estudios: 'Tu estudio',
  clientas: 'Clientes',
  reservas: 'Reservas',
  recibos: 'Cobros y facturas', facturas: 'Cobros y facturas', ventas: 'Cobros y facturas', devoluciones: 'Cobros y facturas',
  suscripciones: 'Planes y bonos', tarifas: 'Planes y bonos', planes: 'Planes y bonos',
  notas: 'Notas y tareas', tareas: 'Notas y tareas',
  eventos: 'Eventos',
};
export const ORDEN_GRUPOS = ['Tu estudio', 'Clientes', 'Reservas', 'Cobros y facturas', 'Planes y bonos', 'Notas y tareas', 'Eventos'] as const;

interface OperacionCruda { summary?: string; deprecated?: boolean; 'x-scope'?: string }

/** Todos los endpoints, en el orden de la especificación (GET antes que POST). */
export function endpointsDeLaApi(rutas: Record<string, unknown> = RUTAS): EndpointApi[] {
  const out: EndpointApi[] = [];
  for (const [ruta, ops] of Object.entries(rutas)) {
    for (const [m, op] of Object.entries(ops as Record<string, OperacionCruda>)) {
      if (m !== 'get' && m !== 'post') continue;
      out.push({
        metodo: m === 'get' ? 'GET' : 'POST',
        ruta,
        resumen: op.summary ?? ruta,
        scope: op['x-scope'] ?? null,
        obsoleto: !!op.deprecated,
        grupo: GRUPO_DE[ruta.split('/')[1]] ?? 'Otros',
      });
    }
  }
  return out;
}
