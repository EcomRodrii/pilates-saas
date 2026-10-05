import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  accionesPosibles, ambitosQueRevisa, destinoDeDenuncia, errorDeResolver, horasHastaTentare, leTocaATentare,
  puedeRevisarDenuncia, textoParaDenunciante,
} from './denuncias.ts';
import { EVENTOS, plantillaDe, render } from '../notifications/catalog.ts';

test('a Tentare cuando el estudio es parte: su hilo con la alumna, o algo escrito por una propietaria', () => {
  assert.equal(destinoDeDenuncia({ ambito: 'CHAT_ESTUDIO', autorEsPropietaria: false }), 'TENTARE');
  assert.equal(destinoDeDenuncia({ ambito: 'CHAT_INSTRUCTORA', autorEsPropietaria: true }), 'TENTARE');
  assert.equal(destinoDeDenuncia({ ambito: 'TABLON', autorEsPropietaria: true }), 'TENTARE');
  assert.equal(destinoDeDenuncia({ ambito: 'CHAT_INSTRUCTORA', autorEsPropietaria: false }), 'ESTUDIO');
  assert.equal(destinoDeDenuncia({ ambito: 'TABLON', autorEsPropietaria: false }), 'ESTUDIO');
});

test('quién revisa: el chat con una instructora, solo la propietaria; el tablón, quien lo modera; el del estudio, nadie del estudio', () => {
  assert.deepEqual(ambitosQueRevisa('PROPIETARIO'), ['CHAT_INSTRUCTORA', 'TABLON']);
  assert.deepEqual(ambitosQueRevisa('MANAGER'), ['TABLON']);
  assert.deepEqual(ambitosQueRevisa('RECEPCION'), ['TABLON']);
  assert.deepEqual(ambitosQueRevisa('INSTRUCTOR'), []);
  for (const rol of ['PROPIETARIO', 'MANAGER', 'RECEPCION', 'INSTRUCTOR'] as const) {
    assert.equal(puedeRevisarDenuncia(rol, 'CHAT_ESTUDIO'), false, rol);
  }
});

test('qué se puede decidir: cerrar solo un chat con instructora y solo la propietaria (o Tentare); retirar, si hay contenido', () => {
  assert.deepEqual(accionesPosibles('PROPIETARIO', { ambito: 'CHAT_INSTRUCTORA', tieneContenido: true }), ['MANTENER', 'OCULTAR', 'CERRAR_CONVERSACION']);
  assert.deepEqual(accionesPosibles('TENTARE', { ambito: 'CHAT_INSTRUCTORA', tieneContenido: false }), ['MANTENER', 'CERRAR_CONVERSACION']);
  assert.deepEqual(accionesPosibles('RECEPCION', { ambito: 'TABLON', tieneContenido: true }), ['MANTENER', 'OCULTAR']);
  assert.deepEqual(accionesPosibles('TENTARE', { ambito: 'CHAT_ESTUDIO', tieneContenido: true }), ['MANTENER', 'OCULTAR']);
});

test('las 24 h: horas que quedan y cuándo le toca a Tentare', () => {
  const ahora = new Date('2026-10-05T12:00:00Z');
  assert.equal(horasHastaTentare('2026-10-05T11:00:00Z', ahora), 23);
  assert.equal(horasHastaTentare('2026-10-04T11:00:00Z', ahora), 0);
  assert.equal(leTocaATentare({ destino: 'ESTUDIO', creadaEn: '2026-10-05T11:00:00Z' }, ahora), false);
  assert.equal(leTocaATentare({ destino: 'ESTUDIO', creadaEn: '2026-10-04T11:59:00Z' }, ahora), true);
  assert.equal(leTocaATentare({ destino: 'TENTARE', creadaEn: '2026-10-05T11:59:00Z' }, ahora), true);
});

test('lo que se le dice a quien denunció, sin el texto denunciado', () => {
  assert.equal(textoParaDenunciante('CONTENIDO_OCULTO', 'TABLON'), 'hemos retirado el comentario.');
  assert.equal(textoParaDenunciante('CONTENIDO_OCULTO', 'CHAT_INSTRUCTORA'), 'hemos retirado el mensaje.');
  assert.equal(textoParaDenunciante('CONVERSACION_CERRADA', 'CHAT_INSTRUCTORA'), 'hemos cerrado la conversación.');
  assert.match(textoParaDenunciante('MANTENIDA', 'TABLON'), /no incumple las normas/);
});

test('los errores de la RPC se traducen y los demás no', () => {
  assert.equal(errorDeResolver({ message: 'DENUNCIA_NO_EXISTE' })?.status, 404);
  assert.equal(errorDeResolver({ message: 'DENUNCIA_YA_RESUELTA' })?.status, 409);
  assert.equal(errorDeResolver({ message: 'ACCION_INVALIDA' })?.status, 400);
  assert.equal(errorDeResolver({ message: 'otra cosa' }), null);
});

test('los avisos de moderación se pintan enteros, a la app correcta y sin huecos', () => {
  const datos = { slug: 'pilates-luz', ambito: 'CHAT_INSTRUCTORA', conversacionId: 'cv1', resultado: 'hemos retirado el mensaje.', queTuyo: 'un mensaje tuyo', queDenuncia: 'Han denunciado un mensaje.' };
  const socia = plantillaDe(EVENTOS.DENUNCIA_RESUELTA, 'SOCIA')!;
  assert.equal(render(socia.body, datos), 'Hemos revisado tu denuncia: hemos retirado el mensaje.');
  assert.equal(socia.deepLink?.(datos), '/portal/pilates-luz/mensajes/cv1');
  const instructora = plantillaDe(EVENTOS.CONTENIDO_RETIRADO, 'INSTRUCTOR')!;
  assert.equal(render(instructora.body, datos), 'Se ha retirado un mensaje tuyo por no cumplir las normas de la comunidad.');
  assert.equal(instructora.deepLink?.(datos), '/portal/pilates-luz/equipo/mensajes/cv1');
  assert.equal(plantillaDe(EVENTOS.CONTENIDO_RETIRADO, 'SOCIA')!.deepLink?.({ ...datos, ambito: 'TABLON' }), '/portal/pilates-luz/comunidad');
  const nueva = plantillaDe(EVENTOS.DENUNCIA_NUEVA, 'PROPIETARIO')!;
  assert.doesNotMatch(render(nueva.body, datos), /\{|\}/);
  assert.equal(nueva.deepLink?.(datos), '/dashboard#decidir-denuncias');
});

// ── Las rutas del panel comprueban el rol en el servidor ─────────────────────

const RAIZ = join(import.meta.dirname, '..', '..');
const leer = (r: string) => readFileSync(join(RAIZ, r), 'utf8');

test('las rutas de moderación del panel exigen sesión de equipo y su permiso', () => {
  assert.match(leer('app/api/moderacion/denuncias/route.ts'), /verificarSesionStaff\(req\)/);
  const decidir = leer('app/api/moderacion/denuncias/[id]/route.ts');
  assert.match(decidir, /verificarSesionStaff\(req\)/);
  assert.match(decidir, /revisor: \{ tipo: 'ESTUDIO', rol: sesion\.rol, userId: sesion\.userId \}/);
  assert.match(leer('app/api/comunidad/comentarios/[id]/retirar/route.ts'), /if \(!puedeModerarComunidad\(sesion\.rol\)\)/);
  assert.match(leer('app/api/mensajeria/conversaciones/[id]/cerrar/route.ts'), /if \(sesion\.rol !== 'PROPIETARIO'\)/);
  // El estudio comprueba ámbito y acción ANTES de llamar a la RPC; la RPC vuelve a comprobar.
  const servidor = leer('lib/moderacion/denuncias-servidor.ts');
  const comprobacion = servidor.indexOf('puedeRevisarDenuncia(p.revisor.rol');
  assert.ok(comprobacion > 0 && servidor.indexOf(".rpc('resolver_denuncia'") > comprobacion);
  // Cerrar solo un chat instructora–alumna, nunca el hilo con el estudio.
  assert.match(servidor, /\.eq\('tipo', 'ALUMNA_INSTRUCTORA'\)/);
});
