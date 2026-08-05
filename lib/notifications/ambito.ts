// ─────────────────────────────────────────────────────────────────────────────
// Ámbito del centro de notificaciones — qué subconjunto de SUS avisos pide
// quien llama.
//
// ⚠️ `ambito` NO es una frontera de autorización, es un filtro de vista. La
// frontera es `recipient_user_id = <uid del JWT>`, que se aplica siempre y
// aparte. Por eso el `studioId` que manda el cliente no hace falta validarlo:
// solo puede ESTRECHAR un conjunto que ya es suyo — mandar el de otro estudio
// devuelve cero filas, nunca filas ajenas. (Distinto de
// `app/api/public/favoritos`, donde el studioId del cliente CONCEDE alcance
// porque se escribe una fila nueva con él, y ahí sí se valida.)
// Si algún día este endpoint dejara de exigir `recipient_user_id = auth.uid()`,
// validar el studioId pasa a ser obligatorio.
//
// Existe porque una misma persona puede ser staff Y socia del mismo estudio con
// la MISMA cuenta (en prod hay una: 29 avisos, PROPIETARIO y SOCIA a la vez).
// Sin esto, abrir el portal le enseñaba los avisos de su panel —incluido el
// mensaje del Umbral, categoría `decisiones`— y el "marcar todo leído" de esa
// bandeja se los borraba de la campana del panel. No hay nada en la petición de
// lo que derivar cuál de las dos superficies llama: tiene que decirlo.
// ─────────────────────────────────────────────────────────────────────────────

export type Ambito = 'socia' | 'staff';

/** Predicados extra a aplicar sobre la query, ADEMÁS de `recipient_user_id`. */
export interface FiltroAmbito {
  /** Igualdad sobre `studio_id`. `null` = sin filtrar por estudio. */
  studioId: string | null;
  /** Rol exacto que hay que exigir. `null` = no se exige ninguno. */
  rolIgual: 'SOCIA' | null;
  /** Rol que hay que EXCLUIR. `null` = no se excluye ninguno. */
  rolDistinto: 'SOCIA' | null;
}

/**
 * Traduce el ámbito pedido a predicados.
 *
 * - `socia`: los avisos de ESA socia en ESE estudio. Filtra por estudio porque
 *   aquí el cruce sí sería entre dos inquilinos (dos portales white-label
 *   distintos) si alguien tuviera cuenta en varios.
 * - `staff`: todo lo que no sea de socia, SIN filtrar por estudio — para el
 *   staff los avisos de otra sede son suyos, no de otro inquilino, y acotarlos
 *   a la sede activa escondería un `pago.fallido` de la sede B mientras miras
 *   la A. Se excluye SOCIA por complemento en vez de listar los roles de staff:
 *   el dominio ya se ha ampliado dos veces (RECEPCION en 0102, MANAGER en 0113)
 *   y con una allowlist un rol nuevo desaparecería de la campana en silencio.
 *   Un `eq(rolActual)` tampoco vale: rompería el histórico de quien cambió de
 *   rol, porque cada fila guarda el rol del momento en que se emitió.
 */
export function filtroDeAmbito(ambito: Ambito, studioId: string | null): FiltroAmbito {
  if (ambito === 'socia') {
    return { studioId, rolIgual: 'SOCIA', rolDistinto: null };
  }
  return { studioId: null, rolIgual: null, rolDistinto: 'SOCIA' };
}

/**
 * Ámbito de una petición que no lo trae (cliente viejo: pestaña de la PWA
 * resumida desde bfcache, que puede seguir viva días).
 *
 * No se falla cerrado a propósito: `fetchNotificaciones` convierte cualquier
 * `!res.ok` en `{items: [], unread: 0}`, así que un 400 no se vería como error
 * sino como "estás al día" — justo la mentira que el resto de este cambio evita.
 * Derivarlo de si resuelve sesión de staff acierta con la socia normal y con el
 * panel, que es toda la población menos una.
 *
 * ⚠️ Para la persona que es staff Y socia queda algo PEOR que antes, no igual:
 * `verificarSesionStaff` resuelve aunque el token venga del portal (otro
 * storageKey, mismo `user.id`), así que su pestaña vieja del portal cae en
 * ámbito staff — sigue viendo ahí los avisos del panel Y su `read-all` deja sin
 * leer los suyos de socia, con lo que esa campana ya no baja. Dura hasta que
 * recargue. Se acepta a conciencia: es una cuenta, la alternativa (mirar
 * `Referer`) es frágil, y fallar cerrado es peor para todos los demás.
 */
export function ambitoDeCompatibilidad(esStaff: boolean): Ambito {
  return esStaff ? 'staff' : 'socia';
}

/** Valida lo que llega por query/body. Cualquier otra cosa es `null`. */
export function parsearAmbito(valor: unknown): Ambito | null {
  return valor === 'socia' || valor === 'staff' ? valor : null;
}
