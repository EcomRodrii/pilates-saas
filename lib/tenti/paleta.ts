// Los colores de Tenti, leídos de los tokens de app/globals.css.
//
// El prototipo traía su paleta escrita en el motor: chispas blancas (invisibles
// sobre --card), mofletes rosa chicle, un verde menta para 'hecho' y un aro
// negro en la insignia. Nada de eso es de Tentare. Aquí se lee lo que el panel
// ya decide para claro y oscuro, así que Tenti cambia de modo con el resto de
// la pantalla en vez de llevar su propio tema.
//
// Desde el 5-oct-2026 (fundador: «que use todos sus estados y emociones, cada
// uno en su momento», lib/tenti/momentos.ts) el panel enseña también 'error',
// 'esperaTuOk', 'agobiado' y 'trabajando', así que sus colores salen de los
// tokens de estado del panel (--destructive, --warning, --info): el azul, el
// ámbar y el rojo del prototipo no son de Tentare. Son OBLIGATORIOS: existen
// siempre en :root y en .dark, y si falta uno la paleta entera cae a 'defecto',
// como con los demás. 'pensando', 'pregunta', 'buscando' y 'dormido' siguen
// con el color del prototipo (el morado de 'pensando' ya está en producción).
//
// ⚠️ --success se lee DIRECTO y no con un alias tipo `--tenti-hecho:
// var(--success)` en :root: la var() se resuelve donde se declara, así que
// dentro de .dark el alias seguiría valiendo el verde CLARO.
//
// Puro (sin DOM) para poder probarlo con node --test: quien lo llama le pasa
// cómo leer un token (getComputedStyle(canvas).getPropertyValue en el navegador).
//
// Los trajes NO salen de aquí: llevan los colores del original de Coucou
// (lib/tenti/trajes-coucou.ts, decisión del fundador del 6-oct-2026).

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
  /** El tinte de los estados del panel que avisan o trabajan. */
  estados: { error: string; esperaTuOk: string; agobiado: string; trabajando: string };
}

export const TOKENS_TENTI = {
  cuerpoLuz: '--tenti-cuerpo-luz',
  cuerpoSombra: '--tenti-cuerpo-sombra',
  tinta: '--tenti-tinta',
  rubor: '--tenti-rubor',
  chispa: '--tenti-chispa',
  hecho: '--success',
  error: '--destructive',
  // 'esperaTuOk' y 'agobiado' comparten ámbar: los dos son «esto espera tu
  // visto bueno»; agobiado es solo más.
  aviso: '--warning',
  trabajando: '--info',
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
  const error = v(TOKENS_TENTI.error), aviso = v(TOKENS_TENTI.aviso), trabajando = v(TOKENS_TENTI.trabajando);
  if (!luz || !sombra || !tinta || !rubor || !chispa || !hecho || !error || !aviso || !trabajando) return null;
  return {
    cuerpo: [luz, sombra], tinta, rubor, chispa, hecho,
    estados: { error, esperaTuOk: aviso, agobiado: aviso, trabajando },
  };
}
