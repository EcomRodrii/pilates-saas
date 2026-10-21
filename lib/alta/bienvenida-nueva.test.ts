import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DESTINO_PRIMERA_CLASE, LINEA_DE_PASOS, PANTALLAS_ALTA, PASO_DE_PANTALLA, PROGRAMAS, PROGRAMAS_RECONOCIDOS,
  anteriorPantalla, clavePantallaAlta, esRutaDelAlta, leerPantallaGuardada, listaReconocidos, nacioConAltaNueva,
  ordenDeVias, origenDeSoftware, pantallaParaGuardar, queExportar, siguientePantalla, softwareAnteriorDe, viaRecomendada,
} from './bienvenida-nueva.ts';
import { VERSIONES_ALTA } from './embudo.ts';
import { OPCIONES_SOFTWARE } from '../onboarding/asistente-rapido.ts';
import { analizarDeterminista } from '../migracion/clasificador.ts';
import { EJEMPLOS } from '../migracion/ejemplos.ts';

// La bienvenida del alta nueva en el panel (pasos 3, 4 y 5): la línea, el
// orden de las pantallas, reanudar, quién la ve y el paso «Importar».

test('la línea son los siete pasos de la maqueta; obligatorios 1, 2, 3 y 6', () => {
  assert.deepEqual(LINEA_DE_PASOS.map(p => `${p.num} ${p.nombre}`), [
    '01 Cuenta', '02 Código', '03 Tu estudio', '04 Tus datos', '05 Tu marca', '06 Primera clase', '07 Publicar',
  ]);
  assert.deepEqual(LINEA_DE_PASOS.filter(p => !p.opcional).map(p => p.num), ['01', '02', '03', '06']);
});

test('las pantallas van en orden y cada una cae en su paso de la línea', () => {
  assert.deepEqual([...PANTALLAS_ALTA], ['estudio', 'horario', 'importar', 'marca']);
  assert.deepEqual(PANTALLAS_ALTA.map(p => PASO_DE_PANTALLA[p]), [3, 3, 4, 5]);
  assert.equal(siguientePantalla('estudio'), 'horario');
  assert.equal(siguientePantalla('marca'), null, 'después de la marca, la primera clase (PR-4)');
  assert.equal(anteriorPantalla('estudio'), null);
  assert.equal(anteriorPantalla('importar'), 'horario');
  assert.equal(DESTINO_PRIMERA_CLASE, '/calendario?nueva=1', 'mientras tanto, «Nueva clase» del Calendario');
});

test('reanudar: vuelve a la pantalla guardada; lo que no se entiende, a la primera', () => {
  for (const p of PANTALLAS_ALTA) assert.equal(leerPantallaGuardada(pantallaParaGuardar(p)), p);
  for (const raro of [null, undefined, '', 'basura', '{"pantalla":"publicar"}', '{"pantalla":3}', '[]']) {
    assert.equal(leerPantallaGuardada(raro), 'estudio', String(raro));
  }
  assert.equal(clavePantallaAlta('s1'), 'tentare-alta-nueva:s1', 'por estudio: dos cuentas en el mismo navegador no se pisan');
});

test('la ve quien se registró con el alta nueva (v2 o la de prueba), nunca una sede creada después', () => {
  assert.equal(nacioConAltaNueva('v2', null), true);
  assert.equal(nacioConAltaNueva('v2_prueba', null), true);
  assert.equal(nacioConAltaNueva('v1', null), false);
  assert.equal(nacioConAltaNueva(null, null), false);
  assert.equal(nacioConAltaNueva('v2', 'cadena-1'), false, 'una sede de cadena sigue con la de siempre');
  // Las versiones son las del CHECK de la migración del embudo.
  for (const v of ['v2', 'v2_prueba']) assert.ok((VERSIONES_ALTA as readonly string[]).includes(v), v);
});

test('las rutas a las que se va sin salir del alta: las tres formas de traer datos, y nada más', () => {
  for (const r of ['/migracion', '/clientas/importar', '/clientas/importar/membresias', '/calendario/importar', '/calendario/importar/']) {
    assert.equal(esRutaDelAlta(r), true, r);
  }
  for (const r of ['/dashboard', '/clientas', '/calendario', '/migracionx', '/configuracion', '', null]) {
    assert.equal(esRutaDelAlta(r), false, String(r));
  }
});

test('«¿Con qué lo llevas ahora?» se guarda con la grafía del asistente de siempre', () => {
  assert.equal(softwareAnteriorDe('cero', ''), 'Todavía ninguno');
  assert.equal(softwareAnteriorDe('hoja', ''), 'Excel o Google Sheets');
  assert.equal(softwareAnteriorDe('papel', ''), 'Papel o libreta');
  assert.equal(softwareAnteriorDe('programa', 'momence'), 'Momence');
  assert.equal(softwareAnteriorDe('programa', 'Bsport'), 'Bsport');
  assert.equal(softwareAnteriorDe('programa', 'uno raro'), 'Otro');
  // Cada programa de la lista existe en la del asistente: /interno los cuenta juntos.
  for (const p of PROGRAMAS) assert.ok((OPCIONES_SOFTWARE as readonly string[]).includes(p.valor), p.valor);
  assert.ok((OPCIONES_SOFTWARE as readonly string[]).includes(softwareAnteriorDe('cero', '')));
  assert.ok((OPCIONES_SOFTWARE as readonly string[]).includes(softwareAnteriorDe('hoja', '')));
});

test('al volver, lo contestado sale marcado (también lo del asistente de siempre)', () => {
  assert.equal(origenDeSoftware(null), null);
  assert.deepEqual(origenDeSoftware('Todavía ninguno')?.origen, 'cero');
  assert.deepEqual(origenDeSoftware('Excel o Google Sheets')?.origen, 'hoja');
  assert.deepEqual(origenDeSoftware('Papel o libreta')?.origen, 'papel');
  assert.deepEqual(origenDeSoftware('Eversports'), { origen: 'programa', programa: 'Eversports' });
  assert.deepEqual(origenDeSoftware('Bonsai'), { origen: 'programa', programa: 'Otro' });
});

test('la vía que le toca pasa delante y se marca; empezar de cero no recomienda ninguna', () => {
  assert.deepEqual(ordenDeVias(null), ['programa', 'magia', 'plantilla']);
  assert.deepEqual(ordenDeVias('programa'), ['programa', 'magia', 'plantilla']);
  assert.deepEqual(ordenDeVias('hoja'), ['magia', 'programa', 'plantilla']);
  assert.deepEqual(ordenDeVias('papel'), ['plantilla', 'programa', 'magia']);
  assert.equal(viaRecomendada('cero'), null);
  assert.equal(viaRecomendada(null), null);
});

test('«Qué exportar»: sin rutas de menú inventadas, y «reconocemos» solo donde es verdad', () => {
  for (const p of PROGRAMAS) {
    const t = queExportar(p.valor);
    assert.match(t, /exportar tus clientas a CSV o Excel/);
    assert.doesNotMatch(t, /›|>|menú|Ajustes|Configuración/i, `${p.valor}: nada de rutas de menú`);
    const dice = /las reconocemos solas/.test(t);
    assert.equal(dice, (PROGRAMAS_RECONOCIDOS as readonly string[]).includes(p.valor), p.valor);
  }
  assert.equal(listaReconocidos(), 'Momence, Eversports y Mindbody');
});

test('⚠️ cada programa que decimos reconocer tiene un export con sus columnas que el clasificador lee solo', () => {
  // Momence y Eversports: sus ejemplos con los nombres de columna reales
  // (lib/migracion/ejemplos.ts). Mindbody: la forma del export de clientas de
  // la evaluación del 13-sep (lib/migracion/mindbody-saldos.test.ts).
  const MINDBODY = [
    'Client ID,First Name,Last Name,Email,Mobile Phone,Birth Date,Pricing Option,Remaining,Expiration Date,Last Visit',
    '10021,Ana,Ejemplo,ana@example.com,612345001,1984-03-12,10 Class Pack Reformer,6,2026-11-30,2026-09-10',
  ].join('\n');
  const archivos: Record<string, { nombre: string; contenido: string }[]> = {
    Momence: EJEMPLOS.find(e => e.id === 'momence')!.archivos,
    Eversports: EJEMPLOS.find(e => e.id === 'eversports')!.archivos,
    Mindbody: [{ nombre: 'clients.csv', contenido: MINDBODY }],
  };
  for (const programa of PROGRAMAS_RECONOCIDOS) {
    const plan = analizarDeterminista(archivos[programa]);
    assert.ok(plan.archivos.some(a => a.entidad === 'socias' && a.origen === 'auto' && a.ok > 0), `${programa}: no se reconocen sus clientas`);
  }
});
