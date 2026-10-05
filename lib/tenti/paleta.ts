// Los colores de Tenti, leídos de los tokens de app/globals.css.
//
// El prototipo traía su paleta escrita en el motor: chispas blancas (invisibles
// sobre --card), mofletes rosa chicle, un verde menta para 'hecho' y un aro
// negro en la insignia. Nada de eso es de Tentare. Aquí se lee lo que el panel
// ya decide para claro y oscuro, así que Tenti cambia de modo con el resto de
// la pantalla en vez de llevar su propio tema.
//
// ⚠️ Solo los tokens que usa la fase 1 (reposo y 'hecho'). Leer más —
// --destructive, --warning…— solo añadiría formas de caer a 'defecto' en
// silencio, para colores de estados que el panel no enseña.
//
// ⚠️ --success se lee DIRECTO y no con un alias tipo `--tenti-hecho:
// var(--success)` en :root: la var() se resuelve donde se declara, así que
// dentro de .dark el alias seguiría valiendo el verde CLARO.
//
// Puro (sin DOM) para poder probarlo con node --test: quien lo llama le pasa
// cómo leer un token (getComputedStyle(canvas).getPropertyValue en el navegador).

export interface PaletaTenti {
  /** Degradado del cuerpo y de las manos: [luz, sombra]. */
  cuerpo: [luz: string, sombra: string];
  /** Ojos. */
  tinta: string;
  /** Mofletes. */
  rubor: string;
  /** Chispas de la celebración: tienen que verse sobre --background y --card. */
  chispa: string;
  /** El tinte de 'hecho'. */
  hecho: string;
}

export const TOKENS_TENTI = {
  cuerpoLuz: '--tenti-cuerpo-luz',
  cuerpoSombra: '--tenti-cuerpo-sombra',
  tinta: '--tenti-tinta',
  rubor: '--tenti-rubor',
  chispa: '--tenti-chispa',
  hecho: '--success',
} as const;

// Sin distinguir mayúsculas: el --destructive oscuro es '#E08a6B', y el día que
// un token de Tenti se escriba así no puede tirar la paleta entera a 'defecto'.
const HEX = /^#[0-9a-f]{6}$/i;

/** La paleta, o `null` si falta algún token o alguno no es un #RRGGBB. */
export function paletaDesdeTokens(leer: (token: string) => string | null | undefined): PaletaTenti | null {
  const v = (token: string): string | null => {
    const s = (leer(token) ?? '').trim();
    return HEX.test(s) ? s : null;
  };
  const luz = v(TOKENS_TENTI.cuerpoLuz), sombra = v(TOKENS_TENTI.cuerpoSombra), tinta = v(TOKENS_TENTI.tinta);
  const rubor = v(TOKENS_TENTI.rubor), chispa = v(TOKENS_TENTI.chispa), hecho = v(TOKENS_TENTI.hecho);
  if (!luz || !sombra || !tinta || !rubor || !chispa || !hecho) return null;
  return { cuerpo: [luz, sombra], tinta, rubor, chispa, hecho };
}
