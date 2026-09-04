// Sin imports ni `@/` (ver push-estado.ts).
//
// `fetchPublicStudioData` lanza ~20 consultas en paralelo y las consumía con
// `xRes.data ?? []`: una que fallara (Supabase saturado, un 504, una RLS
// cambiada) dejaba su parte VACÍA y el resto seguía — un horario sin clases,
// «Solo con bono» sin planes, una instructora sin nota — y, peor, ese catálogo
// mutilado se guardaba en `conCacheCatalogo` durante un minuto para todo el
// estudio. Un error visible y reintentable es mejor que un catálogo falso.

export interface ResultadoMin { error?: { message?: string | null } | null }

/** El primer fallo, con el nombre de su consulta; `null` si todas fueron bien. */
export function primerError(resultados: Array<ResultadoMin | null | undefined>, nombres: string[]): string | null {
  for (let i = 0; i < resultados.length; i++) {
    const r = resultados[i];
    if (r && r.error) return `${nombres[i] ?? `consulta ${i}`}: ${r.error.message || 'error sin mensaje'}`;
  }
  return null;
}
