import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  avisoPendiente, debeEscalar, diasDesde, horaEnMadrid, leerPolitica, POLITICA_POR_DEFECTO, textoDelMotivo, tipoDeAviso,
} from './reglas.ts';

const P = POLITICA_POR_DEFECTO;
// 16-nov-2026 a las 10:00 Madrid (invierno: UTC+1) = 09:00Z.
const abierto = '2026-11-16T09:00:00Z';
const en = (iso: string) => new Date(iso);

test('la política de serie es 0, 2, 5 y 7 días, de 9 a 20 h', () => {
  assert.deepEqual(P, { dias: [0, 2, 5, 7], horaDesde: 9, horaHasta: 20 });
});

test('una política guardada y válida se respeta', () => {
  assert.deepEqual(leerPolitica({ dias: [0, 3, 10], horaDesde: 8, horaHasta: 18 }), { dias: [0, 3, 10], horaDesde: 8, horaHasta: 18 });
});

test('una política inválida cae a la de serie, nunca a «sin avisos»', () => {
  for (const mala of [null, 'x', {}, { dias: [] }, { dias: [2, 5] }, { dias: [0, 5, 2] }, { dias: [0, 0] }, { dias: [0, 99] }, { dias: [0, 1.5] }, { dias: Array.from({ length: 9 }, (_, i) => i) }]) {
    assert.deepEqual(leerPolitica(mala), P, JSON.stringify(mala));
  }
  assert.deepEqual(leerPolitica({ dias: [0, 3], horaDesde: 20, horaHasta: 9 }).dias, [0, 3]);
  assert.equal(leerPolitica({ dias: [0, 3], horaDesde: 20, horaHasta: 9 }).horaDesde, 9);
});

test('el primero es «primero», el último «restriccion» y el resto «recordatorio»', () => {
  assert.deepEqual(P.dias.map((d) => tipoDeAviso(d, P)), ['primero', 'recordatorio', 'recordatorio', 'restriccion']);
  assert.equal(tipoDeAviso(0, { ...P, dias: [0] }), 'primero');
});

test('los días cuentan por calendario de Madrid, no por 24 h', () => {
  // 23:30 Madrid del 16 y 00:30 Madrid del 17 (22:30Z y 23:30Z): solo una hora, pero otro día.
  assert.equal(diasDesde('2026-11-16T22:30:00Z', en('2026-11-16T23:30:00Z')), 1);
  assert.equal(diasDesde(abierto, en('2026-11-16T18:00:00Z')), 0);
  assert.equal(diasDesde(abierto, en('2026-11-18T09:00:00Z')), 2);
});

test('el cambio de hora no mueve un día', () => {
  // Fin del horario de verano: 25-oct-2026 (un día de 25 h).
  assert.equal(diasDesde('2026-10-24T10:00:00Z', en('2026-10-26T10:00:00Z')), 2);
});

test('la hora se lee en Madrid', () => {
  assert.equal(horaEnMadrid(en('2026-11-16T09:00:00Z')), 10);
  assert.equal(horaEnMadrid(en('2026-07-16T09:00:00Z')), 11);
});

test('el día 0 se manda enseguida, a cualquier hora', () => {
  const noche = en('2026-11-16T23:30:00Z'); // 00:30 del día siguiente... mismo incidente abierto a las 23:00Z
  const r = avisoPendiente({ abiertoEn: '2026-11-16T23:00:00Z', avisos: [] }, en('2026-11-16T23:10:00Z'), P);
  assert.deepEqual(r, { dia: 0, tipo: 'primero', saltados: [] });
  assert.ok(noche);
});

test('el día 0 ya mandado y aún no es el día 2: nada', () => {
  assert.equal(avisoPendiente({ abiertoEn: abierto, avisos: [{ dia: 0 }] }, en('2026-11-17T12:00:00Z'), P), null);
});

test('el día 2 toca el día 2, dentro de la ventana', () => {
  const r = avisoPendiente({ abiertoEn: abierto, avisos: [{ dia: 0 }] }, en('2026-11-18T10:00:00Z'), P);
  assert.deepEqual(r, { dia: 2, tipo: 'recordatorio', saltados: [] });
});

test('fuera de la ventana horaria los recordatorios esperan', () => {
  assert.equal(avisoPendiente({ abiertoEn: abierto, avisos: [{ dia: 0 }] }, en('2026-11-18T03:00:00Z'), P), null); // 04:00 Madrid
  assert.equal(avisoPendiente({ abiertoEn: abierto, avisos: [{ dia: 0 }] }, en('2026-11-18T20:00:00Z'), P), null); // 21:00 Madrid
});

test('un aviso ya mandado no se repite', () => {
  assert.equal(avisoPendiente({ abiertoEn: abierto, avisos: [{ dia: 0 }, { dia: 2 }] }, en('2026-11-18T10:00:00Z'), P), null);
});

test('si el cron estuvo parado se manda UN aviso (el último vencido) y los otros se dan por saltados', () => {
  const r = avisoPendiente({ abiertoEn: abierto, avisos: [{ dia: 0 }] }, en('2026-11-22T10:00:00Z'), P); // día 6
  assert.deepEqual(r, { dia: 5, tipo: 'recordatorio', saltados: [2] });
});

test('el último hito avisa de la posible restricción', () => {
  const r = avisoPendiente({ abiertoEn: abierto, avisos: [{ dia: 0 }, { dia: 2 }, { dia: 5 }] }, en('2026-11-23T10:00:00Z'), P);
  assert.equal(r?.tipo, 'restriccion');
  assert.equal(r?.dia, 7);
});

test('pasado el último hito no se manda nada más: la política termina ahí', () => {
  assert.equal(avisoPendiente({ abiertoEn: abierto, avisos: [{ dia: 0 }, { dia: 2 }, { dia: 5 }, { dia: 7 }] }, en('2026-12-30T10:00:00Z'), P), null);
});

test('solo se escala un incidente abierto cuyo último aviso ya salió', () => {
  const todos = [{ dia: 0 }, { dia: 2 }, { dia: 5 }, { dia: 7 }];
  assert.equal(debeEscalar({ estado: 'ABIERTO', avisos: todos }, P), true);
  assert.equal(debeEscalar({ estado: 'ABIERTO', avisos: todos.slice(0, 3) }, P), false);
  assert.equal(debeEscalar({ estado: 'ESCALADO', avisos: todos }, P), false);
  assert.equal(debeEscalar({ estado: 'RECUPERADO', avisos: todos }, P), false);
});

test('el motivo del banco se dice en cristiano; sin código, no se inventa', () => {
  assert.equal(textoDelMotivo('insufficient_funds'), 'La tarjeta no tiene fondos suficientes.');
  assert.equal(textoDelMotivo('EXPIRED_CARD'), 'La tarjeta ha caducado.');
  assert.equal(textoDelMotivo('algo_raro'), 'Tu banco no ha aceptado el cargo.');
  assert.equal(textoDelMotivo(null), null);
  assert.equal(textoDelMotivo(''), null);
});
