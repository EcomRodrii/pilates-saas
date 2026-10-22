import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OPCIONAL, TAREAS, TAREAS_ALTA_NUEVA, primerosPasos, primerosPasosAltaNueva, tituloOtrasSedes, type DatosAltaNueva,
} from './primeros-pasos.ts';
import { calcularOnboarding, type DatosOnboarding } from '../onboarding.ts';
import { ENTRADA_PRIMERA_CLASE } from '../alta/bienvenida-nueva.ts';
import { hrefDeTarjeta } from '../configuracion/destino.ts';
import { PLAN_INFO } from '../billing/entitlements.ts';

const vacio: DatosOnboarding = {
  nif: null, stripeAccountId: null, slug: 'estudio', colorPrimario: null, temaPortal: null, logoUrl: null,
  numInstructores: 0, numInstructoresConCuenta: 0, numTiposClase: 0, numSesiones: 0, numSocios: 0, numSalas: 1,
  numPlanesTarifa: 0, numSuscripcionesActivas: 0, numReservas: 0, hayTarjetaEnLaApp: false,
  automatizacionesActivas: new Set(),
};

test('cada tarea es un paso que calcularOnboarding conoce (si no, nunca se marcaría)', () => {
  const ids = new Set(calcularOnboarding(vacio).categorias.flatMap(c => c.pasos.map(p => p.id)));
  for (const t of [...TAREAS, OPCIONAL]) assert.ok(ids.has(t.id), `«${t.titulo}» apunta a un paso que no existe: ${t.id}`);
});

test('un estudio recién creado tiene las seis por hacer y la primera es la siguiente', () => {
  const p = primerosPasos(calcularOnboarding(vacio).categorias);
  assert.equal(p.total, 6);
  assert.equal(p.hechas, 0);
  assert.equal(p.siguiente?.id, 'instructor');
  assert.equal(p.opcional.hecha, false);
});

test('se marcan solas con datos reales, y Stripe no cuenta para terminar', () => {
  const datos: DatosOnboarding = {
    ...vacio, numInstructores: 1, numTiposClase: 2, numSesiones: 10, numPlanesTarifa: 1, numPlanesActivos: 1,
    numSocios: 5, numReservas: 1,
  };
  const p = primerosPasos(calcularOnboarding(datos).categorias);
  assert.equal(p.hechas, 6);
  assert.equal(p.siguiente, null);
  assert.equal(p.opcional.hecha, false); // sin Stripe, y aun así terminada
});

test('a medias: la siguiente es la primera que falta, no la última', () => {
  const datos: DatosOnboarding = { ...vacio, numInstructores: 1, numTiposClase: 1, numSocios: 3 };
  const p = primerosPasos(calcularOnboarding(datos).categorias);
  assert.equal(p.hechas, 3);
  assert.equal(p.siguiente?.id, 'horario');
});

test('un paso desconocido cuenta como no hecho', () => {
  const p = primerosPasos([{ pasos: [{ id: 'otra-cosa', done: true }] }]);
  assert.equal(p.hechas, 0);
});

test('los textos caben: título corto con verbo y una sola línea de para qué', () => {
  for (const t of [...TAREAS, OPCIONAL]) {
    assert.ok(t.titulo.length <= 40, `título largo: ${t.titulo}`);
    assert.ok(t.para.length <= 80, `«para» largo: ${t.para}`);
    assert.ok(t.href.startsWith('/'), t.href);
  }
});

// ─── «Pon en marcha tu estudio» del alta nueva (PR-5) ───────────────────────

const RECIEN: DatosAltaNueva = {
  claseReservable: false, enlaceCompartido: false, alumnas: false, primeraReserva: false,
  marca: false, stripe: false, fiscales: false, equipo: false, sedes: null,
};

test('alta nueva: cinco tareas en el orden del valor, con los textos de la maqueta', () => {
  assert.deepEqual(TAREAS_ALTA_NUEVA.map(t => t.titulo), [
    'Crea tu cuenta', 'Crea tu primera clase', 'Comparte el enlace de tu app', 'Trae a tus alumnas', 'Recibe tu primera reserva',
  ]);
  // La primera clase va a «Tu primera clase» del PR-4, no a Configuración.
  const clase = TAREAS_ALTA_NUEVA.find(t => t.id === 'primera-clase')!;
  assert.deepEqual(clase.accion, { label: 'Crear mi primera clase', href: ENTRADA_PRIMERA_CLASE });
  // Compartir se hace ahí mismo; la cuenta y la primera reserva se marcan solas.
  assert.deepEqual(TAREAS_ALTA_NUEVA.find(t => t.id === 'compartir')!.accion, { label: 'Compartir mi enlace', abre: 'compartir' });
  assert.equal(TAREAS_ALTA_NUEVA.find(t => t.id === 'cuenta')!.accion, undefined);
  assert.equal(TAREAS_ALTA_NUEVA.find(t => t.id === 'primera-reserva')!.accion, undefined);
});

test('alta nueva: recién llegada, la cuenta hecha, «Paso 2 de 5» y la primera clase es la que se ofrece', () => {
  const p = primerosPasosAltaNueva(RECIEN);
  assert.equal(p.total, 5);
  assert.equal(p.hechas, 1);
  assert.equal(p.paso, 'Paso 2 de 5');
  assert.equal(p.queda, 'Ya casi está: unos 10 minutos');
  assert.equal(p.corto, '1/5');
  assert.equal(p.ahora?.id, 'primera-clase');
  assert.deepEqual(p.tareas.map(t => t.estado), ['hecha', 'ahora', 'pendiente', 'pendiente', 'pendiente']);
  assert.equal(p.terminada, false);
});

test('alta nueva: la primera clase es la RESERVABLE, nunca «tiene un tipo de clase»', () => {
  // Nada en los datos de la lista mira tipos de clase: solo el sí del servidor.
  assert.equal(primerosPasosAltaNueva(RECIEN).tareas[1].estado, 'ahora');
  const p = primerosPasosAltaNueva({ ...RECIEN, claseReservable: true });
  assert.equal(p.tareas[1].estado, 'hecha');
  assert.equal(p.ahora?.id, 'compartir', 'al quedar hecha, se ofrece sola la siguiente');
  assert.equal(p.paso, 'Paso 3 de 5');
  assert.equal(p.queda, 'Ya casi está: unos 5 minutos');
});

test('alta nueva: con clase que aún no se puede reservar, se dice qué falta y se lleva a arreglarlo', () => {
  const aviso = { texto: 'Una alumna nueva todavía no puede reservar desde tu página: pides bono…', href: '/configuracion?tab=conexiones#integracion-stripe' };
  const t = primerosPasosAltaNueva({ ...RECIEN, avisoClase: aviso }).tareas[1];
  assert.equal(t.para, aviso.texto);
  assert.deepEqual(t.accion, { label: 'Ver qué falta', href: aviso.href });
  // Con el sí, el aviso no pinta nada.
  assert.equal(primerosPasosAltaNueva({ ...RECIEN, claseReservable: true, avisoClase: aviso }).tareas[1].para, TAREAS_ALTA_NUEVA[1].para);
});

test('alta nueva: «Omitir» ofrece la siguiente sin dar la omitida por hecha', () => {
  const p = primerosPasosAltaNueva({ ...RECIEN, omitidas: ['primera-clase'] });
  assert.equal(p.ahora?.id, 'compartir');
  const clase = p.tareas.find(t => t.id === 'primera-clase')!;
  assert.equal(clase.estado, 'pendiente');
  assert.equal(clase.omitida, true);
  assert.equal(p.hechas, 1, 'omitir no cuenta como hecha');
  // Lo que se marca solo no se omite: con todo lo demás omitido, se ofrece la primera reserva.
  const q = primerosPasosAltaNueva({ ...RECIEN, omitidas: ['primera-clase', 'compartir', 'alumnas', 'primera-reserva', 'cuenta'] });
  assert.equal(q.ahora?.id, 'primera-reserva');
  // Una omitida que luego se hace, hecha queda.
  assert.equal(primerosPasosAltaNueva({ ...RECIEN, claseReservable: true, omitidas: ['primera-clase'] }).tareas[1].omitida, false);
});

test('alta nueva: las cinco hechas = «Tu estudio está en marcha», y los opcionales no cuentan', () => {
  const p = primerosPasosAltaNueva({ ...RECIEN, claseReservable: true, enlaceCompartido: true, alumnas: true, primeraReserva: true });
  assert.equal(p.terminada, true);
  assert.equal(p.paso, '5 de 5 hechos');
  assert.equal(p.queda, 'Tu estudio está en marcha');
  assert.equal(p.ahora, null);
  assert.equal(p.opcionalesHechos, 0);
});

test('alta nueva: solo falta la primera reserva, que no se puede hacer a mano: «Ya casi está», sin minutos', () => {
  const p = primerosPasosAltaNueva({ ...RECIEN, claseReservable: true, enlaceCompartido: true, alumnas: true });
  assert.equal(p.ahora?.id, 'primera-reserva');
  assert.equal(p.queda, 'Ya casi está');
});

test('alta nueva: opcionales sin «SEPA», con sus enlaces reales; las sedes, solo si dijo varias', () => {
  const p = primerosPasosAltaNueva(RECIEN);
  assert.deepEqual(p.opcionales.map(o => o.titulo), [
    'Pon tu logo y tu color', 'Cobra online con Stripe', 'Tus datos fiscales, para facturar', 'Invita a tu equipo',
  ]);
  assert.equal(p.opcionales.find(o => o.id === 'stripe')!.nota, 'si cobras en el estudio, no');
  for (const o of p.opcionales) assert.doesNotMatch(`${o.titulo} ${o.nota}`, /SEPA/i);
  // Los enlaces escritos a mano son los del catálogo de Configuración.
  assert.equal(p.opcionales.find(o => o.id === 'stripe')!.href, hrefDeTarjeta('integracion-stripe'));
  assert.equal(p.opcionales.find(o => o.id === 'fiscales')!.href, hrefDeTarjeta('datos-fiscales'));

  const marcados = primerosPasosAltaNueva({ ...RECIEN, marca: true, stripe: true });
  assert.equal(marcados.opcionalesHechos, 2);

  const tres = primerosPasosAltaNueva({ ...RECIEN, sedes: { total: 3, abiertas: 1 } });
  const sedes = tres.opcionales.find(o => o.id === 'sedes')!;
  assert.equal(sedes.titulo, 'Abre tus otras 2 sedes');
  assert.equal(sedes.nota, `plan Cadena, ${PLAN_INFO.CADENA.precioMes} €/mes`);
  assert.equal(sedes.hecha, false);
  assert.equal(primerosPasosAltaNueva({ ...RECIEN, sedes: { total: 3, abiertas: 3 } }).opcionales.find(o => o.id === 'sedes')!.hecha, true);
  assert.equal(tituloOtrasSedes(2), 'Abre tu otra sede');
  assert.equal(tituloOtrasSedes(5), 'Abre tus otras 4 o más sedes');
});

test('alta nueva: los textos caben, y todo enlace es del panel', () => {
  for (const t of TAREAS_ALTA_NUEVA) {
    assert.ok(t.titulo.length <= 40, `título largo: ${t.titulo}`);
    assert.ok(t.para.length <= 80, `«para» largo: ${t.para}`);
    if (t.accion && 'href' in t.accion) assert.ok(t.accion.href.startsWith('/'), t.accion.href);
    if (t.otro) assert.ok(t.otro.href.startsWith('/'), t.otro.href);
  }
});
