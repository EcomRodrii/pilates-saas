// Community & Messaging OS — cómo se arma el resumen de cada fila de la
// bandeja (último mensaje + estado de lectura) a partir de lo que ya hay en la
// base. Puro: entra lo que devolvió la consulta, sale lo que va en el JSON.
//
// ⚠️ El truco del "último mensaje de cada conversación en UNA sola consulta":
// el trigger `trg_actualizar_ultimo_mensaje` (migr 20260825175412) escribe
// `conversaciones.ultimo_mensaje_en = mensajes.creado_en` TAL CUAL, sin
// redondear. Así que el último mensaje de una conversación es, por
// construcción, el que tiene ese instante exacto — y basta filtrar
// `conversacion_id in (…) and creado_en in (…)` para traer una fila por
// conversación, sin `distinct on`, sin vista nueva y sin N+1. Si algún día ese
// trigger dejara de copiar el instante exacto, esto devolvería previsualización
// vacía (nunca la equivocada): degrada, no miente.

import type { ResumenConversacion } from './presentacion.ts';

export interface FilaUltimoMensaje {
  conversacion_id: string;
  cuerpo: string;
  remitente_auth_user_id: string;
  creado_en: string;
}

export interface FilaLectura {
  conversacion_id: string;
  auth_user_id: string;
  leido_hasta: string;
}

/** Los instantes por los que filtrar `mensajes.creado_en`, sin repetidos. */
export function instantesUltimoMensaje(conversaciones: { ultimo_mensaje_en: string }[]): string[] {
  return Array.from(new Set(conversaciones.map(c => c.ultimo_mensaje_en)));
}

export function resumirConversaciones<T extends { id: string; ultimo_mensaje_en: string }>(
  conversaciones: T[],
  ultimos: FilaUltimoMensaje[],
  lecturas: FilaLectura[],
  miAuthUserId: string,
): (T & ResumenConversacion)[] {
  const ultimoPorConversacion = new Map<string, FilaUltimoMensaje>();
  for (const m of ultimos) {
    const previo = ultimoPorConversacion.get(m.conversacion_id);
    if (!previo || previo.creado_en < m.creado_en) ultimoPorConversacion.set(m.conversacion_id, m);
  }

  const mio = new Map<string, string>();
  const otros = new Map<string, string>();
  for (const l of lecturas) {
    if (l.auth_user_id === miAuthUserId) {
      mio.set(l.conversacion_id, l.leido_hasta);
    } else {
      // El más ATRASADO de los demás: en un canal de equipo, "lo han leído"
      // solo es cierto cuando lo ha leído todo el mundo. En un 1:1 (el caso
      // normal) hay una sola fila y el mínimo es esa.
      const previo = otros.get(l.conversacion_id);
      if (!previo || l.leido_hasta < previo) otros.set(l.conversacion_id, l.leido_hasta);
    }
  }

  return conversaciones.map(c => {
    const ultimo = ultimoPorConversacion.get(c.id);
    return {
      ...c,
      leido_hasta: mio.get(c.id) ?? null,
      leido_hasta_otros: otros.get(c.id) ?? null,
      ultimo_cuerpo: ultimo?.cuerpo ?? null,
      ultimo_remitente_auth_user_id: ultimo?.remitente_auth_user_id ?? null,
    };
  });
}
