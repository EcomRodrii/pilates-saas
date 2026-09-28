import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG_POR_DEFECTO, fusionarWidgetBuilder, leerConfigs, leerCopiados } from './config.ts';
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
