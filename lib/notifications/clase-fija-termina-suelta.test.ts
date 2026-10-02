// «Tu clase fija termina pronto» también para las plazas SIN clase fija con nombre (dadas desde una clase suelta o a mano):
// mismo evento, mismo canal, y sin prometer lo que no existe (una plaza suelta no se «amplía»: al terminar se vuelve a pedir).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EVENTOS, plantillaDe, render } from './catalog.ts';

const RAIZ = join(import.meta.dirname, '..', '..');
const leer = (r: string) => readFileSync(join(RAIZ, r), 'utf8');

const plantilla = () => {
  const p = plantillaDe(EVENTOS.CLASE_FIJA_TERMINA_PRONTO, 'SOCIA');
  assert.ok(p, 'sin plantilla para la alumna');
  return p;
};
const cuerpo = (data: Record<string, unknown>) => render(plantilla().body, data);

test('una clase fija con nombre sigue diciendo que se puede ampliar (el texto de siempre)', () => {
  const d = { nombre: 'Reformer · martes y jueves', hasta: '12 nov', slug: 'tentare', cierre: 'Amplíala desde tu app si quieres seguir teniéndola.', destino: 'clases-fijas' };
  assert.equal(cuerpo(d), '«Reformer · martes y jueves» termina el 12 nov. Amplíala desde tu app si quieres seguir teniéndola.');
  assert.equal(plantilla().deepLink?.(d), '/portal/tentare/clases-fijas');
});

test('⚠️ una plaza suelta NO promete ampliarla: dice que al terminar se vuelve a pedir, y lleva a sus clases fijas', () => {
  const d = { nombre: 'Reformer · miércoles 10:00', hasta: '12 nov', slug: 'tentare', cierre: 'Cuando termine, podrás volver a pedirla desde su ficha.', destino: 'mis-clases' };
  const texto = cuerpo(d);
  assert.equal(texto, '«Reformer · miércoles 10:00» termina el 12 nov. Cuando termine, podrás volver a pedirla desde su ficha.');
  assert.ok(!/ampl/i.test(texto), 'no se puede ampliar una plaza suelta');
  assert.equal(plantilla().deepLink?.(d), '/portal/tentare/mis-reservas?tab=fijas');
});

test('un aviso viejo (sin «cierre» ni «destino») no se rompe: sale sin esa frase y con el enlace de siempre', () => {
  const d = { nombre: 'Reformer · martes y jueves', hasta: '12 nov', slug: 'tentare' };
  assert.equal(cuerpo(d).trim(), '«Reformer · martes y jueves» termina el 12 nov.');
  assert.equal(plantilla().deepLink?.(d), '/portal/tentare/clases-fijas');
});

test('el emisor da a cada caso su frase, su destino y su clave (una por alumna y fecha, no una por plaza)', () => {
  const emit = leer('lib/notifications/emit.ts');
  const f = emit.slice(emit.indexOf('export async function emitirClaseFijaTerminaPronto'), emit.indexOf('// Reserva pendiente de aprobar'));
  assert.match(f, /conNombre \? 'Amplíala desde tu app si quieres seguir teniéndola\.' : 'Cuando termine, podrás volver a pedirla desde su ficha\.'/);
  assert.match(f, /destino: conNombre \? 'clases-fijas' : 'mis-clases'/);
  assert.match(f, /`clase-fija-termina-pronto:\$\{p\.claseFijaId\}:\$\{p\.socioId\}:\$\{p\.hasta\}`/, 'la clave de las clases con nombre no cambia: no se repite ningún aviso ya enviado');
  assert.match(f, /`plaza-fija-termina-pronto:\$\{p\.socioId\}:\$\{p\.hasta\}:\$\{\(p\.plazaIds \?\? \[\]\)\.join\(','\)\}`/);
});

test('⚠️ el cron avisa de las plazas sueltas en su ventana, solo las vivas y solo las que SÍ tienen fecha, sin tocar las de clase fija con nombre', () => {
  const cron = leer('lib/notificaciones/clase-fija-termina-cron.ts');
  const sueltas = cron.slice(cron.indexOf('async function avisarPlazasSueltas'));
  assert.match(sueltas, /\.in\('estado', \['ACTIVA', 'PAUSADA'\]\)/);
  assert.match(sueltas, /\.is\('clase_fija_id', null\)/, 'solo las SIN clase fija con nombre: esas ya las cubre su propio aviso');
  assert.match(sueltas, /\.gte\('vigencia_hasta', hoy\)\.lte\('vigencia_hasta', limite\)/, 'sin fecha de fin no hay nada que avisar');
  assert.match(sueltas, /agruparTerminanPronto\(plazas\)/, 'un aviso por alumna y fecha');
  const ofertas = cron.slice(cron.indexOf('async function avisarOfertasConNombre'), cron.indexOf('async function avisarPlazasSueltas'));
  assert.match(ofertas, /\.not\('clase_fija_id', 'is', null\)/, 'las de clase fija con nombre siguen como estaban');
  assert.match(cron, /DIAS_AVISO_CLASE_FIJA_TERMINA/, 'la misma ventana para los dos');
});
