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
  '--background',
  '--foreground',
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
