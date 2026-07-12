// Tests de la ficha clínica (semáforo, riesgo, alertas). Runner nativo: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CondicionSalud, RespuestaSesion } from '@/lib/types';
import {
  semaforo, nivelRiesgo, alertaPreClase, diasDesde, revisionVencida,
  esRestriccionDura, etiquetaRestriccion, restriccionesDeZona, resumenSaludClase,
  recordatoriosRevision, textoRecordatorioRevision,
} from './ficha-clinica.ts';

const HOY = new Date('2026-07-12T00:00:00Z');

// ── Fixture ──────────────────────────────────────────────────────────────────
function cond(p: Partial<CondicionSalud> & Pick<CondicionSalud, 'id'>): CondicionSalud {
  return {
    studioId: 'e1', socioId: 's1', categoria: 'LESION', etiqueta: 'Lesión', zona: 'COLUMNA',
    restricciones: [], severidad: 'MEDIA', estado: 'ACTIVA', inicio: '2026-06-01', fin: null,
    revisarEn: null, notas: null, creadoPor: null, creadoEn: '2026-06-01', actualizadoEn: '2026-06-01',
    ...p,
  };
}

// ── semáforo ─────────────────────────────────────────────────────────────────
test('semáforo VERDE sin condiciones activas', () => {
  assert.equal(semaforo([]), 'VERDE');
  assert.equal(semaforo([cond({ id: 'c1', estado: 'RESUELTA', severidad: 'ALTA' })]), 'VERDE');
});

test('semáforo ÁMBAR con condición activa que solo adapta', () => {
  assert.equal(semaforo([cond({ id: 'c1', severidad: 'MEDIA', restricciones: ['EVITAR_FLEXION'] })]), 'AMBAR');
});

test('semáforo ROJO por severidad ALTA', () => {
  assert.equal(semaforo([cond({ id: 'c1', severidad: 'ALTA' })]), 'ROJO');
});

test('semáforo ROJO por restricción dura (NO_*) aunque severidad no sea alta', () => {
  assert.equal(semaforo([cond({ id: 'c1', severidad: 'LEVE', zona: 'RODILLA', restricciones: ['NO_SALTOS'] })]), 'ROJO');
});

// ── riesgo ───────────────────────────────────────────────────────────────────
test('riesgo BAJO sin condiciones', () => {
  const r = nivelRiesgo([], [], HOY);
  assert.equal(r.nivel, 'BAJO');
  assert.equal(r.score, 0);
});

test('riesgo suma severidad + restricciones duras + respuestas + revisión vencida', () => {
  const condiciones = [cond({ id: 'c1', severidad: 'ALTA', zona: 'RODILLA', restricciones: ['NO_SALTOS'], revisarEn: '2026-01-01' })];
  const respuestas: RespuestaSesion[] = ['DOLOR', 'MOLESTIAS'];
  const r = nivelRiesgo(condiciones, respuestas, HOY);
  // severidad ALTA=3 + 1 dura + (2+1) respuestas + 1 revisión vencida = 8 → ALTO
  assert.equal(r.desglose.severidad, 3);
  assert.equal(r.desglose.restriccionesDuras, 1);
  assert.equal(r.desglose.respuestas, 3);
  assert.equal(r.desglose.revisiones, 1);
  assert.equal(r.score, 8);
  assert.equal(r.nivel, 'ALTO');
});

test('riesgo se acota a 10', () => {
  const condiciones = Array.from({ length: 8 }, (_, i) =>
    cond({ id: `c${i}`, severidad: 'ALTA', zona: 'RODILLA', restricciones: ['NO_SALTOS', 'NO_FLEXION_PROFUNDA'] }));
  const respuestas: RespuestaSesion[] = ['DOLOR', 'DOLOR', 'DOLOR'];
  const r = nivelRiesgo(condiciones, respuestas, HOY);
  assert.equal(r.score, 10);
  assert.equal(r.nivel, 'ALTO');
});

test('riesgo MEDIO en rango intermedio', () => {
  const r = nivelRiesgo([cond({ id: 'c1', severidad: 'MEDIA', restricciones: ['EVITAR_FLEXION'] })], ['MOLESTIAS'], HOY);
  // severidad 2 + 0 duras + 1 respuesta + 0 = 3 → BAJO límite; añade otra molestia
  const r2 = nivelRiesgo([cond({ id: 'c1', severidad: 'MEDIA' })], ['MOLESTIAS', 'MOLESTIAS'], HOY);
  assert.equal(r.nivel, 'BAJO');
  assert.equal(r2.nivel, 'MEDIO'); // 2 + 2 = 4
});

// ── revisión / fechas ────────────────────────────────────────────────────────
test('diasDesde cuenta días de calendario', () => {
  assert.equal(diasDesde('2026-07-05', HOY), 7);
  assert.equal(diasDesde('2026-07-20', HOY), -8); // futuro → negativo
});

test('revisionVencida solo si activa y fecha pasada', () => {
  assert.equal(revisionVencida(cond({ id: 'c1', revisarEn: '2026-07-01' }), HOY), true);
  assert.equal(revisionVencida(cond({ id: 'c1', revisarEn: '2026-08-01' }), HOY), false);
  assert.equal(revisionVencida(cond({ id: 'c1', estado: 'RESUELTA', revisarEn: '2026-07-01' }), HOY), false);
});

// ── alertas ──────────────────────────────────────────────────────────────────
test('alertaPreClase null cuando no hay condiciones activas', () => {
  assert.equal(alertaPreClase('Ana', [], HOY), null);
});

test('alertaPreClase compone nombre + condición principal + restricciones + revisión vencida', () => {
  const condiciones = [
    cond({ id: 'c1', etiqueta: 'Lesión lumbar', severidad: 'ALTA', restricciones: ['EVITAR_FLEXION'], revisarEn: '2026-06-22' }),
    cond({ id: 'c2', etiqueta: 'Molestia leve', severidad: 'LEVE' }),
  ];
  const alerta = alertaPreClase('Ana', condiciones, HOY);
  assert.match(alerta!, /^Ana — Lesión lumbar\./);       // toma la de mayor severidad
  assert.match(alerta!, /Evitar flexión\./);
  assert.match(alerta!, /Revisión vencida hace 20 d\./);
});

test('alertaPreClase muestra revisión próxima dentro de 7 días', () => {
  const alerta = alertaPreClase('Ana', [cond({ id: 'c1', etiqueta: 'Hombro', revisarEn: '2026-07-15' })], HOY);
  assert.match(alerta!, /Revisar en 3 d\./);
});

// ── catálogo ─────────────────────────────────────────────────────────────────
test('esRestriccionDura reconoce códigos NO_*', () => {
  assert.equal(esRestriccionDura('NO_SALTOS'), true);
  assert.equal(esRestriccionDura('EVITAR_FLEXION'), false);
});

test('etiquetaRestriccion traduce códigos conocidos y deja pasar los desconocidos', () => {
  assert.equal(etiquetaRestriccion('NO_ELEVACION_90'), 'No elevación por encima de 90°');
  assert.equal(etiquetaRestriccion('CODIGO_RARO'), 'CODIGO_RARO');
});

test('restriccionesDeZona devuelve el catálogo de la zona', () => {
  assert.ok(restriccionesDeZona('RODILLA').some(r => r.codigo === 'NO_SALTOS'));
  assert.equal(restriccionesDeZona('RODILLA').length, 3);
});

// ── resumenSaludClase (agregado anónimo para IA) ─────────────────────────────
test('resumenSaludClase cuenta alumnas, semáforos, categorías y zonas sin nombres', () => {
  const alumnas = [
    [cond({ id: 'a1', categoria: 'LESION', zona: 'COLUMNA', severidad: 'MEDIA', restricciones: ['EVITAR_FLEXION'] })],       // ámbar
    [cond({ id: 'b1', categoria: 'LESION', zona: 'RODILLA', severidad: 'LEVE', restricciones: ['NO_SALTOS'] })],             // rojo (NO_*)
    [cond({ id: 'c1', categoria: 'EMBARAZO', zona: null, severidad: 'MEDIA', etiqueta: 'Embarazo 22 sem' })],                // ámbar
    [],                                                                                                                       // sin condiciones
  ];
  const r = resumenSaludClase(alumnas);
  assert.equal(r.totalAlumnas, 4);
  assert.equal(r.conCondiciones, 3);
  assert.equal(r.semaforos.rojo, 1);
  assert.equal(r.semaforos.ambar, 2);
  assert.equal(r.categorias.LESION, 2);
  assert.equal(r.categorias.EMBARAZO, 1);
  assert.equal(r.zonas.COLUMNA, 1);
  assert.equal(r.zonas.RODILLA, 1);
  assert.ok(r.restricciones.some(x => x.codigo === 'NO_SALTOS' && x.n === 1));
  assert.ok(r.etiquetas.includes('Embarazo 22 sem'));
  // El agregado NO contiene ningún nombre de socia (solo cifras y descripciones).
  assert.equal(JSON.stringify(r).includes('socioId'), false);
});

test('resumenSaludClase con roster sano da ceros', () => {
  const r = resumenSaludClase([[], []]);
  assert.equal(r.totalAlumnas, 2);
  assert.equal(r.conCondiciones, 0);
  assert.equal(r.restricciones.length, 0);
  assert.equal(r.etiquetas.length, 0);
});

// ── recordatoriosRevision (§10) ──────────────────────────────────────────────
test('recordatoriosRevision marca revisión vencida', () => {
  const r = recordatoriosRevision([cond({ id: 'c1', revisarEn: '2026-07-01' })], HOY);
  assert.equal(r.length, 1);
  assert.equal(r[0].motivo, 'REVISION_VENCIDA');
  assert.equal(r[0].dias, 11);
});

test('recordatoriosRevision NO marca revisión futura', () => {
  assert.equal(recordatoriosRevision([cond({ id: 'c1', revisarEn: '2026-08-01' })], HOY).length, 0);
});

test('recordatoriosRevision marca condición sin revisar más antigua que el umbral', () => {
  // inicio hace 100 días, sin revisarEn, umbral 90 → SIN_REVISION
  const r = recordatoriosRevision([cond({ id: 'c1', inicio: '2026-04-03', revisarEn: null })], HOY, 90);
  assert.equal(r.length, 1);
  assert.equal(r[0].motivo, 'SIN_REVISION');
  assert.equal(r[0].dias, 100);
});

test('recordatoriosRevision ignora condiciones resueltas y recientes sin revisar', () => {
  const condiciones = [
    cond({ id: 'c1', estado: 'RESUELTA', revisarEn: '2026-01-01' }),   // resuelta → fuera
    cond({ id: 'c2', inicio: '2026-07-01', revisarEn: null }),         // 11 días < 90 → fuera
  ];
  assert.equal(recordatoriosRevision(condiciones, HOY, 90).length, 0);
});

test('textoRecordatorioRevision nombra a la socia pero NO la condición ni restricciones', () => {
  const c = cond({ id: 'c1', etiqueta: 'Lesión lumbar', restricciones: ['NO_SALTOS'], revisarEn: '2026-06-01' });
  const texto = textoRecordatorioRevision('Ana', recordatoriosRevision([c], HOY)[0]);
  assert.match(texto, /Ana/);
  assert.equal(texto.includes('Lesión lumbar'), false);
  assert.equal(texto.includes('salto'), false);
});
