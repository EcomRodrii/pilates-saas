import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { redondearAIntervalo, minutosDesdeOffset, nuevoHorarioArrastrado } from './calendario-arrastre.ts';

test('redondearAIntervalo: valor ya en un múltiplo de 15 no cambia', () => {
  assert.equal(redondearAIntervalo(120), 120);
});

test('redondearAIntervalo: redondea hacia abajo por debajo de la mitad', () => {
  assert.equal(redondearAIntervalo(127), 120); // 127 -> 8.46 cuartos -> 8 -> 120
});

test('redondearAIntervalo: redondea hacia arriba a partir de la mitad', () => {
  assert.equal(redondearAIntervalo(128), 135); // 128 -> 8.53 cuartos -> 9 -> 135
});

test('redondearAIntervalo: acepta un paso distinto de 15', () => {
  assert.equal(redondearAIntervalo(50, 30), 60);
});

test('minutosDesdeOffset: offset 0 vuelve a horaInicioMin', () => {
  assert.equal(minutosDesdeOffset(0, 96, 8 * 60), 8 * 60);
});

test('minutosDesdeOffset: una hora completa de offset suma 60 minutos', () => {
  assert.equal(minutosDesdeOffset(96, 96, 8 * 60), 9 * 60);
});

test('minutosDesdeOffset: aplica el snap de 15 min sobre el resultado', () => {
  // 50px a 96px/hora = 31.25 min -> 8:00 + 31 -> 8:31 -> redondea a 8:30 (510).
  assert.equal(minutosDesdeOffset(50, 96, 8 * 60), 510);
});

test('minutosDesdeOffset: offset negativo (por encima del grid) no se clampa aquí', () => {
  assert.equal(minutosDesdeOffset(-96, 96, 8 * 60), 7 * 60);
});

test('nuevoHorarioArrastrado: conserva la duración original', () => {
  const r = nuevoHorarioArrastrado(50, 600);
  assert.equal(r.inicioMin, 600);
  assert.equal(r.finMin, 650);
});

// ─────────────────────────────────────────────────────────────────────────────
// Guardián de FUENTE: mover una clase invalida el caché de las DOS fechas.
//
// Reportado en vídeo: se arrastra una clase y «desaparece». El dato se guarda
// bien —la tarjeta de resumen y el contador de la columna la siguen viendo—,
// pero la rejilla pinta una copia vieja: `refrescarVista()` solo borra del
// caché la ventana que se está mirando, así que el día/semana de DESTINO se
// quedaba con su copia de ANTES del movimiento. Recargar la página lo
// arreglaba, que es la firma de un caché obsoleto y no de un guardado fallido.
//
// Se invalidan las dos: la de destino para que aparezca, la de ORIGEN para que
// deje de verse donde ya no está.
//
// Es un test de FUENTE porque el caché vive en un `useRef` dentro de un
// componente de 2.700 líneas: no hay forma de ejercitarlo sin montar la página
// entera, y esta comprobación cuesta un `readFileSync`.
// ─────────────────────────────────────────────────────────────────────────────
const pagina = readFileSync(
  join(import.meta.dirname, '..', 'app/(dashboard)/calendario/page.tsx'),
  'utf8',
);
const bloqueMover = pagina.slice(
  pagina.indexOf('async function ejecutarMoverSesion'),
  pagina.indexOf('function moverSesionArrastrada'),
);

test('mover una clase invalida el cache del dia de origen Y el de destino', () => {
  assert.ok(bloqueMover.length > 200, 'no se ha localizado `ejecutarMoverSesion`: como se renombro?');
  assert.match(bloqueMover, /invalidarCacheDeFechas\(/,
    'Mover tiene que invalidar por FECHAS: `refrescarVista()` solo borra la ventana visible.');
  assert.match(bloqueMover, /new Date\(sesion\.inicio\)/,
    'Falta la fecha de ORIGEN: la clase seguiria viendose donde ya no esta.');
  assert.match(bloqueMover, /new Date\(nuevoInicio\)/,
    'Falta la fecha de DESTINO: es justo la que no aparecia.');
});

test('el invalidador por fechas es UNO, compartido con crear', () => {
  // Antes el bucle estaba escrito a mano dentro de
  // `invalidarCacheSerieYNavegarSiHaceFalta`. Dos copias del mismo recorrido es
  // como una se queda sin arreglar cuando la otra cambia.
  assert.equal(
    (pagina.match(/for \(const \[clave\] of cacheVistaRef\.current\)/g) ?? []).length, 1,
    'El recorrido del cache tiene que estar en UN sitio.',
  );
});
