import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalizarOrigen, LEGAL } from '../legal-info.ts';
import { METODOS, type MetodoIntegracion } from './catalogo.ts';
import {
  FIRMA_CONTENIDO_VALIDA, FORMAS_PEGADAS, claveVista, esOrigenDeTentare, formaDeMetodo, origenAnfitrion,
} from './pegado.ts';

// El CHECK `widget_eventos_anfitrion_es_origen` de la migración de la Fase C.
// Lo que `origenAnfitrion` acepte y la BD no, haría fallar el insert y se
// perdería la visita entera, no solo el anfitrión.
const CHECK_ANFITRION = /^https?:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]{1,5})?$/;

function aceptado(valor: string): string {
  const o = origenAnfitrion(valor);
  assert.ok(o, `debería aceptarse: ${valor}`);
  assert.ok(o.length <= 300 && CHECK_ANFITRION.test(o), `no cabe en el CHECK: ${o}`);
  return o;
}

// ── origenAnfitrion ──────────────────────────────────────────────────────────

test('origenAnfitrion: http y https, porque una web del estudio en http es su web', () => {
  assert.equal(aceptado('http://albapilates.example.com'), 'http://albapilates.example.com');
  assert.equal(aceptado('https://albapilates.example.com'), 'https://albapilates.example.com');
  assert.equal(aceptado('https://www.albapilates.example.com'), 'https://www.albapilates.example.com');
  assert.equal(aceptado('https://reservas.albapilates.example.com:8443'), 'https://reservas.albapilates.example.com:8443');
});

test('⚠️ origenAnfitrion: se queda SOLO con el origen, aunque llegue con ruta, query y ancla', () => {
  assert.equal(aceptado('https://albapilates.example.com/horarios?utm_source=x&socia=1#reservar'), 'https://albapilates.example.com');
  assert.equal(aceptado('http://albapilates.example.com/'), 'http://albapilates.example.com');
  assert.equal(aceptado('  https://AlbaPilates.Example.COM/Clases  '), 'https://albapilates.example.com');
  assert.equal(aceptado('https://albapilates.example.com:443/x'), 'https://albapilates.example.com');
  // El tope es sobre lo que se guarda: una ruta larga no le quita la web.
  const largo = `https://albapilates.example.com/${'a'.repeat(400)}?q=${'b'.repeat(400)}`;
  assert.ok(largo.length > 300);
  assert.equal(aceptado(largo), 'https://albapilates.example.com');
});

test('origenAnfitrion: localhost y 127.0.0.1 sí (quien prueba su web en su ordenador)', () => {
  assert.equal(aceptado('http://localhost:3000/prueba'), 'http://localhost:3000');
  assert.equal(aceptado('http://127.0.0.1:5173'), 'http://127.0.0.1:5173');
});

test('⚠️ origenAnfitrion: rechaza IP, «null», credenciales, javascript: y más de 300 caracteres', () => {
  const etiqueta63 = 'a'.repeat(63);
  const hostLargo = `https://${[etiqueta63, etiqueta63, etiqueta63, etiqueta63, etiqueta63].join('.')}.example.com`;
  assert.ok(hostLargo.length > 300);
  for (const malo of [
    // IP (salvo 127.0.0.1), también escrita de otras formas
    'http://192.168.1.10', 'https://10.0.0.1:8080/x', 'http://3232235777', 'http://[::1]:3000', 'https://[2001:db8::1]',
    // lo que dan un iframe sandbox, file:// o un referrer vacío
    'null', ' null ', '', '   ',
    // credenciales
    'https://usuaria:secreto@albapilates.example.com', 'https://usuaria@albapilates.example.com',
    // otros esquemas
    'javascript:alert(1)', 'data:text/html,<p>x</p>', 'ftp://albapilates.example.com', 'file:///Users/x/web.html',
    'blob:https://albapilates.example.com/uuid', 'about:blank',
    // sin esquema, sin dominio, dominio raro
    'albapilates.example.com', 'http://intranet', 'http://albapilates.123', 'http://alba_pilates.example.com',
    'http://-alba.example.com', 'https://albapilates.example.com.',
    // más de 300
    hostLargo,
  ]) assert.equal(origenAnfitrion(malo), null, malo);
});

test('origenAnfitrion: lo que no es texto, null', () => {
  for (const malo of [null, undefined, 42, {}, ['https://albapilates.example.com'], new URL('https://albapilates.example.com')]) {
    assert.equal(origenAnfitrion(malo), null, String(malo));
  }
});

// ── esOrigenDeTentare ────────────────────────────────────────────────────────

// Como los pasará la ruta: el canónico de Tentare y el de la propia petición.
const PROPIOS = [canonicalizarOrigen(new URL(LEGAL.url).origin), 'http://localhost:3000'];

test('⚠️ esOrigenDeTentare: el apex y el www de Tentare, y cualquier *.vercel.app', () => {
  const apex = `https://${new URL(LEGAL.url).hostname.replace(/^www\./, '')}`;
  for (const propio of [LEGAL.url, apex, `${LEGAL.url}/`, 'https://tentare-git-rama-equipo.vercel.app', 'https://x.vercel.app', 'http://localhost:3000']) {
    assert.equal(esOrigenDeTentare(propio, PROPIOS), true, propio);
  }
});

test('esOrigenDeTentare: la web del estudio no lo es, aunque se le parezca', () => {
  const host = new URL(LEGAL.url).hostname;
  for (const ajeno of [
    'https://albapilates.example.com', 'http://albapilates.example.com', `https://${host}.example.com`,
    'https://vercel.app', 'https://evilvercel.app', 'https://vercel.app.example.com', 'http://localhost:4000',
    `http://${host}`, 'no es una url', 'null', '',
  ]) assert.equal(esOrigenDeTentare(ajeno, PROPIOS), false, ajeno);
  // Sin propios, solo cuenta *.vercel.app.
  assert.equal(esOrigenDeTentare(LEGAL.url, []), false);
});

// ── Formas y claves ──────────────────────────────────────────────────────────

test('formaDeMetodo: dentro de una página, encima y sin marco; botón y enlace no dicen dónde se ven', () => {
  const esperado: Record<MetodoIntegracion, string | null> = {
    iframe: 'incrustado', popup: 'ventana', nativa: 'nativa', boton: null, enlace: null,
  };
  for (const m of Object.keys(METODOS) as MetodoIntegracion[]) assert.equal(formaDeMetodo(m), esperado[m], m);
  assert.deepEqual(FORMAS_PEGADAS, ['incrustado', 'ventana', 'nativa']);
  // `copiado.metodo` sale de un jsonb: basura → null, nunca otra cosa.
  for (const basura of ['toString', 'constructor', '', 'IFRAME']) assert.equal(formaDeMetodo(basura as MetodoIntegracion), null, basura);
});

test('claveVista: la forma delante de la firma', () => {
  assert.equal(claveVista('incrustado', 'c1k65yv5'), 'incrustado:c1k65yv5');
  assert.notEqual(claveVista('incrustado', 'c1k65yv5'), claveVista('ventana', 'c1k65yv5'));
});

test('⚠️ FIRMA_CONTENIDO_VALIDA es literalmente el CHECK `widget_eventos_firma_valida`', () => {
  // Si cambia una, tiene que cambiar la otra en la misma migración.
  assert.equal(FIRMA_CONTENIDO_VALIDA.source, '^c[0-9][0-9a-z]{1,7}$');
  assert.equal(FIRMA_CONTENIDO_VALIDA.flags, '');
  for (const malo of ['zz', 'c1', 'c1ABC', 'x1abc', 'c1abcdefgh', '1fxr0n3', ' c1abc']) assert.doesNotMatch(malo, FIRMA_CONTENIDO_VALIDA, malo);
});
