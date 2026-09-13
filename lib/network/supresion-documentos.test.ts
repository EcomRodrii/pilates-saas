import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONSERVAR_DOCUMENTO_TRAS_VERIFICAR, avatarNetworkDe, huerfanosTrasRegistrar,
  rutasABorrarAlSuprimirPerfil, rutasDocumentoTrasResolver, type ObjetoCarpeta,
} from './supresion-documentos.ts';

const UID = '11111111-2222-3333-4444-555555555555';
const f = (name: string, created_at: string | null = null): ObjetoCarpeta => ({ name, id: `id-${name}`, created_at });

test('la decisión de minimización está explícita y hoy es NO conservar', () => {
  assert.equal(CONSERVAR_DOCUMENTO_TRAS_VERIFICAR, false);
});

test('suprimir perfil: todo lo de la carpeta propia (identidad, certificación, portfolio), nada fuera', () => {
  const rutas = rutasABorrarAlSuprimirPerfil(UID, [
    f('identidad-anverso-1.jpg'), f('identidad-reverso-2.jpg'), f('certificacion-3.pdf'), f('portfolio-4.webp'),
    { name: 'subcarpeta', id: null },       // carpeta: no es un fichero
    f('../otra-cuenta/identidad-9.jpg'),    // nombre con barra: nunca sale de la carpeta
    f(''),
  ]);
  assert.deepEqual(rutas, [
    `${UID}/identidad-anverso-1.jpg`, `${UID}/identidad-reverso-2.jpg`, `${UID}/certificacion-3.pdf`, `${UID}/portfolio-4.webp`,
  ]);
});

test('suprimir perfil: sin uid válido no devuelve ninguna ruta', () => {
  assert.deepEqual(rutasABorrarAlSuprimirPerfil('', [f('identidad-1.jpg')]), []);
  assert.deepEqual(rutasABorrarAlSuprimirPerfil('a/b', [f('identidad-1.jpg')]), []);
});

test('foto de Network: prefijo del bucket avatars', () => {
  assert.equal(avatarNetworkDe('red-abc'), 'network-red-abc');
});

test('al resolver: anverso y reverso, sin nulos ni duplicados', () => {
  assert.deepEqual(
    rutasDocumentoTrasResolver({ documento_path: `${UID}/identidad-anverso-1.jpg`, documento_path_reverso: `${UID}/identidad-reverso-2.jpg` }, false),
    [`${UID}/identidad-anverso-1.jpg`, `${UID}/identidad-reverso-2.jpg`],
  );
  assert.deepEqual(rutasDocumentoTrasResolver({ documento_path: `${UID}/identidad-1.jpg`, documento_path_reverso: null }, false), [`${UID}/identidad-1.jpg`]);
  assert.deepEqual(rutasDocumentoTrasResolver({ documento_path: null, documento_path_reverso: null }, false), []);
});

test('al resolver: si se decide conservar, no se borra nada', () => {
  assert.deepEqual(rutasDocumentoTrasResolver({ documento_path: `${UID}/identidad-1.jpg` }, true), []);
});

test('huérfanos de identidad: el anverso viejo se va, lo referenciado y los otros tipos se quedan', () => {
  const rutas = huerfanosTrasRegistrar({
    authUserId: UID,
    objetos: [f('identidad-anverso-1.jpg'), f('identidad-anverso-2.jpg'), f('identidad-reverso-3.jpg'), f('certificacion-4.pdf'), f('portfolio-5.webp')],
    prefijo: 'identidad',
    referenciadas: [`${UID}/identidad-anverso-2.jpg`, `${UID}/identidad-reverso-3.jpg`, null],
    ahora: new Date('2026-09-13T12:00:00Z'),
    margenMs: 0,
  });
  assert.deepEqual(rutas, [`${UID}/identidad-anverso-1.jpg`]);
});

test('huérfanos de certificación: respeta el margen (una subida en curso no se borra)', () => {
  const ahora = new Date('2026-09-13T12:00:00Z');
  const rutas = huerfanosTrasRegistrar({
    authUserId: UID,
    objetos: [
      f('certificacion-1.pdf', '2026-09-13T11:00:00Z'), // vieja y sin fila → se borra
      f('certificacion-2.pdf', '2026-09-13T11:59:00Z'), // hace 1 min → subida en curso, se queda
      f('certificacion-3.pdf', null),                   // sin fecha → no se arriesga
      f('certificacion-4.pdf', '2026-09-13T10:00:00Z'), // referenciada → se queda
    ],
    prefijo: 'certificacion',
    referenciadas: [`${UID}/certificacion-4.pdf`],
    ahora,
    margenMs: 5 * 60 * 1000,
  });
  assert.deepEqual(rutas, [`${UID}/certificacion-1.pdf`]);
});

test('huérfanos: «identidadX» no casa con el prefijo identidad (hace falta el guion)', () => {
  const rutas = huerfanosTrasRegistrar({
    authUserId: UID, objetos: [f('identidadX.jpg')], prefijo: 'identidad', referenciadas: [], ahora: new Date(), margenMs: 0,
  });
  assert.deepEqual(rutas, []);
});
