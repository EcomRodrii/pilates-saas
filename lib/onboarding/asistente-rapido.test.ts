import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PANTALLAS, POR_DEFECTO, conDefectos, alinearAforos, sanearBorrador, camposOnb, numSalasDe,
  vieneDeOtraPlataforma, OPCIONES_SOFTWARE, SIN_SOFTWARE, OTRO_SOFTWARE,
} from './asistente-rapido.ts';
import { interpretarRespuestasWizard, planificarConfiguracion, planVacio, TIPOS_CLASE_SUGERIDOS, OPCIONES_SALAS, OPCIONES_AFORO, OPCIONES_DURACION } from './plan-configuracion.ts';

test('son tres pantallas, no once preguntas', () => {
  assert.deepEqual(PANTALLAS.map((p) => p.id), ['estudio', 'espacio', 'cierre']);
});

test('los valores por defecto son opciones reales del asistente (no etiquetas sueltas)', () => {
  assert.ok((OPCIONES_SALAS as readonly string[]).includes(POR_DEFECTO.salas!));
  for (const a of POR_DEFECTO.aforos!) assert.ok((OPCIONES_AFORO as readonly string[]).includes(a));
  assert.ok((OPCIONES_DURACION as readonly string[]).includes(POR_DEFECTO.duracion!));
  for (const c of POR_DEFECTO.clases!) assert.ok((TIPOS_CLASE_SUGERIDOS as readonly string[]).includes(c));
});

test('sin tocar nada, el estudio sale MONTADO: salas, aforo, duración y clases', () => {
  const plan = planificarConfiguracion(interpretarRespuestasWizard(conDefectos({})));
  assert.equal(planVacio(plan), false);
  assert.equal(plan.salas.length, 1);
  assert.equal(plan.salas[0].capacidad, 8);
  assert.deepEqual(plan.tiposClase.map((t) => t.nombre), ['Reformer', 'Mat']);
});

test('los valores por defecto no pisan lo contestado', () => {
  const r = conDefectos({ salas: '2 salas', duracion: '50 minutos', clases: ['Yoga'] });
  assert.equal(r.salas, '2 salas');
  assert.equal(r.duracion, '50 minutos');
  assert.deepEqual(r.clases, ['Yoga']);
});

test('no se marca por su cuenta ni el horario ni «das clases tú»', () => {
  const r = conDefectos({});
  assert.equal(r.horario, undefined);
  assert.equal(r.imparte, undefined);
  const i = interpretarRespuestasWizard(r);
  assert.equal(i.imparteClases, false);
  assert.equal(i.horaApertura, undefined);
});

test('un aforo por sala: sube heredando el primero y baja recortando', () => {
  const dos = alinearAforos({ salas: '2 salas', aforos: ['10 plazas'] });
  assert.deepEqual(dos.aforos, ['10 plazas', '10 plazas']);
  const tresCambiado = alinearAforos({ salas: '4 o más', aforos: ['10 plazas', '6 plazas'] });
  assert.deepEqual(tresCambiado.aforos, ['10 plazas', '6 plazas', '10 plazas']);
  assert.equal(numSalasDe({ salas: '4 o más' }), 3);
  const una = alinearAforos({ salas: '1 sala', aforos: ['10 plazas', '6 plazas'] });
  assert.deepEqual(una.aforos, ['10 plazas']);
});

test('un borrador de la versión anterior no arrastra «videollamada»', () => {
  const r = sanearBorrador({ ayuda: 'Quiero una videollamada', software: 'Bsport' });
  assert.equal(r.ayuda, undefined);
  assert.equal(r.software, 'Bsport');
  assert.equal(sanearBorrador({ ayuda: 'Prefiero que me llamen' }).ayuda, 'Prefiero que me llamen');
});

test('lo no contestado se guarda como null, no como un valor inventado', () => {
  const c = camposOnb({ software: 'Momence', ayuda: 'Lo configuro yo' });
  assert.equal(c.onbCentros, null);
  assert.equal(c.onbAlumnosActivos, null);
  assert.equal(c.onbPrioridad, null);
  assert.equal(c.onbSoftwareAnterior, 'Momence');
  assert.equal(camposOnb({ foco: ['Cobros'] }).onbPrioridad?.[0], 'Cobros');
});

test('de qué software se puede migrar', () => {
  assert.equal(vieneDeOtraPlataforma(undefined), false);
  assert.equal(vieneDeOtraPlataforma(SIN_SOFTWARE), false);
  assert.equal(vieneDeOtraPlataforma(OTRO_SOFTWARE), false);
  assert.equal(vieneDeOtraPlataforma('Bsport'), true);
  assert.ok(OPCIONES_SOFTWARE.includes('Excel o Google Sheets'));
});
