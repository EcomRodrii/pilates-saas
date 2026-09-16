import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cartelPdf, codigoLegible, disenoCartel, nombreArchivoQr, normalizarHex, svgCartel, svgQr, tramosQr, urlLegible,
  type DatosCartel,
} from './escaparate.ts';
import { QrCode, Ecc } from '../vendor/qrcodegen.ts';

const URL_RESERVAS = 'https://www.tentare.app/reservar/pilates-centro';
const latin1 = (b: Uint8Array) => Array.from(b, c => String.fromCharCode(c)).join('');
const cartel = (cambios: Partial<DatosCartel> = {}): DatosCartel => ({
  estudio: 'Pilates Centro', destino: 'reservas', url: URL_RESERVAS,
  colores: { fondo: '#343825', codigo: '#111111' },
  ...cambios,
});

test('los tramos cubren exactamente los módulos oscuros del código', () => {
  const qr = QrCode.encodeText(URL_RESERVAS, Ecc.QUARTILE);
  let oscuros = 0;
  for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) if (qr.getModule(x, y)) oscuros++;
  const { lado, tramos } = tramosQr(URL_RESERVAS);
  assert.equal(lado, qr.size + 8, 'zona de silencio de 4 módulos por lado');
  assert.equal(tramos.reduce((s, t) => s + t.ancho, 0), oscuros);
  // Y ningún tramo se sale de la zona útil.
  for (const t of tramos) assert.ok(t.x >= 4 && t.x + t.ancho <= lado - 4 && t.y >= 4 && t.y < lado - 4);
  assert.equal(tramosQr(URL_RESERVAS, 0).lado, qr.size, 'sin margen, para ir dentro de la tarjeta del cartel');
});

test('solo el código: SVG autónomo, fondo blanco, su color y la etiqueta escapada', () => {
  const svg = svgQr(URL_RESERVAS, 'Reservas de «Pilates & Co»', '#0f766e');
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 \d+ \d+"/);
  assert.match(svg, /<rect [^>]*fill="#FFFFFF"/);
  assert.match(svg, /<path [^>]*fill="#0F766E"/);
  assert.match(svg, /aria-label="Reservas de «Pilates &amp; Co»"/);
});

test('colores: se normalizan, y el código solo acepta los que el móvil lee sobre blanco', () => {
  assert.equal(normalizarHex('#abc'), '#AABBCC');
  assert.equal(normalizarHex('no'), null);
  assert.equal(codigoLegible('#111111'), true);
  assert.equal(codigoLegible('#0F766E'), true);
  assert.equal(codigoLegible('#F7C6D9'), false, 'un rosa pastel no se lee tras un cristal');
  assert.equal(codigoLegible('#FFFFFF'), false);
});

test('el cartel: texto claro sobre fondo oscuro y oscuro sobre fondo claro', () => {
  const tintaDe = (fondo: string) => {
    const titulo = disenoCartel(cartel({ colores: { fondo, codigo: '#111111' } }))
      .find(p => p.tipo === 'texto' && p.texto === 'Reserva tu clase');
    return titulo?.tipo === 'texto' ? titulo.color : null;
  };
  assert.equal(tintaDe('#343825'), '#FFFFFF');
  assert.equal(tintaDe('#F7C6D9'), '#131313');
});

test('el cartel: un color de código ilegible no llega al papel, aunque se lo pasen', () => {
  const codigo = disenoCartel(cartel({ colores: { fondo: '#343825', codigo: '#FFE4EC' } })).find(p => p.tipo === 'codigo');
  assert.equal(codigo?.tipo === 'codigo' && codigo.color, '#111111');
});

test('el cartel: sobre fondo blanco la tarjeta lleva filo, y sobre color no', () => {
  const bordeDe = (fondo: string) => disenoCartel(cartel({ colores: { fondo, codigo: '#111111' } }))
    .filter(p => p.tipo === 'caja')
    .map(p => (p.tipo === 'caja' ? p.borde : undefined))[1];
  assert.ok(bordeDe('#FFFFFF'));
  assert.equal(bordeDe('#343825'), undefined);
});

test('el cartel: nada se sale del papel y el código conserva su zona de silencio', () => {
  const piezas = disenoCartel(cartel({ estudio: 'Estudio de Pilates y Bienestar Integral del Mediterráneo Occidental' }));
  for (const p of piezas) {
    if (p.tipo === 'texto') assert.ok(p.tamano >= 8, `«${p.texto}» a ${p.tamano} pt`);
  }
  const codigo = piezas.find(p => p.tipo === 'codigo');
  const esquinas = piezas.find(p => p.tipo === 'esquinas');
  assert.ok(codigo?.tipo === 'codigo' && esquinas?.tipo === 'esquinas');
  const silencio = 4 * codigo.modulo;
  assert.ok(codigo.x - (esquinas.x + esquinas.grosor / 2) >= silencio, 'las esquinas no pisan los 4 módulos de silencio');
});

test('nombres de archivo y dirección legible', () => {
  assert.equal(nombreArchivoQr('reservas', 'pilates-centro', 'codigo', 'png'), 'qr-reservas-pilates-centro.png');
  assert.equal(nombreArchivoQr('app', 'pilates-centro', 'cartel', 'pdf'), 'cartel-qr-app-pilates-centro.pdf');
  assert.equal(nombreArchivoQr('web', 'pilates-centro', 'cartel', 'png'), 'cartel-qr-web-pilates-centro.png');
  assert.equal(urlLegible('https://www.tentare.app/portal/pilates-centro/'), 'www.tentare.app/portal/pilates-centro');
});

test('el cartel es un PDF válido: cabecera, cierre y tabla xref que apunta a cada objeto', () => {
  const pdf = latin1(cartelPdf(cartel()));
  assert.ok(pdf.startsWith('%PDF-1.4\n'));
  assert.ok(pdf.trimEnd().endsWith('%%EOF'));

  const inicioXref = Number(pdf.match(/startxref\n(\d+)\n%%EOF/)![1]);
  assert.ok(pdf.slice(inicioXref).startsWith('xref\n'), 'startxref apunta a la tabla');
  const entradas = pdf.slice(inicioXref).split('\n').slice(3).filter(l => / 00000 n $/.test(l));
  assert.equal(entradas.length, 7);
  entradas.forEach((linea, i) => {
    const pos = Number(linea.slice(0, 10));
    assert.ok(pdf.slice(pos).startsWith(`${i + 1} 0 obj\n`), `el objeto ${i + 1} está donde dice la tabla`);
  });

  // La longitud declarada del contenido es la real.
  const m = pdf.match(/<< \/Length (\d+) >>\nstream\n/)!;
  const inicio = pdf.indexOf(m[0]) + m[0].length;
  assert.equal(pdf.slice(inicio + Number(m[1]), inicio + Number(m[1]) + '\nendstream'.length), '\nendstream');
});

test('el cartel en PDF lleva el nombre, el mensaje, el código, la dirección y los colores elegidos', () => {
  const pdf = latin1(cartelPdf(cartel({ colores: { fondo: '#0F766E', codigo: '#8A2451' } })));
  assert.match(pdf, /\(PILATES CENTRO\) Tj/);
  assert.match(pdf, /\(Reserva tu clase\) Tj/);
  assert.ok(pdf.includes('(Apunta con la c\xE1mara del m\xF3vil) Tj'));
  assert.match(pdf, /\(www\.tentare\.app\/reservar\/pilates-centro\) Tj/);
  assert.ok((pdf.match(/ re\n/g) ?? []).length > 50, 'el código se dibuja con rectángulos');
  assert.ok(pdf.includes('0.059 0.463 0.431 rg'), 'el fondo #0F766E');
  assert.ok(pdf.includes('0.541 0.141 0.318 rg'), 'el código #8A2451');
});

test('el SVG del cartel es el mismo dibujo que el PDF', () => {
  const datos = cartel({ estudio: 'Pilates <Centro>' });
  const svg = svgCartel(datos, 'Cartel');
  const textos = disenoCartel(datos).filter(p => p.tipo === 'texto');
  assert.equal((svg.match(/<text /g) ?? []).length, textos.length);
  assert.match(svg, />PILATES &lt;CENTRO&gt;<\/text>/);
  assert.match(svg, /viewBox="0 0 595\.28 841\.89"/);
});

test('acentos y eñes en WinAnsi; paréntesis escapados; lo que no cabe en la fuente no rompe el PDF', () => {
  const pdf = latin1(cartelPdf(cartel({ estudio: 'Estudio Peña (Almería) 🧘', destino: 'app' })));
  assert.ok(pdf.includes('(ESTUDIO PE\xD1A \\(ALMER\xCDA\\)) Tj'), 'Ñ = 0xD1, Í = 0xCD y ( ) escapados; el emoji fuera');
  assert.match(pdf, /\(Entra en la app del estudio\) Tj/);
});
