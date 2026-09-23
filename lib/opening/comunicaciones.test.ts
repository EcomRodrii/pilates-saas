import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  borradorFinEtapa, borradorInvitadas, borradorVentaEtapa, diasParaFinEtapa, enlaceReservas,
  hrefMensajeria, leerBorradorMensajeria, tocaAvisarAbrimos, tocaRecordarFinEtapa,
} from './comunicaciones.ts';
import { detectarAlertas } from './alertas.ts';
import type { AnalisisCapacidad } from './capacidad.ts';
import type { EtapaVista } from './etapas.ts';

const etapa = (p: Partial<EtapaVista> = {}): EtapaVista => ({
  id: 'e1', etapa: 'FUNDADORA', planId: 'p1', planNombre: 'Cuota Fundadora', desde: '2026-10-01', hasta: '2026-10-20',
  limitePlazas: 10, alCompletar: 'AVISAR', cerrada: false, cerradaMotivo: null, ventas: 4, ...p,
});
const ENLACE = 'https://tentare.app/reservar/mi-estudio';

test('el borrador viaja por URL y vuelve igual, con saltos de línea y tildes', () => {
  const b = borradorVentaEtapa(etapa(), 'Estudio Luz', ENLACE);
  const url = hrefMensajeria(b);
  assert.ok(url.startsWith('/mensajeria?'));
  assert.deepEqual(leerBorradorMensajeria(url.split('?')[1]), b);
});

test('un segmento que el motor de campañas no entiende no rellena nada', () => {
  assert.equal(leerBorradorMensajeria('segmento=CUALQUIERA&asunto=x&mensaje=y'), null);
  assert.equal(leerBorradorMensajeria('asunto=x'), null);
  assert.equal(leerBorradorMensajeria('segmento=ETAPA:interesada'), null);
  assert.ok(leerBorradorMensajeria('segmento=ETIQUETA:apertura-suave'));
  assert.ok(leerBorradorMensajeria('segmento=TODAS'));
});

test('los borradores llevan a quién, la etapa, la fecha y el enlace de reservas', () => {
  const v = borradorVentaEtapa(etapa(), 'Estudio Luz', ENLACE);
  assert.equal(v.segmento, 'ETAPA:INTERESADA');
  assert.match(v.mensaje, /Fundadora.*Cuota Fundadora.*20 de octubre.*Hay 10 plazas/s);
  assert.ok(v.mensaje.includes(ENLACE));
  assert.match(borradorFinEtapa(etapa(), 'Estudio Luz', ENLACE).mensaje, /Quedan 6 plazas/);
  const inv = borradorInvitadas('2026-11-02', 'Estudio Luz', ENLACE);
  assert.equal(inv.segmento, 'ETIQUETA:apertura-suave');
  assert.match(inv.mensaje, /2 de noviembre/);
});

test('fin de etapa: solo en los últimos 3 días, en curso y con plazas por vender', () => {
  assert.equal(diasParaFinEtapa(etapa(), '2026-10-17'), 3);
  assert.equal(diasParaFinEtapa(etapa(), '2026-10-20'), 0);
  assert.equal(diasParaFinEtapa(etapa(), '2026-10-21'), null);
  assert.equal(diasParaFinEtapa(etapa({ cerrada: true }), '2026-10-18'), null);
  assert.equal(tocaRecordarFinEtapa(etapa(), '2026-10-16'), false);
  assert.equal(tocaRecordarFinEtapa(etapa(), '2026-10-17'), true);
  assert.equal(tocaRecordarFinEtapa(etapa({ ventas: 10 }), '2026-10-18'), false);
  assert.equal(tocaRecordarFinEtapa(etapa({ limitePlazas: null }), '2026-10-18'), true);
});

const analisis = { riesgo: 'VERDE', ocupacionPrevista: 0.5, ventana: { dias: 42 } } as unknown as AnalisisCapacidad;
const alertas = (hoy: string | undefined, e = etapa()) => detectarAlertas({
  diasHastaApertura: 30, analisis, etapas: [e], planActivo: new Map([['p1', true]]), objetivoPreventa: 0, hoy,
});

test('alerta ETAPA_TERMINA: propone el recordatorio y lleva a la etapa; sin día, no se evalúa', () => {
  const [a] = alertas('2026-10-19');
  assert.equal(a.tipo, 'ETAPA_TERMINA:e1');
  assert.equal(a.severidad, 'BAJA');
  assert.match(a.titulo, /termina mañana/);
  assert.match(a.descripcion, /quedan 6 plazas/);
  assert.equal(a.href, '/dashboard#etapas-lanzamiento');
  assert.deepEqual(alertas(undefined), []);
  assert.deepEqual(alertas('2026-10-10'), []);
});

test('«abrimos mañana» solo encendido, la víspera y con fecha exacta', () => {
  assert.equal(tocaAvisarAbrimos({ encendido: true, diasHastaApertura: 1, fechaAproximada: false }), true);
  assert.equal(tocaAvisarAbrimos({ encendido: false, diasHastaApertura: 1, fechaAproximada: false }), false);
  assert.equal(tocaAvisarAbrimos({ encendido: true, diasHastaApertura: 2, fechaAproximada: false }), false);
  assert.equal(tocaAvisarAbrimos({ encendido: true, diasHastaApertura: 0, fechaAproximada: false }), false);
  assert.equal(tocaAvisarAbrimos({ encendido: true, diasHastaApertura: 1, fechaAproximada: true }), false);
});

test('enlaceReservas apunta a /reservar/{slug}: tentare.app/{slug} a secas da 404', () => {
  // Fuera del navegador cae al dominio canónico. El alta enseñaba
  // «tentare.app/{slug}» justo cuando la propietaria iba a compartirlo.
  assert.equal(enlaceReservas('mi-estudio'), 'https://www.tentare.app/reservar/mi-estudio');
  assert.equal(enlaceReservas('a b'), 'https://www.tentare.app/reservar/a%20b');
});
