import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CondicionSalud, NotaProgreso } from '../types';
import { notasPropias, saludParaInstructora } from './salud-para-instructora.ts';

function condicion(extra: Partial<CondicionSalud>): CondicionSalud {
  return {
    id: 'c', studioId: 's', socioId: 'a', categoria: 'LESION', etiqueta: 'Hernia discal', zona: 'COLUMNA',
    restricciones: [], severidad: 'MEDIA', estado: 'ACTIVA', inicio: '2026-01-01', fin: null, revisarEn: null,
    notas: 'Texto libre que NO debe salir', creadoPor: null, creadoEn: '2026-01-01', actualizadoEn: '2026-01-01',
    ...extra,
  } as CondicionSalud;
}

test('sin consentimiento vigente no sale nada que deje adivinar si hay condiciones', () => {
  const condiciones = [condicion({ severidad: 'ALTA' })];
  assert.deepEqual(
    saludParaInstructora({ consentimientoFecha: null, consentimientoRevocadoEn: null, condiciones }),
    { consentimiento: 'SIN_CONSENTIMIENTO' },
  );
  assert.deepEqual(
    saludParaInstructora({ consentimientoFecha: '2026-01-01', consentimientoRevocadoEn: '2026-05-01', condiciones }),
    { consentimiento: 'SIN_CONSENTIMIENTO' },
  );
});

test('con consentimiento: semáforo y avisos estructurados de las activas, nunca las notas libres', () => {
  const r = saludParaInstructora({
    consentimientoFecha: '2026-01-01',
    consentimientoRevocadoEn: null,
    condiciones: [
      condicion({ id: 'activa', restricciones: ['EVITAR_ABDOMINALES'] }),
      condicion({ id: 'resuelta', estado: 'RESUELTA', etiqueta: 'Esguince antiguo' }),
    ],
  });
  assert.equal(r.consentimiento, 'VIGENTE');
  if (r.consentimiento !== 'VIGENTE') return;
  assert.equal(r.avisos.length, 1);
  assert.equal(r.avisos[0].etiqueta, 'Hernia discal');
  assert.deepEqual(r.avisos[0].restricciones, ['Evitar abdominales clásicos']);
  assert.doesNotMatch(JSON.stringify(r), /Texto libre|Esguince antiguo/);
  assert.equal(r.semaforo, 'AMBAR');
});

test('de las notas de progreso solo salen las suyas, la más reciente primero', () => {
  const nota = (id: string, instructorId: string, creadaEn: string) =>
    ({ id, studioId: 's', socioId: 'a', instructorId, sesionId: null, textoLibre: id, progreso: null, alertas: null, planProximaSesion: null, ejerciciosCasa: null, creadaEn }) as NotaProgreso;
  const r = notasPropias([
    nota('otra', 'ins-2', '2026-09-10T10:00:00Z'),
    nota('vieja', 'ins-1', '2026-09-01T10:00:00Z'),
    nota('nueva', 'ins-1', '2026-09-12T10:00:00Z'),
  ], 'ins-1');
  assert.deepEqual(r.map((n) => n.id), ['nueva', 'vieja']);
});

test('una nota sin texto libre sale con texto vacío, no con null', () => {
  const r = notasPropias([
    { id: 'n', instructorId: 'ins-1', creadaEn: '2026-09-12T10:00:00Z', textoLibre: null as unknown as string, progreso: 'Bien', alertas: null, planProximaSesion: null },
  ], 'ins-1');
  assert.equal(r[0].textoLibre, '');
  assert.equal(r[0].progreso, 'Bien');
});
