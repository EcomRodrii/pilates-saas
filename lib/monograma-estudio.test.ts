import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  inicialDe, coloresMonograma, tamanoValido, urlMonograma, urlIconoEstudio, logoServible,
  COLOR_MONOGRAMA_POR_DEFECTO,
} from './monograma-estudio.ts';

test('la inicial se pone en mayúscula', () => {
  assert.equal(inicialDe('estudio aurora'), 'E');
  assert.equal(inicialDe('Pilates Boutique'), 'P');
});

test('sin nombre, o solo espacios, sale un interrogante — nunca undefined en el PNG', () => {
  for (const nada of [null, undefined, '', '   ']) assert.equal(inicialDe(nada), '?');
});

test('un nombre que empieza por emoji no se corte a la mitad', () => {
  // `nombre[0]` de un emoji fuera del plano básico da la mitad del carácter
  // (un signo de interrogación en rombo). `Array.from` respeta el code point.
  assert.equal(inicialDe('🧘 Estudio Zen'), '🧘');
});

test('un color de marca válido se respeta tal cual', () => {
  assert.equal(coloresMonograma('#663399').fondo, '#663399');
});

test('un color inválido cae al oliva de marca, no a un icono roto', () => {
  for (const malo of [null, undefined, '', 'no-es-un-color', 'rgb(1,2,3)']) {
    assert.equal(coloresMonograma(malo).fondo, COLOR_MONOGRAMA_POR_DEFECTO);
  }
});

test('el texto es el que más contraste hace sobre el fondo', () => {
  assert.equal(coloresMonograma('#FFFFFF').texto, '#131313'); // fondo claro → texto oscuro
  assert.equal(coloresMonograma('#131313').texto, '#FFFFFF'); // fondo oscuro → texto claro
});

test('solo 192 y 512 son tamaños válidos; cualquier otra cosa cae a 512', () => {
  assert.equal(tamanoValido('192'), 192);
  assert.equal(tamanoValido('512'), 512);
  for (const raro of ['1024', '0', '-1', 'nan', null, '']) assert.equal(tamanoValido(raro), 512);
});

test('la URL cambia si cambia el color: cachear por URL no deja iconos viejos', () => {
  const a = urlMonograma('Estudio Aurora', '#663399', 192);
  const b = urlMonograma('Estudio Aurora', '#B76E79', 192);
  assert.notEqual(a, b);
  assert.match(a, /inicial=E/);
  assert.match(a, /color=%23663399/);
  assert.match(a, /size=192/);
});

// ── El icono con el logo del estudio ────────────────────────────────────────
// El manifest del portal declaraba /icon-192.png y /icon-512.png —los de
// TENTARE— como candidatos junto al logo. Un instalador que exige un tamaño
// exacto descarta el logo (`sizes: 'any'`) y se queda con la marca ajena: la
// alumna acababa con el icono de Tentare en su pantalla de inicio.

const BASE = 'https://proyecto.supabase.co';
const LOGO = `${BASE}/storage/v1/object/public/marca/logo-abc?v=1`;

test('un logo de nuestro almacenamiento público sí se sirve', () => {
  assert.equal(logoServible(LOGO, BASE), true);
  // La barra final de la base no puede cambiar el veredicto.
  assert.equal(logoServible(LOGO, `${BASE}/`), true);
});

// La ruta del icono DESCARGA esta URL en el servidor para componer el PNG, así
// que un parámetro libre sería una puerta para hacerle pedir lo que sea a donde
// sea.
test('cualquier otro origen se rechaza', () => {
  assert.equal(logoServible('https://evil.example/pwn.png', BASE), false);
  assert.equal(logoServible(`https://otro.supabase.co/storage/v1/object/public/x`, BASE), false);
  // Ni rutas internas del propio Supabase que no sean el bucket público.
  assert.equal(logoServible(`${BASE}/rest/v1/studios`, BASE), false);
  assert.equal(logoServible('', BASE), false);
  assert.equal(logoServible(LOGO, ''), false);
  assert.equal(logoServible(LOGO, null), false);
});

test('con logo servible, el icono lo lleva en la URL', () => {
  const u = urlIconoEstudio('Studio Carmen', '#343825', 192, LOGO, BASE);
  assert.ok(u.startsWith('/icono-estudio?'));
  assert.ok(u.includes('size=192'));
  assert.ok(u.includes(`logo=${encodeURIComponent(LOGO)}`));
});

// Sin logo —o con uno que no podemos servir— se cae al monograma, NUNCA al
// icono de Tentare.
test('sin logo servible se cae al monograma, no a la marca de la plataforma', () => {
  for (const malo of [null, undefined, '', 'https://evil.example/x.png']) {
    const u = urlIconoEstudio('Studio Carmen', '#343825', 512, malo, BASE);
    assert.equal(u, urlMonograma('Studio Carmen', '#343825', 512));
    assert.ok(!u.includes('logo='));
  }
});
