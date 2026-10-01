// La forma pública de un evento: el cuerpo de cada webhook y cada elemento de
// `GET /api/v1/eventos`. Igual en los dos sitios a propósito: quien empieza
// leyendo el registro y pasa a webhooks (o al revés) no cambia de parser.

import {
  COLUMNAS, clientaPublica, devolucionPublica, facturaPublica, reciboPublico, reservaPublica, suscripcionPublica, ventaPublica,
} from '../serializar.ts';
import type { RecursoEvento } from './catalogo.ts';

export const VERSION_EVENTOS = 'v1';

export interface FilaEvento {
  id: string;
  tipo: string;
  recurso: string;
  recurso_id: string;
  studio_id: string;
  creado_en: string;
  datos: unknown;
}

export function eventoPublico(f: FilaEvento) {
  return {
    id: f.id,
    tipo: f.tipo,
    creadoEn: f.creado_en,
    estudioId: f.studio_id,
    recurso: f.recurso,
    recursoId: f.recurso_id,
    version: VERSION_EVENTOS,
    // El recurso tal y como estaba al procesar el evento (segundos después de
    // que ocurriera). `null` si ya no existía (o el evento es un «eliminado»).
    datos: (f.datos ?? null) as Record<string, unknown> | null,
  };
}

/**
 * Qué se lee de cada tabla para escribir `datos`: las columnas públicas de la
 * API más `studio_id`, para comprobar que la fila es del estudio del evento.
 */
export const COLUMNAS_EVENTO: Record<RecursoEvento, string> = {
  recibo: `${COLUMNAS.recibo}, studio_id`,
  factura: `${COLUMNAS.factura}, studio_id`,
  devolucion: `${COLUMNAS.devolucion}, studio_id`,
  venta: `${COLUMNAS.venta}, studio_id`,
  // Sin NIF ni dirección: el evento lo recibe cualquier webhook o credencial
  // con `clientas:leer`. Los datos fiscales se piden con GET /clientas.
  clienta: `${COLUMNAS.clienta}, studio_id`,
  reserva: `${COLUMNAS.reserva}, studio_id`,
  suscripcion: `${COLUMNAS.suscripcion}, studio_id`,
};

export function serializarRecurso(recurso: RecursoEvento, fila: Record<string, unknown>): Record<string, unknown> {
  switch (recurso) {
    case 'recibo': return reciboPublico(fila);
    case 'factura': return facturaPublica(fila);
    case 'devolucion': return devolucionPublica(fila);
    case 'venta': return ventaPublica(fila);
    case 'clienta': return clientaPublica(fila, false);
    case 'reserva': return reservaPublica(fila);
    case 'suscripcion': return suscripcionPublica(fila);
  }
}

// ── Cursor de `GET /api/v1/eventos` ──────────────────────────────────────────
// Opaco para el integrador, como el de los listados, pero sobre `publicado`
// (el orden en que se confirmaron): base64url de `e:<n>`. Validado al leerlo: un cursor tocado es
// un 400, nunca una consulta con un valor arbitrario.

export function codificarCursorEventos(publicado: number): string {
  return Buffer.from(`e:${publicado}`, 'utf8').toString('base64url');
}

export function decodificarCursorEventos(texto: string | null | undefined): number | null | 'invalido' {
  if (!texto) return null;
  if (texto.length > 40) return 'invalido';
  const claro = Buffer.from(texto, 'base64url').toString('utf8');
  const m = /^e:(\d{1,15})$/.exec(claro);
  return m ? Number(m[1]) : 'invalido';
}
