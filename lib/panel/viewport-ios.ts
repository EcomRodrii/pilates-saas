// `maximum-scale=1` en la meta viewport del panel, SOLO en iOS/iPadOS. Puro: se
// prueba con `node --test` (viewport-ios.test.ts); lo aplica
// components/layout/viewport-ios.tsx.
//
// Por qué solo ahí: desde iOS 10 Safari IGNORA `maximum-scale` (y
// `user-scalable=no`) para el pellizco del usuario, así que en un iPhone no le
// quita el zoom a nadie, y en cambio sí corta el zoom automático al enfocar un
// campo. En Android `maximum-scale=1` SÍ bloquea el pellizco: ahí no se pone.
// No sustituye a la regla de los 16 px de app/globals.css, que sigue siendo la
// de verdad; esto es el cinturón para lo que se le escape (el «Zoom de la
// página» de Safari por debajo del 100 %, un campo nuevo que no la herede…).

/** iPhone, iPod o iPad, también el iPad que se presenta como Mac (iPadOS 13+). */
export function esIOS(userAgent: string, maxTouchPoints: number): boolean {
  if (/\b(iPhone|iPad|iPod)\b/.test(userAgent)) return true;
  return /\bMacintosh\b/.test(userAgent) && maxTouchPoints > 1;
}

/** El `content` de la meta viewport con `maximum-scale=1` (sin duplicarlo ni tocar lo demás). */
export function conTopeDeEscala(content: string): string {
  const partes = content
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p && !/^maximum-scale\s*=/i.test(p));
  return [...partes, 'maximum-scale=1'].join(', ');
}
