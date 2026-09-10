// El eje de euros del gráfico de ingresos (/informes), en su parte pura — misma
// separación que `ventas-por-tipo.ts`: la pantalla dibuja, esto decide qué
// números pone, y así se puede probar sin navegador.

/**
 * Etiqueta corta de una cantidad, para el eje y el tooltip.
 *
 * ⚠️ En español el punto es el separador de MILES. Con `toFixed(1)` esto
 * escribía «1.5k €» en la misma pantalla en la que la tarjeta de arriba pone
 * «1.500,00 €» — y «1.5k» se lee como mil quinientos mil, no como mil
 * quinientos. Va en es-ES, igual que el resto de cifras de la pantalla.
 */
export function etiquetaEuros(v: number): string {
  if (v >= 1000) return `${(v / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })}k €`;
  return `${v.toLocaleString('es-ES', { maximumFractionDigits: 0 })} €`;
}

/**
 * Hasta dónde llega el eje.
 *
 * ⚠️ El suelo va POR MARCA, no en total. Con un suelo de 1 € repartido entre
 * cuatro marcas, un periodo sin cobros salía rotulado
 * «1 €, 1 €, 1 €, 0 €, 0 €» —tres marcas distintas con el mismo número—
 * porque las etiquetas son euros enteros y el paso era de 0,25 €. Con un euro
 * por marca el paso nunca baja de 1, y dos etiquetas seguidas no pueden
 * coincidir al redondear.
 */
export function techoDelEje(valores: number[], nMarcas: number): number {
  return Math.max(...valores, nMarcas);
}

/** Los valores de las marcas del eje, de abajo (0) a arriba (el techo). */
export function marcasDelEje(techo: number, nMarcas: number): number[] {
  return Array.from({ length: nMarcas + 1 }, (_, i) => (techo / nMarcas) * i);
}
