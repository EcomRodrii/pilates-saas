import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colorSeguro, destinoCarrusel, tiposQueImparte, type Tramo } from './equipo-publico.ts';

const tipos = [
  { id: 'tc-r', nombre: 'Reformer', color: '#7C6A52' },
  { id: 'tc-m', nombre: 'Mat', color: '#6B7A64' },
  { id: 'tc-y', nombre: 'Yoga', color: 'rojo' },
];

test('qué imparte sale del horario, de lo que más da a lo que menos', () => {
  const sesiones = [
    { instructorId: 'ana', tipoClaseId: 'tc-m' },
    { instructorId: 'ana', tipoClaseId: 'tc-r' },
    { instructorId: 'ana', tipoClaseId: 'tc-r' },
    { instructorId: 'bea', tipoClaseId: 'tc-m' },
  ];
  const r = tiposQueImparte(sesiones, tipos);
  assert.deepEqual(r.get('ana')?.map(t => t.nombre), ['Reformer', 'Mat']);
  assert.deepEqual(r.get('bea')?.map(t => t.nombre), ['Mat']);
});

test('a igualdad de clases, orden alfabético (no el del horario, que cambia cada semana)', () => {
  const sesiones = [
    { instructorId: 'ana', tipoClaseId: 'tc-r' },
    { instructorId: 'ana', tipoClaseId: 'tc-m' },
  ];
  assert.deepEqual(tiposQueImparte(sesiones, tipos).get('ana')?.map(t => t.nombre), ['Mat', 'Reformer']);
});

test('nunca se anuncia lo que no está en el horario', () => {
  // Sin clases no hay «qué imparte»: ni una disciplina por defecto, ni una
  // que ya no exista en el catálogo del estudio.
  const sesiones = [
    { instructorId: 'ana', tipoClaseId: 'tc-borrado' },
    { instructorId: null, tipoClaseId: 'tc-r' },
    { tipoClaseId: 'tc-m' },
  ];
  const r = tiposQueImparte(sesiones, tipos);
  assert.equal(r.get('ana'), undefined);
  assert.equal(r.size, 0);
});

test('una clase cancelada no anuncia su disciplina, ni cuenta para la principal', () => {
  // Solo quedaba Yoga en el horario, y se canceló: ya no la da. Y el Mat
  // cancelado no pesa más que el Reformer que sí da.
  const sesiones = [
    { instructorId: 'ana', tipoClaseId: 'tc-y', cancelada: true },
    { instructorId: 'ana', tipoClaseId: 'tc-m', cancelada: true },
    { instructorId: 'ana', tipoClaseId: 'tc-m', cancelada: true },
    { instructorId: 'ana', tipoClaseId: 'tc-m', cancelada: false },
    { instructorId: 'ana', tipoClaseId: 'tc-r' },
    { instructorId: 'ana', tipoClaseId: 'tc-r' },
    { instructorId: 'bea', tipoClaseId: 'tc-r', cancelada: true },
  ];
  const r = tiposQueImparte(sesiones, tipos);
  assert.deepEqual(r.get('ana')?.map(t => t.nombre), ['Reformer', 'Mat']);
  assert.equal(r.get('bea'), undefined);
});

test('el color de cada tipo solo pasa si es un hex; si no, lo decide quien pinta', () => {
  const r = tiposQueImparte([{ instructorId: 'ana', tipoClaseId: 'tc-y' }], tipos);
  assert.equal(r.get('ana')?.[0].color, null);
  assert.equal(colorSeguro('#7C6A52'), '#7C6A52');
  assert.equal(colorSeguro(' #abc '), '#abc');
  assert.equal(colorSeguro('#7C6A5280'), '#7C6A5280');
  assert.equal(colorSeguro('red; background:url(x)'), null);
  assert.equal(colorSeguro(''), null);
  assert.equal(colorSeguro(null), null);
  assert.equal(colorSeguro(undefined), null);
});

// Cuatro tarjetas de 200 con 14 de hueco, y caben 3,7 en 800 de ancho.
const tarjetas: Tramo[] = Array.from({ length: 6 }, (_, i) => ({ inicio: i * 214, fin: i * 214 + 200 }));

test('«siguiente»: la tarjeta que se veía a medias pasa a ser la primera', () => {
  // Desde el principio se ven 0, 1, 2 enteras y la 3 cortada (642–842).
  assert.equal(destinoCarrusel(tarjetas, 0, 800, 1), 642);
});

test('«anterior»: la que quedaba cortada por la izquierda vuelve a verse entera', () => {
  // Con la 4 al principio (856), la 3 (642–842) está oculta a la izquierda.
  // Ir a 214 deja 1, 2 y 3 enteras: ninguna tarjeta se salta.
  const destino = destinoCarrusel(tarjetas, 856, 800, -1);
  assert.equal(destino, 214);
  assert.ok(destino + 800 >= tarjetas[3].fin);
  // Y desde la 3 al principio se vuelve a la primera página tal cual.
  assert.equal(destinoCarrusel(tarjetas, 642, 800, -1), 0);
});

test('«anterior» cerca del principio vuelve al principio, nunca a un negativo', () => {
  assert.equal(destinoCarrusel(tarjetas, 214, 800, -1), 0);
  assert.equal(destinoCarrusel(tarjetas, 0, 800, -1), 0);
});

test('los anchos con decimales no cuentan como tarjeta cortada', () => {
  // (800 − 3·14) / 4 = 189,5: la cuarta acaba justo en 800.
  const exactas: Tramo[] = Array.from({ length: 6 }, (_, i) => ({ inicio: i * 203.5, fin: i * 203.5 + 189.5 }));
  assert.equal(destinoCarrusel(exactas, 0, 800, 1), 814);
  assert.equal(destinoCarrusel(exactas, 814, 800, -1), 0);
});

test('al final, «siguiente» no inventa un destino: el navegador lo acota', () => {
  assert.equal(destinoCarrusel(tarjetas, 470, 800, 1), 1270);
});

test('una tarjeta más ancha que la ventana no deja el botón sin efecto', () => {
  const anchas: Tramo[] = [{ inicio: 0, fin: 300 }, { inicio: 314, fin: 614 }];
  assert.equal(destinoCarrusel(anchas, 0, 200, 1), 314);
  assert.equal(destinoCarrusel(anchas, 314, 200, -1), 0);
});
