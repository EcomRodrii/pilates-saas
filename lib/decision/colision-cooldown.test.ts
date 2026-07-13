// A-17 (regresión): el cooldown debe aplicarse ANTES de coordinar colisiones.
// Si no, una candidata en cooldown puede GANAR la colisión (mayor score) y luego
// el filtro de cooldown la descarta, dejando a la socia SIN la alternativa viable
// que sí existía. Esta es la composición que hace motor.ejecutarAnalisis.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Candidata, Recomendacion } from './tipos.ts';
import { coordinarColisiones } from './director.ts';
import { enCooldown } from './prioridad.ts';

const NOW = new Date('2026-07-11T12:00:00.000Z');
const diasAntes = (x: number) => new Date(NOW.getTime() - x * 86400000).toISOString();

function candidata(p: Partial<Candidata> & Pick<Candidata, 'tipo' | 'dedupeKey'>): Candidata {
  return {
    especialista: 'RETENCION', tituloMotor: 't', motivoMotor: 'm', datosUsados: {}, riesgo: 'PERDIDA',
    confianza: { nivel: 'ALTA', evidencia: [], autonomiaMaxima: 2 }, accion: { tipo: 'MARCAR_GESTIONADO' },
    socioId: 'sofia', tiempoEstimadoMin: 2, expiraEnDias: 7, urgencia: 0.5, esfuerzo: 0.2, ...p,
  };
}

// Dos candidatas para la MISMA socia: A gana la colisión (más impacto), B es la alternativa.
const A = candidata({ tipo: 'RECUPERAR_SOCIA', dedupeKey: 'RETENCION:RECUPERAR_SOCIA:sofia', impacto: { unidad: 'EUR', valor: 300, formula: 'test' } });
const B = candidata({ tipo: 'ENVIAR_REACTIVACION', dedupeKey: 'RETENCION:ENVIAR_REACTIVACION:sofia', impacto: { unidad: 'EUR', valor: 60, formula: 'test' } });

// A fue rechazada hace 3 días → su dedupeKey sigue en cooldown (RECUPERAR_SOCIA = 21 días).
const rechazadaA: Recomendacion = {
  id: 'old-1', studioId: 'e1', decisionSessionId: 'ds', algorithmVersion: '1.0.0', especialista: 'RETENCION',
  tipo: 'RECUPERAR_SOCIA', dedupeKey: A.dedupeKey, titulo: 't', motivo: 'm', datosUsados: {}, riesgo: 'PERDIDA',
  impacto: null, confianza: { nivel: 'ALTA', evidencia: [], autonomiaMaxima: 2 }, score: 50, prioridad: 'ALTA',
  nivelAutonomia: 1, accion: { tipo: 'MARCAR_GESTIONADO' }, socioId: 'sofia', sesionId: null, reciboId: null,
  tiempoEstimadoMin: 2, estado: 'RECHAZADA', vistaEn: null, expiraEn: diasAntes(-30), creadoEn: diasAntes(5),
  resueltoEn: diasAntes(3), resueltoPor: 'u',
};

test('A-17: cooldown antes de colisión → la socia conserva la alternativa viable', () => {
  const candidatas = [A, B];
  const resueltas90d = [rechazadaA];

  // ORDEN CORRECTO (el del motor tras el fix): cooldown → colisión.
  const fueraCooldown = candidatas.filter(c => !enCooldown(c, resueltas90d, NOW));
  const visibles = coordinarColisiones(fueraCooldown);
  const paraSofia = visibles.filter(c => c.socioId === 'sofia');
  assert.equal(paraSofia.length, 1);
  assert.equal(paraSofia[0].tipo, 'ENVIAR_REACTIVACION'); // la alternativa emerge

  // ORDEN ANTIGUO (bug): colisión → cooldown. A gana la colisión y luego el
  // cooldown la mata → Sofía se queda sin NADA aunque B era mostrable.
  const coordinadasPrimero = coordinarColisiones(candidatas);
  const trasCooldown = coordinadasPrimero.filter(c => !enCooldown(c, resueltas90d, NOW));
  assert.equal(trasCooldown.filter(c => c.socioId === 'sofia').length, 0);
});
