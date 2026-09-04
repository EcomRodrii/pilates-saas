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


// ─── Rutas del portal ANTERIOR que llegan por el catch-all ──────────────────
// (`app/portal/[slug]/[...resto]/route.ts`). Vive aquí, y no en la propia
// ruta, por dos motivos: es la misma traducción que `traducirEnlace` —vieja
// URL → árbol nuevo— y un `route.ts` de Next no puede exportar nada que no sea
// un verbo HTTP, así que allí no habría forma de probarla.

const MAPA_PORTAL_VIEJO: Record<string, string> = {
  // El portal separaba comprar (`/compras`) de consultar el saldo (`/bonos`).
  // El diseño nuevo lo llama pagos: es donde está el historial y el recibo.
  compras: '/pagos',
  // El horario y la ficha de clase cambiaron de nombre.
  clases: '/reservar',
  // Listado de reservas.
  reservas: '/mis-reservas',
  // Las tres puertas viejas caen en la puerta única del diseño.
  login: '/acceso/login',
  acceso: '/acceso/login',
  'clave-nueva': '/acceso/verificar',
  // Sin equivalente todavía: se manda al inicio, que es un destino honesto.
  instructores: '',
  comunidad: '',
  mensajes: '',
};

// ⚠️ REENTRADA. Solo estas tres llevan a una pantalla del árbol nuevo que
// admite un segmento más (`/reservar/[claseId]`, `/mis-reservas/[reservaId]`,
// `/pagos/[pagoId]`): son las únicas en las que la cola significa algo.
//
// Arrastrar la cola SIEMPRE era un bucle infinito de 308: el destino de
// `acceso`/`login`/`clave-nueva` empieza por el segmento `acceso`, que a su vez
// es clave de este mapa, así que `/portal/x/acceso/entrar` redirigía a
// `/portal/x/acceso/login/entrar`, que volvía a entrar por aquí y crecía en
// cada salto hasta ERR_TOO_MANY_REDIRECTS — y con 308, permanente, el
// navegador se lo quedaba cacheado. Los casos sin cola nunca fallaron, que es
// por lo que pasó desapercibido.
//
// Ninguno de los tres destinos de aquí abajo (`reservar`, `mis-reservas`,
// `pagos`) es clave del mapa, así que la traducción no puede reentrar.
const ADMITEN_COLA: ReadonlySet<string> = new Set(['clases', 'reservas', 'compras']);

/**
 * Destino en el árbol nuevo para una ruta del portal viejo, SIN el prefijo
 * `/portal/<slug>` y sin query. `null` = no la reconocemos.
 *
 * `''` es un destino válido y distinto de `null`: significa «la conocemos y no
 * tiene pantalla todavía» (`comunidad`, `mensajes`, `instructores`) → el inicio
 * del estudio.
 */
export function destinoPortalViejo(resto: string[] | undefined): string | null {
  const [primero, ...cola] = resto ?? [];
  const destino = MAPA_PORTAL_VIEJO[primero ?? ''];
  if (destino === undefined) return null;
  if (cola.length === 0 || !ADMITEN_COLA.has(primero as string)) return destino;
  return destino + '/' + cola.map(encodeURIComponent).join('/');
}
