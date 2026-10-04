// De qué color va la hora y la batería de la barra de estado de iOS. Puro
// (barra-de-estado.test.ts): quien lo aplica es `estiloBarraDeEstado` en
// puente.ts.
//
// La app no sigue el modo oscuro del sistema (Info.plist fija
// `UIUserInterfaceStyle = Light`), así que esto no depende del iPhone sino de lo
// que hay DETRÁS de la barra: el fondo del estilo que eligió el estudio o, en
// Inicio y en la ficha de una clase, la foto de portada con su velo oscuro.

/** `clara` = letras blancas (fondo oscuro detrás); `oscura` = letras negras. */
export type TintaBarra = 'clara' | 'oscura';

export function tintaBarraDeEstado(o: {
  /** El estilo del estudio es de fondo oscuro («Carbón»). */
  fondoOscuro: boolean;
  /** La cabecera flota sobre la foto de portada (velo oscuro detrás). */
  sobreFoto?: boolean;
}): TintaBarra {
  return o.fondoOscuro || o.sobreFoto ? 'clara' : 'oscura';
}
