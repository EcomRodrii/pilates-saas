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
//   · Los cinco que solo pintaba el kit (`streak-pill`, `pass-card`,
//     `bookings-list`, `videos-cta`, `studio-quote`) YA tienen ficha en el
//     editor desde el 2026-08-14, así que se listan, se ordenan y se ocultan.
//     Sus fichas van con `campos: []`: su contenido no lo escribe la
//     propietaria —son datos de la socia— y un panel de edición ahí prometería
//     algo que no hay.
//     ⚠️ `studio-quote` (`citaEstudio`) es la CITA del tema y se parece a
//     `contenidoEstudio` sin serlo: esa otra es «Mensaje destacado y banners»,
//     lo que ella escribe, y en el kit es `studio-banner`. Casarlas habría
//     hecho que tocar su banner resaltara una cita que no es suya.
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
  // Los cinco que solo existen en el kit (fichas de editor añadidas el
  // 2026-08-14 para que se puedan ordenar y ocultar).
  racha: 'streak-pill',
  tarjetaBono: 'pass-card',
  misReservas: 'bookings-list',
  videosEnCasa: 'videos-cta',
  citaEstudio: 'studio-quote',
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
  guardados: readonly { kind: string; sistemaId?: string; oculto?: boolean; fijo?: boolean }[] | undefined,
): string[] {
  if (!guardados?.length) return [...homeBlocks];

  // ⚠️ `fijo` gana a `oculto`. Medido en producción (cadena de `tentare`,
  // 2026-08-14): `cabecera` llegaba con las DOS marcas a la vez —
  // `{ fijo: true, oculto: true }`— y esa combinación es real, no un dato
  // corrupto. En el portal de siempre es inofensiva: el editor separa los
  // bloques `fijo` de la lista arrastrable y los pinta SIEMPRE («el saludo y
  // la tarjeta grande... no se mueven ni se ocultan», `portal-bloques-editor.
  // tsx`), así que su `oculto` nunca se ha mirado — probablemente quedó de
  // antes de que ese bloque se volviera fijo. `ordenDelInicio` es el PRIMER
  // sitio que sí lo mira, y le borraba a Tentada su cabecera con foto — la
  // pieza que más la distingue del resto — con datos que en el portal viejo
  // nunca tuvieron ese efecto.
  const componeElTema = new Set(homeBlocks);
  const pedidos: string[] = [];
  const vistos = new Set<string>();
  for (const b of guardados) {
    if (b.kind !== 'sistema' || !b.sistemaId) continue;
    if (b.oculto && !b.fijo) continue;
    const kit = BLOQUE_EDITOR_A_KIT[b.sistemaId];
    if (!kit || !componeElTema.has(kit) || vistos.has(kit)) continue;
    vistos.add(kit);
    pedidos.push(kit);
  }

  // Los que el tema trae y el estudio no ha ordenado nunca, detrás y en el
  // orden del tema. ⚠️ Salvo que los haya OCULTADO a propósito: eso sí lo dijo.
  // Los `fijo` no entran aquí aunque tengan `oculto`, por el mismo motivo.
  const ocultados = new Set(
    guardados
      .filter((b) => b.kind === 'sistema' && b.oculto && !b.fijo && b.sistemaId)
      .map((b) => BLOQUE_EDITOR_A_KIT[b.sistemaId as string])
      .filter(Boolean),
  );
  for (const kit of homeBlocks) {
    if (!vistos.has(kit) && !ocultados.has(kit)) pedidos.push(kit);
  }
  return pedidos;
}
