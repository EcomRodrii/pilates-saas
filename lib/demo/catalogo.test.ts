import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOGO, IDS_ESCENARIO, construirDemo, demoPorDefecto } from './catalogo.ts';

test('cada escenario se genera con sus valores por defecto y todas sus comprobaciones pasan', () => {
  for (const id of IDS_ESCENARIO) {
    const d = demoPorDefecto(id);
    assert.equal(d.escenario, id);
    assert.ok(d.pasos.length >= 3, `${id}: pasos`);
    assert.ok(d.reglasAplicables.length > 0 && d.modulos.length > 0, `${id}: reglas y módulos`);
    for (const c of d.comprobaciones) assert.ok(c.ok, `${id}: falla «${c.id}»`);
    for (const paso of d.pasos) {
      assert.ok(paso.porQue.length > 0, `${id}/${paso.id}: sin «por qué»`);
      assert.ok(paso.proposito.length > 10, `${id}/${paso.id}: sin propósito`);
    }
  }
});

test('un escenario fuera del catálogo se rechaza (también claves heredadas del prototipo)', () => {
  for (const x of ['borrar_todo', '', 'constructor', '__proto__', 'toString', 7, null, undefined]) {
    assert.deepEqual(construirDemo(x, {}), { ok: false, motivo: 'escenario-no-soportado' });
  }
});

test('parámetros desconocidos o fuera de rango se rechazan enteros, no se corrigen', () => {
  const malos: [string, unknown][] = [
    ['caducidad_bono', { sql: 'drop table socios' }],
    ['caducidad_bono', { sesionesTotales: 9999 }],
    ['caducidad_bono', { restantesAntesDeReservar: 12, sesionesTotales: 10 }],
    ['caducidad_bono', { caducaDia: 'martes', diaClase: 'jueves' }],
    ['caducidad_bono', { avisoHorasAntes: -1 }],
    ['caducidad_bono', { devolverEnTardia: 'sí' }],
    ['ausencia_recuperacion', { clasesReservadas: 4, limiteSemanal: 2 }],
    ['ausencia_recuperacion', { clasesCanceladas: 3, clasesReservadas: 2 }],
    ['orden_consumo_bonos', { bonos: [{ alcance: 'todas', caducaEnDias: 3, restantes: 1 }] }],
    ['orden_consumo_bonos', { bonos: [{ alcance: 'x', caducaEnDias: 3, restantes: 1 }, { alcance: 'todas', caducaEnDias: null, restantes: 1 }] }],
  ];
  for (const [id, p] of malos) {
    const r = construirDemo(id, p);
    assert.equal(r.ok, false, `${id} ${JSON.stringify(p)} debería rechazarse`);
  }
});

test('el escenario de la caducidad: ausencia a tiempo devuelve la sesión y lo que sobra caduca en su día', () => {
  const r = construirDemo('caducidad_bono', {
    sesionesTotales: 10, restantesAntesDeReservar: 4, caducaDia: 'domingo', diaClase: 'miercoles',
    avisoHorasAntes: 24, ventanaCancelacionHoras: 12, devolverEnTardia: false,
  });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.match(r.valor.resultadoEsperado, /^Se devuelve la sesión y al caducar se pierden 4/);
  assert.ok(r.valor.comprobaciones.every((c) => c.ok));
});

test('un aviso tardío sin devolución en tardía no devuelve la sesión', () => {
  const r = construirDemo('caducidad_bono', { avisoHorasAntes: 2, ventanaCancelacionHoras: 12, devolverEnTardia: false, restantesAntesDeReservar: 4 });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.match(r.valor.resultadoEsperado, /^No se devuelve la sesión y al caducar se pierden 3/);
});

test('con devolver en tardía activado, el aviso tardío también devuelve', () => {
  const r = construirDemo('caducidad_bono', { avisoHorasAntes: 2, ventanaCancelacionHoras: 12, devolverEnTardia: true, restantesAntesDeReservar: 4 });
  assert.ok(r.ok);
  if (r.ok) assert.match(r.valor.resultadoEsperado, /^Se devuelve la sesión/);
});

test('un bono que se agota no pierde nada al caducar', () => {
  const r = construirDemo('caducidad_bono', { restantesAntesDeReservar: 1, avisoHorasAntes: 2, ventanaCancelacionHoras: 12, devolverEnTardia: false });
  assert.ok(r.ok);
  if (r.ok) assert.match(r.valor.resultadoEsperado, /no se pierde nada/);
});

test('recuperación: cancelar a tiempo con hueco sin usar concede; la semana es la ventana no concede', () => {
  const base = { limiteSemanal: 2, clasesReservadas: 2, clasesCanceladas: 1, avisoHorasAntes: 24, ventanaCancelacionHoras: 12 };
  const con = construirDemo('ausencia_recuperacion', base);
  const sin = construirDemo('ausencia_recuperacion', { ...base, soloEnLaSemana: true });
  const tarde = construirDemo('ausencia_recuperacion', { ...base, avisoHorasAntes: 2 });
  const vuelve = construirDemo('ausencia_recuperacion', { ...base, vuelveAReservarLaMisma: true });
  const apagado = construirDemo('ausencia_recuperacion', { ...base, repartoAutomatico: false });
  assert.ok(con.ok && sin.ok && tarde.ok && vuelve.ok && apagado.ok);
  if (!(con.ok && sin.ok && tarde.ok && vuelve.ok && apagado.ok)) return;
  assert.match(con.valor.resultadoEsperado, /Gana 1/);
  assert.match(sin.valor.resultadoEsperado, /No gana ninguna/);
  assert.match(tarde.valor.resultadoEsperado, /No gana ninguna/);
  assert.match(vuelve.valor.resultadoEsperado, /No gana ninguna/);
  assert.match(apagado.valor.resultadoEsperado, /No gana ninguna/);
  for (const d of [con, sin, tarde, vuelve, apagado]) assert.ok(d.valor.comprobaciones.every((c) => c.ok));
});

test('orden de consumo: el específico antes que el comodín, y la mensual gana', () => {
  const bonos = [
    { alcance: 'todas', caducaEnDias: 5, restantes: 6 },
    { alcance: 'solo_esta_clase', caducaEnDias: 30, restantes: 4 },
  ];
  const a = construirDemo('orden_consumo_bonos', { bonos });
  const b = construirDemo('orden_consumo_bonos', { bonos, tieneCuotaMensualQueCubre: true });
  assert.ok(a.ok && b.ok);
  if (!(a.ok && b.ok)) return;
  assert.equal(a.valor.resultadoEsperado, 'Se descuenta de Bono B.');
  assert.equal(b.valor.resultadoEsperado, 'No se descuenta ninguna sesión.');
  assert.ok(a.valor.comprobaciones.every((c) => c.ok) && b.valor.comprobaciones.every((c) => c.ok));
});

test('orden de consumo: entre dos del mismo tipo, el que caduca antes; un agotado no compite', () => {
  const r = construirDemo('orden_consumo_bonos', { bonos: [
    { alcance: 'todas', caducaEnDias: 40, restantes: 3 },
    { alcance: 'todas', caducaEnDias: 10, restantes: 0 },
    { alcance: 'todas', caducaEnDias: 20, restantes: 2 },
  ] });
  assert.ok(r.ok);
  if (r.ok) { assert.equal(r.valor.resultadoEsperado, 'Se descuenta de Bono C.'); assert.ok(r.valor.comprobaciones.every((c) => c.ok)); }
});

test('el catálogo describe todos sus escenarios al modelo', () => {
  for (const id of IDS_ESCENARIO) {
    assert.ok(CATALOGO[id].guiaParametros.length > 40);
    assert.ok(CATALOGO[id].descripcion.length > 20);
  }
});
