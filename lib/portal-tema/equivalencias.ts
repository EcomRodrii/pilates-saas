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
