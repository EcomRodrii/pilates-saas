import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG_POR_DEFECTO, MARGEN_MISMA_COPIA_MS, MAX_ANTERIORES, claveDeCopia, esCopiaCompleta, esLaMismaCopia, fusionarWidgetBuilder,
  leerConfigs, leerCopiados, nuevaCopia, type Copiado,
} from './config.ts';
import { leerWeb } from './recetas.ts';

const COPIA = { firma: 'abc123', en: '2026-09-12T10:00:00.000Z' };

test('leerCopiados: solo widgets del catálogo y con firma y fecha válidas', () => {
  assert.deepEqual(leerCopiados(null), {});
  assert.deepEqual(leerCopiados({
    horario: { copiado: COPIA },
    planes: { copiado: { firma: 'ABC!', en: COPIA.en } },
    citas: { copiado: { firma: 'x', en: 'ayer' } },
    cuenta: { copiado: 'sí' },
    _web: { copiado: COPIA },
    inventado: { copiado: COPIA },
  }), { horario: COPIA });
});

test('⚠️ guardar FUSIONA: `_web`, los ids viejos y las claves desconocidas sobreviven', () => {
  const raw = {
    clases: { tipos: ['tc-r'] },
    _web: { plataforma: 'wordpress', direccion: 'miestudio.example.com', algoNuevo: 1 },
    otraCosa: { x: 1 },
  };
  const configs = leerConfigs(raw);
  const guardado = fusionarWidgetBuilder(raw, configs, {}, leerWeb(raw));
  assert.deepEqual(guardado.clases, { tipos: ['tc-r'] });
  assert.deepEqual(guardado.otraCosa, { x: 1 });
  assert.deepEqual(guardado._web, { plataforma: 'wordpress', direccion: 'miestudio.example.com', algoNuevo: 1 });
  assert.deepEqual((guardado.horario as { tipos: string[] }).tipos, ['tc-r']);
});

test('cada widget guarda su copia, y se vuelve a leer igual', () => {
  const guardado = fusionarWidgetBuilder({}, { horario: CONFIG_POR_DEFECTO }, { horario: COPIA, planes: COPIA }, { plataforma: 'wix', direccion: null });
  assert.deepEqual((guardado.horario as Record<string, unknown>).copiado, COPIA);
  // Una copia de un widget sin ajustes guardados no arrastra una config entera.
  assert.deepEqual(guardado.planes, { copiado: COPIA });
  assert.deepEqual(leerCopiados(guardado), { horario: COPIA, planes: COPIA });
  assert.deepEqual(leerWeb(guardado), { plataforma: 'wix', direccion: null });
});

test('la dirección se contesta con la plataforma: si la borra, se borra; sin contestar, `_web` no se toca', () => {
  const raw = { _web: { plataforma: 'wix', direccion: 'vieja.example.com' } };
  assert.deepEqual(fusionarWidgetBuilder(raw, {}, {}, { plataforma: 'webflow', direccion: null })._web, { plataforma: 'webflow' });
  const desconocida = { _web: { plataforma: 'una-que-aun-no-existe' } };
  assert.deepEqual(fusionarWidgetBuilder(desconocida, {}, {}, leerWeb(desconocida))._web, { plataforma: 'una-que-aun-no-existe' });
  assert.equal('_web' in fusionarWidgetBuilder({}, {}, {}, leerWeb({})), false);
});

test('la config de un widget nunca lleva la clave `copiado` si no se ha copiado', () => {
  const guardado = fusionarWidgetBuilder({ horario: { copiado: COPIA } }, { horario: CONFIG_POR_DEFECTO }, {}, leerWeb({}));
  assert.equal('copiado' in (guardado.horario as Record<string, unknown>), false);
});

// ── Fase C: lo que se guarda al copiar ──────────────────────────────────────

const FOTO = { ...CONFIG_POR_DEFECTO, tipos: ['tc-r'], mostrarPrecio: false };

test('leerCopiados: forma, foto, versión e historial son opcionales y solo entran si son válidos', () => {
  const completa = {
    ...COPIA, metodo: 'popup', config: FOTO, contenido: 'c1abc', anteriores: ['incrustado:c1old', 'ventana:c1older'],
  };
  assert.deepEqual(leerCopiados({ horario: { copiado: completa } }).horario, completa);

  // Cada campo raro cae solo, sin llevarse la copia por delante.
  const rara = leerCopiados({
    horario: {
      copiado: {
        ...COPIA,
        metodo: 'toString', // sale de un jsonb: un objeto de búsqueda devolvería una función
        config: ['no', 'es', 'un', 'objeto'],
        contenido: 'zz',
        anteriores: 'incrustado:c1old',
      },
    },
  }).horario;
  assert.deepEqual(rara, COPIA);
});

test('leerCopiados: la foto pasa por leerConfig, y el historial se limpia, no se repite y se corta a 5', () => {
  const k = leerCopiados({
    horario: {
      copiado: {
        ...COPIA,
        metodo: 'iframe',
        config: { tipos: ['tc-r', 3], mostrarPrecio: 'no', marca: 'rojo' },
        anteriores: [
          'incrustado:c1a', 'incrustado:c1a', 'pagina:c1b', 'ventana:c1c', 'nativa:c1d', 'incrustado:zz', 7,
          'incrustado:c1e', 'ventana:c1f', 'incrustado:c1g',
        ],
      },
    },
  }).horario;
  assert.deepEqual(k.config, { ...CONFIG_POR_DEFECTO, tipos: ['tc-r'] });
  assert.deepEqual(k.anteriores, ['incrustado:c1a', 'ventana:c1c', 'nativa:c1d', 'incrustado:c1e', 'ventana:c1f']);
  assert.equal(k.anteriores?.length, MAX_ANTERIORES);
});

test('claveDeCopia: la versión que dirá la página, solo con forma medible y contenido', () => {
  assert.equal(claveDeCopia({ ...COPIA, metodo: 'iframe', contenido: 'c1abc' }), 'incrustado:c1abc');
  assert.equal(claveDeCopia({ ...COPIA, metodo: 'popup', contenido: 'c1abc' }), 'ventana:c1abc');
  assert.equal(claveDeCopia({ ...COPIA, metodo: 'enlace', contenido: 'c1abc' }), null);
  assert.equal(claveDeCopia({ ...COPIA, metodo: 'iframe' }), null);
  assert.equal(claveDeCopia(COPIA), null);
  assert.equal(claveDeCopia(null), null);
});

test('registrarCopia (nuevaCopia): guarda forma, foto y versión, y la copia de antes pasa al historial', () => {
  const en = '2026-09-20T10:00:00.000Z';
  const primera = nuevaCopia(undefined, { firma: 'f1', en, metodo: 'iframe', config: FOTO, contenido: 'c1uno' });
  assert.deepEqual(primera, { firma: 'f1', en, metodo: 'iframe', config: FOTO, contenido: 'c1uno' });

  const segunda = nuevaCopia(primera, { firma: 'f2', en, metodo: 'popup', config: FOTO, contenido: 'c1dos' });
  assert.deepEqual(segunda.anteriores, ['incrustado:c1uno']);

  // Volver a copiar la MISMA versión no la mete en su propio historial.
  const otraVez = nuevaCopia(segunda, { firma: 'f2', en, metodo: 'popup', config: FOTO, contenido: 'c1dos' });
  assert.deepEqual(otraVez.anteriores, ['incrustado:c1uno']);

  // Sin repetir y hasta 5, la más reciente primero.
  let k = otraVez;
  for (const c of ['c1a', 'c1b', 'c1c', 'c1d', 'c1e', 'c1b']) {
    k = nuevaCopia(k, { firma: 'f', en, metodo: 'iframe', config: FOTO, contenido: c });
  }
  assert.deepEqual(k.anteriores, ['incrustado:c1e', 'incrustado:c1d', 'incrustado:c1c', 'incrustado:c1a', 'ventana:c1dos']);

  // Un botón o un enlace no tienen versión que ver: sin `contenido`, y el
  // historial sigue ahí para cuando lo vuelva a poner dentro de la página.
  const enlace = nuevaCopia(k, { firma: 'f3', en, metodo: 'enlace', config: FOTO, contenido: null });
  assert.equal('contenido' in enlace, false);
  assert.deepEqual(enlace.anteriores, ['incrustado:c1b', 'incrustado:c1e', 'incrustado:c1d', 'incrustado:c1c', 'incrustado:c1a']);

  // Una copia de antes de la Fase C (sin versión) no aporta historial.
  const deAntes = nuevaCopia(COPIA, { firma: 'f4', en, metodo: 'iframe', config: FOTO, contenido: 'c1x' });
  assert.equal('anteriores' in deAntes, false);
  // Una versión con otro formato no se guarda.
  assert.equal('contenido' in nuevaCopia(undefined, { firma: 'f5', en, metodo: 'iframe', config: FOTO, contenido: 'XX' }), false);
});

test('lo copiado con foto se guarda y se vuelve a leer IGUAL (ida y vuelta por el jsonb)', () => {
  const k = nuevaCopia(
    nuevaCopia(undefined, { firma: 'f1', en: COPIA.en, metodo: 'iframe', config: FOTO, contenido: 'c1uno' }),
    { firma: 'f2', en: COPIA.en, metodo: 'iframe', config: FOTO, contenido: 'c1dos' },
  );
  const guardado = JSON.parse(JSON.stringify(
    fusionarWidgetBuilder({}, { horario: CONFIG_POR_DEFECTO }, { horario: k }, leerWeb({})),
  )) as Record<string, unknown>;
  assert.deepEqual(leerCopiados(guardado).horario, k);
});

// ── Fase D: el botón vivo y la copia a mano ─────────────────────────────────

test('nuevaCopia: `botonVivo` solo si el código copiado lee las variables; si no, ni la clave', () => {
  const en = '2026-09-29T10:00:00.000Z';
  const base = { firma: 'f1', en, metodo: 'popup' as const, config: FOTO, contenido: 'c1uno' };
  assert.equal(nuevaCopia(undefined, { ...base, botonVivo: true }).botonVivo, true);
  for (const botonVivo of [false, undefined]) {
    assert.equal('botonVivo' in nuevaCopia(undefined, { ...base, botonVivo }), false, String(botonVivo));
  }
  // La marca no se hereda de la copia de antes: es de ESTE código.
  assert.equal('botonVivo' in nuevaCopia(nuevaCopia(undefined, { ...base, botonVivo: true }), base), false);
  // Y va y vuelve por el jsonb igual.
  const k = nuevaCopia(undefined, { ...base, botonVivo: true });
  const guardado = JSON.parse(JSON.stringify(fusionarWidgetBuilder({}, {}, { horario: k }, leerWeb({})))) as Record<string, unknown>;
  assert.deepEqual(leerCopiados(guardado).horario, k);
});

test('leerCopiados: `botonVivo` solo con `true` exacto', () => {
  assert.equal(leerCopiados({ horario: { copiado: { ...COPIA, botonVivo: true } } }).horario.botonVivo, true);
  for (const raro of ['true', 1, false, null, {}, 'sí']) {
    const k = leerCopiados({ horario: { copiado: { ...COPIA, botonVivo: raro } } }).horario;
    assert.deepEqual(k, COPIA, JSON.stringify(raro));
  }
});

const CODIGO = '<button type="button" data-tentare-popup="https://www.tentare.app/reservar/alba?embed=1" style="color:#FFFFFF;">Reservar</button>\n<script src="https://www.tentare.app/widget-popup.js" async></script>';

test('esCopiaCompleta: el código entero, con los espacios que ponga el navegador', () => {
  assert.equal(esCopiaCompleta(CODIGO, CODIGO), true);
  assert.equal(esCopiaCompleta(CODIGO.replace('\n', '\r\n'), CODIGO), true);
  assert.equal(esCopiaCompleta(`\n  ${CODIGO}  \n`, CODIGO), true);
  // Un trozo no funciona pegado: no cuenta.
  assert.equal(esCopiaCompleta(CODIGO.slice(0, 80), CODIGO), false);
  assert.equal(esCopiaCompleta(CODIGO.split('\n')[0], CODIGO), false);
  // «Seleccionar todo» en la página lleva el código dentro, pero no es él.
  assert.equal(esCopiaCompleta(`Ponlo en tu web\nCopiar código\n${CODIGO}\nSi lo cambias, cópialo otra vez`, CODIGO), false);
  // Sin código no hay nada que copiar, aunque la selección también esté vacía.
  assert.equal(esCopiaCompleta('', ''), false);
  assert.equal(esCopiaCompleta('  ', ' \n '), false);
});

test('esLaMismaCopia: la misma copia repetida en menos de un minuto no se vuelve a guardar', () => {
  const t0 = Date.parse('2026-09-29T10:00:00.000Z');
  const copia = (dt: number, x: Partial<Copiado> = {}): Copiado => ({
    firma: 'f1', en: new Date(t0 + dt).toISOString(), metodo: 'popup', config: FOTO, contenido: 'c1uno', botonVivo: true, ...x,
  });
  const previa = copia(0);
  assert.equal(MARGEN_MISMA_COPIA_MS, 60_000);
  assert.equal(esLaMismaCopia(previa, copia(0)), true);
  assert.equal(esLaMismaCopia(previa, copia(59_000)), true);
  assert.equal(esLaMismaCopia(previa, copia(60_000)), false);
  assert.equal(esLaMismaCopia(previa, copia(61_000)), false);
  // Otra huella, otra forma, otra versión u otra marca del botón: es otra copia.
  assert.equal(esLaMismaCopia(previa, copia(1000, { firma: 'f2' })), false);
  assert.equal(esLaMismaCopia(previa, copia(1000, { metodo: 'iframe' })), false);
  assert.equal(esLaMismaCopia(previa, copia(1000, { contenido: 'c1dos' })), false);
  const sinMarca = copia(1000);
  delete sinMarca.botonVivo;
  assert.equal(esLaMismaCopia(previa, sinMarca), false);
  // Una fecha anterior a la de la copia guardada (otro reloj, otra pestaña) se guarda.
  assert.equal(esLaMismaCopia(previa, copia(-1000)), false);
  // Sin copia de antes, o con una fecha que no se lee, siempre se guarda.
  assert.equal(esLaMismaCopia(undefined, previa), false);
  assert.equal(esLaMismaCopia(null, previa), false);
  assert.equal(esLaMismaCopia(previa, { ...copia(1000), en: 'ayer' }), false);
});
