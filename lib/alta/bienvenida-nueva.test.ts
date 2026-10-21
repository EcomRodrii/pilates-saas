import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ENTRADA_PRIMERA_CLASE, LINEA_DE_PASOS, PANTALLAS_ALTA, PASO_DE_PANTALLA, PRIMEROS_PASOS_DEL_ALTA, PROGRAMAS, PROGRAMAS_RECONOCIDOS,
  anteriorPantalla, clavePantallaAlta, esRutaDelAlta, leerPantallaGuardada, pidePrimeraClase, listaReconocidos, nacioConAltaNueva,
  ordenDeVias, origenDeSoftware, pantallaParaGuardar, queExportar, siguientePantalla, softwareAnteriorDe, viaRecomendada,
} from './bienvenida-nueva.ts';
import { VERSIONES_ALTA } from './embudo.ts';
import { OPCIONES_SOFTWARE } from '../onboarding/asistente-rapido.ts';
import { analizarDeterminista } from '../migracion/clasificador.ts';
import { EJEMPLOS } from '../migracion/ejemplos.ts';

// La bienvenida del alta nueva en el panel (pasos 3, 4 y 5): la línea, el
// orden de las pantallas, reanudar, quién la ve y el paso «Importar».

test('la línea son los cinco pasos del alta; obligatorios 1, 2 y 3', () => {
  // La maqueta tenía siete: «Primera clase» y «Publicar» salieron del alta (fundador, 21-oct-2026,
  // «lo de crear la clase durante el onboarding, descartado») y son tareas de «Pon en marcha tu estudio».
  assert.deepEqual(LINEA_DE_PASOS.map(p => `${p.num} ${p.nombre}`), [
    '01 Cuenta', '02 Código', '03 Tu estudio', '04 Tus datos', '05 Tu marca',
  ]);
  assert.deepEqual(LINEA_DE_PASOS.filter(p => !p.opcional).map(p => p.num), ['01', '02', '03']);
});

test('«Tus primeros pasos» cuenta las tareas que vienen, con los nombres de «Pon en marcha tu estudio»', () => {
  assert.deepEqual(PRIMEROS_PASOS_DEL_ALTA.map(p => p.titulo), [
    'Crea tu primera clase', 'Comparte tu enlace de reservas', 'Trae a tus alumnas', 'Recibe tu primera reserva',
  ]);
  // La primera clase lo crea todo: lo que faltaba (sala, quién la da, precio) se dice.
  const clase = PRIMEROS_PASOS_DEL_ALTA[0].que;
  for (const palabra of ['quién la da', 'sala', 'precio']) assert.ok(clase.includes(palabra), palabra);
});

test('las pantallas van en orden; el alta acaba en «Tus primeros pasos», tras la marca', () => {
  assert.deepEqual([...PANTALLAS_ALTA], ['estudio', 'horario', 'importar', 'marca', 'pasos']);
  assert.deepEqual(PANTALLAS_ALTA.map(p => PASO_DE_PANTALLA[p]), [3, 3, 4, 5, 6]);
  assert.equal(siguientePantalla('estudio'), 'horario');
  // Fundador, 21-oct: tras la marca, nunca el Calendario vacío; primero lo que viene.
  assert.equal(siguientePantalla('marca'), 'pasos', 'después de la marca, «Tus primeros pasos»');
  assert.equal(siguientePantalla('pasos'), null, 'y ahí se sale al panel');
  assert.equal(anteriorPantalla('estudio'), null);
  assert.equal(anteriorPantalla('importar'), 'horario');
  assert.equal(anteriorPantalla('pasos'), 'marca');
  assert.equal(ENTRADA_PRIMERA_CLASE, '/calendario?primera=1');
  assert.equal(pidePrimeraClase('?primera=1'), true);
  assert.equal(pidePrimeraClase('?nueva=1'), false);
  assert.equal(pidePrimeraClase(null), false);
});

test('quien se quedó en «Tu primera clase» o «¡Listo!» (cuando eran del alta) sigue por «Tus primeros pasos»', () => {
  assert.equal(leerPantallaGuardada('{"pantalla":"clase"}'), 'pasos');
  assert.equal(leerPantallaGuardada('{"pantalla":"publicada","clase":"Reformer"}'), 'pasos');
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
