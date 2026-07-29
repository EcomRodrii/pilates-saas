// ─────────────────────────────────────────────────────────────────────────────
// Emparejar el plan que viene en el CSV con una tarifa del catálogo del estudio.
//
// El importador de membresías casa por NOMBRE. Eso funciona cuando el estudio
// llega vacío y crea sus tarifas copiando los nombres del software viejo — que
// es como se probó. Con un estudio que YA tiene su catálogo montado, no casa
// nada: Momence exporta "10 Class Pack" o "Monthly Unlimited", y en Tentare esa
// misma tarifa se llama "Bono 10 Reformer". Cada fila fallaba con «No existe el
// plan X en tu catálogo» y la dueña no tenía dónde decir «X es mi Y».
//
// Aquí vive la normalización canónica (una sola, ver abajo) y las dos funciones
// que necesita la pantalla de revisión: saber qué nombres no casan, y reescribir
// las filas con la tarifa elegida antes de mandarlas.
// ─────────────────────────────────────────────────────────────────────────────

const RE_DIACRITICOS = /[̀-ͯ]/g;

/**
 * Nombre de plan comparable.
 *
 * Minúsculas, sin acentos, sin espacios de sobra — incluidos los INTERIORES.
 * Un doble espacio de un copy-paste ("Bono  10") no debería impedir que case
 * con "Bono 10", y hasta ahora lo impedía.
 *
 * ⚠️ Esta es la ÚNICA definición. Antes había dos: el servidor quitaba
 * diacríticos (`suscripciones/import`) y el aviso previo de la pantalla de
 * revisión no (`clasificador`), así que el aviso llegaba a decir que "Bono
 * Sesiónes" no existía cuando el servidor sí lo iba a casar. Avisos que mienten
 * enseñan a ignorar los avisos.
 */
export function normalizarNombrePlan(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(RE_DIACRITICOS, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Una tarifa del catálogo, con lo justo para emparejar y pintar un desplegable. */
export interface TarifaCatalogo {
  id: string;
  nombre: string;
}

export interface PlanSinCasar {
  /** El nombre tal y como viene en el CSV, sin normalizar (es lo que se enseña). */
  nombre: string;
  /** Cuántas filas lo usan: sirve para ordenar por impacto. */
  filas: number;
}

/**
 * Nombres de plan del CSV que NO existen en el catálogo, con cuántas filas
 * arrastra cada uno. Ordenados por impacto: la dueña resuelve primero el que
 * le salva 300 filas, no el que le salva 2.
 *
 * `mapeo` son las decisiones ya tomadas; lo que ya está mapeado deja de contar
 * como pendiente.
 */
export function planesSinCasar(
  filas: { plan?: string | null }[],
  catalogo: TarifaCatalogo[],
  mapeo: Record<string, string> = {},
): PlanSinCasar[] {
  const conocidos = new Set(catalogo.map((t) => normalizarNombrePlan(t.nombre)));
  const cuenta = new Map<string, { nombre: string; filas: number }>();
  for (const f of filas) {
    const bruto = (f.plan ?? '').trim();
    if (!bruto) continue;
    const norm = normalizarNombrePlan(bruto);
    // `norm in mapeo`, no `mapeo[norm]`: "no importar" se guarda como '' y es
    // falsy, así que con la comprobación por valor un plan que la dueña YA ha
    // descartado seguía apareciendo como pendiente y el panel no se cerraba.
    if (conocidos.has(norm) || norm in mapeo) continue;
    const prev = cuenta.get(norm);
    if (prev) prev.filas++;
    else cuenta.set(norm, { nombre: bruto, filas: 1 });
  }
  return [...cuenta.values()].sort((a, b) => b.filas - a.filas || a.nombre.localeCompare(b.nombre));
}

/**
 * Reescribe el plan de cada fila con la tarifa elegida.
 *
 * El servidor sigue casando por nombre, así que basta con poner el nombre real
 * de la tarifa: no hace falta tocar la API ni inventar un formato nuevo. Las
 * filas cuyo plan se mapeó a `''` (la opción "no importar") se descartan aquí,
 * que es más honesto que mandarlas para que el servidor las rechace y salgan
 * como incidencias.
 */
export function aplicarMapeoPlanes<T extends { plan?: string | null }>(
  filas: T[],
  mapeo: Record<string, string>,
  catalogo: TarifaCatalogo[],
): T[] {
  if (Object.keys(mapeo).length === 0) return filas;
  const porId = new Map(catalogo.map((t) => [t.id, t.nombre]));
  const out: T[] = [];
  for (const f of filas) {
    const norm = normalizarNombrePlan((f.plan ?? '').trim());
    const elegido = mapeo[norm];
    if (elegido === undefined) { out.push(f); continue; }
    if (elegido === '') continue; // "no importar estas filas"
    const nombre = porId.get(elegido);
    out.push(nombre ? { ...f, plan: nombre } : f);
  }
  return out;
}
