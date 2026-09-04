// Traducción de los deep links del portal borrado al árbol nuevo.
//
// ⚠️ Vive en su propio módulo, SIN un solo import, por una razón concreta: el
// runner de tests es `node --test --experimental-strip-types` y NO resuelve el
// alias `@/`. Un test que importe un módulo con `@/` no falla: **no se ejecuta
// en absoluto**, y `npm test` reporta menos casos sin marcar ninguno en rojo —
// que es la peor forma de perder cobertura, porque parece verde.
//
// Aquí solo hay una función pura sobre cadenas, así que puede probarse.

/**
 * Reescribe los deep links viejos al árbol nuevo.
 *
 * ⚠️ El enlace se calcula al INSERTAR y se persiste en `notification.deep_link`,
 * así que las filas ya emitidas en producción llevan rutas del portal borrado
 * —18 formas distintas— y no se arreglan reescribiendo el catálogo. Se traducen
 * aquí, al leerlas, que es lo único que alcanza a lo ya emitido.
 *
 * Lo que no se sabe traducir se deja SIN enlace en vez de mandar a una ruta
 * inventada: una notificación que no lleva a ninguna parte es mejor que una que
 * lleva al sitio equivocado.
 */
export function traducirEnlace(enlace: string | null | undefined, slug: string): string | undefined {
  if (!enlace) return undefined;
  const base = `/portal/${encodeURIComponent(slug)}`;

  // Ya está en el árbol nuevo.
  if (/^\/portal\/[^/]+\/(reservar|mis-reservas|bonos|pagos|notificaciones|perfil|ayuda|calendario)(\/|\?|$)/.test(enlace)) {
    return enlace;
  }

  const m = enlace.match(/^\/portal\/[^/]+\/(.*)$/);
  if (!m) return undefined; // ruta de staff u otra cosa: no es de esta app
  const resto = m[1];

  if (resto.startsWith('clases/')) return `${base}/reservar/${resto.slice('clases/'.length)}`;
  if (resto === 'clases') return `${base}/reservar`;
  if (resto.startsWith('reservas')) return `${base}/mis-reservas`;
  if (resto.startsWith('compras')) return `${base}/pagos`;
  if (resto.startsWith('notificaciones')) return `${base}/notificaciones`;
  if (resto.startsWith('bonos')) return `${base}/bonos`;
  // `comunidad`, `mensajes`, `instructores`… no tienen pantalla todavía.
  return undefined;
}

