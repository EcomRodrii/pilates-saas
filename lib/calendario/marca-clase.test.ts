import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claseEnFiltro, marcaDeClase, primerNombre, resumenDeVista, textoResumen, type ClaseParaResumen, type DatosMarca } from './marca-clase.ts';

// Jueves 1 de octubre de 2026, 10:40 en Madrid.
const AHORA = new Date('2026-10-01T08:40:00.000Z');

function clase(p: Partial<DatosMarca> = {}): DatosMarca {
  return {
    estado: 'PROGRAMADA', inicio: '2026-10-01T16:00:00.000Z', fin: '2026-10-01T16:50:00.000Z',
    instructora: 'Lucía Gómez', confirmadas: 3, asistidas: 0, noVinieron: 0, enEspera: 0, aforo: 6, fijas: 0,
    floja: false, esSiguiente: false, ...p,
  };
}

test('una sola marca, la más importante: sin cubrir gana a floja y a la lista de espera', () => {
  const m = marcaDeClase(clase({ estado: 'SIN_INSTRUCTORA', floja: true, enEspera: 2, ausencia: { tipo: 'VACACIONES' } }), AHORA);
  assert.equal(m.aviso?.tipo, 'sin-cubrir');
  assert.equal(m.aviso?.texto, 'Sin cubrir');
  assert.equal(m.aviso?.detalle, 'Sin instructora · de vacaciones');
  assert.equal(m.extra, null);
});

test('sin instructora dice en qué punto está la sustitución', () => {
  assert.equal(marcaDeClase(clase({ estado: 'SIN_INSTRUCTORA', sustitucionEstado: 'contactando' }), AHORA).aviso?.texto, 'Buscando sustituta');
  assert.equal(marcaDeClase(clase({ estado: 'SIN_INSTRUCTORA', sustitucionEstado: 'pendiente_aprobacion' }), AHORA).aviso?.texto, 'Espera tu visto bueno');
  assert.equal(marcaDeClase(clase({ estado: 'SIN_INSTRUCTORA', sustitucionEstado: 'agotada' }), AHORA).aviso?.texto, 'Nadie ha aceptado');
  assert.equal(
    marcaDeClase(clase({ estado: 'SIN_INSTRUCTORA', instructoraInactiva: true }), AHORA).aviso?.detalle,
    'Sin instructora · ya no está en el equipo',
  );
});

test('una clase que ya pasó sin instructora no pide nada', () => {
  const pasada = clase({ estado: 'SIN_INSTRUCTORA', inicio: '2026-10-01T06:00:00.000Z', fin: '2026-10-01T06:50:00.000Z', asistidas: 4 });
  assert.equal(marcaDeClase(pasada, AHORA).aviso?.texto, '4 vinieron');
});

test('en curso y la siguiente llevan el nombre de pila de quien la da', () => {
  assert.equal(marcaDeClase(clase({ estado: 'EN_CURSO' }), AHORA).aviso?.texto, 'En curso · Lucía');
  const siguiente = clase({ inicio: '2026-10-01T09:00:00.000Z', fin: '2026-10-01T09:50:00.000Z', esSiguiente: true, instructora: 'Irene Sanz' });
  assert.deepEqual(marcaDeClase(siguiente, AHORA).aviso, { tipo: 'siguiente', texto: 'en 20 min · Irene', corto: 'en 20 min' });
});

test('la siguiente solo se anuncia si empieza pronto', () => {
  const tarde = clase({ esSiguiente: true }); // 18:00, dentro de más de 7 h
  const m = marcaDeClase(tarde, AHORA);
  assert.equal(m.aviso, null);
});

test('terminada: cuántas vinieron, o que no vino nadie', () => {
  const base = { estado: 'FINALIZADA' as const, inicio: '2026-10-01T06:00:00.000Z', fin: '2026-10-01T06:50:00.000Z' };
  assert.equal(marcaDeClase(clase({ ...base, asistidas: 5 }), AHORA).aviso?.texto, '5 vinieron');
  assert.equal(marcaDeClase(clase({ ...base, asistidas: 1 }), AHORA).aviso?.texto, '1 vino');
  assert.equal(marcaDeClase(clase({ ...base, asistidas: 0, noVinieron: 2 }), AHORA).aviso?.texto, 'No vino nadie');
  assert.deepEqual(marcaDeClase(clase({ ...base, confirmadas: 0 }), AHORA), { aviso: null, extra: null });
});

test('sin aviso, a la derecha va lo que más importa: floja, espera, llena o fijas', () => {
  assert.equal(marcaDeClase(clase({ floja: true, enEspera: 1 }), AHORA).extra?.texto, 'floja');
  assert.equal(marcaDeClase(clase({ enEspera: 2, confirmadas: 6 }), AHORA).extra?.texto, '+2 en espera');
  assert.equal(marcaDeClase(clase({ confirmadas: 6 }), AHORA).extra?.texto, 'llena');
  assert.equal(marcaDeClase(clase({ fijas: 3 }), AHORA).extra?.texto, '3 fijas');
  assert.equal(marcaDeClase(clase({ fijas: 1 }), AHORA).extra?.texto, '1 fija');
  assert.equal(marcaDeClase(clase(), AHORA).extra, null);
});

test('incidencia y choque dicen qué pasa', () => {
  assert.equal(marcaDeClase(clase({ estado: 'INCIDENCIA', incidenciaTexto: 'Reformer 3 sin muelle' }), AHORA).aviso?.texto, 'Reformer 3 sin muelle');
  assert.equal(marcaDeClase(clase({ estado: 'CONFLICTO' }), AHORA).aviso?.texto, 'Choca con otra clase');
  assert.equal(marcaDeClase(clase({ estado: 'SIN_PASAR_LISTA' }), AHORA).aviso?.texto, 'Pasar lista');
  assert.equal(marcaDeClase(clase({ estado: 'CANCELADA' }), AHORA).aviso?.texto, 'Cancelada');
});

test('primerNombre aguanta nombres vacíos', () => {
  assert.equal(primerNombre('  Marta  Ruiz '), 'Marta');
  assert.equal(primerNombre(null), '');
});

function cr(p: Partial<ClaseParaResumen> = {}): ClaseParaResumen {
  return { id: 'c', estado: 'PROGRAMADA', cancelada: false, terminada: false, floja: false, enEspera: 0, confirmadas: 3, aforo: 6, sobreaforo: false, ...p };
}

test('el resumen cuenta con la misma regla con la que resalta', () => {
  const clases = [
    cr({ id: 'a', estado: 'SIN_INSTRUCTORA' }),
    cr({ id: 'b', estado: 'SIN_INSTRUCTORA', terminada: true }), // ya pasó: no cuenta
    cr({ id: 'c', estado: 'SIN_PASAR_LISTA', terminada: true }),
    cr({ id: 'd', floja: true }),
    cr({ id: 'e', enEspera: 2, confirmadas: 6 }),
    cr({ id: 'f', cancelada: true, estado: 'CANCELADA', floja: true }),
  ];
  const r = resumenDeVista(clases);
  assert.equal(r.clases, 5);
  assert.deepEqual(r.cifras.map(c => [c.filtro, c.n]), [['sin-cubrir', 1], ['pasar-lista', 1], ['flojas', 1], ['espera', 1]]);
  for (const cifra of r.cifras) {
    assert.equal(clases.filter(c => claseEnFiltro(c, cifra.filtro)).length, cifra.n);
  }
});

test('la ocupación no pasa del 100 % por una clase con más gente que aforo', () => {
  const r = resumenDeVista([cr({ confirmadas: 8, aforo: 6 }), cr({ confirmadas: 0, aforo: 6 })]);
  assert.equal(r.ocupacion, 0.5);
  assert.equal(textoResumen(r), '2 clases · 50 % de ocupación');
  assert.equal(textoResumen(resumenDeVista([])), 'Sin clases');
});
