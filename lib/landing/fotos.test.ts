import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  FOTOS, CARPETA_PUBLICA, derivados, rutaFoto, altoDe,
  type FotoRegistrada, type Consentimiento,
} from '../../components/landing/fotos.ts';

// ─────────────────────────────────────────────────────────────────────────────
// El registro de fotos de la home (components/landing/fotos.ts) y lo que
// `scripts/fotos-landing.mjs` dejó en public/landing/fotos/.
//
// Lo que se protege: que ninguna foto vuelva a entrar sin decir de dónde sale,
// que no se rompa ninguna en producción por un fichero que no se generó, y que
// el primer pantallazo no engorde sin que nadie lo vea.
// ─────────────────────────────────────────────────────────────────────────────

const CARPETA = join(import.meta.dirname, '..', '..', 'public', CARPETA_PUBLICA);
const ENTRADAS = Object.entries(FOTOS) as [string, FotoRegistrada][];
const CONSENTIMIENTOS: Consentimiento[] = ['no-aplica', 'firmado'];

// Presupuestos. El que de verdad importa es el del héroe: la AVIF de 1280 es la
// que se descarga un portátil con pantalla retina en el primer pantallazo.
const PRESUPUESTO_HEROE_AVIF_1280_KB = 140;
// Techos para todo lo demás: no son objetivos, son el aviso de que algo se
// exportó mal (calidad al 100, sin recortar, en el formato equivocado).
const TECHO_KB = { avif: 200, webp: 320 } as const;

/** Ancho y alto leídos de la cabecera del fichero, sin librerías de imagen. */
function medidas(fichero: string): { ancho: number; alto: number } {
  const b = readFileSync(fichero);
  if (fichero.endsWith('.webp')) {
    assert.equal(b.toString('ascii', 0, 4), 'RIFF', `${fichero} no es un RIFF`);
    assert.equal(b.toString('ascii', 8, 12), 'WEBP', `${fichero} no es un WebP`);
    const trozo = b.toString('ascii', 12, 16);
    if (trozo === 'VP8X') return { ancho: 1 + b.readUIntLE(24, 3), alto: 1 + b.readUIntLE(27, 3) };
    if (trozo === 'VP8L') {
      const bits = b.readUInt32LE(21);
      return { ancho: (bits & 0x3fff) + 1, alto: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (trozo === 'VP8 ') return { ancho: b.readUInt16LE(26) & 0x3fff, alto: b.readUInt16LE(28) & 0x3fff };
    throw new Error(`${fichero}: trozo WebP desconocido «${trozo}»`);
  }
  // AVIF: la caja `ispe` (image spatial extents) lleva ancho y alto tras 4 bytes
  // de versión y flags.
  const i = b.indexOf('ispe', 0, 'ascii');
  assert.ok(i > 0, `${fichero} no tiene caja ispe: ¿es un AVIF?`);
  return { ancho: b.readUInt32BE(i + 8), alto: b.readUInt32BE(i + 12) };
}

test('hay al menos la foto del héroe', () => {
  assert.ok(FOTOS.heroe, 'el héroe pinta FOTOS.heroe');
});

for (const [clave, foto] of ENTRADAS) {
  test(`${clave}: tiene alt descriptivo`, () => {
    assert.ok(foto.alt.trim().length >= 20, `alt demasiado corto o vacío: «${foto.alt}»`);
    assert.doesNotMatch(foto.alt, /\.(jpe?g|png|webp|avif)\b/i, 'el alt no es un nombre de fichero');
  });

  test(`${clave}: dice de dónde sale y con qué licencia`, () => {
    const c = foto.credito;
    assert.ok(c.autor.trim(), 'falta el autor (si no consta, se dice así, no se deja vacío)');
    assert.ok(c.fuente.trim(), 'falta la fuente');
    assert.ok(c.licencia.trim(), 'falta la licencia');
    assert.match(c.fechaDescarga, /^\d{4}-\d{2}-\d{2}$/, 'fechaDescarga en AAAA-MM-DD');
    assert.ok(c.url === '' || c.url.startsWith('https://'), `url de crédito rara: «${c.url}»`);
  });

  test(`${clave}: consentimiento válido`, () => {
    assert.ok(CONSENTIMIENTOS.includes(foto.consentimiento), `consentimiento desconocido: ${foto.consentimiento}`);
  });

  test(`${clave}: nombres de fichero descriptivos y recortes coherentes`, () => {
    assert.match(foto.id, /^[a-z0-9]+(-[a-z0-9]+)+$/, 'id en minúsculas con guiones (es el nombre del fichero)');
    for (const r of Object.values(foto.recortes)) {
      if (!r) continue;
      assert.ok(r.foco.x >= 0 && r.foco.x <= 1 && r.foco.y >= 0 && r.foco.y <= 1, 'el foco va de 0 a 1');
      assert.ok(r.anchos.length > 0, 'cada recorte tiene al menos un ancho');
      assert.deepEqual([...r.anchos], [...r.anchos].sort((a, b) => a - b), 'anchos de menor a mayor');
    }
  });

  test(`${clave}: ninguna URL apunta fuera del sitio`, () => {
    for (const d of derivados(foto)) {
      const url = rutaFoto(foto, d.recorte, d.ancho, d.formato);
      assert.ok(url.startsWith(`/${CARPETA_PUBLICA}/`), `ruta fuera de la carpeta: ${url}`);
      assert.doesNotMatch(url, /^\/\/|^[a-z]+:/i, `URL remota: ${url}`);
    }
  });

  test(`${clave}: existen todos los ficheros, con sus medidas y dentro de presupuesto`, () => {
    for (const d of derivados(foto)) {
      const ruta = join(CARPETA, d.fichero);
      assert.ok(existsSync(ruta), `falta ${d.fichero}: node scripts/fotos-landing.mjs`);

      const { ancho, alto } = medidas(ruta);
      assert.deepEqual({ ancho, alto }, { ancho: d.ancho, alto: d.alto },
        `${d.fichero} no mide lo que dice el registro: ¿se cambió el recorte sin regenerar?`);

      const kb = statSync(ruta).size / 1024;
      assert.ok(kb <= TECHO_KB[d.formato], `${d.fichero} pesa ${kb.toFixed(1)} KB (techo ${TECHO_KB[d.formato]} KB)`);
    }
  });
}

test('la AVIF de 1280 del héroe cabe en su presupuesto', () => {
  const foto: FotoRegistrada = FOTOS.heroe;
  assert.ok(foto.recortes.escritorio.anchos.includes(1280), 'el héroe se genera a 1280');
  const fichero = join(CARPETA, `${foto.id}-1280.avif`);
  const kb = statSync(fichero).size / 1024;
  assert.ok(kb <= PRESUPUESTO_HEROE_AVIF_1280_KB, `pesa ${kb.toFixed(1)} KB (presupuesto ${PRESUPUESTO_HEROE_AVIF_1280_KB} KB)`);
  assert.equal(altoDe(foto.recortes.escritorio, 1280), 1024, 'escritorio 5:4');
});

test('no quedan ficheros huérfanos de fotos que ya no están en el registro', () => {
  const esperados = new Set(ENTRADAS.flatMap(([, f]) => derivados(f).map((d) => d.fichero)));
  const sobran = readdirSync(CARPETA).filter((f) => !esperados.has(f));
  assert.deepEqual(sobran, [], 'sobran ficheros: el script los borra al regenerar');
});
