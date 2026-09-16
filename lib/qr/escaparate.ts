// ─────────────────────────────────────────────────────────────────────────────
// Códigos QR para el escaparate: la página de reservas, la app de las alumnas y
// la web del estudio, como cartel (PDF para imprimir, PNG para redes) o solo el
// código (PNG y SVG).
//
// Sin dependencias nuevas: el QR sale del mismo codificador que ya usan las
// facturas (lib/vendor/qrcodegen.ts), y el PDF se escribe a mano — un A4 con dos
// fuentes estándar y todo lo demás en trazados vectoriales.
//
// El cartel se describe UNA vez (`disenoCartel`, una lista de piezas) y de ahí
// salen el PDF y el SVG: la vista previa del panel es el mismo dibujo que se
// imprime, no una imitación en CSS que se desvía con el primer retoque.
//
// Los colores los elige el estudio, con una regla: el código va siempre sobre
// una tarjeta blanca y en un color que contraste con ella (`codigoLegible`). El
// fondo del cartel puede ser cualquiera; el texto se pone claro u oscuro solo.
// ─────────────────────────────────────────────────────────────────────────────

import { QrCode, Ecc } from '../vendor/qrcodegen.ts';
import { foregroundParaFondo, hexARgb, ratioContraste } from '../wcag-contrast.ts';
import { mezclarHex } from '../color-utils.ts';

export type DestinoQr = 'reservas' | 'app' | 'web';

/** Lo que dice el cartel de cada uno. Frases para quien pasa por la calle. */
export const TEXTOS_QR: Record<DestinoQr, { titulo: string; frase: string; archivo: string }> = {
  reservas: { titulo: 'Reserva tu clase', frase: 'Mira el horario y reserva en un minuto.', archivo: 'reservas' },
  app: { titulo: 'Entra en la app del estudio', frase: 'Tus reservas y tu bono, siempre en el móvil.', archivo: 'app' },
  web: { titulo: 'Visita nuestra web', frase: 'Conoce el estudio antes de venir.', archivo: 'web' },
};

export const INSTRUCCION_QR = 'Apunta con la cámara del móvil';

/** Zona de silencio exigida por el estándar alrededor del código, en módulos. */
export const MARGEN_QR = 4;

export const BLANCO = '#FFFFFF';
export const COLOR_CODIGO_POR_DEFECTO = '#111111';

/**
 * QUARTILE (recupera un 25 % del código): un escaparate tiene reflejos, polvo y
 * a veces una pegatina encima. HIGH haría el código más denso —módulos más
 * pequeños para la misma superficie— y peor de leer desde lejos.
 */
function codificar(texto: string): QrCode {
  return QrCode.encodeText(texto, Ecc.QUARTILE);
}

export interface TramoQr { x: number; y: number; ancho: number }

/**
 * Los módulos oscuros agrupados en tramos horizontales, ya con el margen sumado.
 * Un tramo por racha en vez de un cuadro por módulo: el SVG y el PDF salen
 * varias veces más ligeros y sin costuras entre cuadros vecinos.
 */
export function tramosQr(texto: string, margen = MARGEN_QR): { lado: number; tramos: TramoQr[] } {
  const qr = codificar(texto);
  const tramos: TramoQr[] = [];
  for (let y = 0; y < qr.size; y++) {
    let x = 0;
    while (x < qr.size) {
      if (!qr.getModule(x, y)) { x++; continue; }
      const inicio = x;
      while (x < qr.size && qr.getModule(x, y)) x++;
      tramos.push({ x: inicio + margen, y: y + margen, ancho: x - inicio });
    }
  }
  return { lado: qr.size + margen * 2, tramos };
}

// ─── Colores ─────────────────────────────────────────────────────────────────

/** `#abc`/`#AABBCC` → `#AABBCC`, o `null` si no es un color. */
export function normalizarHex(valor: string | null | undefined): string | null {
  const rgb = valor ? hexARgb(valor) : null;
  if (!rgb) return null;
  const hx = (n: number) => n.toString(16).padStart(2, '0');
  return `#${hx(rgb.r)}${hx(rgb.g)}${hx(rgb.b)}`.toUpperCase();
}

/**
 * Si un color vale para el código. Va sobre la tarjeta blanca, y por debajo de
 * 4,5:1 (el mínimo de texto normal) las cámaras empiezan a dudar, más aún tras
 * un cristal: un rosa pastel precioso es un QR que no abre nadie.
 */
export function codigoLegible(color: string): boolean {
  return (ratioContraste(color, BLANCO) ?? 0) >= 4.5;
}

export interface ColoresCartel {
  /** El fondo del cartel. */
  fondo: string;
  /** Los módulos del código y las esquinas que lo enmarcan. */
  codigo: string;
}

// ─── Nombres ─────────────────────────────────────────────────────────────────

export type PiezaQr = 'cartel' | 'codigo';

/** `cartel-qr-reservas-pilates-centro.pdf`, `qr-app-pilates-centro.svg`… */
export function nombreArchivoQr(destino: DestinoQr, slug: string, pieza: PiezaQr, extension: 'png' | 'svg' | 'pdf'): string {
  const base = `qr-${TEXTOS_QR[destino].archivo}-${slug || 'estudio'}`;
  return `${pieza === 'cartel' ? 'cartel-' : ''}${base}.${extension}`;
}

/** La dirección sin «https://» ni barra final: así se imprime debajo del código. */
export function urlLegible(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

const escaparXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Solo el código, SVG autónomo con su zona de silencio en blanco. */
export function svgQr(texto: string, etiqueta: string, color = COLOR_CODIGO_POR_DEFECTO): string {
  const { lado, tramos } = tramosQr(texto);
  const d = tramos.map(t => `M${t.x},${t.y}h${t.ancho}v1h-${t.ancho}z`).join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${lado}" shape-rendering="crispEdges" ` +
    `role="img" aria-label="${escaparXml(etiqueta)}">` +
    `<rect width="${lado}" height="${lado}" fill="${BLANCO}"/>` +
    `<path d="${d}" fill="${normalizarHex(color) ?? COLOR_CODIGO_POR_DEFECTO}"/></svg>`
  );
}

// ─── Texto: WinAnsi y anchos de Helvetica ────────────────────────────────────
// Helvetica y Helvetica-Bold son dos de las 14 fuentes que todo lector de PDF
// trae de serie: no hay que incrustar nada. Su codificación es WinAnsi, que
// cubre el castellano (á, ñ, ¿, ¡, ü); lo que no quepa (un emoji en el nombre)
// se cambia por un espacio en vez de romper el fichero. Arial, la que usa el SVG
// donde no hay Helvetica, tiene los mismos anchos: por eso el centrado cuadra.

/** WinAnsi: Latin-1 tal cual, más las comillas tipográficas, rayas y el euro. */
const WINANSI_EXTRA: Record<string, number> = {
  '€': 0x80, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '–': 0x96, '—': 0x97,
};

function codigoWinAnsi(c: string): number | null {
  if (c in WINANSI_EXTRA) return WINANSI_EXTRA[c];
  const n = c.codePointAt(0) ?? 0;
  if ((n >= 0x20 && n <= 0x7e) || (n >= 0xa0 && n <= 0xff)) return n;
  return null;
}

// Anchos de las AFM de Adobe (milésimas de em) para 0x20–0x7E.
const ANCHOS_REGULAR = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const ANCHOS_NEGRITA = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

/** Las letras con acento miden como su letra base; basta para centrar. */
function anchoDe(c: string, negrita: boolean): number {
  const tabla = negrita ? ANCHOS_NEGRITA : ANCHOS_REGULAR;
  const base = c.normalize('NFD').charAt(0);
  const n = base.charCodeAt(0);
  if (n >= 0x20 && n <= 0x7e) return tabla[n - 0x20];
  if (c === '—' || c === '…') return 1000;
  return 556;
}

function anchoTexto(texto: string, tamano: number, negrita: boolean, espaciado = 0): number {
  let milesimas = 0;
  let letras = 0;
  for (const c of texto) { milesimas += anchoDe(c, negrita); letras++; }
  return (milesimas * tamano) / 1000 + espaciado * Math.max(0, letras - 1);
}

/** Normaliza espacios y quita lo que la fuente no sabe pintar. */
function textoImprimible(texto: string): string {
  return Array.from(texto.replace(/\s+/g, ' ').trim())
    .map(c => (codigoWinAnsi(c) === null ? ' ' : c))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── El diseño del cartel ────────────────────────────────────────────────────

export const A4 = { ancho: 595.28, alto: 841.89 };

/** Coordenadas en puntos, origen ARRIBA a la izquierda (el PDF las da la vuelta). */
export type PiezaCartel =
  | { tipo: 'caja'; x: number; y: number; ancho: number; alto: number; radio: number; relleno: string; borde?: string }
  /** `y` es la línea base; `x`, el centro. El tamaño ya viene ajustado para que quepa. */
  | { tipo: 'texto'; texto: string; x: number; y: number; tamano: number; negrita: boolean; color: string; espaciado: number }
  | { tipo: 'codigo'; x: number; y: number; modulo: number; tramos: TramoQr[]; color: string }
  /** Las cuatro esquinas de «escanéame» alrededor del código. */
  | { tipo: 'esquinas'; x: number; y: number; lado: number; largo: number; grosor: number; color: string };

export interface DatosCartel {
  estudio: string;
  destino: DestinoQr;
  url: string;
  colores: ColoresCartel;
}

/** Reduce la letra si no cabe, en vez de salirse del papel. */
function texto(
  contenido: string,
  y: number,
  o: { tamano: number; negrita: boolean; color: string; anchoMax: number; espaciado?: number; minimo?: number },
): PiezaCartel {
  const espaciado = o.espaciado ?? 0;
  let tamano = o.tamano;
  const ancho = anchoTexto(contenido, tamano, o.negrita, espaciado);
  if (ancho > o.anchoMax) tamano = Math.max(o.minimo ?? 8, (tamano * o.anchoMax) / ancho);
  return { tipo: 'texto', texto: contenido, x: A4.ancho / 2, y, tamano, negrita: o.negrita, color: o.color, espaciado };
}

export function disenoCartel({ estudio, destino, url, colores }: DatosCartel): PiezaCartel[] {
  const fondo = normalizarHex(colores.fondo) ?? COLOR_CODIGO_POR_DEFECTO;
  const colorCodigo = normalizarHex(colores.codigo);
  // Un color que no se lee no llega al papel, venga de donde venga.
  const codigo = colorCodigo && codigoLegible(colorCodigo) ? colorCodigo : COLOR_CODIGO_POR_DEFECTO;
  const tinta = foregroundParaFondo(fondo);
  const tintaSuave = mezclarHex(tinta, fondo, 0.74);

  const nombre = (textoImprimible(estudio) || 'Tu estudio').toLocaleUpperCase('es');
  const { titulo, frase } = TEXTOS_QR[destino];
  const direccion = textoImprimible(urlLegible(url));

  // El marco de color deja 22 pt de papel: dentro del margen que no imprime
  // ninguna impresora de casa, así el borde blanco es parte del diseño y no un
  // recorte torcido.
  const margen = 22;
  const piezas: PiezaCartel[] = [
    { tipo: 'caja', x: margen, y: margen, ancho: A4.ancho - 2 * margen, alto: A4.alto - 2 * margen, radio: 30, relleno: fondo },
    texto(nombre, 104, { tamano: 13, negrita: true, color: tintaSuave, anchoMax: 460, espaciado: 2.6 }),
    texto(titulo, 170, { tamano: 46, negrita: true, color: tinta, anchoMax: 480, minimo: 24 }),
    texto(frase, 206, { tamano: 17, negrita: false, color: tintaSuave, anchoMax: 460 }),
  ];

  // La tarjeta blanca ES la zona de silencio: el código no lleva margen propio.
  const { lado: modulos, tramos } = tramosQr(url, 0);
  const tarjeta = { lado: 420, y: 248 };
  const tarjetaX = (A4.ancho - tarjeta.lado) / 2;
  const ladoCodigo = 288;
  const modulo = ladoCodigo / modulos;
  const codigoX = (A4.ancho - ladoCodigo) / 2;
  const codigoY = tarjeta.y + (tarjeta.lado - ladoCodigo) / 2;
  // Las esquinas, a 42 pt del código: fuera de sus 4 módulos de silencio
  // (≤ 35 pt con cualquier dirección de las nuestras) para no confundir al lector.
  const separacion = 42;
  // Sobre un fondo casi blanco la tarjeta desaparecería: se le pone un filo.
  const borde = (ratioContraste(fondo, BLANCO) ?? 21) < 1.3 ? mezclarHex(tinta, BLANCO, 0.16) : undefined;

  piezas.push(
    { tipo: 'caja', x: tarjetaX, y: tarjeta.y, ancho: tarjeta.lado, alto: tarjeta.lado, radio: 28, relleno: BLANCO, borde },
    { tipo: 'esquinas', x: codigoX - separacion, y: codigoY - separacion, lado: ladoCodigo + 2 * separacion, largo: 30, grosor: 5, color: codigo },
    { tipo: 'codigo', x: codigoX, y: codigoY, modulo, tramos, color: codigo },
    texto(INSTRUCCION_QR, tarjeta.y + tarjeta.lado + 54, { tamano: 17, negrita: true, color: tinta, anchoMax: 460 }),
    texto(direccion, A4.alto - margen - 46, { tamano: 12, negrita: false, color: tintaSuave, anchoMax: 470 }),
  );
  return piezas;
}

// ─── Del diseño al SVG ───────────────────────────────────────────────────────

const n2 = (v: number) => (Math.round(v * 100) / 100).toString();

/** El cartel en SVG: la vista previa del panel y la base del PNG. */
export function svgCartel(datos: DatosCartel, etiqueta: string): string {
  const cuerpo = disenoCartel(datos).map(p => {
    switch (p.tipo) {
      case 'caja':
        return `<rect x="${n2(p.x)}" y="${n2(p.y)}" width="${n2(p.ancho)}" height="${n2(p.alto)}" rx="${p.radio}" fill="${p.relleno}"` +
          (p.borde ? ` stroke="${p.borde}" stroke-width="1"` : '') + '/>';
      case 'texto':
        return `<text x="${n2(p.x)}" y="${n2(p.y)}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" ` +
          `font-size="${n2(p.tamano)}" font-weight="${p.negrita ? 700 : 400}"` +
          (p.espaciado ? ` letter-spacing="${p.espaciado}"` : '') +
          ` fill="${p.color}">${escaparXml(p.texto)}</text>`;
      case 'codigo': {
        const d = p.tramos.map(t => `M${t.x},${t.y}h${t.ancho}v1h-${t.ancho}z`).join('');
        return `<path d="${d}" fill="${p.color}" shape-rendering="crispEdges" ` +
          `transform="translate(${n2(p.x)} ${n2(p.y)}) scale(${p.modulo})"/>`;
      }
      case 'esquinas':
        return `<path d="${rutaEsquinas(p).map(([m, a, b]) => `M${n2(m[0])},${n2(m[1])}L${n2(a[0])},${n2(a[1])}L${n2(b[0])},${n2(b[1])}`).join('')}" ` +
          `fill="none" stroke="${p.color}" stroke-width="${p.grosor}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
  }).join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${A4.ancho} ${A4.alto}" role="img" aria-label="${escaparXml(etiqueta)}">` +
    `<rect width="${A4.ancho}" height="${A4.alto}" fill="${BLANCO}"/>${cuerpo}</svg>`
  );
}

type Punto = [number, number];

/** Cada esquina como una «L»: su extremo, el vértice y el otro extremo. */
function rutaEsquinas(p: Extract<PiezaCartel, { tipo: 'esquinas' }>): [Punto, Punto, Punto][] {
  const { x, y, lado, largo } = p;
  const d = x + lado;
  const b = y + lado;
  return [
    [[x, y + largo], [x, y], [x + largo, y]],
    [[d - largo, y], [d, y], [d, y + largo]],
    [[d, b - largo], [d, b], [d - largo, b]],
    [[x + largo, b], [x, b], [x, b - largo]],
  ];
}

// ─── Del diseño al PDF ───────────────────────────────────────────────────────

/** Texto → cadena literal de PDF en WinAnsi, con ( ) \ escapados. */
function literalPdf(contenido: string): string {
  let s = '';
  for (const c of contenido) {
    const codigo = codigoWinAnsi(c) ?? 0x20;
    const ch = String.fromCharCode(codigo);
    s += ch === '(' || ch === ')' || ch === '\\' ? `\\${ch}` : ch;
  }
  return `(${s})`;
}

const n3 = (v: number) => (Math.round(v * 1000) / 1000).toString();

function rgbPdf(hex: string): string {
  const rgb = hexARgb(hex) ?? { r: 0, g: 0, b: 0 };
  return `${n3(rgb.r / 255)} ${n3(rgb.g / 255)} ${n3(rgb.b / 255)}`;
}

/** Rectángulo de esquinas redondeadas con cuatro curvas de Bézier. */
function rutaCajaPdf(x: number, y: number, w: number, h: number, r: number): string {
  // En PDF el origen está abajo: la caja empieza en su borde inferior.
  const X = x;
  const Y = A4.alto - y - h;
  const k = 0.5523 * r;
  return [
    `${n2(X + r)} ${n2(Y)} m`,
    `${n2(X + w - r)} ${n2(Y)} l`,
    `${n2(X + w - r + k)} ${n2(Y)} ${n2(X + w)} ${n2(Y + r - k)} ${n2(X + w)} ${n2(Y + r)} c`,
    `${n2(X + w)} ${n2(Y + h - r)} l`,
    `${n2(X + w)} ${n2(Y + h - r + k)} ${n2(X + w - r + k)} ${n2(Y + h)} ${n2(X + w - r)} ${n2(Y + h)} c`,
    `${n2(X + r)} ${n2(Y + h)} l`,
    `${n2(X + r - k)} ${n2(Y + h)} ${n2(X)} ${n2(Y + h - r + k)} ${n2(X)} ${n2(Y + h - r)} c`,
    `${n2(X)} ${n2(Y + r)} l`,
    `${n2(X)} ${n2(Y + r - k)} ${n2(X + r - k)} ${n2(Y)} ${n2(X + r)} ${n2(Y)} c`,
    'h',
  ].join('\n');
}

function contenidoPdf(piezas: PiezaCartel[]): string {
  return piezas.map(p => {
    switch (p.tipo) {
      case 'caja':
        return p.borde
          ? `${rgbPdf(p.relleno)} rg ${rgbPdf(p.borde)} RG 1 w\n${rutaCajaPdf(p.x, p.y, p.ancho, p.alto, p.radio)}\nB`
          : `${rgbPdf(p.relleno)} rg\n${rutaCajaPdf(p.x, p.y, p.ancho, p.alto, p.radio)}\nf`;
      case 'texto': {
        const x = p.x - anchoTexto(p.texto, p.tamano, p.negrita, p.espaciado) / 2;
        return `BT /${p.negrita ? 'F2' : 'F1'} ${n2(p.tamano)} Tf ${n2(p.espaciado)} Tc ${rgbPdf(p.color)} rg ` +
          `${n2(x)} ${n2(A4.alto - p.y)} Td ${literalPdf(p.texto)} Tj ET`;
      }
      case 'codigo': {
        // Un pelo de solape vertical: sin él, algunos lectores dibujan una raya
        // blanca finísima entre filas de módulos.
        const solape = 0.02;
        const rects = p.tramos
          .map(t => `${n2(p.x + t.x * p.modulo)} ${n2(A4.alto - p.y - (t.y + 1) * p.modulo)} ${n2(t.ancho * p.modulo)} ${n2(p.modulo + solape)} re`)
          .join('\n');
        return `${rgbPdf(p.color)} rg\n${rects}\nf`;
      }
      case 'esquinas':
        return `${rgbPdf(p.color)} RG ${p.grosor} w 1 J 1 j\n` +
          rutaEsquinas(p).map(([m, a, b]) =>
            `${n2(m[0])} ${n2(A4.alto - m[1])} m ${n2(a[0])} ${n2(A4.alto - a[1])} l ${n2(b[0])} ${n2(A4.alto - b[1])} l S`).join('\n');
    }
  }).join('\n');
}

/** El cartel A4, como bytes de un PDF válido. */
export function cartelPdf(datos: DatosCartel): Uint8Array {
  const nombre = textoImprimible(datos.estudio) || 'Tu estudio';
  const contenido = contenidoPdf(disenoCartel(datos));

  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.ancho} ${A4.alto}] ` +
      '/Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`,
    `<< /Title ${literalPdf(`${TEXTOS_QR[datos.destino].titulo} · ${nombre}`)} /Creator (Tentare) >>`,
  ];

  // Todo es de un byte por carácter (ASCII + WinAnsi), así que la longitud de la
  // cadena ES la posición en bytes que exige la tabla xref.
  let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const posiciones: number[] = [];
  objetos.forEach((cuerpo, i) => {
    posiciones.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${cuerpo}\nendobj\n`;
  });
  const inicioXref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  pdf += posiciones.map(p => `${String(p).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R /Info ${objetos.length} 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}
