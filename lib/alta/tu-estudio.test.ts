import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIAS_ALTA, DIAS_POR_DEFECTO, HORARIOS_ALTA, PRECIO_CADENA_MES,
  aHoraBd, aHoraCorta, diasDe, erroresCuando, erroresDonde, esCanarias, etiquetaCuando, etiquetaDonde, filasHorario,
  franjaDe, horarioGuardado, horarioIdDe, horarioOtroValido, limpiarDonde, lineaDireccion, onbCentrosDe, otrasSedes,
  horasDeLaFranja, restoDeSedes, semanaPrevista, sedesDeOnbCentros, textoProvincia, tituloDonde, tuEstudioGuardado,
  type Sedes,
} from './tu-estudio.ts';
import { OPCIONES_HORARIO } from '../onboarding/plan-configuracion.ts';
import { OPCIONES_CENTROS } from '../onboarding/asistente-rapido.ts';
import { PLAN_INFO } from '../billing/entitlements.ts';
import type { DiaHorario } from '../types.ts';

// El paso 3 del alta nueva, «Tu estudio» (dónde está y cuándo abre). Lo que se
// pinta y lo que se guarda salen de aquí; la pantalla
// (components/alta-nueva/paso-tu-estudio.tsx) solo lo conecta.

test('la provincia sale de las dos primeras cifras del código postal, sin servicio externo', () => {
  assert.equal(textoProvincia('28003'), 'Provincia: Madrid. Sale sola de tu código postal.');
  assert.equal(textoProvincia('08001'), 'Provincia: Barcelona. Sale sola de tu código postal.');
  assert.equal(textoProvincia('2800'), 'La provincia sale sola de tu código postal.', 'a medio escribir, no se adivina');
  assert.equal(textoProvincia('53001'), 'La provincia sale sola de tu código postal.', 'el 53 no es de ninguna provincia');
});

test('Canarias (35 y 38) saca el aviso de la hora peninsular; el resto no', () => {
  assert.equal(esCanarias('35001'), true);
  assert.equal(esCanarias('38001'), true);
  assert.equal(esCanarias('28003'), false);
  assert.equal(esCanarias('3500'), false, 'solo con el código entero');
});

test('«Dónde está»: lo que falta se dice campo a campo y lo que sobra se limpia', () => {
  const vacio = erroresDonde({ nombre: ' ', direccion: '', codigoPostal: '2800', ciudad: '' });
  assert.deepEqual(Object.keys(vacio).sort(), ['ciudad', 'codigoPostal', 'direccion', 'nombre']);
  assert.deepEqual(erroresDonde({ nombre: 'Lucía', direccion: 'Calle Mayor 1', codigoPostal: '28003', ciudad: 'Madrid' }), {});
  assert.ok(erroresDonde({ nombre: 'Lucía', direccion: 'Calle Mayor 1', codigoPostal: '99999', ciudad: 'Madrid' }).codigoPostal,
    'un código postal que no es de ninguna provincia no se guarda');
  assert.deepEqual(
    limpiarDonde({ nombre: '  Lucía  ', direccion: 'Calle   Mayor, 1 ', codigoPostal: ' 28 003', ciudad: ' Madrid ' }),
    { nombre: 'Lucía', direccion: 'Calle Mayor, 1', codigoPostal: '28003', ciudad: 'Madrid' },
  );
  assert.equal(lineaDireccion('Madrid', 'Calle Mayor, 1'), 'Madrid · Calle Mayor, 1', 'como la pinta /reservar');
  assert.equal(lineaDireccion('Madrid', ''), 'Madrid');
  assert.equal(lineaDireccion('', ''), '');
});

test('sedes: «Solo esta» y «Varias» se guardan legibles en onb_centros y vuelven igual', () => {
  const casos: [Sedes, string][] = [
    [{ tipo: 'una' }, '1 estudio'],
    [{ tipo: 'varias', total: 2 }, '2 estudios'],
    [{ tipo: 'varias', total: 3 }, '3 estudios'],
    [{ tipo: 'varias', total: 4 }, '4 estudios'],
    [{ tipo: 'varias', total: 5 }, '5 o más estudios'],
  ];
  for (const [s, texto] of casos) {
    assert.equal(onbCentrosDe(s), texto);
    assert.deepEqual(sedesDeOnbCentros(texto), s, texto);
  }
  assert.equal(sedesDeOnbCentros(null), null, 'sin contestar no es «una»: no se inventa');
  assert.equal(sedesDeOnbCentros(''), null);
});

test('sedes: las respuestas del asistente de siempre se entienden (no se pregunta dos veces)', () => {
  assert.deepEqual(OPCIONES_CENTROS.map(sedesDeOnbCentros), [
    { tipo: 'una' }, { tipo: 'varias', total: 2 }, { tipo: 'varias', total: 4 }, { tipo: 'varias', total: 5 },
  ]);
});

test('sedes: lo que dice la pantalla con «Varias»', () => {
  assert.equal(otrasSedes(2), '1');
  assert.equal(otrasSedes(3), '2');
  assert.equal(otrasSedes(5), '4 o más');
  assert.equal(restoDeSedes(2), null);
  assert.equal(restoDeSedes(3), 'Sede 3');
  assert.equal(restoDeSedes(4), 'Sedes 3 y 4');
  assert.equal(restoDeSedes(5), 'Sede 3 y las demás');
  assert.equal(tituloDonde({ tipo: 'una' }), 'Dónde está tu estudio');
  assert.equal(tituloDonde({ tipo: 'varias', total: 3 }), 'Dónde está tu primera sede');
  assert.equal(etiquetaDonde({ tipo: 'una' }), 'Paso 3 de 5 · Tu estudio, 1 de 2 · unos 3 minutos');
  assert.equal(etiquetaDonde({ tipo: 'varias', total: 3 }), 'Paso 3 de 5 · Tu primera sede (1 de 3) · unos 3 minutos');
  assert.equal(etiquetaDonde({ tipo: 'varias', total: 5 }), 'Paso 3 de 5 · Tu primera sede (1 de 5 o más) · unos 3 minutos');
  assert.equal(etiquetaCuando({ tipo: 'una' }), 'Paso 3 de 5 · Tu estudio, 2 de 2 · 1 minuto');
  assert.equal(etiquetaCuando({ tipo: 'varias', total: 2 }), 'Paso 3 de 5 · Tu primera sede, 2 de 2 · 1 minuto');
});

test('el precio de Cadena sale del catálogo de planes, nunca escrito a mano', () => {
  assert.equal(PRECIO_CADENA_MES, PLAN_INFO.CADENA.precioMes);
});

test('las cuatro franjas son las horas de OPCIONES_HORARIO (las de la bienvenida de siempre)', () => {
  assert.equal(HORARIOS_ALTA.length, OPCIONES_HORARIO.length);
  HORARIOS_ALTA.forEach((h, i) => {
    assert.equal(aHoraBd(h.apertura), OPCIONES_HORARIO[i].apertura);
    assert.equal(aHoraBd(h.cierre), OPCIONES_HORARIO[i].cierre);
  });
  assert.deepEqual(HORARIOS_ALTA.map(h => `${h.nombre} ${h.apertura} – ${h.cierre}`), [
    'Solo mañanas 07:00 – 15:00', 'Solo tardes 15:00 – 22:00', 'Mañana y tarde 07:00 – 22:00', 'De 9 a 21 09:00 – 21:00',
  ]);
});

test('«Otro horario»: la de cierre después de la de apertura, y horas que existen', () => {
  assert.equal(horarioOtroValido('08:30', '20:00'), true);
  assert.equal(horarioOtroValido('20:00', '08:30'), false);
  assert.equal(horarioOtroValido('09:00', '09:00'), false, 'abrir y cerrar a la vez no es un horario');
  assert.equal(horarioOtroValido('', '20:00'), false);
  assert.equal(horarioOtroValido('25:00', '26:00'), false);
  assert.deepEqual(franjaDe('otro', { apertura: '08:30', cierre: '20:00' }), { apertura: '08:30', cierre: '20:00' });
  assert.equal(franjaDe('otro', { apertura: '21:00', cierre: '08:00' }), null);
  assert.deepEqual(franjaDe('tardes', { apertura: '', cierre: '' }), { apertura: '15:00', cierre: '22:00' });
  assert.deepEqual(erroresCuando('otro', { apertura: '21:00', cierre: '08:00' }, DIAS_POR_DEFECTO), {
    horario: 'La hora de cierre tiene que ser después de la de apertura.',
  });
});

test('al volver, la franja guardada sale marcada; si no es una de las cuatro, como «Otro horario»', () => {
  assert.equal(horarioIdDe('07:00:00', '15:00:00'), 'mananas');
  assert.equal(horarioIdDe('09:00', '21:00'), 'nueve-a-nueve');
  assert.equal(horarioIdDe('08:00:00', '22:00:00'), 'otro');
  assert.equal(aHoraCorta('08:00:00'), '08:00');
  assert.equal(aHoraCorta(null), '');
});

test('días → las siete filas de studio_horario (0 = domingo), cerrado sin horas', () => {
  const filas = filasHorario([true, true, true, true, true, true, false], '07:00', '22:00');
  assert.deepEqual(filas.map(f => f.diaSemana), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(filas[0], { diaSemana: 0, abierto: false, horaApertura: null, horaCierre: null }, 'el domingo, cerrado');
  assert.deepEqual(filas[1], { diaSemana: 1, abierto: true, horaApertura: '07:00:00', horaCierre: '22:00:00' }, 'el lunes');
  assert.deepEqual(filas[6], { diaSemana: 6, abierto: true, horaApertura: '07:00:00', horaCierre: '22:00:00' }, 'el sábado');
  // Solo el miércoles: la X es el tercer botón y el 3 de studio_horario.
  const soloX = filasHorario([false, false, true, false, false, false, false], '09:00', '21:00');
  assert.deepEqual(soloX.filter(f => f.abierto).map(f => f.diaSemana), [3]);
  assert.equal(DIAS_ALTA[2].letra, 'X');
  assert.deepEqual(erroresCuando('mananas', { apertura: '', cierre: '' }, [false, false, false, false, false, false, false]), {
    dias: 'Elige al menos un día.',
  });
});

test('días: de vuelta del horario por día; sin filas (estudio nuevo), de lunes a sábado', () => {
  assert.deepEqual(diasDe(undefined), [...DIAS_POR_DEFECTO]);
  assert.deepEqual(diasDe([]), [...DIAS_POR_DEFECTO]);
  assert.equal(horarioGuardado([]), false);
  const guardado: DiaHorario[] = filasHorario([true, false, true, false, true, false, true], '07:00', '15:00');
  assert.equal(horarioGuardado(guardado), true);
  assert.deepEqual(diasDe(guardado), [true, false, true, false, true, false, true], 'ida y vuelta');
});

test('la semana de la vista previa empieza HOY, como el Calendario, y cierra los días que no abre', () => {
  // Miércoles 21 de octubre de 2026; abre de lunes a viernes.
  const semana = semanaPrevista('2026-10-21', [true, true, true, true, true, false, false]);
  assert.deepEqual(semana.map(d => d.iso), ['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27']);
  assert.deepEqual(semana.map(d => d.diaSemana), [3, 4, 5, 6, 0, 1, 2]);
  assert.deepEqual(semana.map(d => d.cerrado), [false, false, false, true, true, false, false]);
  // El cambio de hora (25-oct-2026) no se come ni repite un día.
  assert.equal(new Set(semana.map(d => d.iso)).size, 7);
});

test('las filas de la semana vacía salen de la franja, en horas enteras', () => {
  assert.deepEqual(horasDeLaFranja({ apertura: '07:00', cierre: '22:00' }), { desdeHora: 7, hastaHora: 22 });
  assert.deepEqual(horasDeLaFranja({ apertura: '07:30', cierre: '21:15' }), { desdeHora: 7, hastaHora: 22 }, 'la hora a medias cuenta entera');
  assert.equal(horasDeLaFranja({ apertura: '21:00', cierre: '09:00' }), null);
  assert.equal(horasDeLaFranja(null), null);
});

test('el embudo solo apunta «Tu estudio» con la dirección y el horario por día guardados', () => {
  const bien = { direccion: 'Calle Mayor 1', codigoPostal: '28003', ciudad: 'Madrid', filasHorario: 7 };
  assert.equal(tuEstudioGuardado(bien), true);
  assert.equal(tuEstudioGuardado({ ...bien, filasHorario: 0 }), false, 'un estudio nuevo no tiene filas hasta guardarlas');
  assert.equal(tuEstudioGuardado({ ...bien, direccion: '  ' }), false);
  assert.equal(tuEstudioGuardado({ ...bien, codigoPostal: null }), false);
  assert.equal(tuEstudioGuardado({ ...bien, ciudad: undefined }), false);
});
