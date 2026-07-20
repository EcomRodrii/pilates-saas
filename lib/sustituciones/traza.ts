// Traza de lo que el motor ha hecho por su cuenta: a quién avisó, por qué canal,
// cuándo, y qué contestó. Puro y testeable — sin I/O.
//
// Por qué existe: el módulo promete "puedes desconectar, esto se resuelve solo".
// Pedirle eso a alguien y no enseñarle qué ha pasado es pedirle un acto de fe.
// Hasta ahora la tabla `sustitucion_contactos` era de SOLO ESCRITURA: se
// registraba cada intento y no había una sola pantalla que lo leyera. La
// propietaria veía "Contactando" y nada más — así que cogía el teléfono para
// comprobarlo, que es justo el reflejo que el módulo quiere quitar.

export type CanalContacto = 'email' | 'whatsapp' | 'sms' | 'llamada' | 'push';

export type EstadoContacto =
  | 'enviado' | 'fallido' | 'leido' | 'aceptado' | 'rechazado' | 'expirado' | 'invalidado';

export interface ContactoFila {
  instructor_id: string;
  canal: string;
  estado: string;
  enviado_en: string | null;
  respondido_en: string | null;
}

export type TipoEvento = 'envio' | 'aceptado' | 'rechazado' | 'fallo';

export interface EventoTraza {
  /** ISO del instante en que pasó. Se usa para ordenar y para pintar la hora. */
  en: string;
  texto: string;
  tipo: TipoEvento;
}

const ETIQUETA_CANAL: Record<string, string> = {
  email: 'Email',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  llamada: 'Llamada',
  push: 'Notificación',
};

// Solo el primer nombre: la traza se lee de un vistazo, y "Ana María Ruiz Pérez"
// en cada línea la vuelve ilegible en móvil.
function primerNombre(n: string): string {
  return n.split(' ')[0] || n;
}

/**
 * Convierte las filas crudas de `sustitucion_contactos` en una lista de eventos
 * en lenguaje humano, ordenada del más antiguo al más reciente.
 *
 * Una fila puede generar DOS eventos: el envío y, si contestó, la respuesta.
 * Así la propietaria ve la conversación entera ("le escribimos a las 18:04, nos
 * dijo que no a las 18:12") en vez de solo el estado final.
 *
 * `nombres` mapea instructor_id → nombre. Si falta uno (instructora borrada),
 * se degrada a un genérico en vez de romper o imprimir un id.
 */
export function construirTraza(
  contactos: ContactoFila[],
  nombres: Record<string, string>,
): EventoTraza[] {
  const eventos: EventoTraza[] = [];

  for (const c of contactos) {
    // El acortado solo se aplica a nombres reales: el genérico ya viene listo
    // (si no, "la instructora" se quedaría en "la").
    const nombre = nombres[c.instructor_id];
    const quien = nombre ? primerNombre(nombre) : 'la instructora';
    const canal = ETIQUETA_CANAL[c.canal] ?? 'Aviso';

    // 1) El envío. 'fallido' se cuenta como envío fallido, no se oculta: si el
    //    WhatsApp no salió, la propietaria tiene que saberlo — puede ser la
    //    diferencia entre esperar tranquila y coger el teléfono a tiempo.
    if (c.enviado_en) {
      eventos.push(
        c.estado === 'fallido'
          ? { en: c.enviado_en, texto: `No se pudo enviar el ${canal.toLowerCase()} a ${quien}`, tipo: 'fallo' }
          : { en: c.enviado_en, texto: `${canal} a ${quien}`, tipo: 'envio' },
      );
    }

    // 2) La respuesta, si la hubo. Sin `respondido_en` no inventamos una hora:
    //    preferimos no pintar el evento a pintarlo con la hora equivocada.
    if (c.respondido_en) {
      if (c.estado === 'aceptado') {
        eventos.push({ en: c.respondido_en, texto: `${quien} acepta cubrir la clase`, tipo: 'aceptado' });
      } else if (c.estado === 'rechazado') {
        eventos.push({ en: c.respondido_en, texto: `${quien} no puede`, tipo: 'rechazado' });
      }
    }
  }

  return eventos.sort((a, b) => new Date(a.en).getTime() - new Date(b.en).getTime());
}

/**
 * Resumen de una línea para la cabecera de la card ("3 avisos · última respuesta
 * hace un rato"). Devuelve null si no hay nada que contar todavía.
 */
export function resumenTraza(eventos: EventoTraza[]): string | null {
  if (eventos.length === 0) return null;
  const envios = eventos.filter((e) => e.tipo === 'envio').length;
  const fallos = eventos.filter((e) => e.tipo === 'fallo').length;
  const partes: string[] = [];
  if (envios > 0) partes.push(`${envios} ${envios === 1 ? 'aviso enviado' : 'avisos enviados'}`);
  if (fallos > 0) partes.push(`${fallos} sin salir`);
  const respuestas = eventos.filter((e) => e.tipo === 'aceptado' || e.tipo === 'rechazado').length;
  if (respuestas > 0) partes.push(`${respuestas} ${respuestas === 1 ? 'respuesta' : 'respuestas'}`);
  return partes.length > 0 ? partes.join(' · ') : null;
}
