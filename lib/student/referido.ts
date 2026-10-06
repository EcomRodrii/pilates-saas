// Quién invitó a quién. Sin imports ni `@/`: `node --test
// --experimental-strip-types` no resuelve ese alias, y un test que lo use no
// falla — deja de ejecutarse.

/**
 * ¿Es utilizable este referidor para ESTA alta?
 *
 * ⚠️ La comprobación de verdad la hace el servidor contra la base (misma
 * socia, mismo estudio). Esto es solo la parte que se puede decidir sin
 * consultar nada, y existe para no mandar basura: `socios.referido_por` tiene
 * clave foránea a `socios(id)`, así que un valor inventado NO se ignora — hace
 * fallar el INSERT y deja a la invitada sin poder darse de alta. Un enlace
 * manipulado no puede costarle la cuenta a quien lo abre.
 */
export function referidorUtilizable(ref: string | null | undefined, yo: string | null | undefined): boolean {
  const r = (ref ?? '').trim();
  if (!r) return false;
  // Nadie se invita a sí misma: sería un crédito por darse de alta.
  if (yo && r === yo) return false;
  // Forma de id. No prueba que exista —eso es cosa del servidor— pero descarta
  // lo que seguro que no lo es: espacios, barras, comillas, etiquetas.
  //
  // ⚠️ SIN longitud mínima. La primera versión exigía 6 caracteres y rechazaba
  // `soc-2`, un id perfectamente válido: `socios.id` es `text` en el esquema,
  // así que su formato no lo decide esta app. Inventarle un mínimo era añadir
  // una regla que no me toca y que rompería altas legítimas.
  return r.length <= 64 && /^[0-9a-zA-Z_-]+$/.test(r);
}

/**
 * Quién invitó a esta alta en la página pública del estudio. Manda `refValido` (el camino de `?ref=`, que no se toca),
 * luego `?invita=` (el enlace de «Compartir esta clase», P04) y por último lo que se guardó antes de ir al correo o a
 * Google (`st_ref_<slug>`, misma pestaña). Todo pasa por `referidorUtilizable`: ni basura que rompa la clave foránea, ni
 * invitarse a sí misma. La comprobación de verdad (misma ficha, MISMO estudio) la hace el servidor al dar de alta, que
 * descarta en silencio lo que no cuadre: el alta nunca depende de que el enlace estuviera bien.
 */
export function referidorDeAlta({ refValido, invitaUrl, guardado, nuevoId }: {
  refValido: string | null | undefined;
  invitaUrl: string | null | undefined;
  guardado: string | null | undefined;
  nuevoId: string | null | undefined;
}): string | null {
  for (const candidato of [refValido, invitaUrl, guardado]) {
    if (referidorUtilizable(candidato, nuevoId)) return (candidato as string).trim();
  }
  return null;
}

/** El enlace que la socia comparte. */
export function enlaceInvitacion(origen: string, slug: string, socioId: string): string {
  const base = origen.replace(/\/$/, '');
  return `${base}/portal/${encodeURIComponent(slug)}/acceso/registro?ref=${encodeURIComponent(socioId)}`;
}

/** La frase de la invitación, sin el enlace (la hoja de compartir lo lleva aparte). */
export function fraseInvitacion(estudio: string): string {
  return `Te invito a probar ${estudio}. Entra desde aquí y nos vemos en clase:`;
}

/** El texto que se comparte con el enlace. */
export function textoInvitacion(estudio: string, enlace: string): string {
  return `${fraseInvitacion(estudio)}\n${enlace}`;
}
