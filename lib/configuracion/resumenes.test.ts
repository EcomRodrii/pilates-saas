import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DiaHorario } from '../types.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CORREOS_AUTOMATICOS, MAX_RESUMEN, MAX_REVISA, NO_DISPONIBLE_TODAVIA, TARJETA_DE_INTEGRACION, agruparConexiones, estadoDelPlan,
  resumenAppsConAcceso, resumenConexion, resumenCreditosPorAccion, resumenDireccion, resumenPaginaPublica, resumenReglasCreditos,
  avisosDeConfiguracion, rangoDeFechas, resumenCierres, resumenCompraPublica,
  resumenContacto, resumenContrato, resumenCuestionarioSalud, resumenDatosExtra, resumenDatosFiscales, resumenDevoluciones,
  resumenDomiciliaciones, resumenGmail, resumenHerramienta, resumenHorario, resumenHorarioSemana, resumenNombreYDireccion, resumenPlan,
  resumenPlanesActivos, resumenRegla, resumenRemitente, resumenSedes, resumenStripe, resumenWhatsapp, resumenesDeConfiguracion, revisaEsto, unir,
  resumenAppInstructoras, resumenAvisarAlumnas, resumenEquipo, resumenModoSustituciones, resumenTarifas,
  type DatosConfiguracion, type IntegracionResumible,
} from './resumenes.ts';
import { TARJETAS_REGLAS, reglasGuardadas } from './reglas-reserva.ts';
import { HERRAMIENTAS, SECCIONES, seccionDeTarjeta } from './secciones.ts';

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
  assert.equal(r.web.valor, 'Fuera de Tentare Network');
  // Sin el tema cargado, del color no se dice nada.
  assert.equal(r.marca.valor, 'Sin logo');
  // Nada conectado que se sepa, la motivación y tus avisos se cargan aparte,
  // el panel no se ha leído y exportar no tiene estado.
  assert.equal(r.conexiones.valor, null);
  assert.equal(r.motivacion.valor, null);
  assert.equal(r.avisos.valor, null);
  assert.equal(r.panel.valor, null);
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
  assert.equal(valor(con({ logoUrl: 'https://example.com/logo.png', visibleEnNetwork: true }), 'web'), 'En Tentare Network');
  assert.equal(valor(con({ logoUrl: 'https://example.com/logo.png' }, { colorPropio: true }), 'marca'), 'Con logo · tu color');
  assert.equal(valor(con({}, { colorPropio: false }), 'marca'), 'Sin logo · color de Tentare');
  assert.equal(valor(con({}, { panel: { menuPosition: 'lateral', oscuro: false } }), 'panel'), 'Menú a la izquierda · modo claro');
  assert.equal(valor(con({}, { panel: { menuPosition: 'superior', oscuro: true } }), 'panel'), 'Menú arriba · modo oscuro');
});

test('el plan de Tentare: prueba con sus días, activo o terminado; y sin estado del servidor, nada', () => {
  const trial = (fase: 'PLENA' | 'HOLGADA' | 'AVISO' | 'ULTIMO_DIA' | 'EXPIRADA' | 'SIN_PRUEBA' | 'SUSCRITO', diasRestantes = 0) =>
    ({ fase, diasRestantes });
  assert.deepEqual(resumenPlan({ plan: 'ESTUDIO', subscriptionStatus: 'trialing', trial: trial('HOLGADA', 5) }), { valor: 'Prueba del plan Estudio · quedan 5 días', estado: null });
  assert.deepEqual(resumenPlan({ plan: 'BASE', subscriptionStatus: 'trialing', trial: trial('ULTIMO_DIA', 1) }), {
    valor: 'Prueba del plan Base · queda 1 día', estado: { tono: 'pendiente', etiqueta: 'Elige tu plan' },
  });
  assert.deepEqual(resumenPlan({ plan: 'ESTUDIO', subscriptionStatus: 'trial_expirado', trial: trial('EXPIRADA') }), {
    valor: 'Prueba terminada', estado: { tono: 'problema', etiqueta: 'Elige un plan' },
  });
  assert.deepEqual(resumenPlan({ plan: 'CADENA', subscriptionStatus: 'active', trial: trial('SUSCRITO') }), { valor: 'Plan Cadena · activo', estado: null });
  assert.deepEqual(resumenPlan({ plan: 'ESTUDIO', subscriptionStatus: 'past_due', trial: trial('SUSCRITO') }), {
    valor: 'Plan Estudio · falló el último cobro', estado: { tono: 'problema', etiqueta: 'Revisa el pago' },
  });
  // Lo que no se sabe no se adivina: sin `trial` (un servidor sin desplegar),
  // sin prueba ni suscripción, o con un plan que no conocemos.
  const nada = { valor: null, estado: null };
  assert.deepEqual(resumenPlan(null), nada);
  assert.deepEqual(resumenPlan({ plan: 'ESTUDIO', subscriptionStatus: 'active' }), nada);
  assert.deepEqual(resumenPlan({ plan: 'BASE', subscriptionStatus: null, trial: trial('SIN_PRUEBA') }), nada);
  assert.deepEqual(resumenPlan({ plan: 'RARO', subscriptionStatus: 'active', trial: trial('SUSCRITO') }), nada);
  assert.equal(resumenPlan({ plan: 'RARO', trial: trial('PLENA', 7) }).valor, 'En prueba · quedan 7 días');
  for (const plan of ['BASE', 'ESTUDIO', 'CADENA']) {
    for (const d of [trial('PLENA', 7), trial('SUSCRITO')]) {
      const v = resumenPlan({ plan, subscriptionStatus: 'past_due', trial: d }).valor;
      if (v) assert.ok(v.length <= MAX_RESUMEN, `«${v}» mide ${v.length}`);
    }
  }
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
  // Kisi tiene su fila en Conexiones desde el 15-sep (v2): antes iba a «Más integraciones».
  const [kisi] = avisosDeConfiguracion(con({}, { integraciones: [fallando('KISI')] }));
  assert.deepEqual([kisi.seccion, kisi.ancla], ['conexiones', 'integracion-kisi']);
  // Todas tienen su fila: ninguna aviso cae en una sección sin nada que tocar.
  for (const [tipo, tarjeta] of Object.entries(TARJETA_DE_INTEGRACION)) {
    assert.equal(tarjeta, `integracion-${tipo.toLowerCase()}`, tipo);
  }
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
  assert.deepEqual(avisosDeConfiguracion(con({ horarioSemana: CERRADO })).map(a => [a.seccion, a.ancla, a.etiqueta]), [['estudio', 'horario', 'Sin horario']]);
  assert.deepEqual(avisosDeConfiguracion(con({ horarioSemana: [] })), []);
  assert.deepEqual(avisosDeConfiguracion(con({ horarioSemana: undefined })), []);
});

test('«Revisa esto»: por prioridad, como mucho tres, y vacío si no hay nada', () => {
  const todo = con({ nif: '', horarioSemana: CERRADO }, { integraciones: [fallando('WHATSAPP')], numPlanesActivos: 3, stripeDisponible: true });
  assert.deepEqual(avisosDeConfiguracion(todo).map(a => a.id), ['nif', 'integracion-whatsapp', 'venta-online', 'horario']);
  assert.equal(MAX_REVISA, 3);
  assert.deepEqual(revisaEsto(todo).map(a => a.id), ['nif', 'integracion-whatsapp', 'venta-online']);
  assert.deepEqual(revisaEsto(ESTUDIO), []);

  // Por rol, y por TARJETA, no por sección: la gerencia abre «Mi estudio», así
  // que le toca el horario sin ningún día abierto, pero no el NIF ni WhatsApp,
  // que se arreglan en secciones que no abre. Mandarla ahí sería una puerta
  // cerrada.
  assert.deepEqual(revisaEsto(todo, 'MANAGER').map(a => a.id), ['horario']);
  assert.deepEqual(revisaEsto(todo, 'RECEPCION'), []);
  assert.deepEqual(resumenesDeConfiguracion(todo, 'MANAGER').cobros.estado, null);
  assert.deepEqual(resumenesDeConfiguracion(todo, 'MANAGER').estudio.estado, { tono: 'pendiente', etiqueta: 'Sin horario' });

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

// ─── Las filas de las herramientas ────────────────────────────────────────────

const AHORA = Date.parse('2026-09-15T10:00:00Z');
const AYER = '2026-09-14T10:00:00Z';
const MANANA = '2026-09-16T10:00:00Z';

test('herramientas: sin datos, ninguna dice nada; con ellos, lo que hay', () => {
  for (const h of HERRAMIENTAS) assert.equal(resumenHerramienta(h.id, {}), null, h.id);

  assert.equal(resumenHerramienta('tipos-de-clase', { numTiposClase: 4 }), '4 tipos de clase');
  assert.equal(resumenHerramienta('tipos-de-clase', { numTiposClase: 1 }), '1 tipo de clase');
  assert.equal(resumenHerramienta('tipos-de-clase', { numTiposClase: 0 }), 'Sin tipos de clase');
  assert.equal(resumenHerramienta('tipos-de-clase', { numTiposClase: null }), null);
});

test('salas: cuántas y cuántas máquinas siguen en avería; una avería ya arreglada no cuenta', () => {
  const salas = (averias: { hasta: string | null }[], numSalas = 2) => resumenHerramienta('salas', { salas: { numSalas, averias, ahoraMs: AHORA } });
  assert.equal(salas([]), '2 salas');
  assert.equal(salas([{ hasta: null }]), '2 salas · 1 máquina en avería');
  assert.equal(salas([{ hasta: null }, { hasta: MANANA }]), '2 salas · 2 máquinas en avería');
  assert.equal(salas([{ hasta: AYER }]), '2 salas');
  assert.equal(salas([], 1), '1 sala');
  assert.equal(salas([], 0), 'Sin salas');
});

test('correos: sin fila se envía, y solo `enviar: false` lo apaga', () => {
  const correos = (filas: { tipo: string; enviar?: boolean | null }[]) => resumenHerramienta('correos-automaticos', { correos: filas });
  assert.equal(correos([]), 'Los 6 correos se envían');
  // Una fila con su texto pero encendida sigue enviándose.
  assert.equal(correos([{ tipo: 'reserva', enviar: true }]), 'Los 6 correos se envían');
  assert.equal(correos([{ tipo: 'reserva', enviar: false }, { tipo: 'impago', enviar: false }]), '4 de 6 correos se envían');
  assert.equal(correos(CORREOS_AUTOMATICOS.map(tipo => ({ tipo, enviar: false }))), 'Ningún correo se envía');
  // Un tipo que no es de la lista (recibo, factura) no cuenta.
  assert.equal(correos([{ tipo: 'factura', enviar: false }]), 'Los 6 correos se envían');
});

test('la lista de correos del resumen es la de la pantalla de correos', () => {
  const pantalla = readFileSync(join(import.meta.dirname, '../../components/configuracion/tab-plantillas-email.tsx'), 'utf8');
  const tipos = [...pantalla.matchAll(/^\s+tipo: '([a-z]+)', label:/gm)].map(m => m[1]);
  assert.deepEqual(tipos, [...CORREOS_AUTOMATICOS]);
});

test('contenido de tu app: el mensaje, y lo publicado que se ve hoy', () => {
  const contenido = (c: Partial<{ mensajeDestacado: string | null; tarjetas: { activo: boolean; fechaInicio?: string | null; fechaFin?: string | null }[]; avisos: { activo: boolean }[] }>) =>
    resumenHerramienta('contenido-de-tu-app', { contenido: { mensajeDestacado: null, tarjetas: [], avisos: [], ahoraMs: AHORA, ...c } });
  assert.equal(contenido({}), 'Sin mensaje destacado');
  assert.equal(contenido({ mensajeDestacado: '  ' }), 'Sin mensaje destacado');
  assert.equal(
    contenido({ mensajeDestacado: 'Taller el sábado', tarjetas: [{ activo: true }, { activo: true }], avisos: [{ activo: true }] }),
    'Con mensaje destacado · 2 tarjetas · 1 aviso',
  );
  // Oculta, caducada o aún por empezar: no se ve, no cuenta.
  assert.equal(
    contenido({ tarjetas: [{ activo: false }, { activo: true, fechaFin: AYER }, { activo: true, fechaInicio: MANANA }, { activo: true }] }),
    'Sin mensaje destacado · 1 tarjeta',
  );
  assert.equal(contenido({ avisos: [{ activo: true }, { activo: false }] }), 'Sin mensaje destacado · 1 aviso');
});

test('widgets: solo se dice lo que se sabe (las webs autorizadas); sin ninguna, su descripción', () => {
  assert.equal(resumenHerramienta('widgets', { widgetDominios: ['https://mi-estudio.example.com'] }), '1 web autorizada para el calendario');
  assert.equal(resumenHerramienta('widgets', { widgetDominios: ['https://a.example.com', 'https://b.example.com'] }), '2 webs autorizadas para el calendario');
  assert.equal(resumenHerramienta('widgets', { widgetDominios: [] }), null);
  assert.equal(resumenHerramienta('widgets', { widgetDominios: null }), null);
});

test('recompensas y logros: lo que hay en cada catálogo, y nada inventado mientras carga', () => {
  const m = (recompensas: number, logros: number, niveles: number, retos: number) =>
    resumenHerramienta('recompensas-y-logros', { motivacion: { recompensas, logros, niveles, retos } });
  assert.equal(m(4, 3, 0, 2), '4 recompensas · 3 logros · 2 retos');
  assert.equal(m(1, 1, 1, 1), '1 recompensa · 1 logro · 1 reto · 1 nivel');
  assert.equal(m(0, 5, 0, 0), 'Sin recompensas · 5 logros');
  assert.equal(m(0, 0, 0, 0), 'Sin recompensas ni logros todavía');
  assert.equal(resumenHerramienta('recompensas-y-logros', { motivacion: null }), null);
});

test('ninguna fila de herramienta pasa de una línea del móvil ni dice «clienta»', () => {
  const muchos = {
    numTiposClase: 120,
    salas: { numSalas: 12, averias: Array.from({ length: 11 }, () => ({ hasta: null })), ahoraMs: AHORA },
    correos: [{ tipo: 'reserva', enviar: false }],
    contenido: { mensajeDestacado: 'Hola', tarjetas: Array.from({ length: 20 }, () => ({ activo: true })), avisos: Array.from({ length: 30 }, () => ({ activo: true })), ahoraMs: AHORA },
    widgetDominios: Array.from({ length: 12 }, (_, i) => `https://w${i}.example.com`),
    motivacion: { recompensas: 120, logros: 340, niveles: 12, retos: 45 },
  };
  for (const h of HERRAMIENTAS) {
    const v = resumenHerramienta(h.id, muchos);
    assert.ok(v, h.id);
    assert.ok(v.length <= MAX_RESUMEN, `${h.id}: «${v}» (${v.length})`);
    assert.doesNotMatch(v, /\b(client|soci)as?\b/i, v);
  }
});

// ─── Las filas de «Mi estudio» ────────────────────────────────────────────────

test('nombre y dirección: lo guardado, lo vacío dicho como vacío y, sin cargar, nada', () => {
  assert.equal(resumenNombreYDireccion({ nombre: 'Pilates Centro', direccion: 'Calle Mayor 4', ciudad: 'Almería' }), 'Pilates Centro · Calle Mayor 4 · Almería');
  assert.equal(resumenNombreYDireccion({ nombre: 'Pilates Centro', direccion: null, ciudad: '  ' }), 'Pilates Centro · sin dirección');
  assert.equal(resumenNombreYDireccion({ nombre: 'Pilates Centro', ciudad: 'Almería' }), 'Pilates Centro · Almería');
  assert.equal(resumenNombreYDireccion({}), null);
  // Una dirección que no cabe se salta entera; la ciudad sigue.
  assert.equal(resumenNombreYDireccion({ nombre: 'Pilates Centro', direccion: 'Avenida de la Constitución 125, portal B, 2º', ciudad: 'Almería' }), 'Pilates Centro · Almería');
});

test('contacto: teléfono, email y web sin protocolo; vacío se dice, sin cargar no', () => {
  assert.equal(resumenContacto({ telefono: '600 111 222', email: 'hola@example.com', sitioWeb: null }), '600 111 222 · hola@example.com');
  assert.equal(resumenContacto({ telefono: null, email: null, sitioWeb: 'https://www.pilates.example.com/' }), 'Pilates.example.com');
  assert.equal(resumenContacto({ telefono: '', email: null, sitioWeb: null }), 'Sin teléfono, email ni web');
  assert.equal(resumenContacto({}), null);
});

test('el horario de la fila: por tramos de lunes a domingo, con horas y días cerrados', () => {
  const tipico = semana(d => (d >= 1 && d <= 5 ? ['08:00', '22:00'] : d === 6 ? ['09:00', '14:00'] : null));
  assert.equal(resumenHorarioSemana(tipico), 'L-V 8:00–22:00 · S 9:00–14:00 · D cerrado');
  assert.equal(resumenHorarioSemana(semana(() => ['07:30', '21:30'])), 'Todos los días 7:30–21:30');
  assert.equal(resumenHorarioSemana(CERRADO), 'Cerrado toda la semana');
  assert.equal(resumenHorarioSemana(semana(d => (d === 0 || d === 6 ? null : ['08:00', '21:00']))), 'L-V 8:00–21:00 · S-D cerrado');
  // Seis franjas distintas no caben en una línea: cuántos días abre.
  assert.equal(resumenHorarioSemana(semana(d => (d === 0 ? null : [`0${d}:00`, '20:00']))), 'Abre 6 días a la semana');
  // Incompleto: no se sabe, no se rellena con el de fábrica.
  assert.equal(resumenHorarioSemana(undefined), null);
  assert.equal(resumenHorarioSemana(tipico.slice(1)), null);
  assert.equal(resumenHorarioSemana(tipico.map(d => (d.diaSemana === 2 ? { ...d, horaApertura: null } : d))), null);
  for (const v of [tipico, CERRADO, semana(d => [`0${d + 1}:15`, '20:45'])].map(resumenHorarioSemana)) {
    assert.ok(v && v.length <= MAX_RESUMEN, `«${v}»`);
  }
});

test('los cierres: el próximo o el que está en curso, y cuántos más; los pasados no cuentan', () => {
  const hoy = '2026-12-20';
  assert.equal(rangoDeFechas('2026-12-24', '2026-12-26'), '24–26 dic');
  assert.equal(rangoDeFechas('2026-12-30', '2027-01-02'), '30 dic–2 ene');
  assert.equal(rangoDeFechas('2026-12-08', '2026-12-08'), '8 dic');
  assert.equal(resumenCierres([], hoy), 'Sin cierres próximos');
  assert.equal(resumenCierres([{ desde: '2026-08-01', hasta: '2026-08-15' }], hoy), 'Sin cierres próximos');
  assert.equal(resumenCierres([{ desde: '2027-04-01', hasta: '2027-04-05' }, { desde: '2026-12-24', hasta: '2026-12-26' }], hoy), 'Cerrado 24–26 dic · 1 cierre más');
  assert.equal(resumenCierres([{ desde: '2026-12-18', hasta: '2026-12-22' }], hoy), 'Cerrado hasta el 22 dic');
  assert.equal(resumenCierres([{ desde: '2026-12-20', hasta: '2026-12-20' }], hoy), 'Cerrado hoy');
  // Sin poder leerlos: la fila enseña su descripción.
  assert.equal(resumenCierres(null, hoy), null);
});

test('las sedes: cuántas y en cuál estás; sin cargar, nada', () => {
  assert.equal(resumenSedes([{ id: 'a', nombre: 'Pilates Centro' }, { id: 'b', nombre: 'Pilates Norte' }], 'a'), '2 sedes · estás en Pilates Centro');
  assert.equal(resumenSedes([{ id: 'a', nombre: 'Pilates Centro' }], 'a'), 'Solo esta sede');
  assert.equal(resumenSedes(null, 'a'), null);
});

// ─── Las filas de «Cobros y facturas» y «Alta de alumnas» ────────────────────

test('datos fiscales: razón social, NIF e IVA; con el NIF mal, qué pasa con tus facturas y la pastilla de «Revisa esto»', () => {
  assert.deepEqual(resumenDatosFiscales({ razonSocial: 'Pilates Centro SL', nif: NIF_BUENO, ivaPorDefecto: 21 }), { valor: `Pilates Centro SL · ${NIF_BUENO} · IVA 21 %`, estado: null });
  // Sin razón social no se inventa: va lo que hay.
  assert.equal(resumenDatosFiscales({ razonSocial: ' ', nif: NIF_BUENO.toLowerCase(), ivaPorDefecto: 10 }).valor, `${NIF_BUENO} · IVA 10 %`);
  assert.deepEqual(resumenDatosFiscales({ nif: 'B12345670', ivaPorDefecto: 21 }), {
    valor: 'Revisa el NIF: tus facturas salen con uno que Hacienda no reconoce', estado: { tono: 'pendiente', etiqueta: 'Revisa el NIF' },
  });
  assert.deepEqual(resumenDatosFiscales({ nif: '', ivaPorDefecto: 21 }).estado, { tono: 'problema', etiqueta: 'Falta el NIF' });
  assert.deepEqual(resumenDatosFiscales({ nif: 'B12345678' }).estado, { tono: 'problema', etiqueta: 'NIF no válido' });
  // La pastilla de la fila es la misma que la de «Revisa esto».
  for (const nif of ['', 'B12345678', 'B12345670']) {
    const aviso = avisosDeConfiguracion(con({ nif })).find(a => a.id === 'nif')!;
    assert.deepEqual(resumenDatosFiscales({ nif }).estado, { tono: aviso.tono, etiqueta: aviso.etiqueta });
  }
  assert.deepEqual(resumenDatosFiscales({}), { valor: null, estado: null });
});

test('Stripe: un solo estado, y nunca «sin conectar» cuando no se puede conectar', () => {
  const base = { conectado: false, disponible: false, fallando: false, bizum: null };
  assert.deepEqual(resumenStripe(base), {
    valor: 'Lo estamos terminando de conectar por nuestro lado', estado: { tono: 'neutro', etiqueta: 'No disponible todavía' },
  });
  assert.deepEqual(resumenStripe({ ...base, disponible: true }), { valor: 'Conéctalo para cobrar con tarjeta', estado: { tono: 'neutro', etiqueta: 'Sin conectar' } });
  assert.deepEqual(resumenStripe({ ...base, conectado: true }).estado, { tono: 'activo', etiqueta: 'Conectado' });
  // Conectado aunque Tentare haya quitado la clave: lo conectado sigue cobrando.
  assert.equal(resumenStripe({ ...base, conectado: true, bizum: 'active' }).valor, 'Tarjeta y Bizum');
  assert.equal(resumenStripe({ ...base, conectado: true, disponible: true, bizum: 'pending' }).valor, 'Tarjeta · Bizum sin activar');
  assert.deepEqual(resumenStripe({ ...base, conectado: true, fallando: true }).estado, { tono: 'problema', etiqueta: 'Con problemas' });
  // Un fallo sin cuenta conectada no es de esta fila.
  assert.equal(resumenStripe({ ...base, disponible: true, fallando: true }).estado!.etiqueta, 'Sin conectar');
});

test('domiciliaciones y devoluciones: lo guardado, lo que falta y, sin cargar, nada', () => {
  assert.equal(resumenDomiciliaciones({ sepaAcreedorId: 'ES12ZZZ12345678', sepaIban: 'ES00 0000', sepaTitular: 'Pilates Centro SL' }), 'Listas para remesas');
  assert.equal(resumenDomiciliaciones({ sepaAcreedorId: null, sepaIban: '', sepaTitular: null }), 'Sin configurar');
  assert.equal(resumenDomiciliaciones({ sepaAcreedorId: 'ES12ZZZ12345678', sepaIban: null, sepaTitular: '' }), 'Falta el IBAN y el titular');
  assert.equal(resumenDomiciliaciones({}), null);

  assert.equal(resumenDevoluciones({ reembolsosActivos: false, reembolsoPlazoDias: 30 }), 'Apagadas: devuelves desde Stripe');
  assert.equal(resumenDevoluciones({ reembolsosActivos: true, reembolsoPlazoDias: 14, reembolsoSoloSinUsar: true }), 'Hasta 14 días · bonos, solo sin empezar');
  assert.equal(resumenDevoluciones({ reembolsosActivos: true, reembolsoPlazoDias: 0, reembolsoSoloSinUsar: false }), 'Sin plazo');
  assert.equal(resumenDevoluciones({ reembolsosActivos: true, reembolsoPlazoDias: 1, reembolsoSoloSinUsar: false }), 'Hasta 1 día');
  assert.equal(resumenDevoluciones({}), null);
});

test('contrato: de quién son los textos, y con términos propios y penalización, que no se cobra', () => {
  const propios = (terminosServicio: boolean, politicaPrivacidad: boolean) => ({ terminosServicio, politicaPrivacidad });
  assert.deepEqual(resumenContrato({ propios: propios(false, false), hayPenalizacion: true }), { valor: 'Los textos de Tentare', estado: null });
  assert.equal(resumenContrato({ propios: propios(true, false), hayPenalizacion: false }).valor, 'Tus términos · privacidad de Tentare');
  assert.equal(resumenContrato({ propios: propios(false, true), hayPenalizacion: true }).valor, 'Términos de Tentare · tu privacidad');
  assert.equal(resumenContrato({ propios: propios(true, true), hayPenalizacion: false }).valor, 'Tus términos y tu privacidad');
  // Solo los TÉRMINOS propios bloquean el cobro (`terminos_propios`); la privacidad, no.
  assert.deepEqual(resumenContrato({ propios: propios(true, true), hayPenalizacion: true }), {
    valor: 'Con términos propios no se cobran penalizaciones', estado: { tono: 'problema', etiqueta: 'Con problemas' },
  });
  assert.deepEqual(resumenContrato({ propios: null, hayPenalizacion: true }), { valor: null, estado: null });
});

test('alta de alumnas: compra desde tu enlace, datos extra y cuestionario; sin cargar, nada', () => {
  assert.equal(resumenCompraPublica('EXIGIR_REGISTRO'), 'Se registra antes de pagar');
  assert.equal(resumenCompraPublica('CREAR_FICHA'), 'Paga sin registrarse antes');
  assert.equal(resumenCompraPublica(undefined), null);

  const campo = (activo: boolean, requerido = false) => ({ activo, requerido });
  assert.equal(resumenDatosExtra([campo(true, true), campo(true), campo(true), campo(false, true)]), '3 datos extra · 1 obligatorio');
  assert.equal(resumenDatosExtra([campo(true)]), '1 dato extra');
  // Uno apagado no se pide en el alta: no cuenta.
  assert.equal(resumenDatosExtra([campo(false)]), 'Ninguno');
  assert.equal(resumenDatosExtra([]), 'Ninguno');
  assert.equal(resumenDatosExtra(null), null);

  assert.equal(resumenCuestionarioSalud([{ activo: true }, { activo: true }, { activo: false }]), '2 preguntas');
  assert.equal(resumenCuestionarioSalud([{ activo: false }]), 'Sin preguntas');
  assert.equal(resumenCuestionarioSalud(null), null);

  assert.equal(resumenPlanesActivos([{ activo: true }, { activo: false }]), '1 plan a la venta');
  assert.equal(resumenPlanesActivos([]), 'Ningún plan a la venta');
  assert.equal(resumenPlanesActivos(null), null);
});

test('las filas de cobros y altas caben en una línea del móvil (los avisos van enteros) y dicen «alumna»', () => {
  const valores = [
    resumenDatosFiscales({ razonSocial: 'Pilates Centro SL', nif: NIF_BUENO, ivaPorDefecto: 21 }).valor,
    resumenDomiciliaciones({ sepaAcreedorId: 'x', sepaIban: null, sepaTitular: null }),
    resumenDomiciliaciones({ sepaAcreedorId: null, sepaIban: 'x', sepaTitular: null }),
    resumenDevoluciones({ reembolsosActivos: true, reembolsoPlazoDias: 365, reembolsoSoloSinUsar: true }),
    resumenContrato({ propios: { terminosServicio: true, politicaPrivacidad: false }, hayPenalizacion: false }).valor,
    resumenContrato({ propios: { terminosServicio: false, politicaPrivacidad: true }, hayPenalizacion: false }).valor,
    resumenDatosExtra([{ activo: true, requerido: true }, { activo: true, requerido: true }]),
    resumenStripe({ conectado: true, disponible: true, fallando: false, bizum: 'pending' }).valor,
    resumenStripe({ conectado: false, disponible: true, fallando: false, bizum: null }).valor,
    resumenPlanesActivos([{ activo: true }, { activo: true }]),
  ];
  for (const v of valores) {
    assert.ok(v && v.length <= MAX_RESUMEN, `«${v}» no cabe`);
    assert.doesNotMatch(v, /\b(client|soci)as?\b/i, v);
  }
});

// ─── Las filas de «Cómo reservan mis alumnas» y «Cómo me comunico» ───────────

test('reglas de reserva: lo principal delante, y los tipos que la cambian antes que el detalle', () => {
  const r = reglasGuardadas(null);
  const sin = { excepciones: 0 };
  assert.equal(resumenRegla('reservar', r, sin), 'Cualquier antelación · con plan o bono');
  assert.equal(resumenRegla('reservar', { ...r, reservaAntelacionMaximaDias: 30, requiereAprobacion: true }, sin), 'Hasta 30 días antes · la apruebas tú');
  assert.equal(resumenRegla('cancelar-y-recuperar', r, sin), 'Hasta 12 h antes · después pierde la sesión');
  assert.equal(resumenRegla('cancelar-y-recuperar', { ...r, cancelacionVentanaHoras: 0 }, sin), 'Cancela hasta el último momento');
  assert.equal(resumenRegla('si-se-cancela-una-clase', r, sin), 'Devuelve la sesión · sin mínimo');
  assert.equal(resumenRegla('si-se-cancela-una-clase', { ...r, cancelacionClaseDevuelveBono: false, minimoAsistentesPorClase: 3 }, sin), 'No devuelve la sesión · mínimo 3 alumnas');
  assert.equal(resumenRegla('lista-de-espera', r, sin), 'Plaza al momento');
  assert.equal(resumenRegla('lista-de-espera', { ...r, listaEsperaPlazoAceptacionMinutos: 30 }, sin), 'Oferta de 30 min');
  assert.equal(resumenRegla('lista-de-espera', { ...r, permiteListaEspera: false, listaEsperaPlazoAceptacionMinutos: 30 }, sin), 'Sin lista de espera');
  assert.equal(resumenRegla('asistencia', r, { excepciones: 0, pideConfirmacion: true }), 'Se pasa lista · pide confirmar a quien falta');
  // Sin leer la confirmación (su endpoint), no se dice nada de ella.
  assert.equal(resumenRegla('asistencia', { ...r, requiereCheckinQr: false }, { excepciones: 0, pideConfirmacion: null }), 'Sin pasar lista');
  assert.equal(resumenRegla('si-cancela-tarde-o-no-viene', r, sin), 'Sin cargo');
  assert.equal(resumenRegla('si-cancela-tarde-o-no-viene', { ...r, penalizacionImporteEur: 5 }, sin), '5 € · lo apruebas tú');
  assert.equal(resumenRegla('si-cancela-tarde-o-no-viene', { ...r, penalizacionImporteEur: 7.5, penalizacionCobroAutomatico: true, penalizacionAplicaCancelacionTardia: false }, sin),
    '7,50 € · se cobra solo · solo si no viene');

  // Los tipos que la cambian no se pierden nunca por falta de sitio.
  assert.equal(resumenRegla('cancelar-y-recuperar', r, { excepciones: 2 }), 'Hasta 12 h antes · 2 tipos lo cambian');
  assert.equal(resumenRegla('lista-de-espera', r, { excepciones: 1 }), 'Plaza al momento · 1 tipo lo cambia');
  // El cargo propio de un tipo no se cobra: la fila no puede decir que «lo cambia».
  assert.equal(resumenRegla('si-cancela-tarde-o-no-viene', r, { excepciones: 2 }), 'Sin cargo · 2 tipos: su cargo no se cobra');
  const peores = { ...r, reservaAntelacionMaximaDias: 365, cancelacionVentanaHoras: 168, minimoAsistentesPorClase: 12, penalizacionImporteEur: 12.5 };
  for (const t of TARJETAS_REGLAS) {
    for (const v of [r, peores]) {
      const texto = resumenRegla(t, v, { excepciones: 12, pideConfirmacion: true });
      assert.ok(texto && texto.length <= MAX_RESUMEN, `${t}: «${texto}» no cabe`);
      const excepcion = t === 'si-cancela-tarde-o-no-viene' ? /12 tipos: su cargo no se cobra/ : /12 tipos lo cambian/;
      assert.match(texto, excepcion, `${t}: «${texto}» se come las excepciones`);
    }
  }
});

test('WhatsApp: un solo estado, y guardado sin usar no es «Conectado»', () => {
  assert.deepEqual(resumenWhatsapp({ estado: 'APAGADA' }).estado, { tono: 'neutro', etiqueta: 'Sin conectar' });
  assert.deepEqual(resumenWhatsapp({ estado: 'SIN_PROBAR' }).estado, { tono: 'pendiente', etiqueta: 'Sin probar' });
  const bien = resumenWhatsapp({ estado: 'FUNCIONA', desde: '2026-08-18T10:00:00Z' });
  assert.deepEqual(bien.estado, { tono: 'activo', etiqueta: 'Conectado' });
  assert.match(bien.valor!, /^Funciona · última vez el 18 ago/);
  const mal = resumenWhatsapp({ estado: 'FALLANDO', desde: '2026-08-18T10:00:00Z', error: 'Session has expired' });
  assert.deepEqual(mal.estado, { tono: 'problema', etiqueta: 'Con problemas' });
  // El motivo del servicio va en la fila: distingue un token caducado de un número mal puesto.
  assert.match(mal.valor!, /Session has expired$/);
});

test('Gmail: conectado con su cuenta, sin conectar, o nada que conectar todavía', () => {
  assert.deepEqual(resumenGmail({ email: 'estudio@example.com', disponible: false }), { valor: 'estudio@example.com', estado: { tono: 'activo', etiqueta: 'Conectado' } });
  assert.deepEqual(resumenGmail({ email: null, disponible: true }).estado, { tono: 'neutro', etiqueta: 'Sin conectar' });
  assert.deepEqual(resumenGmail({ email: ' ', disponible: false }), {
    valor: 'Lo estamos terminando de conectar por nuestro lado', estado: { tono: 'neutro', etiqueta: 'No disponible todavía' },
  });
});

test('remitente: lo tuyo si está activo, un email a medio escribir no cuenta, y lo que falta sale del estudio', () => {
  const estudio = { nombreEstudio: 'Pilates Centro', emailEstudio: 'estudio@example.com' };
  assert.equal(resumenRemitente({ ...estudio, propio: { activo: true, fromName: 'Pilates Almería', fromEmail: 'hola@example.com' } }), 'Pilates Almería · responde a hola@example.com');
  // Apagada, el envío no la lee: se dice lo que sale de verdad.
  assert.equal(resumenRemitente({ ...estudio, propio: { activo: false, fromName: 'Pilates Almería', fromEmail: 'hola@example.com' } }), 'Pilates Centro · responde a estudio@example.com');
  assert.equal(resumenRemitente({ ...estudio, propio: { activo: true, fromName: '', fromEmail: 'hola@' } }), 'Pilates Centro · responde a estudio@example.com');
  assert.equal(resumenRemitente({ nombreEstudio: 'Pilates Centro', emailEstudio: null, propio: { activo: false } }), 'Pilates Centro · sin email de respuesta');
  assert.equal(resumenRemitente({ ...estudio, propio: null }), null);
});

test('conexiones: un solo estado, por su cuenta o por su salud, y nunca «sin conectar» cuando no se puede', () => {
  const apagada = { estado: 'APAGADA' } as const;
  const bien = { estado: 'FUNCIONA', desde: '2026-08-18T10:00:00Z' } as const;
  const mal = { estado: 'FALLANDO', desde: '2026-08-18T10:00:00Z', error: 'Invalid API key' } as const;
  const paraQue = 'Conéctalo para copiar tus clases a tu calendario';

  // Por cuenta (Google Calendar, Zoom, Klaviyo, Zapier).
  assert.deepEqual(resumenConexion({ cuenta: 'estudio@example.com', salud: apagada, disponible: true, paraQue }), {
    valor: 'estudio@example.com', estado: { tono: 'activo', etiqueta: 'Conectado' },
  });
  assert.deepEqual(resumenConexion({ cuenta: null, salud: apagada, disponible: true, paraQue }), { valor: paraQue, estado: { tono: 'neutro', etiqueta: 'Sin conectar' } });
  assert.deepEqual(resumenConexion({ cuenta: ' ', salud: apagada, disponible: false, paraQue }), {
    valor: NO_DISPONIBLE_TODAVIA, estado: { tono: 'neutro', etiqueta: 'No disponible todavía' },
  });
  // Conectada sigue conectada aunque Tentare haya quitado la clave: lo conectado sigue funcionando.
  assert.equal(resumenConexion({ cuenta: 'estudio@example.com', salud: apagada, disponible: false, paraQue }).estado!.etiqueta, 'Conectado');
  // Un fallo sin cuenta conectada no es de esta fila.
  assert.equal(resumenConexion({ cuenta: null, salud: mal, disponible: true, paraQue }).estado!.etiqueta, 'Sin conectar');

  // Por clave pegada (Kisi, Mailchimp): manda la salud, con la última vez que se usó.
  assert.deepEqual(resumenConexion({ salud: apagada, disponible: true, paraQue: 'Conéctalo' }).estado, { tono: 'neutro', etiqueta: 'Sin conectar' });
  assert.deepEqual(resumenConexion({ salud: { estado: 'SIN_PROBAR' }, disponible: true, paraQue }).estado, { tono: 'pendiente', etiqueta: 'Sin probar' });
  assert.match(resumenConexion({ salud: bien, disponible: true, paraQue }).valor!, /^Funciona · última vez el 18 ago/);
  const caida = resumenConexion({ salud: mal, disponible: true, paraQue });
  assert.deepEqual(caida.estado, { tono: 'problema', etiqueta: 'Con problemas' });
  assert.match(caida.valor!, /Invalid API key$/);
});

test('conexiones agrupadas: con problemas arriba, luego conectadas y sin conectar, y lo no disponible al final', () => {
  const fila = (id: string, tono: 'activo' | 'pendiente' | 'problema' | 'neutro' | null, etiqueta = '') =>
    ({ id, resumen: tono ? { valor: 'x', estado: { tono, etiqueta } } : null });
  const grupos = agruparConexiones([
    fila('google', 'neutro', 'No disponible todavía'),
    fila('zoom', 'activo', 'Conectado'),
    fila('kisi', 'neutro', 'Sin conectar'),
    fila('zapier', null),
    fila('mailchimp', 'problema', 'Con problemas'),
    fila('klaviyo', 'pendiente', 'Sin probar'),
  ]);
  assert.deepEqual(grupos.map(g => [g.titulo, g.filas.map(f => f.id)]), [
    ['Con problemas', ['mailchimp']],
    ['Conectadas', ['zoom', 'klaviyo']],
    ['Sin conectar', ['kisi', 'google', 'zapier']],
  ]);
  // Sin grupos vacíos.
  assert.deepEqual(agruparConexiones([fila('kisi', 'neutro', 'Sin conectar')]).map(g => g.titulo), ['Sin conectar']);
});

test('apps con acceso y la dirección corta de tu página', () => {
  assert.equal(resumenAppsConAcceso(null), null);
  assert.equal(resumenAppsConAcceso([]), 'Ninguna app tiene acceso');
  assert.equal(resumenAppsConAcceso([{ nombre: 'Zapier' }]), 'Zapier');
  assert.equal(resumenAppsConAcceso([{ nombre: 'Zapier' }, { nombre: 'Make' }]), '2 apps: Zapier, Make');

  assert.equal(resumenDireccion({ slug: 'pilates-centro', origen: 'https://www.tentare.example' }), 'tentare.example/reservar/pilates-centro');
  assert.equal(resumenDireccion({ slug: 'pilates-centro', origen: 'http://localhost:3000/' }), 'localhost:3000/reservar/pilates-centro');
  // Antes de saber dónde está, la ruta sola; sin dirección, nada.
  assert.equal(resumenDireccion({ slug: 'pilates-centro', origen: '' }), '/reservar/pilates-centro');
  assert.equal(resumenDireccion({ slug: null, origen: 'https://tentare.example' }), null);

  assert.equal(resumenPaginaPublica({ oculta: false, tieneClave: true }), 'Visible para todo el mundo');
  assert.equal(resumenPaginaPublica({ oculta: true, tieneClave: false }), 'Oculta: no entra nadie');
  assert.equal(resumenPaginaPublica({ oculta: true, tieneClave: true }), 'Oculta: solo entra quien tenga la clave');
  // Sin saberlo, no se afirma que se ve.
  assert.equal(resumenPaginaPublica(null), null);
});

test('Motivación: la pastilla del plan en la fila, y los créditos como los aplica el servidor', () => {
  assert.deepEqual(estadoDelPlan({ enTuPlan: true, activo: true, planMinimo: 'Estudio' }), { tono: 'activo', etiqueta: 'Incluido en tu plan' });
  assert.deepEqual(estadoDelPlan({ enTuPlan: false, activo: true, planMinimo: 'Estudio' }), { tono: 'neutro', etiqueta: 'Desde el plan Estudio' });
  // Con el plan que la trae pero sin suscripción viva, no se le dice que se cambie de plan.
  assert.deepEqual(estadoDelPlan({ enTuPlan: true, activo: false, planMinimo: 'Estudio' }), { tono: 'pendiente', etiqueta: 'Tu plan no está activo' });

  assert.equal(resumenReglasCreditos({}), null);
  assert.equal(resumenReglasCreditos({ creditosNombre: null, creditosCaducanMeses: null, rachaClasesSemana: null }), 'Se llaman créditos · no caducan · racha de 1 clase por semana');
  assert.equal(resumenReglasCreditos({ creditosNombre: 'puntos', creditosCaducanMeses: 12, rachaClasesSemana: 2 }), 'Se llaman puntos · caducan a los 12 meses sin ganar · racha de 2 clases por semana');

  const disparadores = ['ASISTENCIA_CLASE', 'RENOVACION_PLAN', 'COMPRA'];
  assert.equal(resumenCreditosPorAccion(null, disparadores, 'puntos'), null);
  assert.equal(resumenCreditosPorAccion([], disparadores, 'puntos'), 'Ninguna acción da puntos todavía');
  // Apagada o a 0 no da nada.
  assert.equal(resumenCreditosPorAccion([
    { trigger: 'RENOVACION_PLAN', creditos: 40, activa: false },
    { trigger: 'COMPRA', creditos: 0, activa: true },
  ], disparadores, 'créditos'), 'Ninguna acción da créditos todavía');
  assert.equal(resumenCreditosPorAccion([
    { trigger: 'ASISTENCIA_CLASE', creditos: 10, activa: true },
    { trigger: 'COMPRA', creditos: 1, activa: true },
  ], disparadores, 'puntos'), '2 de 3 dan puntos · 10 por asistir');
});

// ─── Mi equipo ───────────────────────────────────────────────────────────────

test('Mi equipo: quién hay por rol, sin propietarias ni bajas; si no cabe, cuántas y lo primero', () => {
  const p = (rol: string, activo = true) => ({ rol, activo });
  assert.equal(resumenEquipo(null), null);
  assert.equal(resumenEquipo([p('PROPIETARIO')]), 'Sin instructoras ni recepción todavía');
  assert.equal(
    resumenEquipo([p('PROPIETARIO'), p('INSTRUCTOR'), p('INSTRUCTOR'), p('RECEPCION'), p('INSTRUCTOR', false)]),
    '2 instructoras · 1 en recepción',
  );
  assert.equal(resumenEquipo([p('INSTRUCTOR'), p('MANAGER')]), '1 instructora · 1 responsable de sede');
  const muchas = [...Array.from({ length: 5 }, () => p('INSTRUCTOR')), p('RECEPCION'), p('RECEPCION'), p('MANAGER'), p('MANAGER')];
  assert.equal(resumenEquipo(muchas), '9 personas · 5 instructoras');
});

test('Mi equipo: las instructoras con tarifa por hora; sin poder leer las tarifas, nada', () => {
  const instructoras = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.equal(resumenTarifas(null, []), null);
  // No leídas no es «ninguna».
  assert.equal(resumenTarifas(instructoras, null), null);
  assert.equal(resumenTarifas([], []), 'Sin instructoras todavía');
  assert.equal(resumenTarifas(instructoras, []), 'Ninguna instructora con tarifa por hora');
  // Una fila sin tarifa por hora (solo base mensual) no cuenta, ni la de alguien que no es instructora.
  assert.equal(resumenTarifas(instructoras, [
    { instructorId: 'a', tarifaHora: 22 }, { instructorId: 'b', tarifaHora: null }, { instructorId: 'recepcion', tarifaHora: 15 },
  ]), '1 de 3 instructoras con tarifa por hora');
  assert.equal(resumenTarifas([{ id: 'a' }], [{ instructorId: 'a', tarifaHora: 22 }]), '1 de 1 instructora con tarifa por hora');
});

test('Mi equipo: el modo de Sustituciones que se aplica de verdad, con el plan; sin leerlo, nada', () => {
  const estudio = { plan: 'ESTUDIO', subscriptionStatus: 'active' };
  assert.equal(resumenModoSustituciones(estudio), null);
  assert.equal(resumenModoSustituciones({ ...estudio, modoAutonomia: null }), null);
  assert.equal(resumenModoSustituciones({ ...estudio, modoAutonomia: 'inventado' }), null);
  assert.equal(resumenModoSustituciones({ ...estudio, modoAutonomia: 'manual' }), 'Manual: tú das cada paso');
  assert.equal(resumenModoSustituciones({ ...estudio, modoAutonomia: 'asistido' }), 'Asistido: tú apruebas con un toque');
  assert.equal(resumenModoSustituciones({ ...estudio, modoAutonomia: 'autonomo' }), 'Autónomo: cubre las bajas y te lo cuenta');
  assert.equal(resumenModoSustituciones({ ...estudio, modoAutonomia: 'vacaciones' }), 'Vacaciones: lo resuelve sin molestarte');
  // Sin el plan, el motor lo rebaja a asistido (`modoAutonomiaEfectivo`): se dice eso, no lo guardado.
  assert.equal(resumenModoSustituciones({ plan: 'BASE', subscriptionStatus: 'active', modoAutonomia: 'autonomo' }), 'Asistido: tu plan no incluye «Autónomo»');
  assert.equal(resumenModoSustituciones({ plan: 'BASE', subscriptionStatus: 'active', modoAutonomia: 'vacaciones' }), 'Asistido: tu plan no incluye «Vacaciones»');
  assert.equal(resumenModoSustituciones({ plan: 'BASE', subscriptionStatus: 'active', modoAutonomia: 'asistido' }), 'Asistido: tú apruebas con un toque');
});

test('Mi equipo: el aviso a las alumnas y la dirección de la app de tus instructoras', () => {
  assert.equal(resumenAvisarAlumnas(true), 'Les avisa por email y en su app');
  assert.equal(resumenAvisarAlumnas(false), 'No avisa a las alumnas');
  assert.equal(resumenAvisarAlumnas(null), null);
  assert.equal(resumenAvisarAlumnas(undefined), null);
  assert.equal(resumenAppInstructoras({ slug: 'pilates-centro', origen: 'https://www.tentare.es/' }), 'tentare.es/portal/pilates-centro/equipo');
  assert.equal(resumenAppInstructoras({ slug: '  ', origen: 'https://tentare.es' }), null);
  assert.equal(resumenAppInstructoras({ slug: null, origen: 'https://tentare.es' }), null);
});

test('las filas de Mi equipo caben en una línea del móvil y dicen «alumna» e «instructora»', () => {
  const p = (rol: string) => ({ rol, activo: true });
  const valores = [
    resumenEquipo([p('INSTRUCTOR'), p('INSTRUCTOR'), p('RECEPCION'), p('MANAGER')]),
    resumenEquipo([...Array.from({ length: 12 }, () => p('INSTRUCTOR')), p('RECEPCION'), p('RECEPCION'), p('MANAGER'), p('MANAGER')]),
    resumenEquipo([p('PROPIETARIO')]),
    resumenTarifas(Array.from({ length: 15 }, (_, i) => ({ id: `i${i}` })), Array.from({ length: 12 }, (_, i) => ({ instructorId: `i${i}`, tarifaHora: 20 }))),
    resumenTarifas([{ id: 'a' }], []),
    ...['manual', 'asistido', 'autonomo', 'vacaciones'].map(modoAutonomia => resumenModoSustituciones({ plan: 'ESTUDIO', subscriptionStatus: 'active', modoAutonomia })),
    ...['autonomo', 'vacaciones'].map(modoAutonomia => resumenModoSustituciones({ plan: 'BASE', subscriptionStatus: 'active', modoAutonomia })),
    resumenAvisarAlumnas(true),
    resumenAvisarAlumnas(false),
  ];
  for (const v of valores) {
    assert.ok(v && v.length <= MAX_RESUMEN, `«${v}» no cabe`);
    assert.doesNotMatch(v, /\b(client|soci|profesor)as?\b/i, v);
  }
});
