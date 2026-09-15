import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REGLAS_DE_DINERO,
  boolATri,
  camposParaGuardar,
  claseToForm,
  emptyClaseForm,
  enPalabrasMinutos,
  formACampos,
  hayVentanaImposible,
  plazasSiPropias,
  resumenAforo,
  resumenAntelacionMaxima,
  resumenAntelacionMinima,
  resumenHoras,
  resumenMinimoAsistentes,
  resumenPenalizacion,
  resumenPlazoEspera,
  triABool,
  valorReglaDeDinero,
  type ClaseForm,
} from './tipo-clase-form.ts';
import type { TipoClase } from '../types.ts';

const tipo = (extra: Partial<TipoClase> = {}): TipoClase => ({
  id: 'tc1', studioId: 'e1', nombre: 'Reformer', color: '#111111', duracionMinutos: 50,
  descripcion: null, nivel: 'TODOS', fotoUrl: null, logoUrl: null, objetivos: [],
  ventanaCancelacionHoras: null, reservaExigirPlan: null, reservaVentanaMinimaMinutos: null,
  reservaAntelacionMaximaDias: null, permiteListaEspera: null, requiereAprobacion: null,
  listaEsperaPlazoAceptacionMinutos: null, minimoAsistentesPorClase: null,
  penalizacionImporteEur: null, especialidadNetwork: null, esOnline: false,
  aforoPorDefecto: null, requiereAutorizacion: false, ...extra,
});

const form = (extra: Partial<ClaseForm> = {}): ClaseForm => ({ ...emptyClaseForm('#111111'), ...extra });

// ─── "Vacío = hereda" es el contrato de todo el formulario ────────────────────
// Es la regla que sostiene las 8 reglas por tipo de clase: si un campo vacío
// dejara de convertirse en `null`, un tipo de clase que "hereda" empezaría a
// fijar un 0 y cambiaría de comportamiento sin que nadie lo tocara.

test('un formulario en blanco no fija ningún override: todo null', () => {
  const c = formACampos(form({ nombre: 'Reformer' }));
  assert.equal(c.ventanaCancelacionHoras, null);
  assert.equal(c.reservaExigirPlan, null);
  assert.equal(c.reservaVentanaMinimaMinutos, null);
  assert.equal(c.reservaAntelacionMaximaDias, null);
  assert.equal(c.permiteListaEspera, null);
  assert.equal(c.requiereAprobacion, null);
  assert.equal(c.listaEsperaPlazoAceptacionMinutos, null);
  assert.equal(c.minimoAsistentesPorClase, null);
  assert.equal(c.penalizacionImporteEur, null);
  assert.equal(c.especialidadNetwork, null);
  assert.equal(c.aforoPorDefecto, null);
});

test('un 0 explícito NO es heredar: se guarda como 0', () => {
  // "Sin mínimo" y "hereda el mínimo del estudio" son cosas distintas, y la
  // única señal que las separa es el string vacío.
  const c = formACampos(form({ nombre: 'X', minimoAsistentesPorClase: '0', ventanaCancelacionHoras: '0' }));
  assert.equal(c.minimoAsistentesPorClase, 0);
  assert.equal(c.ventanaCancelacionHoras, 0);
});

test('ida y vuelta: lo guardado vuelve idéntico al formulario', () => {
  const t = tipo({
    ventanaCancelacionHoras: 24, reservaExigirPlan: false, reservaVentanaMinimaMinutos: 120,
    reservaAntelacionMaximaDias: 14, permiteListaEspera: true, requiereAprobacion: false,
    listaEsperaPlazoAceptacionMinutos: 30, minimoAsistentesPorClase: 3,
    // Pasar lista (migr 20260909210000): tri-estado como el resto, NULL hereda.
    requiereCheckinQr: false,
    penalizacionImporteEur: 12.5, especialidadNetwork: 'reformer', esOnline: true,
    aforoPorDefecto: 8, descripcion: 'Con máquina', objetivos: ['reformer'],
    // Niveles: booleano plano, no tri-estado — no hereda del estudio.
    requiereAutorizacion: true,
  });
  const c = formACampos(claseToForm(t));
  assert.deepEqual(c, {
    nombre: t.nombre, color: t.color, duracionMinutos: 50, nivel: 'TODOS',
    objetivos: ['reformer'], descripcion: 'Con máquina', aforoPorDefecto: 8,
    ventanaCancelacionHoras: 24, reservaExigirPlan: false, reservaVentanaMinimaMinutos: 120,
    reservaAntelacionMaximaDias: 14, permiteListaEspera: true, requiereAprobacion: false,
    listaEsperaPlazoAceptacionMinutos: 30, minimoAsistentesPorClase: 3,
    requiereCheckinQr: false,
    penalizacionImporteEur: 12.5, especialidadNetwork: 'reformer', esOnline: true,
    requiereAutorizacion: true,
  });
});

test('el tri-estado distingue heredar de un "no" explícito', () => {
  assert.equal(triABool('hereda'), null);
  assert.equal(triABool('si'), true);
  assert.equal(triABool('no'), false);
  assert.equal(boolATri(null), 'hereda');
  assert.equal(boolATri(undefined), 'hereda');
  assert.equal(boolATri(false), 'no');
  assert.equal(boolATri(true), 'si');
});

test('el aforo se acota a lo que acepta el CHECK de la BD (1..300)', () => {
  // Sin esto, un 0 o un 9999 tecleados a mano volvían de Postgres como un
  // error crudo de constraint en vez de guardarse.
  assert.equal(formACampos(form({ aforoPorDefecto: '0' })).aforoPorDefecto, null);
  assert.equal(formACampos(form({ aforoPorDefecto: '9999' })).aforoPorDefecto, 300);
  assert.equal(formACampos(form({ aforoPorDefecto: '8' })).aforoPorDefecto, 8);
  assert.equal(formACampos(form({ aforoPorDefecto: '  ' })).aforoPorDefecto, null);
});

test('los negativos se recortan a 0, no se guardan en negativo', () => {
  assert.equal(formACampos(form({ ventanaCancelacionHoras: '-5' })).ventanaCancelacionHoras, 0);
  assert.equal(formACampos(form({ penalizacionImporteEur: '-3' })).penalizacionImporteEur, 0);
});

test('sin duración válida se guarda el default de 60, no un NaN', () => {
  assert.equal(formACampos(form({ duracionMinutos: '' })).duracionMinutos, 60);
  assert.equal(formACampos(form({ duracionMinutos: 'ocho' })).duracionMinutos, 60);
});

test('el nombre se recorta y una descripción en blanco es null', () => {
  const c = formACampos(form({ nombre: '  Reformer  ', descripcion: '   ' }));
  assert.equal(c.nombre, 'Reformer');
  assert.equal(c.descripcion, null);
});

// ─── La ventana imposible ────────────────────────────────────────────────────

test('la ventana imposible solo salta si ESTA clase fija los dos extremos', () => {
  // Mínima 3 días (4320 min) contra máxima 1 día: no habría ningún momento
  // válido para reservar.
  assert.equal(hayVentanaImposible(form({ reservaVentanaMinimaMinutos: '4320', reservaAntelacionMaximaDias: '1' })), true);
  assert.equal(hayVentanaImposible(form({ reservaVentanaMinimaMinutos: '60', reservaAntelacionMaximaDias: '1' })), false);
  // Con uno heredado manda el estudio, y esa coherencia se comprueba en su
  // propia pantalla — aquí no hay nada que comparar.
  assert.equal(hayVentanaImposible(form({ reservaVentanaMinimaMinutos: '4320' })), false);
  assert.equal(hayVentanaImposible(form({ reservaAntelacionMaximaDias: '1' })), false);
});

// ─── Las frases de herencia ──────────────────────────────────────────────────
// Son lo único que la propietaria lee para saber qué está heredando: si mienten
// sobre la unidad, configura a ciegas.

test('los minutos se cuentan en la unidad en la que se piensan', () => {
  assert.equal(enPalabrasMinutos(0), 'sin límite');
  assert.equal(enPalabrasMinutos(45), '45 minutos');
  assert.equal(enPalabrasMinutos(60), '1 hora');
  assert.equal(enPalabrasMinutos(120), '2 horas');
  assert.equal(enPalabrasMinutos(90), '1 h 30 min');
});

test('cero y null no dicen lo mismo, y ninguno se enseña como "0"', () => {
  assert.equal(resumenAntelacionMinima(0), 'se puede reservar hasta el último momento');
  assert.equal(resumenAntelacionMinima(120), 'cierra 2 horas antes');
  // null = sin límite; 0 = solo el mismo día. Confundirlos cambia la regla.
  assert.equal(resumenAntelacionMaxima(null), 'sin límite, se puede reservar con toda la antelación');
  assert.equal(resumenAntelacionMaxima(0), 'solo el mismo día');
  assert.equal(resumenAntelacionMaxima(1), 'se abre 1 día antes');
  assert.equal(resumenAntelacionMaxima(30), 'se abre 30 días antes');
  assert.equal(resumenHoras(0), 'puede cancelar hasta el último momento');
  assert.equal(resumenHoras(1), 'hasta 1 hora antes');
  assert.equal(resumenHoras(12), 'hasta 12 horas antes');
  assert.equal(resumenPlazoEspera(0), 'se le asigna al instante');
  assert.equal(resumenPlazoEspera(30), '30 minutos para aceptar');
  assert.equal(resumenMinimoAsistentes(0), 'sin mínimo, la clase sale siempre');
  assert.equal(resumenMinimoAsistentes(1), '1 alumna');
  assert.equal(resumenMinimoAsistentes(3), '3 alumnas');
  assert.equal(resumenPenalizacion(null), 'no se cobra nada');
  assert.equal(resumenPenalizacion(0), 'no se cobra nada');
  assert.equal(resumenPenalizacion(12.5), '12,50 €');
});

test('el aforo vacío se lee como "las plazas de la sala", nunca como cero plazas', () => {
  assert.equal(resumenAforo(''), 'las plazas de la sala');
  assert.equal(resumenAforo('0'), 'las plazas de la sala');
  assert.equal(resumenAforo('1'), '1 plaza');
  assert.equal(resumenAforo('8'), '8 plazas');
});

test('en la ficha de la clase, un aforo heredado no dice nada en vez de mentir', () => {
  // La tarjeta y la previsualización resumen LA CLASE. Si el aforo lo pone la
  // sala, la cifra depende de dónde se programe: prometerla ahí sería inventar.
  assert.equal(plazasSiPropias(''), null);
  assert.equal(plazasSiPropias('0'), null);
  assert.equal(plazasSiPropias('1'), '1 plaza');
  assert.equal(plazasSiPropias('8'), '8 plazas');
});

// ─── Objetivos ───────────────────────────────────────────────────────────────

// ─── Las tres reglas de dinero, cuando no las fija quien guarda ──────────────
//
// Un trigger de la base de datos las rechaza con 42501 si no es la propietaria
// (`tipos_clase_dinero_solo_propietaria`). Mandar «los mismos valores» no vale:
// basta un redondeo, o que otra pestaña las haya cambiado, para que salte. Lo
// que se fija aquí es que NO VIAJAN.

test('la propietaria manda las tres reglas de dinero, al crear y al editar', () => {
  const f = form({ penalizacionImporteEur: '5', ventanaCancelacionHoras: '3', reservaExigirPlan: 'no' });
  const nueva = camposParaGuardar(f, { modo: 'nueva', reglasDeDinero: true });
  assert.equal(nueva.penalizacionImporteEur, 5);
  assert.equal(nueva.ventanaCancelacionHoras, 3);
  assert.equal(nueva.reservaExigirPlan, false);
  assert.deepEqual(camposParaGuardar(f, { modo: 'editar', reglasDeDinero: true }), formACampos(f));
});

test('la gerencia crea la clase con las tres en «hereda», aunque el formulario traiga otra cosa', () => {
  // El formulario no se las deja tocar, pero si llegaran con valor —un enlace
  // viejo, un estado arrastrado— se crean heredando, que es lo único que el
  // trigger admite de quien no es la propietaria.
  const f = form({ penalizacionImporteEur: '5', ventanaCancelacionHoras: '3', reservaExigirPlan: 'no' });
  const nueva = camposParaGuardar(f, { modo: 'nueva', reglasDeDinero: false });
  for (const regla of REGLAS_DE_DINERO) assert.equal(nueva[regla], null, regla);
  // Y lo demás se guarda igual: solo se recortan esas tres.
  assert.equal(nueva.nombre, formACampos(f).nombre);
  assert.equal(nueva.minimoAsistentesPorClase, formACampos(f).minimoAsistentesPorClase);
});

test('la gerencia edita sin mandarlas: las tres claves no están en el cambio', () => {
  const f = form({ penalizacionImporteEur: '5', ventanaCancelacionHoras: '3', reservaExigirPlan: 'no', nombre: 'Reformer' });
  const cambio = camposParaGuardar(f, { modo: 'editar', reglasDeDinero: false });
  for (const regla of REGLAS_DE_DINERO) {
    assert.equal(Object.hasOwn(cambio, regla), false, `${regla} no puede viajar en el UPDATE`);
  }
  assert.equal(cambio.nombre, 'Reformer');
  assert.equal(cambio.requiereCheckinQr, null);
});

test('quien solo puede LEER una regla de dinero ve su valor, no un hueco', () => {
  const estudio = { cancelacionVentanaHoras: 12, penalizacionImporteEur: 10, reservaExigirPlan: true };
  // Heredadas: lo que pone el estudio.
  const hereda = form();
  assert.equal(valorReglaDeDinero('ventanaCancelacionHoras', hereda, estudio), 'Como tu estudio: hasta 12 horas antes');
  assert.equal(valorReglaDeDinero('penalizacionImporteEur', hereda, estudio), 'Como tu estudio: 10,00 €');
  assert.equal(valorReglaDeDinero('reservaExigirPlan', hereda, estudio), 'Como tu estudio: sí hace falta');
  // Propias de esta clase: se distingue de lo heredado, o no se sabe qué manda.
  const propia = form({ ventanaCancelacionHoras: '3', penalizacionImporteEur: '0', reservaExigirPlan: 'no' });
  assert.equal(valorReglaDeDinero('ventanaCancelacionHoras', propia, estudio), 'Solo esta clase: hasta 3 horas antes');
  assert.equal(valorReglaDeDinero('penalizacionImporteEur', propia, estudio), 'Solo esta clase: no se cobra nada');
  assert.equal(valorReglaDeDinero('reservaExigirPlan', propia, estudio), 'Solo esta clase: no hace falta');
  // Sin datos del estudio se cae a los mismos valores por defecto de siempre.
  assert.equal(valorReglaDeDinero('ventanaCancelacionHoras', hereda, {}), 'Como tu estudio: hasta 12 horas antes');
});

test('un objetivo desconocido guardado en la BD no vuelve al formulario', () => {
  // resolverObjetivos ya lo garantiza; aquí se fija que el formulario lo usa y
  // no arrastra ids de una versión anterior de la lista.
  const f = claseToForm(tipo({ objetivos: ['reformer', 'inventado', 'reformer'] }));
  assert.deepEqual(f.objetivos, ['reformer']);
});
