import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  GUIAS, TARJETAS_SIN_GUIA, ORDEN_LISTADO, DESTACADA, CARPETA_PORTADAS, PRESUPUESTO_PORTADA_KB, ANCHOS_PORTADA, ANCHO_MAX_PORTADA,
  anchoUtil, altoUtil, anchosPortada, derivadosPortada, rutaPortada, todasLasPortadas, fechaModificada, mesCorto, metaTarjeta,
  PRESUPUESTO_PORTADA_CABECERA_KB,
} from './guias.ts';

// ─────────────────────────────────────────────────────────────────────────────
// El registro de guías de /recursos y sus portadas en public/.
//
// Lo que se protege: que cada guía publicada tenga portada, con crédito y un
// alt que no la venda como foto real; que ningún fichero falte, venga ampliado
// o engorde; y que las fechas no vuelvan a escribirse a mano en cada página.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..', '..');
const CARPETA = join(RAIZ, 'public', CARPETA_PORTADAS);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Ancho y alto leídos de la cabecera del fichero, sin librerías de imagen. */
function medidas(fichero: string): { ancho: number; alto: number } {
  const b = readFileSync(fichero);
  if (fichero.endsWith('.webp')) {
    const trozo = b.toString('ascii', 12, 16);
    if (trozo === 'VP8X') return { ancho: 1 + b.readUIntLE(24, 3), alto: 1 + b.readUIntLE(27, 3) };
    if (trozo === 'VP8L') {
      const bits = b.readUInt32LE(21);
      return { ancho: (bits & 0x3fff) + 1, alto: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (trozo === 'VP8 ') return { ancho: b.readUInt16LE(26) & 0x3fff, alto: b.readUInt16LE(28) & 0x3fff };
    throw new Error(`${fichero}: trozo WebP desconocido «${trozo}»`);
  }
  const i = b.indexOf('ispe', 0, 'ascii');
  assert.ok(i > 0, `${fichero} no tiene caja ispe: ¿es un AVIF?`);
  return { ancho: b.readUInt32BE(i + 8), alto: b.readUInt32BE(i + 12) };
}

test('cada carpeta de app/recursos es una guía registrada, y al revés', () => {
  const enApp = readdirSync(join(RAIZ, 'app', 'recursos'), { withFileTypes: true })
    // `[slug]` es el segmento de los artículos escritos como datos
    // (lib/recursos/articulos), que tienen su propio test de registro.
    .filter((d) => d.isDirectory() && !d.name.startsWith('[') && existsSync(join(RAIZ, 'app', 'recursos', d.name, 'page.tsx')))
    .map((d) => d.name)
    .sort();
  assert.deepEqual(GUIAS.map((g) => g.slug).sort(), enApp);
});

test('ninguna guía escribe sus fechas a mano: salen del registro', () => {
  // Antes cada page.tsx pasaba `datePublished` al JSON-LD y el registro SEO
  // tenía otra copia; así fue como la cabecera decía «jul 2026» en guías de agosto.
  for (const g of GUIAS) {
    const pagina = readFileSync(join(RAIZ, 'app', 'recursos', g.slug, 'page.tsx'), 'utf8');
    assert.doesNotMatch(pagina, /date(Published|Modified)\s*=/, `${g.slug}: fecha escrita a mano en la página`);
    assert.doesNotMatch(pagina, /readTime="\d/, `${g.slug}: minutos escritos a mano en la página`);
    assert.match(pagina, new RegExp(`guia\\('${g.slug}'\\)`), `${g.slug}: la página no lee su entrada del registro`);
  }
});

test('fechas válidas y en orden', () => {
  for (const g of GUIAS) {
    assert.match(g.publicado, ISO, `${g.slug}: publicado`);
    assert.ok(!Number.isNaN(Date.parse(g.publicado)), `${g.slug}: publicado no es una fecha`);
    if (g.actualizado) {
      assert.match(g.actualizado, ISO, `${g.slug}: actualizado`);
      assert.ok(g.actualizado > g.publicado, `${g.slug}: actualizado antes de publicado`);
    }
    assert.ok(Number.isInteger(g.lectura) && g.lectura > 0, `${g.slug}: minutos de lectura`);
  }
});

test('el pie de las tarjetas sale de las mismas fechas', () => {
  assert.equal(mesCorto('2026-08-06'), 'ago 2026');
  assert.equal(mesCorto('2026-01-31'), 'ene 2026');
  const f = GUIAS.find((g) => g.slug === 'facturacion-electronica-verifactu')!;
  assert.equal(metaTarjeta(f), '7 min · jul 2026');
  assert.equal(fechaModificada(f), '2026-09-25');
});

test('el listado enseña todas las guías y tarjetas, una vez cada una', () => {
  const claves = [...GUIAS.map((g) => g.slug), ...TARJETAS_SIN_GUIA.map((t) => t.clave)];
  assert.equal(new Set(ORDEN_LISTADO).size, ORDEN_LISTADO.length, 'claves repetidas');
  for (const c of ORDEN_LISTADO) assert.ok(claves.includes(c), `ORDEN_LISTADO: «${c}» no existe`);
  assert.ok(GUIAS.some((g) => g.slug === DESTACADA), 'la destacada no es una guía');
  assert.ok(!ORDEN_LISTADO.includes(DESTACADA), 'la destacada va aparte, no repetida en la rejilla');
  for (const c of claves) if (c !== DESTACADA) assert.ok(ORDEN_LISTADO.includes(c), `«${c}» no sale en el listado`);
});

test('cada guía con enlace tiene portada con alt, crédito y consentimiento', () => {
  for (const g of GUIAS) {
    const p = g.portada;
    assert.ok(p, `${g.slug}: sin portada`);
    assert.ok(p.alt.trim().length >= 30, `${g.slug}: alt demasiado corto`);
    // Son imágenes generadas con IA: el alt no puede presentarlas como una foto real.
    assert.match(p.alt, /^Escena ilustrativa: /, `${g.slug}: el alt tiene que decir que es una escena ilustrativa`);
    assert.doesNotMatch(p.alt, /clienta|nuestro estudio|estudio real/i, `${g.slug}: el alt presenta la escena como real`);
    assert.ok(p.credito.autor && p.credito.fuente && p.credito.licencia, `${g.slug}: crédito incompleto`);
    assert.match(p.credito.fechaDescarga, ISO);
    assert.ok(['no-aplica', 'firmado'].includes(p.consentimiento));
    assert.match(p.id, /^[a-z0-9]+(-[a-z0-9]+)+$/, `${g.slug}: id de fichero`);
  }
});

test('ids de portada únicos y rutas propias del sitio', () => {
  const ids = todasLasPortadas().map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, 'dos portadas con el mismo id');
  for (const p of todasLasPortadas()) {
    for (const d of derivadosPortada(p)) {
      const url = rutaPortada(p, d.ancho, d.formato);
      assert.ok(url.startsWith(`/${CARPETA_PORTADAS}/`), url);
      assert.doesNotMatch(url, /^\/\/|^[a-z]+:/i, `URL remota: ${url}`);
    }
  }
});

test('el recorte solo quita el filete del borde, sin morder la foto', () => {
  for (const p of todasLasPortadas()) {
    assert.equal(p.recorte.length, 4, `${p.id}: recorte [arriba, derecha, abajo, izquierda]`);
    for (const r of p.recorte) assert.ok(Number.isInteger(r) && r >= 0 && r <= 6, `${p.id}: recorte de ${r} px`);
    // Y la portada sigue siendo apaisada 2:1, que es el marco donde se pinta.
    const proporcion = anchoUtil(p) / altoUtil(p);
    assert.ok(proporcion > 1.9 && proporcion < 2.2, `${p.id}: proporción ${proporcion.toFixed(2)}`);
  }
});

test('existen todos los ficheros, a su tamaño, sin ampliar y dentro de presupuesto', () => {
  assert.equal(ANCHO_MAX_PORTADA, Math.max(...ANCHOS_PORTADA));
  for (const p of todasLasPortadas()) {
    assert.ok(ANCHO_MAX_PORTADA <= anchoUtil(p), `${p.id}: se pide más ancho que el original sin filete (${anchoUtil(p)})`);
    for (const d of derivadosPortada(p)) {
      const ruta = join(CARPETA, d.fichero);
      assert.ok(existsSync(ruta), `falta ${d.fichero}: node scripts/portadas-recursos.mjs`);
      assert.deepEqual(medidas(ruta), { ancho: d.ancho, alto: d.alto }, `${d.fichero} no mide lo que dice el registro`);
      assert.ok(d.ancho <= anchoUtil(p), `${d.fichero}: ${d.ancho} px ampliaría un original de ${anchoUtil(p)}`);
      if (d.ancho === ANCHO_MAX_PORTADA) {
        const kb = statSync(ruta).size / 1024;
        assert.ok(kb <= PRESUPUESTO_PORTADA_KB[d.formato], `${d.fichero} pesa ${kb.toFixed(1)} KB (presupuesto ${PRESUPUESTO_PORTADA_KB[d.formato]} KB)`);
      }
      // La de cabecera de un artículo (su derivado mayor) tiene su propio techo.
      const mayor = Math.max(...anchosPortada(p));
      if (mayor > ANCHO_MAX_PORTADA && d.ancho === mayor) {
        const kb = statSync(ruta).size / 1024;
        const techo = PRESUPUESTO_PORTADA_CABECERA_KB[d.formato];
        assert.ok(kb <= techo, `${d.fichero} pesa ${kb.toFixed(1)} KB (presupuesto de cabecera ${techo} KB)`);
      }
    }
  }
});

test('no quedan ficheros huérfanos en la carpeta de portadas', () => {
  const esperados = new Set(todasLasPortadas().flatMap((p) => derivadosPortada(p).map((d) => d.fichero)));
  assert.deepEqual(readdirSync(CARPETA).filter((f) => !esperados.has(f)), []);
});
