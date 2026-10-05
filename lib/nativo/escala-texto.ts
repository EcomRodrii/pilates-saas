// «Texto más grande» de iOS (Dynamic Type) dentro de la app. Puro
// (escala-texto.test.ts): quien mide y aplica es `PuenteNativo`.
//
// En WebKit de iOS, `font: -apple-system-body` da el cuerpo de texto que ha
// elegido la persona en Ajustes (17 px con el tamaño por defecto). Esa medida,
// dividida por 17, es cuánto agrandar la escala de la app (`--escala-texto`,
// que multiplica los tokens `--t-*` de student.css).
//
// ⚠️ Con TOPE en los dos sentidos. Por arriba, 1,35: con los tamaños de
// accesibilidad más grandes el cuerpo pasa de 40 px, y una app de tarjetas,
// píldoras de días y barra inferior pensada para 375 px no aguanta eso sin
// partirse — de 16 a 21,6 px de cuerpo ya es «más grande» de verdad. Por abajo,
// 0,9: quien elige texto pequeño lo tiene un poco más pequeño, nunca ilegible.
// ⚠️ No se toca el `font-size` de <html> (la otra forma de hacerlo): todo lo que
// mide en `rem` dentro del portal —el pago embebido, por ejemplo— crecería sin
// tope y sin que nadie lo hubiera revisado.

export const CUERPO_IOS_POR_DEFECTO = 17;
export const ESCALA_MIN = 0.9;
export const ESCALA_MAX = 1.35;

/** De los px del cuerpo del sistema a la escala de la app, con su tope y a dos decimales. */
export function escalaDeTexto(pxCuerpoSistema: number): number {
  if (!Number.isFinite(pxCuerpoSistema) || pxCuerpoSistema <= 0) return 1;
  const e = pxCuerpoSistema / CUERPO_IOS_POR_DEFECTO;
  return Math.round(Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, e)) * 100) / 100;
}
