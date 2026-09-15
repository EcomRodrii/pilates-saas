import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mensajeErrorRenovar, nombreSerie, resultadoDeRpc, semanasValidas, seriePorRenovarDeFila, textoFinSerie, textoTrasRenovar,
  type ResultadoRenovarSerie,
} from './series-renovacion.ts';

const base: ResultadoRenovarSerie = {
  estado: 'renovada', periodo: 2, periodoActual: 1, semanas: 52, desde: '2026-10-12', hasta: '2027-10-04',
  creadas: 52, omitidas: [], sinInstructora: [], instructoraInactiva: false, plazasFijas: 0, renovacionAutomatica: false,
};

test('resultadoDeRpc traduce el jsonb de la base de datos y descarta lo que no tiene forma', () => {
  const r = resultadoDeRpc({
    estado: 'simulacion', periodo_actual: 1, periodo: 2, semanas: 4, desde: '2026-10-12', hasta: '2026-11-02',
    creadas: 3, omitidas: [{ fecha: '2026-10-19', motivo: 'sala_ocupada' }, { fecha: 5, motivo: 'x' }],
    sin_instructora: ['2026-10-26'], instructora_inactiva: false, plazas_fijas: 2, plazas_fijas_ids: ['pf-1'],
  });
  assert.deepEqual(r, {
    estado: 'simulacion', periodo: 2, periodoActual: 1, semanas: 4, desde: '2026-10-12', hasta: '2026-11-02',
    creadas: 3, omitidas: [{ fecha: '2026-10-19', motivo: 'sala_ocupada' }], sinInstructora: ['2026-10-26'],
    instructoraInactiva: false, plazasFijas: 2, renovacionAutomatica: false,
  });
  assert.equal(resultadoDeRpc({ estado: 'otra' }), null);
  assert.equal(resultadoDeRpc(null), null);
});

test('seriePorRenovarDeFila deja la hora en HH:MM', () => {
  const s = seriePorRenovarDeFila({
    serie_id: 'serie-1', ultima_fecha: '2026-10-06', dia_semana: 2, hora: '18:00:00', sala_id: 'sala-1',
    tipo_clase_id: null, instructor_id: 'ins-1', aforo: 8, periodo: 1, semanas_periodo: 52, plazas_fijas: 5, terminada: false,
  });
  assert.equal(s.hora, '18:00');
  assert.equal(s.tipoClaseId, null);
  assert.equal(s.plazasFijas, 5);
  assert.equal(s.renovacionAutomatica, false);
  assert.equal(s.avisoTramo, null);
});

test('textoFinSerie: futuro con cuenta atrás, hoy, mañana y ya terminada', () => {
  assert.equal(textoFinSerie('2026-10-05', '2026-09-15'), 'Termina el 05/10/2026 · en 20 días');
  assert.equal(textoFinSerie('2026-09-15', '2026-09-15'), 'Termina hoy');
  assert.equal(textoFinSerie('2026-09-16', '2026-09-15'), 'Termina mañana');
  assert.equal(textoFinSerie('2026-09-10', '2026-09-15'), 'Terminó el 10/09/2026');
});

test('textoTrasRenovar cuenta lo creado, lo omitido y lo que hay que revisar', () => {
  assert.equal(textoTrasRenovar(base), 'Clase renovada: 52 clases más, hasta el 04/10/2027');
  assert.equal(
    textoTrasRenovar({
      ...base, creadas: 50, plazasFijas: 5, sinInstructora: ['2026-11-02'],
      omitidas: [{ fecha: '2026-12-22', motivo: 'sala_ocupada' }, { fecha: '2026-12-29', motivo: 'ya_existe' }],
    }),
    'Clase renovada: 50 clases más, hasta el 04/10/2027 · 1 fecha no se ha creado porque la sala está ocupada · 1 ya estaba en el calendario · 1 queda sin instructora: asígnala en el calendario · 5 plazas fijas siguen',
  );
  assert.match(textoTrasRenovar({ ...base, instructoraInactiva: true }), /la de antes ya no está en el equipo/);
  assert.equal(textoTrasRenovar({ ...base, estado: 'ya_renovada' }), 'Esta clase ya estaba renovada: sigue hasta el 04/10/2027');
  assert.match(textoTrasRenovar({ ...base, estado: 'sin_cambios', creadas: 0 }), /No se ha creado ninguna clase/);
});

test('mensajeErrorRenovar traduce los códigos de la RPC y no enseña errores crudos', () => {
  assert.equal(mensajeErrorRenovar('SERIE_SIN_CLASES'), 'Todas las clases de esta serie están canceladas: no hay nada que renovar.');
  assert.equal(mensajeErrorRenovar('P0001: SERIE_NO_ENCONTRADA'), 'No se ha encontrado esta clase.');
  assert.match(mensajeErrorRenovar('DEMASIADAS_CLASES'), /más de 400/);
  assert.equal(mensajeErrorRenovar('duplicate key value violates unique constraint'), 'No se ha podido renovar la clase. Inténtalo de nuevo.');
});

test('nombreSerie usa los nombres del panel y no se inventa ninguno', () => {
  const tipos: Record<string, string> = { 'tc-1': 'Reformer' };
  const salas: Record<string, string> = { 'sala-1': 'Sala 1' };
  assert.equal(
    nombreSerie({ diaSemana: 2, hora: '18:00:00', salaId: 'sala-1', tipoClaseId: 'tc-1' }, id => tipos[id], id => salas[id]),
    'Reformer · Martes 18:00 · Sala 1',
  );
  assert.equal(nombreSerie({ diaSemana: 3, hora: '09:30', salaId: null, tipoClaseId: 'x' }, id => tipos[id], id => salas[id]), 'Clase · Miércoles 09:30 · Sala');
});

test('un día de cierre del centro se omite con su motivo y se cuenta aparte', () => {
  const r = resultadoDeRpc({
    estado: 'renovada', periodo: 2, periodo_actual: 1, semanas: 3, desde: '2026-10-12', hasta: '2026-10-26',
    creadas: 2, omitidas: [{ fecha: '2026-10-12', motivo: 'cierre' }], sin_instructora: [],
    instructora_inactiva: false, plazas_fijas: 0, renovacion_automatica: false,
  });
  assert.deepEqual(r?.omitidas, [{ fecha: '2026-10-12', motivo: 'cierre' }]);
  assert.equal(
    textoTrasRenovar(r!),
    'Clase renovada: 2 clases más, hasta el 26/10/2026 · 1 fecha no se ha creado porque el centro está cerrado',
  );
});

test('semanasValidas: de 1 a 104, enteras', () => {
  assert.equal(semanasValidas(52), true);
  assert.equal(semanasValidas(0), false);
  assert.equal(semanasValidas(105), false);
  assert.equal(semanasValidas(4.5), false);
});
