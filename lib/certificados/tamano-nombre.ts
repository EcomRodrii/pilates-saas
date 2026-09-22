// Tamaño de letra del nombre del estudio en el certificado: de «PILATES BCN»
// a «CENTRO INTEGRAL DE PILATES Y MOVIMIENTO» sin salirse del área, sin
// solaparse con el resto y centrado en 1 o 2 líneas. Pura, sin imports — la
// ejecuta `node --test` directamente.
export function tamanoNombreCertificado(nombre: string): number {
  const len = nombre.trim().length;
  if (len <= 16) return 76;
  if (len <= 28) return 58;
  if (len <= 45) return 44;
  return 32;
}
