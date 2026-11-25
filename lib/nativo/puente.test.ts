// Las llamadas del puente a los plugins PROPIOS de la app, con el
// `@capacitor/core` de verdad y solo la parte de iOS simulada: si una llamada no
// llega a «iOS» o no contesta, la función de la app está muerta aunque compile.
import test from 'node:test';
import assert from 'node:assert/strict';

const llamadas: string[] = [];
const metodos = (...nombres: string[]) => nombres.map((name) => ({ name, rtype: 'promise' }));

// Lo que la carcasa deja en la página antes de que cargue la web.
Object.assign(globalThis, {
  window: globalThis,
  webkit: { messageHandlers: { bridge: {} } },
  Capacitor: {
    isNativePlatform: () => true,
    PluginHeaders: [
      { name: 'ProximaClase', methods: metodos('guardar', 'borrar', 'leer') },
      { name: 'AvisosLocales', methods: metodos('programar', 'borrar') },
      { name: 'Bloqueo', methods: metodos('estado', 'activar') },
    ],
    nativePromise: async (plugin: string, metodo: string) => {
      llamadas.push(`${plugin}.${metodo}`);
      return { programados: 2, disponible: true, tipo: 'Face ID', activo: true };
    },
  },
});

const puente = await import('./puente.ts');

/** Sin respuesta en 1 s = colgada: ningún plugin simulado tarda nada. */
async function contesta<T>(p: Promise<T>): Promise<T> {
  let reloj: ReturnType<typeof setTimeout> | undefined;
  const tope = new Promise<never>((_, no) => { reloj = setTimeout(() => no(new Error('sin respuesta')), 1000); });
  try {
    return await Promise.race([p, tope]);
  } finally {
    clearTimeout(reloj);
  }
}

test('el widget recibe las clases y se limpia', async () => {
  llamadas.length = 0;
  assert.equal(await contesta(puente.guardarClasesParaElWidget('{}')), true);
  await contesta(puente.borrarClasesDelWidget());
  assert.deepEqual(llamadas, ['ProximaClase.guardar', 'ProximaClase.borrar']);
});

test('los avisos se programan y se quitan', async () => {
  llamadas.length = 0;
  assert.equal(await contesta(puente.programarAvisosLocales('{}')), 2);
  await contesta(puente.borrarAvisosLocales());
  assert.deepEqual(llamadas, ['AvisosLocales.programar', 'AvisosLocales.borrar']);
});

test('el bloqueo se lee, se cambia y se apaga al salir', async () => {
  llamadas.length = 0;
  assert.deepEqual(await contesta(puente.estadoBloqueo()), { programados: 2, disponible: true, tipo: 'Face ID', activo: true });
  assert.equal(await contesta(puente.cambiarBloqueo(true)), true);
  await contesta(puente.apagarBloqueoAlSalir());
  assert.deepEqual(llamadas, ['Bloqueo.estado', 'Bloqueo.activar', 'Bloqueo.activar']);
});
