import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// El vídeo de producto del hero (components/landing/VideoProducto.tsx): un
// único fichero con controles nativos, `public/producto/tour.mp4` +
// `tour-poster.jpg`, leídos sin ffprobe (CI no lo tiene).
//
// Lo que se protege:
//   · el vídeo y el póster existen, el póster mide lo mismo que declara el
//     componente (1920×1080) y el vídeo no engorda por encima de lo que cabe
//     bien en una descarga que el visitante pide con un clic;
//   · el MP4 es H.264 High (o Main/Baseline) 4:2:0 — un 4:4:4 se reproducía en
//     negro en el móvil (#1004); ya no hay autoplay, pero el códec sigue
//     teniendo que decodificar en cualquier navegador que abra el fichero;
//   · el componente no vuelve a traer autoplay/loop, y `preload` no es
//     `"auto"` — es un vídeo que arranca el visitante, no un bucle de fondo.
// ─────────────────────────────────────────────────────────────────────────────

const PUBLIC = join(import.meta.dirname, '..', '..', 'public');
const COMPONENTE = join(import.meta.dirname, '..', '..', 'components', 'landing', 'VideoProducto.tsx');
const MP4 = join(PUBLIC, 'producto', 'tour.mp4');
const POSTER = join(PUBLIC, 'producto', 'tour-poster.jpg');

/** Techo de peso (es la portada, aunque ahora bajo demanda): que nadie suba un máster sin comprimir por error. */
const TECHO_MP4_KB = 10 * 1024;

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

function medidasJpeg(b: Buffer): { ancho: number; alto: number } {
  for (let i = 2; i < b.length - 9; ) {
    if (b[i] !== 0xff) { i++; continue; }
    const marca = b[i + 1];
    if (marca >= 0xc0 && marca <= 0xc2) return { alto: b.readUInt16BE(i + 5), ancho: b.readUInt16BE(i + 7) };
    i += 2 + b.readUInt16BE(i + 2);
  }
  throw new Error('JPEG sin SOF');
}

test('vídeo de producto: fichero, medidas y peso', () => {
  assert.ok(existsSync(MP4), 'falta public/producto/tour.mp4');
  assert.ok(existsSync(POSTER), 'falta public/producto/tour-poster.jpg');

  const mp4Medidas = medidasMp4(readFileSync(MP4));
  const posterMedidas = medidasJpeg(readFileSync(POSTER));
  assert.deepEqual(posterMedidas, mp4Medidas, 'tour-poster.jpg no mide lo mismo que tour.mp4');
  assert.deepEqual(mp4Medidas, { ancho: 1920, alto: 1080 }, 'tour.mp4 no es 1920×1080 (16:9)');

  const kb = statSync(MP4).size / 1024;
  assert.ok(kb <= TECHO_MP4_KB, `tour.mp4 pesa ${kb.toFixed(0)} KB (techo ${TECHO_MP4_KB} KB)`);
});

test('vídeo de producto: códec que decodifica en cualquier navegador (#1004)', () => {
  const { perfil, croma } = avcC(readFileSync(MP4));
  assert.ok([66, 77, 100].includes(perfil), `tour.mp4: perfil H.264 ${perfil} (se espera Baseline, Main o High, nunca High 4:4:4)`);
  if (croma !== null) assert.equal(croma, 1, `tour.mp4: croma ${croma}, tiene que ser 4:2:0`);
});

test('vídeo de producto: lo arranca el visitante, no un bucle de fondo', () => {
  const fuente = readFileSync(COMPONENTE, 'utf8');
  assert.doesNotMatch(fuente, /\bautoPlay\b/, 'no debe volver autoPlay: el vídeo lo arranca el visitante con los controles');
  assert.doesNotMatch(fuente, /\bloop\b/, 'no debe volver loop: ya no es un bucle de fondo');
  assert.match(fuente, /\bcontrols\b/, 'el <video> tiene que llevar controles nativos');
  assert.doesNotMatch(fuente, /preload=["']auto["']/, 'preload no puede ser "auto": nada se descarga hasta que se pulsa play');
  assert.match(fuente, /preload=["']none["']/, 'preload tiene que ser "none"');
});
