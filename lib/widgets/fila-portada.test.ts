import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { EstadoEnTuWeb, PiezaCopiada } from './en-tu-web.ts';
import { ORDEN, REGLAS, filaDePortada, type ClaveAviso, type EntradaFila } from './fila-portada.ts';
import type { AvisoSoloHorario } from './solo-horario.ts';

const SOLO: AvisoSoloHorario = {
  modo: 'copiar',
  texto: 'Si en tu web te salen los bonos y las cuotas debajo del horario, vuelve a copiar el código: el nuevo trae «Tu horario, tus clases» activado. El que ya tienes pegado no cambia solo.',
  accion: { texto: 'Copiar el código nuevo', hace: 'copiar' },
};

const H = 3600_000;
const AHORA = Date.parse('2026-10-16T12:00:00.000Z');
const iso = (t: number) => new Date(t).toISOString();

const VISTO: EstadoEnTuWeb = { tipo: 'visto', forma: 'incrustado', anfitrion: 'https://pilatescentro.example.com', ultimo: iso(AHORA - 2 * H), otrasWebs: 0, version: 'al-dia' };

function pieza(p: Partial<PiezaCopiada> = {}): PiezaCopiada {
  return {
    metodo: 'iframe', desfasado: false, cambios: null, etiqueta: 'web-horario', mes: null,
    disenoPropio: false, botonCongelado: false, estado: VISTO, ...p,
  };
}
function fila(p: Partial<PiezaCopiada> = {}, extra: Partial<EntradaFila> = {}): EntradaFila {
  return { pieza: pieza(p), esEnlace: false, webSinAutorizar: null, conListaDeWebs: false, codigoAntiguo: false, soloHorario: null, ...extra };
}
const anterior = (porId: boolean): EstadoEnTuWeb => ({
  ...VISTO, version: 'anterior', laOtra: { anfitrion: VISTO.tipo === 'visto' ? VISTO.anfitrion : null, ultimo: iso(AHORA - 3 * H) }, ...(porId ? { porId: true } : {}),
});

/** Una fila en la que encajan TODOS los avisos a la vez. */
const TODO = fila(
  { desfasado: true, cambios: ['qué clases salen'], disenoPropio: true, botonCongelado: true },
  { webSinAutorizar: 'pilatescentro.example.com', conListaDeWebs: true, codigoAntiguo: true, soloHorario: SOLO },
);

test('nunca más de un aviso: con todos a la vez, gana la web sin autorizar (lo único que no deja cargar el widget)', () => {
  const r = filaDePortada(TODO, AHORA);
  assert.equal(r.aviso?.clave, 'web-sin-autorizar');
  assert.deepEqual(r.aviso!.accion, { texto: 'Ir a las webs autorizadas', hace: 'webs-autorizadas' });
  // Y el estado dice lo que se ve: lo de antes, aunque se haya visto hace un rato.
  assert.equal(r.chip?.texto, 'Tu web tiene lo de antes');
  assert.equal(r.chip?.tono, 'aviso');
});

test('el orden: web sin autorizar (fundador, 16-oct) → «Tu horario, tus clases» → desfase/versión → código de antes → diseño propio → botón de antes', () => {
  assert.deepEqual(ORDEN, ['web-sin-autorizar', 'solo-horario', 'desfase', 'version', 'codigo-antiguo', 'diseno-propio', 'boton-de-antes']);
  // Quitando uno a uno el que gana, sale el siguiente.
  const pasos: [Partial<PiezaCopiada>, Partial<EntradaFila>, ClaveAviso][] = [
    [{}, { webSinAutorizar: null }, 'solo-horario'],
    [{}, { webSinAutorizar: null, soloHorario: null }, 'desfase'],
    [{ desfasado: false }, { webSinAutorizar: null, soloHorario: null }, 'codigo-antiguo'],
    [{ desfasado: false }, { webSinAutorizar: null, soloHorario: null, codigoAntiguo: false }, 'diseno-propio'],
    [{ desfasado: false, disenoPropio: false }, { webSinAutorizar: null, soloHorario: null, codigoAntiguo: false }, 'boton-de-antes'],
  ];
  for (const [p, e, esperado] of pasos) {
    const f: EntradaFila = { ...TODO, ...e, pieza: { ...TODO.pieza, ...p } };
    assert.equal(filaDePortada(f, AHORA).aviso?.clave, esperado);
  }
});

test('⚠️ la web sin autorizar va DELANTE de todo (decisión del fundador, 16-oct): con el desfase o el diseño propio, sale ella', () => {
  const sinAutorizar = { webSinAutorizar: 'pilatescentro.example.com', conListaDeWebs: true };
  assert.equal(filaDePortada(fila({ disenoPropio: true }, sinAutorizar), AHORA).aviso?.clave, 'web-sin-autorizar');
  assert.equal(filaDePortada(fila({ desfasado: true }, sinAutorizar), AHORA).aviso?.clave, 'web-sin-autorizar');
  // Sin lista que abrir (ya no va sin marco) sigue siendo la primera: es cierto, aunque no tenga botón.
  assert.equal(filaDePortada(fila({ desfasado: true }, { ...sinAutorizar, conListaDeWebs: false }), AHORA).aviso?.clave, 'web-sin-autorizar');
});

test('cada uno de los siete tipos de aviso tiene su regla y sale solo', () => {
  const casos: Record<ClaveAviso, EntradaFila> = {
    desfase: fila({ desfasado: true }),
    version: fila({ estado: anterior(false) }),
    'codigo-antiguo': fila({}, { codigoAntiguo: true }),
    'diseno-propio': fila({ disenoPropio: true }),
    'web-sin-autorizar': fila({}, { webSinAutorizar: 'pilatescentro.example.com', conListaDeWebs: true }),
    'boton-de-antes': fila({ botonCongelado: true }),
    'solo-horario': fila({}, { soloHorario: SOLO }),
  };
  assert.deepEqual(Object.keys(REGLAS).sort(), [...ORDEN].sort());
  for (const clave of ORDEN) {
    const r = filaDePortada(casos[clave], AHORA);
    assert.equal(r.aviso?.clave, clave, clave);
    assert.ok(r.aviso!.texto.length > 20, clave);
  }
});

test('sin nada que avisar, ningún aviso; y el estado de su web en la pastilla', () => {
  const r = filaDePortada(fila(), AHORA);
  assert.equal(r.aviso, null);
  assert.deepEqual(r.chip && { texto: r.chip.texto, tono: r.chip.tono }, { texto: 'Se ve en pilatescentro.example.com · hace 2 h', tono: 'ok' });
  assert.match(r.chip!.detalle!, /^Visto en pilatescentro\.example\.com hace 2 h/);
});

test('`oculto` no pinta pastilla (cargando, sin permiso o la lectura falló), y sin `ahora` tampoco', () => {
  assert.equal(filaDePortada(fila({ estado: { tipo: 'oculto' } }), AHORA).chip, null);
  assert.equal(filaDePortada(fila(), null).chip, null);
  // Sin `ahora`, el botón de antes no se dice todavía: saldría y se iría.
  assert.equal(filaDePortada(fila({ botonCongelado: true }), null).aviso, null);
});

test('por id, una versión anterior NO es un aviso: se pone al día sola', () => {
  const r = filaDePortada(fila({ estado: anterior(true) }), AHORA);
  assert.equal(r.aviso, null);
  assert.deepEqual(r.chip && { texto: r.chip.texto, tono: r.chip.tono }, { texto: 'Se pone al día en unos minutos', tono: 'neutro' });
  // Con un código de antes (no por id), sí: hay que pegarlo.
  const antes = filaDePortada(fila({ estado: anterior(false) }), AHORA);
  assert.equal(antes.aviso?.clave, 'version');
  assert.equal(antes.chip?.texto, 'Tu web tiene lo de antes');
});

test('el botón del aviso: enlace o código, y la web sin autorizar sin lista no ofrece botón', () => {
  assert.equal(filaDePortada(fila({ desfasado: true }, { esEnlace: true }), AHORA).aviso?.accion?.texto, 'Copiar el enlace nuevo');
  assert.equal(filaDePortada(fila({}, { codigoAntiguo: true, esEnlace: true }), AHORA).aviso?.accion?.texto, 'Copiar el enlace de ahora');
  assert.deepEqual(filaDePortada(fila({ disenoPropio: true }), AHORA).aviso?.accion, { texto: 'Que siga el estilo de tus widgets', hace: 'estilo-comun' });
  const sinLista = filaDePortada(fila({}, { webSinAutorizar: 'pilatescentro.example.com', conListaDeWebs: false }), AHORA);
  assert.equal(sinLista.aviso?.clave, 'web-sin-autorizar');
  assert.equal(sinLista.aviso?.accion, null);
});

test('el código de antes habla de «Publicar en mi web», nunca de «Aplicar»', () => {
  const r = filaDePortada(fila({}, { codigoAntiguo: true }), AHORA);
  assert.match(r.aviso!.texto, /«Publicar en mi web»/);
  assert.doesNotMatch(r.aviso!.texto, /Aplicar/);
});

test('«Tu horario, tus clases»: sin aviso del panel no sale, y con él la fila lo enseña con su botón', () => {
  assert.equal(filaDePortada(fila(), AHORA).aviso, null);
  const r = filaDePortada(fila({}, { soloHorario: SOLO }), AHORA);
  assert.equal(r.aviso?.clave, 'solo-horario');
  assert.match(r.aviso!.texto, /bonos y las cuotas debajo del horario/);
  assert.deepEqual(r.aviso!.accion, { texto: 'Copiar el código nuevo', hace: 'copiar' });
  // Sin botón (la barra de publicar ya está a la vista), el aviso sigue siendo cierto.
  const sinBoton = filaDePortada(fila({}, { soloHorario: { ...SOLO, modo: 'publicar', accion: null } }), AHORA);
  assert.equal(sinBoton.aviso?.clave, 'solo-horario');
  assert.equal(sinBoton.aviso?.accion, null);
});
