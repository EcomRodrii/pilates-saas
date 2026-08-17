import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  planificarConfiguracion, planVacio, colorPorIndice, TIPOS_CLASE_SUGERIDOS,
  interpretarRespuestasWizard, OPCIONES_SALAS, OPCIONES_AFORO, OPCIONES_DURACION,
} from './plan-configuracion.ts';

test('el caso del enunciado: 2 salas, aforo 8, clases de 50 min', () => {
  const p = planificarConfiguracion({
    numSalas: 2, aforoPorSala: 8, duracionMinutos: 50,
    tiposClase: ['Reformer', 'Mat'], usaBonos: true,
  });
  assert.deepEqual(p.salas.map(s => s.nombre), ['Sala 1', 'Sala 2']);
  assert.ok(p.salas.every(s => s.capacidad === 8));
  assert.deepEqual(p.tiposClase.map(t => t.nombre), ['Reformer', 'Mat']);
  assert.ok(p.tiposClase.every(t => t.duracionMinutos === 50));
  assert.equal(p.planes.length, 1);
  assert.equal(p.planes[0].tipo, 'BONO');
});

test('con una sola sala se llama "Sala", sin número', () => {
  const p = planificarConfiguracion({ numSalas: 1, aforoPorSala: 10 });
  assert.deepEqual(p.salas.map(s => s.nombre), ['Sala']);
});

test('las salas salen de colores distintos', () => {
  const p = planificarConfiguracion({ numSalas: 3, aforoPorSala: 6 });
  assert.equal(new Set(p.salas.map(s => s.color)).size, 3);
});

// ── Regla 1: nada que pueda cobrar se crea activo ────────────────────────────

test('los planes se crean SIEMPRE como borrador no vendible', () => {
  // Un bono con precio inventado es peor que no tener bono: se puede comprar.
  // `/api/stripe/checkout` rechaza un plan inactivo (409), así que `activo:
  // false` es lo que garantiza que un borrador no le cobre a nadie.
  const p = planificarConfiguracion({ usaBonos: true, usaMembresias: true });
  assert.equal(p.planes.length, 2);
  for (const plan of p.planes) {
    assert.equal(plan.activo, false, 'un plan del onboarding nunca sale activo');
    assert.equal(plan.precio, 0, 'el precio lo pone la propietaria, no se inventa');
  }
});

test('sin decir que usa bonos ni membresías no se crea ningún plan', () => {
  assert.deepEqual(planificarConfiguracion({ numSalas: 1, aforoPorSala: 5 }).planes, []);
});

// ── Regla 2: sin respuesta no se inventa nada ────────────────────────────────

test('una sala sin aforo NO se crea', () => {
  // El aforo de la sala es lo que limita cuántas reservas entran. Inventarlo
  // deja pasar o corta reservas reales; callarse es lo seguro.
  assert.deepEqual(planificarConfiguracion({ numSalas: 3 }).salas, []);
});

test('tipos de clase sin duración NO se crean', () => {
  const p = planificarConfiguracion({ tiposClase: ['Reformer', 'Mat'] });
  assert.deepEqual(p.tiposClase, []);
});

test('respuestas vacías dan un plan vacío, no un estudio con relleno', () => {
  const p = planificarConfiguracion({});
  assert.ok(planVacio(p));
});

// ── Entradas absurdas ────────────────────────────────────────────────────────

test('números fuera de rango no crean filas', () => {
  for (const numSalas of [0, -3, 999, 2.5e9, NaN, Infinity]) {
    const p = planificarConfiguracion({ numSalas, aforoPorSala: 8 });
    assert.ok(p.salas.length <= 20, `numSalas=${numSalas} generó ${p.salas.length} salas`);
  }
  assert.deepEqual(planificarConfiguracion({ numSalas: 0, aforoPorSala: 8 }).salas, []);
  assert.deepEqual(planificarConfiguracion({ numSalas: 2, aforoPorSala: 0 }).salas, []);
});

test('2.5 salas se trunca, no se redondea a 3 (no se inventa una sala)', () => {
  assert.equal(planificarConfiguracion({ numSalas: 2.9, aforoPorSala: 8 }).salas.length, 2);
});

test('duraciones imposibles no crean tipos de clase', () => {
  for (const duracionMinutos of [0, -50, 5, 600, NaN]) {
    const p = planificarConfiguracion({ duracionMinutos, tiposClase: ['Mat'] });
    assert.deepEqual(p.tiposClase, [], `duración ${duracionMinutos} no debería crear nada`);
  }
});

test('un tipo de clase que no está en la lista cerrada se ignora', () => {
  // Evita que texto libre (o algo inyectado en el body del endpoint) acabe
  // creando filas con nombres arbitrarios.
  const p = planificarConfiguracion({
    duracionMinutos: 50, tiposClase: ['Reformer', '<script>alert(1)</script>', 'Krav Maga'],
  });
  assert.deepEqual(p.tiposClase.map(t => t.nombre), ['Reformer']);
});

test('tipos duplicados se deduplican (romperían la idempotencia por nombre)', () => {
  const p = planificarConfiguracion({ duracionMinutos: 50, tiposClase: ['Mat', 'Mat', 'Reformer'] });
  assert.deepEqual(p.tiposClase.map(t => t.nombre), ['Mat', 'Reformer']);
});

test('todos los tipos sugeridos son planificables', () => {
  const p = planificarConfiguracion({ duracionMinutos: 50, tiposClase: [...TIPOS_CLASE_SUGERIDOS] });
  assert.equal(p.tiposClase.length, TIPOS_CLASE_SUGERIDOS.length);
});

test('el nivel es TODOS: el asistente no pregunta por nivel', () => {
  const p = planificarConfiguracion({ duracionMinutos: 50, tiposClase: ['Prenatal'] });
  assert.equal(p.tiposClase[0].nivel, 'TODOS');
});

test('la paleta cicla en vez de quedarse sin color', () => {
  assert.equal(colorPorIndice(0), colorPorIndice(6));
  assert.ok(colorPorIndice(37).startsWith('#'));
});

test('el mismo cuestionario da siempre el mismo plan', () => {
  // Es lo que permite que el ejecutor sea idempotente comparando por nombre.
  const r = { numSalas: 2, aforoPorSala: 8, duracionMinutos: 50, tiposClase: ['Mat'], usaBonos: true };
  assert.deepEqual(planificarConfiguracion(r), planificarConfiguracion(r));
});

// ── Etiquetas del asistente → respuestas ─────────────────────────────────────

test('las etiquetas del asistente se traducen a números', () => {
  const r = interpretarRespuestasWizard({
    salas: '2 salas', aforo: '8 plazas', duracion: '50 minutos',
    clases: ['Reformer'], cobro: ['Bonos de sesiones'],
  });
  assert.equal(r.numSalas, 2);
  assert.equal(r.aforoPorSala, 8);
  assert.equal(r.duracionMinutos, 50);
  assert.equal(r.usaBonos, true);
  assert.equal(r.usaMembresias, false);
});

test('"4 o más" se queda en 4: pasarse es peor que quedarse corto', () => {
  // Con 7 salas reales, crear 4 y que añada 3 es mejor que crear 10 y que
  // borre 3. En el aforo además pasarse deja entrar reservas que no caben.
  assert.equal(interpretarRespuestasWizard({ salas: '4 o más' }).numSalas, 4);
  assert.equal(interpretarRespuestasWizard({ aforo: '12 o más' }).aforoPorSala, 12);
});

test('TODAS las opciones que pinta el asistente son interpretables', () => {
  // Este es el test que impide el desajuste clásico: alguien edita la etiqueta
  // en el componente y el intérprete deja de reconocerla en silencio.
  for (const s of OPCIONES_SALAS) {
    assert.equal(typeof interpretarRespuestasWizard({ salas: s }).numSalas, 'number', s);
  }
  for (const a of OPCIONES_AFORO) {
    assert.equal(typeof interpretarRespuestasWizard({ aforo: a }).aforoPorSala, 'number', a);
  }
  for (const d of OPCIONES_DURACION) {
    assert.equal(typeof interpretarRespuestasWizard({ duracion: d }).duracionMinutos, 'number', d);
  }
});

test('cada opción de duración produce tipos de clase de verdad', () => {
  for (const d of OPCIONES_DURACION) {
    const p = planificarConfiguracion(interpretarRespuestasWizard({ duracion: d, clases: ['Mat'] }));
    assert.equal(p.tiposClase.length, 1, d);
  }
});

test('cada combinación de salas × aforo del asistente crea salas', () => {
  for (const s of OPCIONES_SALAS) {
    for (const a of OPCIONES_AFORO) {
      const p = planificarConfiguracion(interpretarRespuestasWizard({ salas: s, aforo: a }));
      assert.ok(p.salas.length > 0, `${s} / ${a}`);
      assert.ok(p.salas.every(x => x.capacidad > 0));
    }
  }
});

test('"Clase suelta" sola no crea ningún plan', () => {
  // No hay nada que sembrar: una clase suelta es un precio puntual, no un plan
  // con sesiones. Prometer un borrador aquí sería inventar.
  const r = interpretarRespuestasWizard({ cobro: ['Clase suelta'] });
  assert.deepEqual(planificarConfiguracion(r).planes, []);
});

test('sin tocar nada, el asistente no configura nada', () => {
  assert.ok(planVacio(planificarConfiguracion(interpretarRespuestasWizard({}))));
});
