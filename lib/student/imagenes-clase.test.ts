// Las DOS imágenes de un tipo de clase, tal y como las ve la alumna.
//
// Hasta el 2026-09-05 solo había una (`foto_url`) haciendo los dos trabajos: el
// panel la pintaba en 44×44 y la app de la alumna en un héroe de 290 px. Una
// imagen no puede quedar bien recortada de las dos maneras, así que se separan
// en banner (ancho, cabecera) y logo (cuadrado, fila del horario).
//
// Los dos campos tienen reglas de herencia DISTINTAS a propósito, y es
// exactamente lo que fija este fichero.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proyectarClases, type PayloadMin } from './mapeo.ts';

const BASE: PayloadMin = {
  studio: { fotoUrl: '/estudio.webp' },
  sesiones: [{
    id: 'ses-1', inicio: '2026-09-10T09:00:00.000Z', fin: '2026-09-10T10:00:00.000Z',
    aforoMaximo: 10, tipoClaseId: 'tc-1', salaId: 'sala-1', instructorId: 'ins-1',
    cancelada: false, precioPuntual: 15,
  }],
  tiposClase: [{ id: 'tc-1', nombre: 'Reformer', nivel: 'TODOS' }],
  salas: [{ id: 'sala-1', nombre: 'Sala 1' }],
  instructores: [{ id: 'ins-1', nombre: 'Carmen' }],
  aforoReservas: [],
};

function proyectar(parche: Partial<PayloadMin>) {
  const clase = proyectarClases({ ...BASE, ...parche })[0];
  assert.ok(clase, 'la proyección se quedó vacía');
  return clase;
}

// ── El logo ──────────────────────────────────────────────────────────────────

test('el logo sale del TIPO DE CLASE y de ningún otro sitio', () => {
  const c = proyectar({
    tiposClase: [{ id: 'tc-1', nombre: 'Reformer', nivel: 'TODOS', logoUrl: '/logo-reformer.webp' }],
  });
  assert.equal(c.logoUrl, '/logo-reformer.webp');
});

test('⚠️ el logo NO hereda de la sala ni del estudio', () => {
  // Sería lo cómodo, y estaría mal: un logo identifica a la clase. Heredarlo
  // pondría el MISMO icono en todas las filas del horario, que se lee como un
  // error de la app — el mismo motivo por el que `lib/imagenes-por-defecto.ts`
  // prohíbe la foto por defecto en las miniaturas de los listados.
  const c = proyectar({
    salas: [{ id: 'sala-1', nombre: 'Sala 1', fotoUrl: '/sala.webp' }],
    studio: { fotoUrl: '/estudio.webp' },
  });
  assert.equal(c.logoUrl, undefined, 'sin logo propio, la fila va sin icono');
});

// ── El banner ────────────────────────────────────────────────────────────────

test('⚠️ un banner propio de la clase gana a la foto de la sala', () => {
  // El orden era `sala ?? tipo ?? estudio`, y con él un banner subido a ESTA
  // clase no se vería nunca en un estudio que tuviera foto de sala: la función
  // nacería muerta.
  const c = proyectar({
    tiposClase: [{ id: 'tc-1', nombre: 'Reformer', nivel: 'TODOS', fotoUrl: '/banner-reformer.webp' }],
    salas: [{ id: 'sala-1', nombre: 'Sala 1', fotoUrl: '/sala.webp' }],
  });
  assert.equal(c.fotoUrl, '/banner-reformer.webp');
});

test('sin banner propio, sigue mandando la sala sobre el estudio', () => {
  // Esto NO se toca: se decidió así porque, como casi ningún tipo de clase
  // tenía foto, todas las clases acababan enseñando la misma imagen del
  // estudio —que a menudo es la foto de la propietaria—.
  const c = proyectar({ salas: [{ id: 'sala-1', nombre: 'Sala 1', fotoUrl: '/sala.webp' }] });
  assert.equal(c.fotoUrl, '/sala.webp');
});

test('sin banner ni sala, cae al estudio', () => {
  assert.equal(proyectar({}).fotoUrl, '/estudio.webp');
});

test('sin nada, cadena vacía y no `undefined`', () => {
  // `Clase.fotoUrl` es `string`, no opcional: quien lo pinta hace
  // `url(...)` sin comprobar, y un `undefined` ahí pinta la palabra.
  assert.equal(proyectar({ studio: null }).fotoUrl, '');
});

// ── Las dos a la vez ─────────────────────────────────────────────────────────

test('logo y banner son independientes: se pueden poner por separado', () => {
  const soloLogo = proyectar({
    tiposClase: [{ id: 'tc-1', nombre: 'Reformer', nivel: 'TODOS', logoUrl: '/logo.webp' }],
  });
  assert.equal(soloLogo.logoUrl, '/logo.webp');
  assert.equal(soloLogo.fotoUrl, '/estudio.webp', 'poner logo no debe tocar el banner');

  const ambos = proyectar({
    tiposClase: [{ id: 'tc-1', nombre: 'Reformer', nivel: 'TODOS', logoUrl: '/logo.webp', fotoUrl: '/banner.webp' }],
  });
  assert.equal(ambos.logoUrl, '/logo.webp');
  assert.equal(ambos.fotoUrl, '/banner.webp');
});
