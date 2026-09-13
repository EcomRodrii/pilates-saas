// «¿Primera vez aquí?» — en qué sección sale la tira y cuándo deja de salir.
// Es la parte pura de components/guia/primera-vez-aqui.tsx, aparte para poder
// probarla sin montar el componente.

/**
 * Sección del panel → capítulo que la explica.
 *
 * Deliberadamente corto: solo las pantallas donde una propietaria nueva se
 * queda mirando sin saber qué hacer. Añadir aquí las treinta y pico rutas
 * convertiría la ayuda en ruido y la primera en cerrarse para siempre sería
 * justamente la útil.
 */
export const CAPITULO_POR_SECCION: Record<string, string> = {
  '/calendario': 'tu-horario',
  '/cobros': 'cobrar',
  '/clientas': 'tus-alumnas',
  '/equipo': 'tu-equipo',
  '/automatizaciones': 'que-trabaje-solo',
  '/informes': 'entiende-tu-negocio',
  '/sustituciones': 'tu-equipo',
  '/migracion': 'tus-alumnas',
};

/**
 * Cuántas tiras cerradas bastan para dejar de enseñarla en TODAS.
 *
 * Con un cierre por sección, una propietaria nueva que recorre el panel se
 * encontraba la misma tira en ocho pantallas seguidas y tenía que cerrarla
 * ocho veces (evaluación del 13-sep). Cerrarla dos veces ya es una respuesta:
 * sabe que la guía existe y dónde está.
 */
export const CIERRES_PARA_OCULTAR_TODAS = 2;

/** La sección cuya tira toca enseñar en `pathname`, o `null` si ninguna. */
export function seccionConAyuda(pathname: string, cerradas: readonly string[]): string | null {
  if (new Set(cerradas).size >= CIERRES_PARA_OCULTAR_TODAS) return null;
  // Coincidencia por sección, no por ruta exacta: `/clientas/abc` sigue siendo
  // Clientas. Se ordena de más larga a más corta para que un prefijo corto no
  // le robe la coincidencia a uno más específico si algún día se añade.
  const seccion = Object.keys(CAPITULO_POR_SECCION)
    .sort((a, b) => b.length - a.length)
    .find(s => pathname === s || pathname.startsWith(`${s}/`));
  if (!seccion || cerradas.includes(seccion)) return null;
  return seccion;
}
