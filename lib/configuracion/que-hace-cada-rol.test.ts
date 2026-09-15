import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { QUE_HACE_CADA_ROL } from './que-hace-cada-rol.ts';
import {
  ETIQUETA_ROL, puedeGestionarClientas, puedeGestionarEquipo, puedeMoverDinero, puedeVer, puedeVerFichaClinica,
  puedeVerSemaforo, rolesQuePuedeAsignar,
} from '../permisos-reglas.ts';
import { urlAppInstructora } from '../avisos/app-instructora.ts';
import type { Rol } from '../types.ts';

// Cada frase de «Qué puede hacer cada rol» es una afirmación sobre las reglas de
// permisos. Aquí se comprueba cada una contra la regla de la que sale: si mañana
// recepción entra en Informes, este test falla antes de que la pantalla mienta.

const RAIZ = join(import.meta.dirname, '../..');
const detalle = (rol: Rol) => QUE_HACE_CADA_ROL.find(r => r.rol === rol)!.detalle;
const OTROS: Rol[] = ['MANAGER', 'RECEPCION', 'INSTRUCTOR'];

test('los cuatro roles, de quien más puede a quien menos, con el nombre que tienen en Equipo', () => {
  assert.deepEqual(QUE_HACE_CADA_ROL.map(r => r.rol), ['PROPIETARIO', 'MANAGER', 'RECEPCION', 'INSTRUCTOR']);
  for (const r of QUE_HACE_CADA_ROL) assert.equal(r.titulo, ETIQUETA_ROL[r.rol].label);
});

test('propietaria: todo, cobros incluidos, y es el único rol en Configuración, Informes y Automatizaciones', () => {
  assert.match(detalle('PROPIETARIO'), /cobros incluidos/);
  for (const ruta of ['/configuracion', '/informes', '/automatizaciones', '/cobros', '/equipo']) {
    assert.equal(puedeVer('PROPIETARIO', ruta), true, ruta);
  }
  for (const ruta of ['/configuracion', '/informes', '/automatizaciones']) {
    for (const rol of OTROS) assert.equal(puedeVer(rol, ruta), false, `${rol} ${ruta}`);
  }
});

test('responsable de sede: agenda, alumnas, sustituciones y equipo; da de alta a recepción e instructoras; ni cobros, ni informes, ni Configuración', () => {
  for (const ruta of ['/calendario', '/clientas', '/sustituciones', '/equipo']) assert.equal(puedeVer('MANAGER', ruta), true, ruta);
  assert.equal(puedeGestionarClientas('MANAGER'), true);
  assert.equal(puedeGestionarEquipo('MANAGER'), true);
  assert.deepEqual(rolesQuePuedeAsignar('MANAGER'), ['RECEPCION', 'INSTRUCTOR']);
  for (const ruta of ['/cobros', '/informes', '/configuracion']) assert.equal(puedeVer('MANAGER', ruta), false, ruta);
  assert.equal(puedeMoverDinero('MANAGER'), false);
  assert.equal(puedeVerSemaforo('MANAGER'), true);
  assert.equal(puedeVerFichaClinica('MANAGER'), false);
  assert.match(detalle('MANAGER'), /No ve cobros, informes ni Configuración/);
  assert.match(detalle('MANAGER'), /solo el color del semáforo/);
});

test('recepción: agenda, alumnas y cobros; de la salud solo el semáforo; ni Equipo, ni Informes, ni Configuración', () => {
  for (const ruta of ['/calendario', '/clientas', '/cobros']) assert.equal(puedeVer('RECEPCION', ruta), true, ruta);
  assert.equal(puedeGestionarClientas('RECEPCION'), true);
  assert.equal(puedeMoverDinero('RECEPCION'), true);
  assert.equal(puedeVerSemaforo('RECEPCION'), true);
  assert.equal(puedeVerFichaClinica('RECEPCION'), false);
  for (const ruta of ['/equipo', '/informes', '/configuracion']) assert.equal(puedeVer('RECEPCION', ruta), false, ruta);
  assert.match(detalle('RECEPCION'), /no entra en Equipo, Informes ni Configuración/);
});

test('instructora: ninguna pantalla del panel, y lo que dice de su app existe', () => {
  for (const ruta of ['/dashboard', '/calendario', '/clientas', '/configuracion']) assert.equal(puedeVer('INSTRUCTOR', ruta), false, ruta);
  assert.equal(urlAppInstructora('pilates-centro'), '/portal/pilates-centro/equipo');
  for (const pantalla of ['agenda', 'disponibilidad', 'alumnas']) {
    assert.ok(existsSync(join(RAIZ, 'app/portal/[slug]/equipo', pantalla, 'page.tsx')), `falta la pantalla «${pantalla}» de su app`);
  }
  assert.ok(existsSync(join(RAIZ, 'lib/student/baja-instructora.ts')), 'sus bajas en la app');
});

test('corto, y dice «alumna» e «instructora»', () => {
  for (const r of QUE_HACE_CADA_ROL) {
    assert.ok(r.detalle.length <= 200, `${r.rol}: ${r.detalle.length} caracteres`);
    assert.ok(r.detalle.endsWith('.'), r.rol);
    assert.doesNotMatch(r.detalle, /\b(client|soci|profesor)as?\b/i, r.rol);
  }
});
