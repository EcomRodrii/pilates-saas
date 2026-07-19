import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizarConfig, elegibleParaAutonomia, seleccionarAutonomas,
  AUTONOMIA_CONFIG_DEFAULT, TIPOS_AUTONOMIA_PERMITIDOS, MAX_DIARIO_TOPE,
  type AutonomiaConfig,
} from './autonomia.ts';
import type { Recomendacion, AccionDecision } from './tipos.ts';

// Factory mínima de Recomendacion para los tests (solo importan estado,
// confianza.nivel, nivelAutonomia, accion.tipo y score).
function rec(over: {
  id?: string; estado?: Recomendacion['estado']; nivel?: 'ALTA' | 'MEDIA' | 'BAJA';
  nivelAutonomia?: 0 | 1 | 2 | 3; accion?: AccionDecision; score?: number;
} = {}): Recomendacion {
  return {
    id: over.id ?? 'r1', studioId: 's1', decisionSessionId: 'ds1', algorithmVersion: '1.1.0',
    especialista: 'RETENCION', tipo: 'ENVIAR_REACTIVACION', dedupeKey: 'k1', titulo: 't', motivo: 'm',
    datosUsados: {}, riesgo: 'PERDIDA', impacto: null,
    confianza: { nivel: over.nivel ?? 'ALTA', evidencia: [], autonomiaMaxima: 2 },
    score: over.score ?? 100, prioridad: 'ALTA', nivelAutonomia: over.nivelAutonomia ?? 2,
    accion: over.accion ?? { tipo: 'ENVIAR_EMAIL', plantilla: 'REACTIVACION' },
    socioId: 'soc1', sesionId: null, reciboId: null, tiempoEstimadoMin: 5,
    estado: over.estado ?? 'PENDIENTE', vistaEn: null, expiraEn: '2026-12-31T00:00:00Z',
    creadoEn: '2026-07-19T00:00:00Z', resueltoEn: null, resueltoPor: null,
  };
}

const ON: AutonomiaConfig = { activa: true, tiposPermitidos: ['ENVIAR_EMAIL'], maxDiario: 5 };

test('sanitizarConfig: off por defecto ante input vacío', () => {
  const c = sanitizarConfig(null);
  assert.equal(c.activa, false);
  assert.deepEqual(c.tiposPermitidos, AUTONOMIA_CONFIG_DEFAULT.tiposPermitidos);
});

test('sanitizarConfig: NUNCA deja pasar COBRAR_RECIBOS ni tipos inválidos', () => {
  const c = sanitizarConfig({ activa: true, tiposPermitidos: ['ENVIAR_EMAIL', 'COBRAR_RECIBOS', 'MARCAR_GESTIONADO'] as AccionDecision['tipo'][], maxDiario: 3 });
  assert.deepEqual(c.tiposPermitidos, ['ENVIAR_EMAIL']);
  assert.ok(!c.tiposPermitidos.includes('COBRAR_RECIBOS' as AccionDecision['tipo']));
});

test('sanitizarConfig: acota maxDiario a [0, tope] y dedup de tipos', () => {
  assert.equal(sanitizarConfig({ maxDiario: 999 }).maxDiario, MAX_DIARIO_TOPE);
  assert.equal(sanitizarConfig({ maxDiario: -4 }).maxDiario, 0);
  const c = sanitizarConfig({ tiposPermitidos: ['ENVIAR_EMAIL', 'ENVIAR_EMAIL', 'CONTACTO_MANUAL'] });
  assert.deepEqual(c.tiposPermitidos, ['ENVIAR_EMAIL', 'CONTACTO_MANUAL']);
});

test('sanitizarConfig: coacciona activa a booleano estricto', () => {
  assert.equal(sanitizarConfig({ activa: 'sí' as unknown as boolean }).activa, false);
  assert.equal(sanitizarConfig({ activa: true }).activa, true);
});

test('elegible: config apagada → nunca', () => {
  assert.equal(elegibleParaAutonomia(rec(), { ...ON, activa: false }), false);
});

test('elegible: exige ALTA confianza', () => {
  assert.equal(elegibleParaAutonomia(rec({ nivel: 'MEDIA' }), ON), false);
  assert.equal(elegibleParaAutonomia(rec({ nivel: 'ALTA' }), ON), true);
});

test('elegible: exige nivelAutonomia >= 2', () => {
  assert.equal(elegibleParaAutonomia(rec({ nivelAutonomia: 1 }), ON), false);
  assert.equal(elegibleParaAutonomia(rec({ nivelAutonomia: 2 }), ON), true);
});

test('elegible: solo estado PENDIENTE', () => {
  assert.equal(elegibleParaAutonomia(rec({ estado: 'APROBADA' }), ON), false);
});

test('elegible: COBRAR_RECIBOS nunca, aunque estuviera en la config', () => {
  const configMaliciosa = { activa: true, tiposPermitidos: ['COBRAR_RECIBOS'] as AccionDecision['tipo'][], maxDiario: 5 };
  const r = rec({ accion: { tipo: 'COBRAR_RECIBOS', reciboIds: ['x'] } });
  assert.equal(elegibleParaAutonomia(r, configMaliciosa), false);
});

test('elegible: el tipo debe estar en la config del estudio', () => {
  // CONTACTO_MANUAL es permitible globalmente, pero la config solo tiene ENVIAR_EMAIL.
  const r = rec({ accion: { tipo: 'CONTACTO_MANUAL', canal: 'WHATSAPP', textoSugerido: 'hola' } });
  assert.equal(elegibleParaAutonomia(r, ON), false);
  assert.equal(elegibleParaAutonomia(r, { ...ON, tiposPermitidos: ['CONTACTO_MANUAL'] }), true);
});

test('seleccionar: respeta el cupo diario ya consumido', () => {
  const recs = [rec({ id: 'a', score: 90 }), rec({ id: 'b', score: 80 }), rec({ id: 'c', score: 70 })];
  const sel = seleccionarAutonomas(recs, { ...ON, maxDiario: 5 }, 3); // cupo = 2
  assert.deepEqual(sel.map(r => r.id), ['a', 'b']);
});

test('seleccionar: cupo agotado → vacío', () => {
  assert.deepEqual(seleccionarAutonomas([rec()], { ...ON, maxDiario: 2 }, 2), []);
});

test('seleccionar: ordena por score descendente', () => {
  const recs = [rec({ id: 'low', score: 10 }), rec({ id: 'high', score: 99 }), rec({ id: 'mid', score: 50 })];
  const sel = seleccionarAutonomas(recs, ON, 0);
  assert.deepEqual(sel.map(r => r.id), ['high', 'mid', 'low']);
});

test('seleccionar: filtra no elegibles antes de aplicar el cupo', () => {
  const recs = [
    rec({ id: 'ok', score: 50 }),
    rec({ id: 'baja', score: 99, nivel: 'BAJA' }), // no elegible pese a score alto
  ];
  const sel = seleccionarAutonomas(recs, ON, 0);
  assert.deepEqual(sel.map(r => r.id), ['ok']);
});

test('allowlist global no contiene acciones financieras', () => {
  assert.ok(!TIPOS_AUTONOMIA_PERMITIDOS.includes('COBRAR_RECIBOS' as AccionDecision['tipo']));
  assert.ok(!TIPOS_AUTONOMIA_PERMITIDOS.includes('MARCAR_GESTIONADO' as AccionDecision['tipo']));
});
