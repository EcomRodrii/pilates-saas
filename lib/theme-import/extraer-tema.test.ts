import test from 'node:test';
import assert from 'node:assert/strict';
import { extraerColorDeclarado, extraerColorDeMarca, extraerContenidoDeMarca } from './extraer-tema.ts';

/** Un `<script data-dc-script data-props="...">` con las props dadas —
 *  Claude Design declara uno por componente editable, no uno solo. */
function bloqueProps(props: Record<string, unknown>): string {
  return `<script data-dc-script data-props="${JSON.stringify(props).replace(/"/g, '&quot;')}">x</script>`;
}

test('extraerColorDeclarado: lee el default de la prop brand', () => {
  const props = JSON.stringify({
    studioName: { editor: 'text', default: 'Estudio Alma' },
    brand: { editor: 'color', default: '#333B24' },
  }).replace(/"/g, '&quot;');
  const html = `<script data-dc-script data-props="${props}">x</script>`;

  assert.equal(extraerColorDeclarado(html), '#333B24');
});

test('extraerColorDeclarado: sin data-props, o con JSON roto, devuelve null', () => {
  assert.equal(extraerColorDeclarado('<div>hola</div>'), null);
  assert.equal(extraerColorDeclarado('<script data-dc-script data-props="{esto no es json">x</script>'), null);
});

test('extraerColorDeclarado: sin prop brand declarada, devuelve null — nunca adivina', () => {
  const props = JSON.stringify({
    studioName: { editor: 'text', default: 'Estudio Alma' },
  }).replace(/"/g, '&quot;');
  const html = `<script data-dc-script data-props="${props}">x</script>`;

  assert.equal(extraerColorDeclarado(html), null);
});

test('extraerColorDeclarado: un default que no es un hex válido se descarta', () => {
  const props = JSON.stringify({
    brand: { editor: 'color', default: 'no soy un color' },
  }).replace(/"/g, '&quot;');
  const html = `<script data-dc-script data-props="${props}">x</script>`;

  assert.equal(extraerColorDeclarado(html), null);
});

test('extraerColorDeclarado: acepta el shorthand #RGB, igual que el resto del repo (hexARgb)', () => {
  const props = JSON.stringify({ brand: { default: '#333' } }).replace(/"/g, '&quot;');
  const html = `<script data-dc-script data-props="${props}">x</script>`;
  assert.equal(extraerColorDeclarado(html), '#333');
});

// ── extraerColorDeMarca: automática de verdad, nunca bloquea ────────────────
// El pedido explícito fue "que sea automático, nada de reglas que digan
// 'este tema no declara un color extraíble'" — estos tests fijan que la
// función SIEMPRE devuelve algo, para ZIPs que no traen el contrato de
// data-props (la inmensa mayoría).

test('extraerColorDeMarca: el contrato declarado sigue ganando cuando existe', () => {
  const props = JSON.stringify({ brand: { default: '#333B24' } }).replace(/"/g, '&quot;');
  const html = `<script data-dc-script data-props="${props}">x</script><style>:root{--otro:#1a73e8}</style><div style="color:#1a73e8">x</div><div style="color:#1a73e8">x</div>`;
  assert.equal(extraerColorDeMarca(html), '#333B24');
});

test('extraerColorDeMarca: ⚠️ un verde oliva apagado (#333B24, diferencia de 23 entre canales) NO se confunde con un gris', () => {
  // Es EL color real que este arreglo tenía que dejar de perder: con un
  // umbral de neutralidad mal calibrado, este mismo hex se descartaba como
  // "gris" y la extracción caía al verde de fábrica en vez del de verdad.
  const html = `<style>:root{--marca:#333B24}</style><div style="background:#333B24">a</div><div style="color:#333B24">b</div>`;
  assert.equal(extraerColorDeMarca(html), '#333b24');
});

test('extraerColorDeMarca: sin contrato, usa la variable CSS declarada Y más usada — sea cual sea su nombre', () => {
  // Nombre de variable arbitrario ("--acento-2"), no "brand"/"primary": la
  // heurística no depende de adivinar el nombre.
  const html = `
    <style>:root{--gris-fondo:#e7e4db;--acento-2:#c0392b}</style>
    <div style="background:#e7e4db">fondo</div>
    <div style="color:#c0392b">a</div>
    <div style="border-color:#c0392b">b</div>
    <div style="color:#c0392b">c</div>
  `;
  assert.equal(extraerColorDeMarca(html), '#c0392b');
});

test('extraerColorDeMarca: sin ninguna variable CSS, cae al color no-neutro más repetido del documento', () => {
  const html = `<div style="color:#2e7d32">a</div><span style="border:1px solid #2e7d32">b</span><p style="color:#2e7d32">c</p><i style="color:#9e9e9e">gris, una vez</i>`;
  assert.equal(extraerColorDeMarca(html), '#2e7d32');
});

test('extraerColorDeMarca: un documento sin ningún color (o solo neutros) no bloquea — cae al verde de fábrica', () => {
  assert.equal(extraerColorDeMarca('<div>sin estilos</div>'), '#343825');
  assert.equal(extraerColorDeMarca('<style>:root{--fondo:#ffffff;--texto:#333333}</style>'), '#343825');
});

// ── extraerContenidoDeMarca: "extrae todo, hasta lo más mínimo" ────────────
// Un ZIP de verdad declara VARIOS `data-dc-script` (uno por componente
// editable — portada, "sobre nosotros", CTA…), no uno solo para el color.
// Estos tests combinan varios bloques, como el diseño real.

test('extraerContenidoDeMarca: combina TODOS los data-dc-script del documento, no solo el primero', () => {
  const html =
    bloqueProps({ studioName: { editor: 'text', default: 'Estudio Alma' }, brand: { editor: 'color', default: '#333B24' } }) +
    bloqueProps({ acento: { editor: 'color', default: '#C9A15A' } }) +
    bloqueProps({ titular: { editor: 'text', default: 'Encuentra tu calma' } });

  const r = extraerContenidoDeMarca(html);
  assert.equal(r.primary, '#333B24');
  assert.equal(r.secondary, '#C9A15A');
  assert.equal(r.reservarTitular, 'Encuentra tu calma');
});

test('extraerContenidoDeMarca: reparte el texto de más corto (CTA) a más largo (sobre nosotros)', () => {
  const html =
    bloqueProps({ brand: { editor: 'color', default: '#333B24' } }) +
    bloqueProps({
      boton: { editor: 'text', default: 'Reservar' },
      titular: { editor: 'text', default: 'Encuentra tu calma interior' },
      subtitulo: { editor: 'text', default: 'Clases de pilates reformer y mat, para todos los niveles' },
      sobreTitulo: { editor: 'text', default: 'Quiénes somos' },
      sobreTexto: { editor: 'text', default: 'Somos un estudio boutique con más de diez años de experiencia enseñando pilates en el centro de la ciudad, con instructoras certificadas y un ambiente cercano.' },
    });

  const r = extraerContenidoDeMarca(html);
  assert.equal(r.reservarCta, 'Reservar');
  assert.equal(r.reservarTitular, 'Encuentra tu calma interior');
  assert.equal(r.reservarSubtitulo, 'Clases de pilates reformer y mat, para todos los niveles');
  assert.equal(r.reservarSobreTitulo, 'Quiénes somos');
  assert.match(r.reservarSobreTexto, /^Somos un estudio boutique/);
});

test('extraerContenidoDeMarca: con menos de cinco textos, rellena los huecos cortos y deja el resto vacío', () => {
  const html = bloqueProps({
    brand: { editor: 'color', default: '#333B24' },
    boton: { editor: 'text', default: 'Reservar' },
    titular: { editor: 'text', default: 'Encuentra tu calma' },
  });
  const r = extraerContenidoDeMarca(html);
  assert.equal(r.reservarCta, 'Reservar');
  assert.equal(r.reservarTitular, 'Encuentra tu calma');
  assert.equal(r.reservarSubtitulo, '');
  assert.equal(r.reservarSobreTitulo, '');
  assert.equal(r.reservarSobreTexto, '');
});

test('extraerContenidoDeMarca: con más de cinco textos, el último hueco (sobre nosotros) coge el MÁS LARGO, no el quinto en orden', () => {
  // Seis candidatos: el 5º más corto ("medio", 80 y pico caracteres) NO debe
  // ganar el hueco de "sobre nosotros" — tiene que ganarlo "largo" (el
  // verdaderamente más largo de los seis), aunque quede sexto en el orden.
  const medio = 'Un texto de longitud media, ni tan corto como un botón ni tan largo como un párrafo entero de verdad.';
  const largo = 'Un párrafo de verdad, bastante más largo que cualquiera de los otros textos declarados en este diseño de ejemplo, para comprobar que gana por ser el más largo de todos y no simplemente el quinto en el orden por longitud.';
  assert.ok(largo.length > medio.length);

  const html = bloqueProps({
    brand: { editor: 'color', default: '#333B24' },
    a: { editor: 'text', default: 'Ir' },
    b: { editor: 'text', default: 'Reservar ya' },
    c: { editor: 'text', default: 'Encuentra tu calma interior' },
    d: { editor: 'text', default: 'Clases para todos los niveles, mañana y tarde' },
    e: { editor: 'text', default: medio },
    f: { editor: 'text', default: largo },
  });
  const r = extraerContenidoDeMarca(html);
  assert.equal(r.reservarSobreTexto, largo);
  assert.notEqual(r.reservarSobreTexto, medio);
});

test('extraerContenidoDeMarca: studioName y colores nunca se cuelan como texto', () => {
  const html = bloqueProps({
    studioName: { editor: 'text', default: 'Estudio Alma' },
    brand: { editor: 'color', default: '#333B24' },
    boton: { editor: 'text', default: 'Reservar' },
  });
  const r = extraerContenidoDeMarca(html);
  assert.equal(r.reservarCta, 'Reservar');
  assert.notEqual(r.reservarTitular, 'Estudio Alma');
  assert.notEqual(r.reservarSubtitulo, 'Estudio Alma');
});

test('extraerContenidoDeMarca: trunca un texto que se pasa del límite de su campo', () => {
  const ctaLargo = 'Reserva tu clase de pilates reformer ahora mismo, plazas limitadas';
  const html = bloqueProps({ boton: { editor: 'text', default: ctaLargo } });
  const r = extraerContenidoDeMarca(html);
  assert.equal(r.reservarCta.length, 28); // RESERVAR_CTA_MAX
  assert.equal(r.reservarCta, ctaLargo.slice(0, 28));
});

test('extraerContenidoDeMarca: imagen con URL externa (http/https) se recoge; una interna no', () => {
  const conImagen = bloqueProps({ foto: { editor: 'image', default: 'https://images.unsplash.com/foto.jpg' } });
  assert.equal(extraerContenidoDeMarca(conImagen).imagenUrl, 'https://images.unsplash.com/foto.jpg');

  const interna = bloqueProps({ foto: { editor: 'image', default: '/assets/foto-local.jpg' } });
  assert.equal(extraerContenidoDeMarca(interna).imagenUrl, null);
});

test('extraerContenidoDeMarca: ⚠️ "sobreTitulo" clasifica como título de "sobre nosotros", NO como titular — aunque contenga "Titulo"', () => {
  // Regresión real, cazada escribiendo estos mismos tests: un orden de
  // patrones ingenuo comprobaba "título" antes que "sobre", y "sobreTitulo"
  // (que SÍ contiene "Titulo" como subcadena) se colaba en el titular en vez
  // de en su propio hueco. Igual al revés con "sobreTexto" y "texto".
  const html = bloqueProps({
    sobreTitulo: { editor: 'text', default: 'Quiénes somos' },
    sobreTexto: { editor: 'text', default: 'Un estudio boutique en el centro.' },
    titular: { editor: 'text', default: 'Encuentra tu calma' },
  });
  const r = extraerContenidoDeMarca(html);
  assert.equal(r.reservarSobreTitulo, 'Quiénes somos');
  assert.equal(r.reservarSobreTexto, 'Un estudio boutique en el centro.');
  assert.equal(r.reservarTitular, 'Encuentra tu calma');
});

test('extraerContenidoDeMarca: sin ningún data-props, todo vacío o de fábrica — nunca lanza', () => {
  const r = extraerContenidoDeMarca('<div>sin nada</div>');
  assert.equal(r.primary, '#343825');
  assert.equal(r.secondary, null);
  assert.equal(r.imagenUrl, null);
  assert.equal(r.reservarTitular, '');
  assert.equal(r.reservarSobreTexto, '');
});
