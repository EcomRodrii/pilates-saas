import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Candidata, HechoMemoria, MemoriaEstudio, Recomendacion } from './tipos.ts';
import { aplicarMemoria, canalPreferido, tieneHechoActivo, detectarHechosPorRegla, detectarHechosPorFeedback } from './memoria.ts';
import { construirIndices } from './senales.ts';
import type { SnapshotEstudio } from './tipos.ts';
import type { Socio, AutomationLog } from '@/lib/types';

const NOW = new Date('2026-07-11T12:00:00.000Z');
const diasAntes = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();
const diasDespues = (n: number) => new Date(NOW.getTime() + n * 86400000).toISOString();

function hecho(p: Partial<HechoMemoria> & Pick<HechoMemoria, 'socioId' | 'clave'>): HechoMemoria {
  return {
    id: 'h1', studioId: 'e1', valor: {}, nivel: 'MEDIO', confianza: 'MEDIA',
    origen: 'REGLA', creadoPor: null, evidencia: '', activa: true, expiraEn: null,
    ...p,
  };
}
function memoria(hechos: HechoMemoria[]): MemoriaEstudio {
  const m: MemoriaEstudio = new Map();
  for (const h of hechos) {
    const arr = m.get(h.socioId) ?? [];
    arr.push(h);
    m.set(h.socioId, arr);
  }
  return m;
}
function candidataContacto(p: Partial<Candidata> = {}): Candidata {
  return {
    especialista: 'RETENCION', tipo: 'RECUPERAR_SOCIA', dedupeKey: 'RETENCION:RECUPERAR_SOCIA:a',
    tituloMotor: 'Noto a Ana a punto de irse', motivoMotor: 'Lleva 20 días sin venir.',
    datosUsados: { nombre: 'Ana' }, riesgo: 'PERDIDA',
    confianza: { nivel: 'ALTA', evidencia: [], autonomiaMaxima: 2 },
    accion: { tipo: 'CONTACTO_MANUAL', canal: 'WHATSAPP', textoSugerido: 'texto' },
    socioId: 'a', tiempoEstimadoMin: 2, expiraEnDias: 10, urgencia: 0.5, esfuerzo: 0.2,
    ...p,
  };
}

test('tieneHechoActivo: ignora hechos expirados', () => {
  const m = memoria([hecho({ socioId: 'a', clave: 'NO_CONTACTAR_HASTA', expiraEn: diasAntes(1) })]);
  assert.equal(tieneHechoActivo(m, 'a', 'NO_CONTACTAR_HASTA', NOW), false);
});

test('tieneHechoActivo: hecho vigente cuenta', () => {
  const m = memoria([hecho({ socioId: 'a', clave: 'NO_CONTACTAR_HASTA', expiraEn: diasDespues(30) })]);
  assert.equal(tieneHechoActivo(m, 'a', 'NO_CONTACTAR_HASTA', NOW), true);
});

test('canalPreferido: WHATSAPP antes que LLAMADA antes que EMAIL', () => {
  const m = memoria([
    hecho({ socioId: 'a', clave: 'PREFIERE_LLAMADA' }),
    hecho({ socioId: 'a', clave: 'PREFIERE_WHATSAPP' }),
  ]);
  assert.equal(canalPreferido(m, 'a', NOW), 'WHATSAPP');
});

test('aplicarMemoria: NO_CONTACTAR_HASTA suprime la candidata de contacto', () => {
  const m = memoria([hecho({ socioId: 'a', clave: 'NO_CONTACTAR_HASTA', expiraEn: diasDespues(30) })]);
  const resultado = aplicarMemoria([candidataContacto()], m, NOW);
  assert.equal(resultado.length, 0);
});

test('aplicarMemoria: NO_OFRECER_DESCUENTOS degrada ENVIAR_REACTIVACION a RECUPERAR_SOCIA', () => {
  const c = candidataContacto({
    tipo: 'ENVIAR_REACTIVACION', dedupeKey: 'RETENCION:ENVIAR_REACTIVACION:a',
    accion: { tipo: 'ENVIAR_EMAIL', plantilla: 'REACTIVACION', descuentoPct: 15 },
  });
  const m = memoria([hecho({ socioId: 'a', clave: 'NO_OFRECER_DESCUENTOS', expiraEn: null })]);
  const [resultado] = aplicarMemoria([c], m, NOW);
  assert.equal(resultado.tipo, 'RECUPERAR_SOCIA');
  assert.equal(resultado.accion.tipo, 'CONTACTO_MANUAL');
});

test('aplicarMemoria: ajusta el canal a la preferencia guardada', () => {
  const m = memoria([hecho({ socioId: 'a', clave: 'PREFIERE_LLAMADA', expiraEn: diasDespues(30) })]);
  const [resultado] = aplicarMemoria([candidataContacto()], m, NOW);
  assert.equal(resultado.accion.tipo === 'CONTACTO_MANUAL' && resultado.accion.canal, 'LLAMADA');
});

test('aplicarMemoria: NUNCA_RESPONDE_EMAIL convierte ENVIAR_EMAIL en CONTACTO_MANUAL', () => {
  const c = candidataContacto({ accion: { tipo: 'ENVIAR_EMAIL', plantilla: 'REACTIVACION' } });
  const m = memoria([hecho({ socioId: 'a', clave: 'NUNCA_RESPONDE_EMAIL', expiraEn: diasDespues(30) })]);
  const [resultado] = aplicarMemoria([c], m, NOW);
  assert.equal(resultado.accion.tipo, 'CONTACTO_MANUAL');
});

test('aplicarMemoria: candidata sin socioId (insight de negocio) pasa intacta', () => {
  const c = candidataContacto({ socioId: undefined, accion: { tipo: 'MARCAR_GESTIONADO' } });
  const resultado = aplicarMemoria([c], memoria([]), NOW);
  assert.equal(resultado.length, 1);
});

// ── escritura automática ──────────────────────────────────────────────────

function socio(p: Partial<Socio> & Pick<Socio, 'id'>): Socio {
  return { studioId: 'e1', nombre: 'A', apellidos: 'B', email: 'a@b.c', telefono: null, nif: null, fechaAlta: '2025-01-01', activo: true, ...p };
}
function log(p: Partial<AutomationLog> & Pick<AutomationLog, 'socioId'>): AutomationLog {
  return { id: `l-${Math.random()}`, studioId: 'e1', ruleId: 'r', ruleName: 'R', resultado: 'EJECUTADO', accion: 'ENVIAR_EMAIL', socioNombre: null, pasoIndex: 0, detalle: '', ejecutadoEn: diasAntes(10), proximaAccionEn: null, ...p };
}
function snapshot(over: Partial<SnapshotEstudio>): SnapshotEstudio {
  return { studioId: 'e1', socios: [], reservas: [], sesiones: [], salas: [], recibos: [], suscripciones: [], planesTarifa: [], tiposClase: [], instructores: [], automationLogs: [], campanas: [], ...over };
}

test('detectarHechosPorRegla: 3+ emails sin respuesta en 60d → NUNCA_RESPONDE_EMAIL', () => {
  const socios = [socio({ id: 'a' })];
  const logs = [1, 2, 3].map(i => log({ socioId: 'a', ejecutadoEn: diasAntes(10 * i) }));
  const snap = snapshot({ socios, automationLogs: logs });
  const idx = construirIndices(snap);
  const nuevos = detectarHechosPorRegla(idx, snap, NOW);
  assert.equal(nuevos.length, 1);
  assert.equal(nuevos[0].clave, 'NUNCA_RESPONDE_EMAIL');
});

test('detectarHechosPorFeedback: 2 rechazos de contacto sobre la misma socia en 90d → NO_CONTACTAR_HASTA', () => {
  function rec(p: Partial<Recomendacion>): Recomendacion {
    return {
      id: 'r', studioId: 'e1', decisionSessionId: 'ds1', algorithmVersion: '1.0.0', especialista: 'RETENCION',
      tipo: 'RECUPERAR_SOCIA', dedupeKey: 'k', titulo: 't', motivo: 'm', datosUsados: {}, riesgo: 'PERDIDA',
      impacto: null, confianza: { nivel: 'ALTA', evidencia: [], autonomiaMaxima: 2 }, score: 50, prioridad: 'ALTA',
      nivelAutonomia: 1, accion: { tipo: 'CONTACTO_MANUAL', canal: 'WHATSAPP', textoSugerido: '' },
      socioId: 'a', sesionId: null, reciboId: null, tiempoEstimadoMin: 2, estado: 'RECHAZADA', vistaEn: null,
      expiraEn: diasDespues(10), creadoEn: diasAntes(20), resueltoEn: diasAntes(15), resueltoPor: 'u1',
      ...p,
    };
  }
  const resueltas = [rec({ id: 'r1', resueltoEn: diasAntes(40) }), rec({ id: 'r2', resueltoEn: diasAntes(15) })];
  const nuevos = detectarHechosPorFeedback(resueltas, NOW);
  assert.equal(nuevos.length, 1);
  assert.equal(nuevos[0].clave, 'NO_CONTACTAR_HASTA');
  assert.equal(nuevos[0].socioId, 'a');
});

test('detectarHechosPorFeedback: 1 solo rechazo no genera hecho', () => {
  function rec(): Recomendacion {
    return {
      id: 'r1', studioId: 'e1', decisionSessionId: 'ds1', algorithmVersion: '1.0.0', especialista: 'RETENCION',
      tipo: 'RECUPERAR_SOCIA', dedupeKey: 'k', titulo: 't', motivo: 'm', datosUsados: {}, riesgo: 'PERDIDA',
      impacto: null, confianza: { nivel: 'ALTA', evidencia: [], autonomiaMaxima: 2 }, score: 50, prioridad: 'ALTA',
      nivelAutonomia: 1, accion: { tipo: 'CONTACTO_MANUAL', canal: 'WHATSAPP', textoSugerido: '' },
      socioId: 'a', sesionId: null, reciboId: null, tiempoEstimadoMin: 2, estado: 'RECHAZADA', vistaEn: null,
      expiraEn: diasDespues(10), creadoEn: diasAntes(20), resueltoEn: diasAntes(15), resueltoPor: 'u1',
    };
  }
  assert.equal(detectarHechosPorFeedback([rec()], NOW).length, 0);
});
