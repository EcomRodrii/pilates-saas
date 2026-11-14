// ─────────────────────────────────────────────────────────────────────────────
// Búsquedas del Centro de ayuda que no dieron ningún resultado: qué se busca y no se encuentra. Puro y sin `@/`.
//
// Decisión del fundador (14-nov-2026): guardarlas ANONIMIZADAS durante 90 días, con su frecuencia. Anonimizar aquí es lo que lo hace
// defendible: quien teclea en un buscador puede pegar sin querer un correo, un teléfono o el nombre de una alumna. Por eso:
//  · no se guarda quién (ni usuario, ni estudio, ni IP: la tabla no tiene esas columnas);
//  · el servidor descarta lo que parece un dato personal (correo, enlace, número largo, frase larga) en vez de «limpiarlo», porque
//    una frase con un nombre dentro ya no es una búsqueda;
//  · se guarda normalizado (minúsculas, sin acentos), así «Bsport» y «bsport» cuentan juntas;
//  · el cliente solo avisa cuando la persona deja de teclear, nunca por cada letra.
// ─────────────────────────────────────────────────────────────────────────────

export const MIN_CARACTERES = 3;
export const MAX_CARACTERES = 60;
/** Una búsqueda de ayuda son pocas palabras. Más es una frase pegada, y una frase puede llevar nombres. */
export const MAX_PALABRAS = 6;

/** El término a guardar, o `null` si no se debe guardar nada. */
export function anonimizarTermino(bruto: unknown): string | null {
  if (typeof bruto !== 'string') return null;
  const t = bruto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  if (t.length < MIN_CARACTERES || t.length > MAX_CARACTERES) return null;
  // Correos, enlaces y usuarios: nunca.
  if (/[@]|https?:|www\.|\.(com|es|net|org|app|io)\b/.test(t)) return null;
  // Teléfonos, DNI/NIF, IBAN, importes largos: cualquier cosa con cinco o más cifras.
  if ((t.match(/\d/g) ?? []).length >= 5) return null;
  // Solo letras, cifras, espacios y guion: lo demás no es una búsqueda de ayuda.
  if (!/^[a-z0-9ñç ·\-]+$/.test(t)) return null;
  if (t.split(' ').length > MAX_PALABRAS) return null;
  return t;
}
