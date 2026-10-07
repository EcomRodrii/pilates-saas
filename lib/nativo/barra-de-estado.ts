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

/** Alto de la barra de estado de un iPhone (pt): hasta 59 con la isla dinámica. */
export const ALTO_BARRA_DE_ESTADO = 60;

/**
 * ¿Sigue la foto debajo de la hora y la batería? Lo está mientras su borde de
 * abajo quede por debajo de la barra. `bordeInferior` es el de
 * `getBoundingClientRect()`, que ya descuenta lo que se ha bajado.
 */
export function fotoBajoLaBarra(bordeInferior: number): boolean {
  return bordeInferior > ALTO_BARRA_DE_ESTADO;
}

/**
 * Pone la tinta de la barra según haya foto detrás, la cambia al bajar y, al
 * terminar, la devuelve a la del fondo de la página. Lo comparten todas las
 * pantallas con foto arriba: la ficha de una clase (`FichaClaseHero`), la ficha
 * de un estudio en `/app` y la portada de `/reservar` (`useTintaSobreFoto`).
 *
 * Solo llama a `aplicar` cuando la tinta cambia: el scroll dispara decenas de
 * eventos por segundo, y cada uno sería una llamada al puente nativo.
 *
 * ⚠️ La vuelta al terminar NO es opcional. Una pantalla con foto deja la tinta
 * clara, y la siguiente puede no ponerla: `PuenteNativo` solo la fija al
 * montarse, y vive en el layout de `/app`, que no se desmonta al volver de la
 * ficha al buscador. Sin esto, la entrada se quedaría con letras blancas sobre
 * crema.
 *
 * Sin React ni Capacitor (barra-de-estado.test.ts): en la app, `ventana` es
 * `window` y `aplicar` es `estiloBarraDeEstado`.
 */
export function vigilarTintaSobreFoto(o: {
  fondoOscuro: boolean;
  sobreFoto: () => boolean;
  aplicar: (tinta: TintaBarra) => void;
  ventana: Pick<Window, 'addEventListener' | 'removeEventListener'>;
}): () => void {
  let ultima: TintaBarra | null = null;
  const mirar = () => {
    const tinta = tintaBarraDeEstado({ fondoOscuro: o.fondoOscuro, sobreFoto: o.sobreFoto() });
    if (tinta === ultima) return;
    ultima = tinta;
    o.aplicar(tinta);
  };
  mirar();
  o.ventana.addEventListener('scroll', mirar, { passive: true });
  o.ventana.addEventListener('resize', mirar);
  return () => {
    o.ventana.removeEventListener('scroll', mirar);
    o.ventana.removeEventListener('resize', mirar);
    // Siempre, aunque ya fuera esa: otra pantalla pudo cambiarla entretanto.
    o.aplicar(tintaBarraDeEstado({ fondoOscuro: o.fondoOscuro }));
  };
}
