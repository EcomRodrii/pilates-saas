import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DiaHorario } from '../types.ts';
import {
  MAX_RESUMEN, MAX_REVISA, avisosDeConfiguracion, resumenHorario, resumenesDeConfiguracion, revisaEsto, unir,
  type DatosConfiguracion, type IntegracionResumible,
} from './resumenes.ts';
import { SECCIONES, seccionDeTarjeta } from './secciones.ts';

// Los resúmenes del inicio de Configuración dicen cómo está cada sección. Un
// resumen que no cuadra con lo guardado es peor que ninguno: la propietaria deja
// de mirar. Aquí se fija que cada valor sale de su campo, que lo que no se sabe
// no se inventa, y qué entra en «Revisa esto» y en qué orden.

/** La semana, de domingo (0) a sábado (6), con la franja de cada día o `null` si cierra. */
function semana(franja: (dia: number) => [string, string] | null): DiaHorario[] {
  return [0, 1, 2, 3, 4, 5, 6].map(dia => {
    const f = franja(dia);
    return { diaSemana: dia, abierto: !!f, horaApertura: f ? `${f[0]}:00` : null, horaCierre: f ? `${f[1]}:00` : null };
  });
}

const L_V_Y_SABADO = semana(d => (d >= 1 && d <= 5 ? ['08:00', '21:00'] : d === 6 ? ['09:00', '14:00'] : null));
const CERRADO = semana(() => null);

// Un NIF con formato y dígito de control correctos, que no es de relleno.
const NIF_BUENO = 'B12345674';

const ESTUDIO: DatosConfiguracion = {
  studio: {
    nombre: 'Pilates Centro', nif: NIF_BUENO, ivaPorDefecto: 21, stripeAccountId: null,
    horarioSemana: L_V_Y_SABADO, cancelacionVentanaHoras: 12, permiteListaEspera: true,
    listaEsperaPlazoAceptacionMinutos: 0, reservaExigirPlan: true, logoUrl: null, visibleEnNetwork: false,
    instructorasCreanClases: true, compraPublicaModo: 'EXIGIR_REGISTRO', valoracionInicialActiva: false,
    gmailEmail: null, googleCalendarEmail: null, zoomEmail: null, klaviyoAccountName: null,
  },
  numSalas: 2, numTiposClase: 5, numPlanesActivos: 0, integraciones: [], stripeDisponible: false,
};

const NADA: DatosConfiguracion = {
  studio: {}, numSalas: null, numTiposClase: null, numPlanesActivos: null, integraciones: null, stripeDisponible: true,
};

const con = (studio: DatosConfiguracion['studio'], resto: Partial<DatosConfiguracion> = {}): DatosConfiguracion =>
  ({ ...ESTUDIO, ...resto, studio: { ...ESTUDIO.studio, ...studio } });

const valor = (d: DatosConfiguracion, id: keyof ReturnType<typeof resumenesDeConfiguracion>) =>
  resumenesDeConfiguracion(d)[id].valor;

const fallando = (tipo: IntegracionResumible['tipo']): IntegracionResumible => ({
  tipo, activo: true, ultimoOkEn: '2026-09-01T10:00:00Z', ultimoErrorEn: '2026-09-02T10:00:00Z', ultimoError: 'token caducado',
});

// ─── El valor de cada sección ─────────────────────────────────────────────────

test('cada sección resume lo guardado, y las que no se pueden saber no dicen nada', () => {
  const r = resumenesDeConfiguracion(ESTUDIO);
  assert.equal(r.estudio.valor, 'Pilates Centro · L-V 8-21, S 9-14 · 2 salas');
  assert.equal(r.clases.valor, '5 tipos de clase');
  assert.equal(r.reservas.valor, 'Cancelar 12 h · lista de espera al momento');
  assert.equal(r.cobros.valor, 'Stripe no disponible todavía · IVA 21 %');
  // La segunda parte no cabe: se salta entera, no se corta.
  assert.equal(r.altas.valor, 'Se registra antes de pagar');
  assert.equal(r.comunicacion.valor, 'WhatsApp sin conectar');
  assert.equal(r.equipo.valor, 'Las instructoras crean sus clases');
  assert.equal(r.web.valor, 'Sin logo · fuera de Tentare Network');
  // Nada conectado que se sepa, la motivación se carga aparte y exportar no tiene estado.
  assert.equal(r.conexiones.valor, null);
  assert.equal(r.motivacion.valor, null);
  assert.equal(r.datos.valor, null);
  for (const s of SECCIONES) assert.equal(r[s.id].estado, null, `${s.id}: sin nada que revisar no hay estado`);
});

test('cambiar un valor guardado cambia su resumen', () => {
  // «Cancelar sin plazo · lista de espera al momento» no cabe: la lista de espera se salta.
  assert.equal(valor(con({ cancelacionVentanaHoras: 0 }), 'reservas'), 'Cancelar sin plazo');
  assert.equal(valor(con({ cancelacionVentanaHoras: 0, permiteListaEspera: false }), 'reservas'), 'Cancelar sin plazo · sin lista de espera');
  assert.equal(valor(con({ cancelacionVentanaHoras: 24, permiteListaEspera: false }), 'reservas'), 'Cancelar 24 h · sin lista de espera');
  assert.equal(valor(con({ listaEsperaPlazoAceptacionMinutos: 30 }), 'reservas'), 'Cancelar 12 h · 30 min para aceptar la plaza');
  assert.equal(valor(con({ listaEsperaPlazoAceptacionMinutos: 120 }), 'reservas'), 'Cancelar 12 h · 2 h para aceptar la plaza');
  // Sin lista de espera, su plazo no decide nada.
  assert.equal(valor(con({ permiteListaEspera: false, listaEsperaPlazoAceptacionMinutos: 30 }), 'reservas'), 'Cancelar 12 h · sin lista de espera');

  assert.equal(valor(con({ stripeAccountId: 'acct_1', ivaPorDefecto: 10 }), 'cobros'), 'Stripe conectado · IVA 10 %');
  assert.equal(valor(con({}, { stripeDisponible: true }), 'cobros'), 'Stripe sin conectar · IVA 21 %');

  assert.equal(valor(con({}, { numTiposClase: 1 }), 'clases'), '1 tipo de clase');
  assert.equal(valor(con({}, { numTiposClase: 0 }), 'clases'), 'Sin tipos de clase');
  assert.equal(valor(con({ nombre: 'Estudio Sol' }, { numSalas: 0 }), 'estudio'), 'Estudio Sol · L-V 8-21, S 9-14 · sin salas');
  assert.equal(valor(con({ nombre: 'Sol', horarioSemana: CERRADO }, { numSalas: 1 }), 'estudio'), 'Sol · cerrado toda la semana · 1 sala');
  // Con un nombre largo, las salas son lo que no cabe.
  assert.equal(valor(con({}, { numSalas: 0 }), 'estudio'), 'Pilates Centro · L-V 8-21, S 9-14');

  assert.equal(valor(con({ compraPublicaModo: 'CREAR_FICHA' }), 'altas'), 'Paga sin registrarse antes');
  assert.equal(valor(con({ instructorasCreanClases: false }), 'equipo'), 'Las instructoras no crean clases');
  assert.equal(valor(con({ logoUrl: 'https://example.com/logo.png', visibleEnNetwork: true }), 'web'), 'Con logo · en Tentare Network');
});

test('comunicación y conexiones: solo lo que se sabe conectado, y cómo va', () => {
  const whatsapp = (fila: IntegracionResumible) => valor(con({}, { integraciones: [fila] }), 'comunicacion');
  assert.equal(whatsapp({ tipo: 'WHATSAPP', activo: true, ultimoOkEn: '2026-09-02T10:00:00Z', ultimoErrorEn: null, ultimoError: null }), 'WhatsApp funcionando');
  assert.equal(whatsapp({ tipo: 'WHATSAPP', activo: true, ultimoOkEn: null, ultimoErrorEn: null, ultimoError: null }), 'WhatsApp sin probar');
  assert.equal(whatsapp(fallando('WHATSAPP')), 'WhatsApp con problemas');
  assert.equal(valor(con({ gmailEmail: 'estudio@example.com' }), 'comunicacion'), 'WhatsApp sin conectar · Gmail conectado');

  assert.equal(valor(con({ googleCalendarEmail: 'estudio@example.com' }), 'conexiones'), 'Google Calendar conectado');
  assert.equal(valor(con({ googleCalendarEmail: 'estudio@example.com', zoomEmail: 'estudio@example.com' }), 'conexiones'), 'Google Calendar y Zoom conectados');
  // Demasiados para una línea: el primero y «más», nunca un total que no se sabe.
  assert.equal(
    valor(con({ googleCalendarEmail: 'a@example.com', zoomEmail: 'a@example.com', klaviyoAccountName: 'Estudio' }, {
      integraciones: [{ tipo: 'KISI', activo: true, ultimoOkEn: null, ultimoErrorEn: null, ultimoError: null }],
    }), 'conexiones'),
    'Google Calendar y más, conectados',
  );
});

test('lo que no se sabe no se resume: sin cargar, ni un valor ni un estado', () => {
  const r = resumenesDeConfiguracion(NADA);
  for (const s of SECCIONES) {
    assert.equal(r[s.id].valor, null, `${s.id}: «${r[s.id].valor}» sin datos`);
    assert.equal(r[s.id].estado, null, s.id);
  }
  assert.deepEqual(avisosDeConfiguracion(NADA), []);
  // Solo el nombre: el horario y las salas aún no han llegado.
  assert.equal(valor({ ...NADA, studio: { nombre: 'Pilates Centro' } }, 'estudio'), 'Pilates Centro');
});

test('ningún resumen pasa de una línea del móvil', () => {
  const variantes: DatosConfiguracion[] = [
    ESTUDIO,
    con({ nombre: 'Estudio de Pilates y Bienestar Integral del Centro Histórico' }),
    con({ listaEsperaPlazoAceptacionMinutos: 45, cancelacionVentanaHoras: 48 }),
    con({ stripeAccountId: null, ivaPorDefecto: 4 }, { stripeDisponible: false }),
    con({ compraPublicaModo: 'CREAR_FICHA', valoracionInicialActiva: true }),
    con({ horarioSemana: semana(d => [`0${d + 1}:30`, '20:15']) }),
  ];
  for (const d of variantes) {
    for (const [id, r] of Object.entries(resumenesDeConfiguracion(d))) {
      if (r.valor) assert.ok(r.valor.length <= MAX_RESUMEN, `${id}: «${r.valor}» mide ${r.valor.length}`);
    }
  }
  // Un nombre que no cabe se salta, y el horario sigue saliendo.
  assert.equal(valor(variantes[1], 'estudio'), 'L-V 8-21, S 9-14 · 2 salas');
});

test('el horario, en corto', () => {
  assert.equal(resumenHorario(L_V_Y_SABADO), 'L-V 8-21, S 9-14');
  assert.equal(resumenHorario(semana(d => (d === 6 ? ['09:00', '14:00'] : null))), 'S 9-14');
  assert.equal(resumenHorario(semana(d => (d >= 1 && d <= 5 ? ['08:30', '21:30'] : null))), 'L-V 8:30-21:30');
  assert.equal(resumenHorario(CERRADO), 'cerrado toda la semana');
  // Siete franjas distintas no caben: se dice cuántos días abre.
  assert.equal(resumenHorario(semana(d => [`0${d + 1}:00`, '20:00'])), 'abre 7 días a la semana');
  // Incompleto: no se sabe.
  assert.equal(resumenHorario(undefined), null);
  assert.equal(resumenHorario([]), null);
  assert.equal(resumenHorario(L_V_Y_SABADO.slice(1)), null);
  assert.equal(resumenHorario(L_V_Y_SABADO.map(d => (d.diaSemana === 1 ? { ...d, horaCierre: null } : d))), null);
});

test('unir salta la parte que no cabe y sigue con las siguientes', () => {
  assert.equal(unir(['una', null, 'dos']), 'Una · dos');
  assert.equal(unir(['x'.repeat(38), 'no cabe', 'sí']), `X${'x'.repeat(37)} · sí`);
  assert.equal(unir([null, undefined, '']), null);
});

// ─── Revisa esto ──────────────────────────────────────────────────────────────

test('el NIF: vacío o de relleno no emite facturas; con el control mal, se revisa', () => {
  const nif = (valorNif: string | null) => avisosDeConfiguracion(con({ nif: valorNif as string }));
  assert.deepEqual(nif('').map(a => [a.id, a.tono, a.etiqueta, a.seccion, a.ancla]), [['nif', 'problema', 'Falta el NIF', 'cobros', 'datos-fiscales']]);
  assert.deepEqual(nif(null).map(a => a.etiqueta), ['Falta el NIF']);
  assert.deepEqual(nif('B12345678').map(a => [a.tono, a.etiqueta]), [['problema', 'NIF no válido']]);
  assert.deepEqual(nif('B12345670').map(a => [a.tono, a.etiqueta]), [['pendiente', 'Revisa el NIF']]);
  assert.deepEqual(nif(NIF_BUENO), []);
  // Sin el campo, no se sabe: no se avisa.
  const sinNif = { ...ESTUDIO.studio };
  delete sinNif.nif;
  assert.deepEqual(avisosDeConfiguracion({ ...ESTUDIO, studio: sinNif }), []);
});

test('una conexión que falla lleva a su tarjeta, y una que se recuperó no avisa', () => {
  const [whatsapp] = avisosDeConfiguracion(con({}, { integraciones: [fallando('WHATSAPP')] }));
  assert.deepEqual([whatsapp.seccion, whatsapp.ancla, whatsapp.etiqueta], ['comunicacion', 'integracion-whatsapp', 'Con problemas']);
  // Kisi no tiene tarjeta propia: vive en «Más integraciones».
  const [kisi] = avisosDeConfiguracion(con({}, { integraciones: [fallando('KISI')] }));
  assert.deepEqual([kisi.seccion, kisi.ancla], ['conexiones', 'mas-integraciones']);
  const recuperada = { ...fallando('WHATSAPP'), ultimoOkEn: '2026-09-03T10:00:00Z' };
  assert.deepEqual(avisosDeConfiguracion(con({}, { integraciones: [recuperada] })), []);
  // Y la sección lo cuenta en su fila.
  assert.deepEqual(resumenesDeConfiguracion(con({}, { integraciones: [fallando('WHATSAPP')] })).comunicacion.estado, { tono: 'problema', etiqueta: 'Con problemas' });
});

test('pedir bono sin poder comprarlo online: a Stripe si se puede conectar, si no a la regla', () => {
  const vende = { numPlanesActivos: 2 };
  const [conStripe] = avisosDeConfiguracion(con({}, { ...vende, stripeDisponible: true }));
  assert.deepEqual([conStripe.id, conStripe.seccion, conStripe.ancla], ['venta-online', 'cobros', 'integracion-stripe']);
  const [sinStripe] = avisosDeConfiguracion(con({}, { ...vende, stripeDisponible: false }));
  assert.deepEqual([sinStripe.seccion, sinStripe.ancla], ['reservas', 'reservar']);
  assert.deepEqual(avisosDeConfiguracion(con({ stripeAccountId: 'acct_1' }, vende)), []);
  assert.deepEqual(avisosDeConfiguracion(con({ reservaExigirPlan: false }, vende)), []);
  assert.deepEqual(avisosDeConfiguracion(con({}, { numPlanesActivos: 0 })), []);
  assert.deepEqual(avisosDeConfiguracion(con({}, { numPlanesActivos: null })), [], 'sin las tarifas cargadas no se sabe');
});

test('un horario sin ningún día abierto se revisa; uno sin cargar, no', () => {
  assert.deepEqual(avisosDeConfiguracion(con({ horarioSemana: CERRADO })).map(a => [a.seccion, a.ancla, a.etiqueta]), [['estudio', 'horario-y-cierres', 'Sin horario']]);
  assert.deepEqual(avisosDeConfiguracion(con({ horarioSemana: [] })), []);
  assert.deepEqual(avisosDeConfiguracion(con({ horarioSemana: undefined })), []);
});

test('«Revisa esto»: por prioridad, como mucho tres, y vacío si no hay nada', () => {
  const todo = con({ nif: '', horarioSemana: CERRADO }, { integraciones: [fallando('WHATSAPP')], numPlanesActivos: 3, stripeDisponible: true });
  assert.deepEqual(avisosDeConfiguracion(todo).map(a => a.id), ['nif', 'integracion-whatsapp', 'venta-online', 'horario']);
  assert.equal(MAX_REVISA, 3);
  assert.deepEqual(revisaEsto(todo).map(a => a.id), ['nif', 'integracion-whatsapp', 'venta-online']);
  assert.deepEqual(revisaEsto(ESTUDIO), []);

  // Dos avisos en Cobros: la fila enseña el primero.
  assert.deepEqual(resumenesDeConfiguracion(todo).cobros.estado, { tono: 'problema', etiqueta: 'Falta el NIF' });
  assert.deepEqual(resumenesDeConfiguracion(todo).estudio.estado, { tono: 'pendiente', etiqueta: 'Sin horario' });
});

test('cada aviso lleva a una tarjeta de su sección, y el copy dice «alumna»', () => {
  const todo = con({ nif: '', horarioSemana: CERRADO }, {
    integraciones: [fallando('WHATSAPP'), fallando('RESEND'), fallando('KISI'), fallando('MAILCHIMP')],
    numPlanesActivos: 3,
  });
  for (const a of avisosDeConfiguracion(todo)) {
    assert.equal(seccionDeTarjeta(a.ancla), a.seccion, a.id);
    assert.ok(a.etiqueta.length <= 16, `${a.id}: «${a.etiqueta}» no es una pastilla`);
    assert.doesNotMatch(a.texto, /\b(client|soci)as?\b/i, a.texto);
  }
  for (const r of Object.values(resumenesDeConfiguracion(todo))) {
    if (r.valor) assert.doesNotMatch(r.valor, /\b(client|soci)as?\b/i, r.valor);
  }
});
