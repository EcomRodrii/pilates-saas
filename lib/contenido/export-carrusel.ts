'use client';

// Exporta una diapositiva de carrusel a PNG 1080×1080 dibujándola en un canvas.
// No usa librerías externas.

import { ESTILO_CARRUSEL, type EstiloCarrusel, type SlideCarrusel } from './types';

const SIZE = 1080;

function aplicarFondo(ctx: CanvasRenderingContext2D, bg: string) {
  const grad = bg.match(/linear-gradient\([^,]+,(.+)\)/);
  if (grad) {
    const colores = grad[1].split(',').map((c) => c.trim());
    const g = ctx.createLinearGradient(0, 0, SIZE, SIZE);
    colores.forEach((c, i) => g.addColorStop(colores.length === 1 ? 1 : i / (colores.length - 1), c));
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = bg;
  }
  ctx.fillRect(0, 0, SIZE, SIZE);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lineas: string[] = [];
  for (const parrafo of text.split('\n')) {
    const palabras = parrafo.split(' ');
    let linea = '';
    for (const p of palabras) {
      const prueba = linea ? `${linea} ${p}` : p;
      if (ctx.measureText(prueba).width > maxW && linea) { lineas.push(linea); linea = p; }
      else linea = prueba;
    }
    lineas.push(linea);
  }
  return lineas;
}

function dibujarBloque(ctx: CanvasRenderingContext2D, lineas: string[], x: number, y: number, lh: number, align: CanvasTextAlign) {
  ctx.textAlign = align;
  lineas.forEach((l, i) => ctx.fillText(l, x, y + i * lh));
  return y + lineas.length * lh;
}

export function exportarSlidePNG(slide: SlideCarrusel, estilo: EstiloCarrusel, index: number, total: number, temaSlug: string) {
  const e = ESTILO_CARRUSEL[estilo];
  const canvas = document.createElement('canvas');
  canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  aplicarFondo(ctx, e.bg);
  const pad = 110;
  const maxW = SIZE - pad * 2;
  const centrado = slide.tipo === 'cta';
  const x = centrado ? SIZE / 2 : pad;
  const fontFamily = e.font.includes('serif') ? 'Georgia, serif' : 'Arial, Helvetica, sans-serif';

  ctx.fillStyle = e.fg;
  ctx.textBaseline = 'alphabetic';

  // Título
  const tSize = slide.tipo === 'portada' ? 88 : slide.tipo === 'cta' ? 76 : 68;
  ctx.font = `800 ${tSize}px ${fontFamily}`;
  ctx.fillStyle = slide.tipo === 'cta' ? e.accent : e.fg;
  const tituloLineas = wrap(ctx, slide.titulo, maxW);
  let y = SIZE / 2 - (tituloLineas.length * tSize * 1.05) / 2;
  y = dibujarBloque(ctx, tituloLineas, x, y, tSize * 1.1, centrado ? 'center' : 'left');

  // Cuerpo
  if (slide.cuerpo) {
    const bSize = 40;
    ctx.font = `400 ${bSize}px ${fontFamily}`;
    ctx.fillStyle = e.fg;
    ctx.globalAlpha = 0.85;
    dibujarBloque(ctx, wrap(ctx, slide.cuerpo, maxW), x, y + 40, bSize * 1.35, centrado ? 'center' : 'left');
    ctx.globalAlpha = 1;
  }

  // Pie
  ctx.font = `600 26px ${fontFamily}`;
  ctx.fillStyle = e.fg; ctx.globalAlpha = 0.6;
  ctx.textAlign = 'left'; ctx.fillText('@tuestudio', pad, SIZE - pad + 20);
  ctx.textAlign = 'right'; ctx.fillText(`${index} / ${total}`, SIZE - pad, SIZE - pad + 20);
  ctx.globalAlpha = 1;

  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = `carrusel-${temaSlug}-${index}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
