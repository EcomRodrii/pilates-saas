import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construirBrief, type EntradaBrief } from './brief.ts';

const e = (p: Partial<EntradaBrief>): EntradaBrief => ({
  diasHastaApertura: 21, fechaAproximada: false, ventasAyer: 0, interesadasAyer: 0, alerta: null, siguientePaso: null, ...p,
});

test('con novedades: cuenta atrás, lo de ayer, la alerta y el siguiente paso', () => {
  assert.deepEqual(construirBrief(e({
    ventasAyer: 4, interesadasAyer: 11,
    alerta: { titulo: 'Tus clases se van a llenar' }, siguientePaso: { titulo: 'Publica tu horario' },
  })), {
    titulo: 'Tu estudio abre en 21 días',
    cuerpo: 'Ayer: +4 cuotas vendidas, +11 interesadas. Atención: Tus clases se van a llenar. Siguiente paso: Publica tu horario.',
  });
});

test('singular y solo lo que hubo', () => {
  assert.equal(construirBrief(e({ ventasAyer: 1 }))!.cuerpo, 'Ayer: +1 cuota vendida.');
  assert.equal(construirBrief(e({ interesadasAyer: 1 }))!.cuerpo, 'Ayer: +1 interesada.');
});

test('sin nada que contar, no se manda (no se interrumpe por interrumpir)', () => {
  assert.equal(construirBrief(e({})), null);
  assert.equal(construirBrief(e({ siguientePaso: { titulo: 'Publica tu horario' } })), null);
});

test('los días clave de la cuenta atrás salen aunque no haya novedades', () => {
  assert.equal(construirBrief(e({ diasHastaApertura: 7 }))!.titulo, 'Tu estudio abre en 7 días');
  assert.equal(construirBrief(e({ diasHastaApertura: 1 }))!.titulo, 'Mañana abres tu estudio');
  assert.deepEqual(construirBrief(e({ diasHastaApertura: 0 })), { titulo: 'Hoy abres tu estudio', cuerpo: 'Todo lo que tienes pendiente para abrir está en Resumen.' });
});

test('sin fecha exacta, fuera del último mes o ya abierto: no hay brief', () => {
  assert.equal(construirBrief(e({ diasHastaApertura: null, ventasAyer: 3 })), null);
  assert.equal(construirBrief(e({ fechaAproximada: true, ventasAyer: 3 })), null);
  assert.equal(construirBrief(e({ diasHastaApertura: 45, ventasAyer: 3 })), null);
  assert.equal(construirBrief(e({ diasHastaApertura: -2, ventasAyer: 3 })), null);
});
