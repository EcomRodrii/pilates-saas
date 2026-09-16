import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CONSULTA_MOVIL, CORTES_VIDEO_PRODUCTO, PRESUPUESTO_VIDEO_KB } from './video-producto.ts';

// ─────────────────────────────────────────────────────────────────────────────
// El vídeo de producto del hero (components/landing/VideoProducto.tsx) y sus
// ficheros de public/producto, leídos sin ffprobe (CI no lo tiene):
//
//   · los dos cortes existen, miden lo que dice el componente y no engordan;
//   · el MP4 es H.264 High (o Main/Baseline) 4:2:0. Un 4:4:4 se reproducía en
//     negro en el móvil (#1004) y en el navegador de escritorio no se notaba;
//   · el WebM es VP9;
//   · el corte móvil del CSS es el mismo que el `media` del <picture>.
// ─────────────────────────────────────────────────────────────────────────────

const PUBLIC = join(import.meta.dirname, '..', '..', 'public');
const COMPONENTE = join(import.meta.dirname, '..', '..', 'components', 'landing', 'VideoProducto.tsx');
const ruta = (url: string) => join(PUBLIC, url);

/** Primer `tkhd` con ancho y alto (coma fija 16.16). */
function medidasMp4(b: Buffer): { ancho: number; alto: number } {
  for (let i = b.indexOf('tkhd'); i !== -1; i = b.indexOf('tkhd', i + 4)) {
    const version = b[i + 4];
    const fin = i + 4 + (version === 1 ? 96 : 84);
    const ancho = b.readUInt32BE(fin - 8) / 65536;
    const alto = b.readUInt32BE(fin - 4) / 65536;
    if (ancho > 0 && alto > 0) return { ancho, alto };
  }
  throw new Error('sin tkhd de vídeo');
}

/** Perfil y submuestreo de croma del `avcC`. */
function avcC(b: Buffer): { perfil: number; croma: number | null } {
  const i = b.indexOf('avcC');
  assert.ok(i > 0, 'el MP4 no es H.264 (sin avcC)');
  let p = i + 4;
  const perfil = b[p + 1];
  p += 5;
  const nSps = b[p] & 0x1f;
  p += 1;
  for (let n = 0; n < nSps; n++) p += 2 + b.readUInt16BE(p);
  const nPps = b[p];
  p += 1;
  for (let n = 0; n < nPps; n++) p += 2 + b.readUInt16BE(p);
  // Los perfiles High llevan detrás el formato de croma: 1 = 4:2:0.
  const croma = [100, 110, 122, 144].includes(perfil) ? b[p] & 0x03 : null;
  return { perfil, croma };
}

/** PixelWidth (0xB0) y PixelHeight (0xBA) del primer vídeo del WebM. */
function medidasWebm(b: Buffer): { ancho: number; alto: number } {
  const leer = (id: number) => {
    for (let i = b.indexOf(id); i !== -1 && i < b.length - 3; i = b.indexOf(id, i + 1)) {
      if (b[i + 1] === 0x82) return b.readUInt16BE(i + 2);
      if (b[i + 1] === 0x81) return b[i + 2];
    }
    throw new Error(`sin elemento 0x${id.toString(16)}`);
  };
  return { ancho: leer(0xb0), alto: leer(0xba) };
}

function medidasJpeg(b: Buffer): { ancho: number; alto: number } {
  for (let i = 2; i < b.length - 9; ) {
    if (b[i] !== 0xff) { i++; continue; }
    const marca = b[i + 1];
    if (marca >= 0xc0 && marca <= 0xc2) return { alto: b.readUInt16BE(i + 5), ancho: b.readUInt16BE(i + 7) };
    i += 2 + b.readUInt16BE(i + 2);
  }
  throw new Error('JPEG sin SOF');
}

for (const corte of Object.values(CORTES_VIDEO_PRODUCTO)) {
  test(`vídeo de producto (${corte.id}): ficheros, medidas y peso`, () => {
    for (const url of [corte.poster, corte.webm, corte.mp4]) assert.ok(existsSync(ruta(url)), `falta public${url}`);

    const mp4 = readFileSync(ruta(corte.mp4));
    assert.deepEqual(medidasMp4(mp4), { ancho: corte.ancho, alto: corte.alto }, `${corte.mp4} no mide lo que dice el componente`);
    assert.deepEqual(medidasWebm(readFileSync(ruta(corte.webm))), { ancho: corte.ancho, alto: corte.alto }, `${corte.webm} no mide lo que dice el componente`);
    assert.deepEqual(medidasJpeg(readFileSync(ruta(corte.poster))), { ancho: corte.ancho, alto: corte.alto }, `${corte.poster} no mide lo que dice el componente`);

    const techo = PRESUPUESTO_VIDEO_KB[corte.id];
    for (const url of [corte.webm, corte.mp4]) {
      const kb = statSync(ruta(url)).size / 1024;
      assert.ok(kb <= techo, `${url} pesa ${kb.toFixed(0)} KB (techo ${techo} KB)`);
    }
  });

  test(`vídeo de producto (${corte.id}): códecs que el móvil decodifica (#1004)`, () => {
    const { perfil, croma } = avcC(readFileSync(ruta(corte.mp4)));
    assert.ok([66, 77, 100].includes(perfil), `${corte.mp4}: perfil H.264 ${perfil} (se espera Baseline, Main o High, nunca High 4:4:4)`);
    if (croma !== null) assert.equal(croma, 1, `${corte.mp4}: croma ${croma}, tiene que ser 4:2:0`);
    assert.ok(readFileSync(ruta(corte.webm)).includes('V_VP9'), `${corte.webm} no es VP9`);
  });
}

test('el corte móvil del CSS es el del <picture> y nada llega al servidor como <video>', () => {
  const fuente = readFileSync(COMPONENTE, 'utf8');
  const px = CONSULTA_MOVIL.match(/max-width:\s*(\d+)px/)?.[1];
  assert.ok(px, 'CONSULTA_MOVIL sin max-width');
  assert.match(fuente, new RegExp(`@media \\(max-width: ${px}px\\)`), 'el CSS del componente usa otro corte');
  assert.match(fuente, /<source media=\{CONSULTA_MOVIL\}/, 'el póster móvil tiene que elegirse con media en el <picture>');
  // Sin saber el ancho (servidor e hidratación) solo se pinta el <picture>.
  assert.match(fuente, /\(\) => null,/, 'la instantánea del servidor tiene que ser «no se sabe»');
});
