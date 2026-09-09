import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Guardián: lo que viaja al navegador de la clienta no puede llevar el registro
// fiscal del estudio.
//
// ── Por qué existe ───────────────────────────────────────────────────────────
// `facturaDeSociaPublica` hacía `.from('facturas').select('*')` y devolvía
// `mapFactura(fila)` entero. `Factura` arrastra la cadena Veri*Factu del
// obligado tributario —huella, huella anterior, secuencia, estado ante la AEAT
// y CSV del acuse— y esa respuesta se serializa a JSON y llega al móvil de una
// alumna. La pantalla no lo pintaba, pero estaba ahí, a un F12 de distancia.
//
// Arreglarlo fue escribir una lista blanca. Mantenerlo arreglado es esto: una
// lista blanca es una lista de la que alguien se acuerda hoy, y dentro de seis
// meses el camino corto es volver a `mapFactura(...)` porque «ya está mapeado».
//
// Se cruzan DOS ficheros que ningún compilador compara:
//  · `FacturaImprimible` (lib/factura-pdf.ts) — la forma del documento.
//  · el literal `factura: {` de `facturaDeSociaPublica` — lo que se manda.
//
// ── Si esto falla ────────────────────────────────────────────────────────────
// O se ha ampliado el documento de la clienta con un campo interno, o las dos
// listas han dejado de coincidir. Se arregla en el fichero que lo causó: este
// test no es el que decide qué puede ver una clienta, solo el que avisa.
//
// Mismo enfoque que `payload-socia-contrato.test.ts`, del que sale el lector.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..');

/** Claves del primer nivel de un bloque `{ ... }`. No es un parser de TS. */
function clavesDelPrimerNivel(fuente: string, apertura: RegExp): string[] {
  const m = fuente.match(apertura);
  assert.ok(m?.index != null, `no se encontró el bloque ${apertura}`);
  let i = fuente.indexOf('{', m.index);
  let prof = 0;
  const claves: string[] = [];
  for (; i < fuente.length; i++) {
    const c = fuente[i];
    if (c === '{') { prof++; continue; }
    if (c === '}') { prof--; if (prof === 0) break; continue; }
    if (prof !== 1) continue;
    if (c === '\n') {
      const finLinea = fuente.indexOf('\n', i + 1);
      const linea = fuente.slice(i + 1, finLinea === -1 ? fuente.length : finLinea);
      const k = linea.match(/^\s*([A-Za-z_$][\w$]*)\s*\??\s*:/);
      if (k) claves.push(k[1]);
    }
  }
  assert.ok(prof === 0, 'llaves desbalanceadas: el bloque no se cerró');
  return claves;
}

/**
 * El fichero sin sus líneas de comentario.
 *
 * ⚠️ Hace falta: la primera versión de este guardián se puso roja por el propio
 * comentario de cabecera de `factura-pdf.ts`, que explica que ANTES imprimía el
 * «Entorno de PRUEBAS». Un guardián que lee prosa acusa a quien documenta el
 * arreglo — el mismo tropiezo que ya documenta `paginas.test.ts`.
 *
 * Solo se quitan las líneas ENTERAS de comentario, no las de código con un
 * `//` al final: una URL `https://…` dentro de una plantilla se partiría, y
 * este lector se volvería silencioso justo donde tiene que mirar.
 */
function sinComentarios(fuente: string): string {
  return fuente
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');
}

const plantilla = sinComentarios(readFileSync(join(RAIZ, 'lib/factura-pdf.ts'), 'utf8'));
const servidor = readFileSync(join(RAIZ, 'lib/db/supabase-data-admin.ts'), 'utf8');

const declarados = clavesDelPrimerNivel(plantilla, /export interface FacturaImprimible\s*\{/);
const emitidos = clavesDelPrimerNivel(servidor, /\n\s*factura:\s*\{/);

// Nombres que delatan la cadena interna. `csv` va suelto a propósito: el CSV de
// la AEAT es el acuse de remisión, no una exportación de hoja de cálculo.
const INTERNOS = /verifactu|huella|prevhash|seq|csv|fiskaly/i;

test('los dos bloques se han leído de verdad, no están vacíos', () => {
  // Sin esto, un cambio de formato que rompiera el lector dejaría el test en
  // verde comparando dos listas vacías. Verde por vacío, otra vez no.
  assert.ok(declarados.length >= 8, `FacturaImprimible leída a medias: ${declarados.join(', ')}`);
  assert.ok(emitidos.length >= 8, `el payload del servidor leído a medias: ${emitidos.join(', ')}`);
  assert.ok(declarados.includes('numeroCompleto'), 'FacturaImprimible sin `numeroCompleto`');
  assert.ok(emitidos.includes('numeroCompleto'), 'el payload del servidor sin `numeroCompleto`');
});

test('el documento de la clienta no declara ni un campo del registro del estudio', () => {
  const intrusos = declarados.filter((d) => INTERNOS.test(d));
  assert.deepEqual(intrusos, [], `FacturaImprimible declara campos internos: ${intrusos.join(', ')}`);
});

test('el servidor no manda a la clienta ni un campo del registro del estudio', () => {
  const intrusos = emitidos.filter((d) => INTERNOS.test(d));
  assert.deepEqual(
    intrusos, [],
    `facturaDeSociaPublica manda la cadena Veri*Factu al navegador de la clienta: ${intrusos.join(', ')}`,
  );
});

test('lo que manda el servidor es exactamente el documento, ni más ni menos', () => {
  assert.deepEqual(
    [...emitidos].sort(), [...declarados].sort(),
    'el payload de la clienta y `FacturaImprimible` han dejado de coincidir',
  );
});

test('la plantilla del PDF no vuelve a imprimir la cadena interna', () => {
  // El bloque viejo llevaba «Huella:», la URL de cotejo en texto plano y el
  // aviso de entorno de pruebas. Los tres se buscan por su literal.
  assert.ok(!/Huella:/.test(plantilla), 'la plantilla vuelve a imprimir la huella');
  assert.ok(!/Entorno de PRUEBAS/i.test(plantilla), 'la plantilla vuelve a avisar del entorno de pruebas');
  assert.ok(!/QR de cotejo AEAT/.test(plantilla), 'la plantilla vuelve a imprimir la URL de cotejo');
  // Y no puede volver a construir la URL por su cuenta: el sello se lo dan.
  assert.ok(!/urlQrVerifactu/.test(plantilla), 'la plantilla decide el sello por su cuenta otra vez');
});

test('la ficha del panel SÍ conserva el registro fiscal del estudio', () => {
  // La otra mitad de la separación. Si esto falla, se ha «limpiado» de más: el
  // estudio necesita su huella y su estado ante la AEAT en alguna pantalla.
  const panel = readFileSync(join(RAIZ, 'components/cobros/panel-facturas.tsx'), 'utf8');
  assert.ok(/Huella:/.test(panel), 'el panel ya no enseña la huella al estudio');
  assert.ok(/verifactuHash/.test(panel), 'el panel ya no lee la cadena Veri*Factu');
});
