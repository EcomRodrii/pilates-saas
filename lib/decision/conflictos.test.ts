import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Candidata } from './tipos.ts';
import { detectarConflictos } from './conflictos.ts';

function candidata(p: Partial<Candidata> = {}): Candidata {
  return {
    especialista: 'INGRESOS', tipo: 'ABRIR_SESION', dedupeKey: 'k', tituloMotor: 't', motivoMotor: 'm',
    datosUsados: {}, riesgo: 'OPORTUNIDAD',
    confianza: { nivel: 'ALTA', evidencia: [], autonomiaMaxima: 2 },
    accion: { tipo: 'MARCAR_GESTIONADO' },
    tiempoEstimadoMin: 10, expiraEnDias: 21, urgencia: 0.5, esfuerzo: 0.5,
    ...p,
  };
}

test('detectarConflictos: ABRIR_SESION e FUSIONAR_SESIONES sobre la misma sala se marcan cruzadas, ninguna se oculta', () => {
  const abrir = candidata({ especialista: 'INGRESOS', tipo: 'ABRIR_SESION', tituloMotor: 'Abre otra clase', salaId: 'sala-1' });
  const fusionar = candidata({ especialista: 'AGENDA', tipo: 'FUSIONAR_SESIONES', tituloMotor: 'Esta clase va vacía', salaId: 'sala-1' });
  const resultado = detectarConflictos([abrir, fusionar]);
  assert.equal(resultado.length, 2);
  assert.ok(String(resultado[0].datosUsados.conflictoCon).includes('Esta clase va vacía'));
  assert.ok(String(resultado[1].datosUsados.conflictoCon).includes('Abre otra clase'));
});

test('detectarConflictos: ABRIR_SESION y MOVER_HORARIO comparten instructora → se marcan', () => {
  const abrir = candidata({ especialista: 'INGRESOS', tipo: 'ABRIR_SESION', tituloMotor: 'Abre otra clase', instructorId: 'ins-1' });
  const mover = candidata({ especialista: 'AGENDA', tipo: 'MOVER_HORARIO', tituloMotor: 'Muévela de hora', instructorId: 'ins-1' });
  const resultado = detectarConflictos([abrir, mover]);
  assert.ok(resultado.every(c => c.datosUsados.conflictoCon !== undefined));
});

test('detectarConflictos: misma entidad pero tipos NO conflictivos → no se marcan', () => {
  const a = candidata({ especialista: 'INGRESOS', tipo: 'ABRIR_SESION', salaId: 'sala-1' });
  const b = candidata({ especialista: 'AGENDA', tipo: 'ABRIR_SESION', salaId: 'sala-1' });
  const resultado = detectarConflictos([a, b]);
  assert.ok(resultado.every(c => c.datosUsados.conflictoCon === undefined));
});

test('detectarConflictos: tipos conflictivos pero SIN entidad compartida → no se marcan', () => {
  const abrir = candidata({ especialista: 'INGRESOS', tipo: 'ABRIR_SESION', salaId: 'sala-1' });
  const fusionar = candidata({ especialista: 'AGENDA', tipo: 'FUSIONAR_SESIONES', salaId: 'sala-2' });
  const resultado = detectarConflictos([abrir, fusionar]);
  assert.ok(resultado.every(c => c.datosUsados.conflictoCon === undefined));
});

test('detectarConflictos: mismo especialista, misma entidad → no cuenta como conflicto (coordinarColisiones ya lo trata aparte)', () => {
  const a = candidata({ especialista: 'AGENDA', tipo: 'FUSIONAR_SESIONES', salaId: 'sala-1' });
  const b = candidata({ especialista: 'AGENDA', tipo: 'MOVER_HORARIO', salaId: 'sala-1' });
  const resultado = detectarConflictos([a, b]);
  assert.ok(resultado.every(c => c.datosUsados.conflictoCon === undefined));
});

test('detectarConflictos: candidata sin entidades no se marca ni rompe', () => {
  const a = candidata({ especialista: 'RETENCION', tipo: 'RECUPERAR_SOCIA', socioId: 'x' });
  const resultado = detectarConflictos([a]);
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].datosUsados.conflictoCon, undefined);
});
