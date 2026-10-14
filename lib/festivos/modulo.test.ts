import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aniosConCalendario, dominioDe, esFecha, fuenteVista, limpiarPropuestosIA, normaCorta, oficialesDeLaLista,
  prepararParaGuardar, rangoDeBusqueda, rangoDeLaLista, unirLista, urlSegura, zonaDeLocalidad,
  MAX_POR_GUARDADO, MAX_PROPUESTOS_IA,
} from './modulo.ts';
import { aniosDeLista, cifrasDeLista, hojaDeCalendario, textoAnadir, vistaDeLista, type FestivoDeLaLista } from './lista.ts';
import { ambitoOficial } from './oficiales.ts';

const HOY = '2026-10-14';
const vistas = (...u: string[]) => new Set(u);
const LIMPIEZA = { desde: HOY, hasta: '2027-12-31', fechasOficiales: new Set<string>(), aniosConCalendario: new Set([2026, 2027]), fuentesVistas: vistas() };

test('el rango de búsqueda es el de Bonsai: de hoy a final del año que viene', () => {
  assert.deepEqual(rangoDeBusqueda(HOY), { desde: HOY, hasta: '2027-12-31', anios: [2026, 2027] });
  assert.deepEqual(rangoDeBusqueda('2026-12-31').hasta, '2027-12-31');
});

test('la lista va del 1 de enero hasta el último año con calendario (o el que viene)', () => {
  assert.deepEqual(rangoDeLaLista(HOY, 'MADRID'), { desde: '2026-01-01', hasta: '2027-12-31' });
  assert.deepEqual(rangoDeLaLista(HOY, null), { desde: '2026-01-01', hasta: '2027-12-31' });
  assert.deepEqual(rangoDeLaLista('2028-03-01', 'MADRID'), { desde: '2028-01-01', hasta: '2029-12-31' });
});

test('la localidad escrita da su comunidad (para avisar si no es la de la dirección)', () => {
  assert.equal(zonaDeLocalidad('Madrid'), 'MADRID');
  assert.equal(zonaDeLocalidad('  barcelona '), 'CATALUNA');
  assert.equal(zonaDeLocalidad('Sabadell (Barcelona)'), 'CATALUNA');
  assert.equal(zonaDeLocalidad('08001'), 'CATALUNA');
  assert.equal(zonaDeLocalidad('28013 Madrid'), 'MADRID');
  assert.equal(zonaDeLocalidad('Vielha'), 'ARAN');
  assert.equal(zonaDeLocalidad('Valencia'), null);
  assert.equal(zonaDeLocalidad(''), null);
});

test('nacional si es festivo en todas las comunidades ese año; si no, de la comunidad', () => {
  assert.equal(ambitoOficial('MADRID', '2026-12-25'), 'nacional');
  assert.equal(ambitoOficial('CATALUNA', '2026-04-03'), 'nacional'); // Viernes Santo
  assert.equal(ambitoOficial('MADRID', '2026-04-02'), 'autonomico'); // Jueves Santo: Cataluña no lo tiene
  assert.equal(ambitoOficial('CATALUNA', '2026-09-11'), 'autonomico'); // Diada
  assert.equal(ambitoOficial('MADRID', '2026-11-02'), 'autonomico'); // Todos los Santos, trasladado
});

test('los oficiales de la lista: sin id (no se guardan), con su norma y su ámbito', () => {
  const p = oficialesDeLaLista('MADRID', HOY, '2027-12-31');
  assert.equal(p[0].fecha, '2026-11-02');
  assert.ok(p.every((f) => f.id === null && f.origen === 'oficial' && /^https:\/\//.test(f.fuenteUrl ?? '')));
  // 2027 de Madrid sí trae la Semana Santa (lo que a Bonsai le faltaba).
  assert.ok(p.some((f) => f.fecha === '2027-03-26' && f.nombre === 'Viernes Santo'));
  assert.equal(p.find((f) => f.fecha === '2026-12-25')?.fuente, 'BOE núm. 259, de 28 de octubre de 2025');
  const bcn = oficialesDeLaLista('CATALUNA', '2027-01-01', '2027-12-31');
  assert.ok(bcn.some((f) => f.fecha === '2027-06-24'), 'Sant Joan, que a Bonsai le faltaba');
  assert.match(bcn[0].fuente ?? '', /DOGC/);
});

test('la norma corta sale del paréntesis del diario', () => {
  assert.equal(normaCorta('Resolución … (BOE núm. 259, de 28 de octubre de 2025, BOE-A-2025-21667)'), 'BOE núm. 259, de 28 de octubre de 2025');
  assert.equal(normaCorta('Corta'), 'Corta');
});

test('años con calendario oficial: los dos en las cuatro zonas; ninguno sin zona', () => {
  assert.deepEqual([...aniosConCalendario('MADRID', [2026, 2027])], [2026, 2027]);
  assert.deepEqual([...aniosConCalendario('MADRID', [2027, 2028])], [2027]);
  assert.deepEqual([...aniosConCalendario(null, [2026, 2027])], []);
});

test('la fuente se enseña solo si la búsqueda la vio (o es de su mismo sitio)', () => {
  const v = vistas('https://www.bocm.es/boletin/x.pdf', 'https://www.barcelona.cat/calendari');
  assert.equal(fuenteVista('https://www.bocm.es/boletin/x.pdf', v), 'https://www.bocm.es/boletin/x.pdf');
  assert.equal(fuenteVista('https://www.barcelona.cat/otra-pagina', v), 'https://www.barcelona.cat/otra-pagina');
  assert.equal(fuenteVista('https://inventada.example/festivos', v), null);
  assert.equal(fuenteVista(null, v), null);
});

test('lo de la IA se filtra: fechas reales y en rango, sin repetir los oficiales, solo lo local donde hay boletín', () => {
  const crudo = [
    { fecha: '2027-09-24', nombre: 'La Mercè', ambito: 'local', fuente_url: 'https://www.barcelona.cat/calendario' },
    { fecha: '2027-09-24', nombre: 'Duplicado', ambito: 'local', fuente_url: null },
    { fecha: '2027-06-24', nombre: 'Sant Joan', ambito: 'local', fuente_url: null }, // ya es oficial
    { fecha: '2027-02-30', nombre: 'Imposible', ambito: 'local' },
    { fecha: '2026-01-01', nombre: 'Pasado', ambito: 'local' },
    { fecha: '2027-05-17', nombre: 'Segunda Pascua', ambito: 'local', fuente_url: 'javascript:alert(1)' },
    { fecha: '2027-08-01', nombre: 'x'.repeat(200), ambito: 'local' },
    { fecha: '2027-08-02', nombre: 'Sin ámbito' },
    { fecha: '2027-08-03', nombre: 'Autonómica', ambito: 'autonomico' },
    'basura', null,
  ];
  const r = limpiarPropuestosIA(crudo, { ...LIMPIEZA, fechasOficiales: new Set(['2027-06-24']), fuentesVistas: vistas('https://www.barcelona.cat/calendario') });
  assert.deepEqual(r.map((f) => f.fecha), ['2027-05-17', '2027-09-24']);
  assert.equal(r[1].fuente, 'barcelona.cat');
  assert.equal(r[0].fuenteUrl, null);
  // Un año sin calendario oficial: la IA puede proponer también lo autonómico de ese año.
  const sin2027 = limpiarPropuestosIA(crudo, { ...LIMPIEZA, aniosConCalendario: new Set([2026]) });
  assert.ok(sin2027.some((f) => f.fecha === '2027-08-03' && f.ambito === 'autonomico'));
  assert.deepEqual(limpiarPropuestosIA('no es una lista', LIMPIEZA), []);
});

test('una fuente que la búsqueda no vio se queda sin enlace', () => {
  const r = limpiarPropuestosIA([{ fecha: '2027-09-24', nombre: 'La Mercè', ambito: 'local', fuente_url: 'https://inventada.example/merce' }], LIMPIEZA);
  assert.equal(r[0].fuenteUrl, null);
  assert.equal(r[0].fuente, null);
});

test('la IA no puede colar más de lo razonable', () => {
  const muchos = Array.from({ length: 80 }, (_, i) => ({ fecha: `2027-0${1 + (i % 9)}-${String(1 + (i % 28)).padStart(2, '0')}`, nombre: `F${i}`, ambito: 'local' }));
  assert.ok(limpiarPropuestosIA(muchos, LIMPIEZA).length <= MAX_PROPUESTOS_IA);
});

test('guardar: un oficial no se guarda (ya está en la lista), ni nada en un día oficial', () => {
  assert.equal(prepararParaGuardar([{ fecha: '2026-12-08', nombre: 'Inmaculada', origen: 'oficial' }], { zona: 'MADRID', hoy: HOY }).ok, false);
  const pisa = prepararParaGuardar([{ fecha: '2026-12-08', nombre: 'Mi puente', origen: 'manual' }], { zona: 'MADRID', hoy: HOY });
  assert.deepEqual(pisa, { ok: false, error: 'Ese día ya es festivo oficial: ya está en tu lista.' });
});

test('guardar: lo de la IA (solo local donde hay boletín) y lo manual, limpios', () => {
  const r = prepararParaGuardar([
    { fecha: '2027-09-24', nombre: '  La   Mercè ', origen: 'ia', ambito: 'local', fuenteUrl: 'https://www.barcelona.cat/x' },
    { fecha: '2026-12-24', nombre: 'Nochebuena', origen: 'manual' },
    { fecha: '2026-12-24', nombre: 'Repetido', origen: 'manual' },
  ], { zona: 'CATALUNA', hoy: HOY });
  assert.ok(r.ok);
  assert.deepEqual(r.ok && r.filas.map((f) => [f.fecha, f.nombre, f.ambito, f.origen]), [
    ['2027-09-24', 'La Mercè', 'local', 'ia'],
    ['2026-12-24', 'Nochebuena', 'propio', 'manual'],
  ]);
  // Una «autonómica» de la IA en un año con boletín no entra.
  assert.equal(prepararParaGuardar([{ fecha: '2027-08-03', nombre: 'X', origen: 'ia', ambito: 'autonomico' }], { zona: 'CATALUNA', hoy: HOY }).ok, false);
  // Sin zona (no tenemos su boletín), sí.
  assert.equal(prepararParaGuardar([{ fecha: '2027-08-03', nombre: 'X', origen: 'ia', ambito: 'autonomico' }], { zona: null, hoy: HOY }).ok, true);
});

test('guardar: lo pasado, lo lejano, sin nombre, sin origen o demasiados, no', () => {
  assert.equal(prepararParaGuardar([{ fecha: '2026-10-13', nombre: 'Ayer', origen: 'manual' }], { zona: null, hoy: HOY }).ok, false);
  assert.equal(prepararParaGuardar([{ fecha: '2028-01-01', nombre: 'Lejos', origen: 'manual' }], { zona: null, hoy: HOY }).ok, false);
  assert.equal(prepararParaGuardar([{ fecha: '2026-12-31', nombre: '', origen: 'manual' }], { zona: null, hoy: HOY }).ok, false);
  assert.equal(prepararParaGuardar([{ fecha: '2026-12-31', nombre: 'Sin origen' }], { zona: null, hoy: HOY }).ok, false);
  assert.equal(prepararParaGuardar([], { zona: null, hoy: HOY }).ok, false);
  const demasiados = Array.from({ length: MAX_POR_GUARDADO + 1 }, () => ({ fecha: '2026-12-31', nombre: 'x', origen: 'manual' }));
  assert.equal(prepararParaGuardar(demasiados, { zona: null, hoy: HOY }).ok, false);
});

const fila = (fecha: string, nombre: string, extra: Partial<FestivoDeLaLista> = {}): FestivoDeLaLista =>
  ({ id: null, fecha, nombre, ambito: 'nacional', origen: 'oficial', fuente: null, fuenteUrl: null, estado: null, ...extra });

test('la lista une oficiales y guardados sin repetir un día (manda el oficial)', () => {
  const r = unirLista([fila('2026-12-08', 'Inmaculada')], [
    fila('2026-12-08', 'Otra cosa', { id: 'a', origen: 'manual', ambito: 'propio' }),
    fila('2026-11-09', 'Almudena', { id: 'b', origen: 'ia', ambito: 'local' }),
  ]);
  assert.deepEqual(r.map((f) => [f.fecha, f.nombre]), [['2026-11-09', 'Almudena'], ['2026-12-08', 'Inmaculada']]);
});

test('la vista: por año, en orden, con buscador sin tildes y ocultando lo pasado', () => {
  const lista = [fila('2027-01-06', 'Reyes'), fila('2026-12-25', 'Navidad'), fila('2026-10-12', 'Fiesta Nacional'), fila('2027-09-24', 'La Mercè')];
  const v = vistaDeLista(lista, { anio: 'todos', busqueda: '', ocultarPasados: true, hoy: HOY });
  assert.deepEqual(v.map((g) => [g.anio, g.festivos.map((f) => f.fecha)]), [[2026, ['2026-12-25']], [2027, ['2027-01-06', '2027-09-24']]]);
  assert.deepEqual(vistaDeLista(lista, { anio: 2027, busqueda: 'merce', ocultarPasados: true, hoy: HOY })[0].festivos.map((f) => f.nombre), ['La Mercè']);
  assert.equal(vistaDeLista(lista, { anio: 'todos', busqueda: '', ocultarPasados: false, hoy: HOY })[0].festivos.length, 2);
  assert.deepEqual(aniosDeLista(lista, { ocultarPasados: true, hoy: HOY }), [2026, 2027]);
  const c = cifrasDeLista(lista, HOY);
  assert.deepEqual([c.proximo?.nombre, c.diasHastaProximo, c.esteAnio, c.siguiente], ['Navidad', 72, 1, 2]);
  assert.equal(cifrasDeLista([], HOY).proximo, null);
});

test('la hoja de calendario y los textos', () => {
  assert.deepEqual(hojaDeCalendario('2026-11-01'), { mes: 'NOV', dia: '01', semana: 'Domingo' });
  assert.equal(textoAnadir(0), 'Marca los que quieras añadir');
  assert.equal(textoAnadir(1), 'Añadir 1 festivo');
  assert.equal(textoAnadir(14), 'Añadir 14 festivos');
  assert.equal(dominioDe('https://www.barcelona.cat/a?b=c'), 'barcelona.cat');
  assert.equal(urlSegura('http://inseguro.es'), null);
  assert.equal(urlSegura('https://user:pass@x.es'), null);
  assert.equal(urlSegura('https://x.es/a b'), null);
  assert.equal(esFecha('2026-02-29'), false);
  assert.equal(esFecha('2028-02-29'), true);
});
