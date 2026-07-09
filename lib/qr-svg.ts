// Genera el marcado SVG de un código QR (nivel de corrección M) a partir de un
// texto — pensado para la URL de cotejo Veri*Factu. Cliente-seguro (sin
// node:crypto). Devuelve una cadena <svg> lista para inyectar en el PDF de
// impresión o en la preview (dangerouslySetInnerHTML).
import { QrCode, Ecc } from './vendor/qrcodegen';

export function qrSvgMarkup(text: string, opciones?: { margen?: number }): string {
  const qr = QrCode.encodeText(text, Ecc.MEDIUM);
  const margen = opciones?.margen ?? 4; // zona de silencio (quiet zone) exigida
  const dim = qr.size + margen * 2;
  let path = '';
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.getModule(x, y)) path += `M${x + margen},${y + margen}h1v1h-1z`;
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" ` +
    `shape-rendering="crispEdges" width="100%" height="100%" role="img" aria-label="Código QR de cotejo Veri*Factu">` +
    `<rect width="${dim}" height="${dim}" fill="#ffffff"/>` +
    `<path d="${path}" fill="#000000"/>` +
    `</svg>`
  );
}
