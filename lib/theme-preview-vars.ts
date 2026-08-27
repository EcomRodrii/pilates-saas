// Claves de CSS var que el preview en vivo puede sobreescribir por
// postMessage. Es una whitelist de SEGURIDAD: el mensaje llega de otra ventana
// y no se acepta cualquier propiedad, solo estas.
//
// Vivía dentro de theme-preview-listener.tsx ('use client'), donde ningún test
// podía leerla — y se quedó corta en silencio: `varsBarraFlotante` y
// `varsRadioTema` (los ejes de FORMA de los temas, justo lo que distingue un
// tema de una paleta) emiten siete vars que no estaban en la lista, así que en
// el preview del editor y en las miniaturas de la biblioteca se descartaban
// una por una sin avisar. La barra de Bloom no flotaba y ningún tema cambiaba
// de radio: se veían todos iguales.
//
// ⚠️ Toda var nueva de `themeToVarMap` tiene que entrar aquí. No hace falta
// acordarse: `theme-preview-vars.test.ts` recorre las combinaciones de ejes
// del motor y falla si alguna emite una clave que no esté en este conjunto.
export const CLAVES_PREVIEW_PERMITIDAS: ReadonlySet<string> = new Set([
  '--portal-brand',
  '--portal-brand-foreground',
  '--portal-brand-secondary',
  '--brand',
  '--brand-foreground',
  '--brand-secondary',
  '--accent',
  '--foreground',
  // Fondo del portal en modo Día ("Fondo") — C2, ver varsFondoPortal en
  // lib/theme-runtime.ts. Ya no hay `--background`: ese var pintaba el PANEL,
  // no el portal, y se retiró junto con el campo que lo alimentaba.
  '--portal-bg-dia',
  '--radius',
  '--font-sans',
  '--font-heading',
  // buttonStyle/cardStyle 'solid'/'flat' no declaran estas 5 (ver
  // lib/theme-runtime.ts) — por eso el listener las borra todas antes de
  // aplicar el mensaje nuevo, no solo las que vengan en él.
  '--portal-btn-bg',
  '--portal-btn-fg',
  '--portal-btn-border',
  '--portal-card-border',
  '--portal-card-shadow',
  // Titular del portal (galería de temas) — 'instrumentSerif' no declara
  // ninguna de las dos, mismo motivo que buttonStyle/cardStyle arriba.
  '--portal-heading-font',
  '--portal-heading-weight',
  // Barra inferior — mismo motivo otra vez: un tema sin `barraOscura`/
  // `barraClasica`/`barraFlotante` no declara ninguna de estas.
  '--portal-tabbar-bg',
  '--portal-tabbar-border',
  '--portal-tabbar-height',
  '--portal-tabbar-radius',
  '--portal-tabbar-shadow',
  '--portal-tabbar-active-bg',
  '--portal-tabbar-active-shadow',
  '--portal-tabbar-active-fg',
  '--portal-tabbar-idle-fg',
  // Encuadre de la foto del estudio en la portada. Sin esta línea, mover el
  // control en el editor no movería la vista previa: se vería centrada
  // siempre y el ajuste parecería roto. Lo cazó el guard de abajo, no yo.
  '--portal-foto-pos',
  // Radio por pieza (`radioTema`): cada una se declara solo si el tema fija
  // ese eje — "ausente" significa "hereda", no "0".
  '--portal-radius-card',
  '--portal-radius-boton',
  '--portal-radius-chip',
  '--portal-radius-acceso',
  // Escala tipográfica (`escalaTexto`): igual, solo se declara lo que el tema
  // fija. Es identidad del tema — Noir/Oliva titulan a 17 y Bloom a 20.
  '--portal-text-seccion',
  '--portal-text-titulo-pantalla',
  '--portal-text-saludo',
  '--portal-text-titulo-hero',
  '--portal-text-bienvenida',
  '--portal-text-numero-bono',
]);

/**
 * Lo que hay que ESCRIBIR en `:root` para que la previsualización enseñe este
 * tema y solo este tema.
 *
 * ⚠️ Una clave que el tema no declara se pone a `initial`, NO se borra. Y ahí
 * estaba el fallo que hacía que el editor "mostrara otra cosa": el listener
 * borraba la propiedad EN LÍNEA, pero el tema publicado no vive ahí — vive en
 * una regla `:root` de un `<style>` que pinta el servidor. Quitar la de arriba
 * descubría la de debajo, así que cada tema se veía sobre los restos del
 * publicado: en la biblioteca, con Noir publicado, las miniaturas de Clásico,
 * Oliva y Bloom salían todas con la barra negra de Noir. Comprobado en vivo en
 * el navegador (`--portal-tabbar-bg` calculada `#1E2B22` en las cuatro, con la
 * de línea vacía).
 *
 * `initial` en una custom property es el valor "inválido garantizado": hace
 * que cada `var(--x, loQueSea)` use su propio respaldo, que es exactamente lo
 * que pasa en un portal donde el tema nunca declaró esa var.
 */
export function varsDePreview(
  entrantes: Record<string, unknown>,
  permitidas: ReadonlySet<string> = CLAVES_PREVIEW_PERMITIDAS,
): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const clave of permitidas) {
    const v = entrantes[clave];
    salida[clave] = typeof v === 'string' ? v : 'initial';
  }
  return salida;
}


// ── Los tokens del kit ──────────────────────────────────────────────────────
//
// Whitelist aparte, y con una regla de limpieza OPUESTA a la de arriba. Merece
// explicación, porque parece una incoherencia y no lo es:
//
// Con los `--portal-*`, quitar la propiedad en línea descubre el `<style>` del
// tema PUBLICADO que pinta el servidor — o sea, el tema equivocado mientras se
// previsualiza otro. Por eso allí se escribe `initial` en vez de borrar.
//
// Con los del kit, lo que hay debajo es el fichero del PROPIO tema
// (`html[data-theme="…"]`), que es exactamente el valor al que queremos volver
// cuando la propietaria no ha tocado ese ajuste. Aquí borrar es lo correcto, y
// escribir `initial` sería el error: `border-radius: var(--radius-card)` no
// lleva respaldo, así que un `initial` dejaría las tarjetas con las esquinas
// cuadradas.
//
// ⚠️ Auditoría 21-ago: los `--size-*` estaban escritos A MANO y la lista no
// coincidía con la realidad. `varsEscalaSobreTema` los deriva de
// `tema.designSystem.type`, que es distinto por tema; comparando la lista con lo
// que emiten los 5 temas salían 6 claves reales fuera de la whitelist
// (`--size-body`, `--size-caption`, `--size-meta`, `--size-micro`,
// `--size-pass-number`, `--size-timer`) y 5 entradas muertas que no existen en
// ningún tema. Efecto: tocar la escala tipográfica cambiaba el cuerpo, los
// metadatos y el número del bono en PRODUCCIÓN y no en la vista previa — el
// mismo bug histórico que este fichero dice prevenir.
//
// ⚠️ RETIRADO (decisión del fundador, 2026-08-27): se derivaban del registro
// de temas del kit (`themes/registro.ts`), borrado en el PR 2 de "borrar
// temas del kit". Sin temas del kit no hay tokens `--size-*` que declarar.
const CLAVES_SIZE_DE_LOS_TEMAS: string[] = [];

export const CLAVES_KIT_PERMITIDAS: ReadonlySet<string> = new Set([
  // `--accent` SALIÓ de aquí por higiene (auditoría previa: ningún emisor del
  // kit lo producía) y VUELVE ahora que sí lo produce de verdad: `destacado`
  // ("Acento") → `varsColorSobreTema({accent: ...})` — P1 de la auditoría del
  // Theme Builder, cableando el kit para que deje de tener campos inertes.
  // Es TINTA (el dorado de Noir, el rosa de Bloom), nunca el fondo pálido del
  // vocabulario viejo con el mismo nombre — ver el comentario de
  // `varsColorSobreTema` en themes/registro.ts.
  '--accent',
  // `barraOscura` → `varsBarraOscuraSobreTema` → fondo de `TabBar`. Mismo
  // motivo y misma fase que `--accent` de arriba.
  '--tab-bar-bg',
  '--brand', '--on-brand', '--support', '--bg', '--ink',
  '--font-body', '--font-display', '--weight-display',
  '--radius-card', '--radius-button', '--radius-chip', '--radius-quick-link',
  // La escala se emite entera o no se emite: `varsEscalaSobreTema` aplica un
  // factor a TODOS los pasos del tema, no solo a los que se tocaron.
  ...CLAVES_SIZE_DE_LOS_TEMAS,
  // `cardStyle` → sombra (`varsSombraSobreTema`): 'flat' no las declara, así
  // que se borran igual que el resto — la tarjeta vuelve a la sombra propia
  // del fichero del tema, no a un `initial` sin respaldo.
  '--shadow-card', '--shadow-card-hover',
  // `buttonStyle` sobre un tema del KIT (`varsBotonSobreTema`) — faltaban las
  // tres, así que "Botón principal" guardaba el borrador (autosave, "1 sin
  // publicar") pero la vista previa seguía enseñando el botón sólido: solo se
  // veía el cambio real al publicar. Reproducido en vivo 2026-08-25.
  // 'solid' no las declara, así que se borran igual que el resto.
  '--btn-primary-bg', '--btn-primary-fg', '--btn-primary-border',
]);

/** Las que vienen, filtradas. Las que no vienen NO salen: se borran. */
export function varsKitDePreview(
  entrantes: Record<string, unknown>,
  permitidas: ReadonlySet<string> = CLAVES_KIT_PERMITIDAS,
): { aplicar: Record<string, string>; borrar: string[] } {
  const aplicar: Record<string, string> = {};
  const borrar: string[] = [];
  for (const clave of permitidas) {
    const v = entrantes[clave];
    if (typeof v === 'string') aplicar[clave] = v;
    else borrar.push(clave);
  }
  return { aplicar, borrar };
}
