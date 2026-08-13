// Qué bloque del editor es qué bloque del kit.
//
// El editor de Apariencia lista las secciones del Inicio con los ids del
// sistema viejo (`cabecera`, `proximaClase`…, ver `BLOQUES_SISTEMA_IDS`). El
// kit compone su Inicio con los suyos (`home-header`, `next-class`…, ver
// `home_blocks` en `themes/*/config.ts`). Son dos vocabularios para la misma
// pantalla, y hasta ahora nadie los cruzaba porque la previsualización del
// editor pintaba SIEMPRE el portal viejo — así que la propietaria editaba
// contra algo que sus socias ya no veían.
//
// ⚠️ Esta tabla NO es completa, y no puede serlo:
//
//   · Cuatro bloques del editor (`accesosRapidos`, `invitarAmiga`,
//     `progresoSemanal`, `retos`) no están en TODOS los temas del kit: cada
//     tema elige su composición. Por eso la pregunta útil no es «¿existe?»
//     sino «¿lo incluye ESTE tema?» — `elTemaIncluye`.
//   · Cinco del kit (`streak-pill`, `pass-card`, `bookings-list`,
//     `videos-cta`, `studio-quote`) no tienen ninguna sección equivalente en
//     el editor. No se inventa una: seleccionarlos no llevaría a ningún sitio.
//     ⚠️ `studio-quote` es la CITA del tema, firmada por el estudio, y se
//     parece a `contenidoEstudio` sin serlo: esa sección del editor es
//     «Mensaje destacado y banners», lo que escribe la propietaria, y eso en
//     el kit es `studio-banner`. Casarlos habría hecho que tocar su banner
//     resaltara una cita que ella no escribe.
//
// Y lo de fondo, que esta tabla no arregla: **con el kit, el orden del Inicio
// lo decide el TEMA** (`home_blocks`), no el estudio. Reordenar u ocultar
// desde el rail no mueve nada en un estudio con el kit encendido.

/** editor → kit. Solo los que de verdad pintan lo mismo. */
export const BLOQUE_EDITOR_A_KIT: Readonly<Record<string, string>> = {
  cabecera: 'home-header',
  proximaClase: 'next-class',
  estaSemana: 'today-timeline',
  tiraSemana: 'week-strip',
  contenidoEstudio: 'studio-banner',
  accesosRapidos: 'quick-links',
  progresoSemanal: 'weekly-progress',
  retos: 'challenges',
};

/** kit → editor. Lo que no está aquí no es seleccionable desde el editor. */
export const BLOQUE_KIT_A_EDITOR: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(BLOQUE_EDITOR_A_KIT).map(([editor, kit]) => [kit, editor]),
);

/**
 * ¿Pinta este tema del kit la sección que el rail llama `idEditor`?
 *
 * `false` para lo que el tema no compone, y también para lo que no tiene
 * equivalente: en los dos casos el rail estaría enseñando una sección que en
 * la previsualización no aparece, que es la mentira que esto viene a quitar.
 */
export function elTemaIncluye(idEditor: string, homeBlocks: readonly string[]): boolean {
  const kit = BLOQUE_EDITOR_A_KIT[idEditor];
  return kit !== undefined && homeBlocks.includes(kit);
}

/**
 * El orden del Inicio que pinta el kit, decidido por el ESTUDIO.
 *
 * ⚠️ Hasta ahora lo decidía el tema y punto (`home_blocks` en su `config.ts`),
 * así que el rail de Secciones enseñaba agarradera y ojo que no movían nada: la
 * propietaria reordenaba y su portal se quedaba igual. Decisión del fundador
 * (2026-08-14): manda el estudio, como en Shopify — el tema trae el orden por
 * DEFECTO y ella lo cambia.
 *
 * Reglas, y las tres importan:
 *
 *  · **Sin bloques guardados, manda el tema.** Es el caso de los 13 estudios
 *    hoy, así que nadie ve un cambio hasta que toca algo.
 *  · **Un bloque oculto no se pinta**, que es la mitad más pedida de esto.
 *  · **Lo que el estudio guarda pero el tema no sabe pintar se IGNORA**, no se
 *    cuela como hueco: los 10 bloques del catálogo (`texto`, `galeria`…) no
 *    tienen renderizador en el kit todavía. El rail los marca aparte — pintar
 *    un hueco vacío sería peor que no pintar nada.
 *  · **Lo que el tema compone y el estudio no guarda va al FINAL**, no se
 *    pierde: si mañana un tema añade una sección, aparece en vez de
 *    desaparecer por no estar en una lista guardada hace meses. Mismo criterio
 *    que `aplicarLayout` con la home del panel.
 */
export function ordenDelInicio(
  homeBlocks: readonly string[],
  guardados: readonly { kind: string; sistemaId?: string; oculto?: boolean }[] | undefined,
): string[] {
  if (!guardados?.length) return [...homeBlocks];

  const componeElTema = new Set(homeBlocks);
  const pedidos: string[] = [];
  const vistos = new Set<string>();
  for (const b of guardados) {
    if (b.kind !== 'sistema' || !b.sistemaId || b.oculto) continue;
    const kit = BLOQUE_EDITOR_A_KIT[b.sistemaId];
    if (!kit || !componeElTema.has(kit) || vistos.has(kit)) continue;
    vistos.add(kit);
    pedidos.push(kit);
  }

  // Los que el tema trae y el estudio no ha ordenado nunca, detrás y en el
  // orden del tema. ⚠️ Salvo que los haya OCULTADO a propósito: eso sí lo dijo.
  const ocultados = new Set(
    guardados
      .filter((b) => b.kind === 'sistema' && b.oculto && b.sistemaId)
      .map((b) => BLOQUE_EDITOR_A_KIT[b.sistemaId as string])
      .filter(Boolean),
  );
  for (const kit of homeBlocks) {
    if (!vistos.has(kit) && !ocultados.has(kit)) pedidos.push(kit);
  }
  return pedidos;
}
