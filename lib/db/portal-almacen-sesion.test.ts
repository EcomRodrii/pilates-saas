import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// `window` falso ANTES de importar el módulo: lee `typeof window` al llamarse,
// no al cargarse, pero así el orden queda explícito y el test no depende de eso.
class Almacen {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  get tamano() { return this.m.size; }
}
const local = new Almacen();
const sesion = new Almacen();
(globalThis as unknown as { window: unknown }).window = { localStorage: local, sessionStorage: sesion };

const { almacenSesionPortal, recuerdaSesion, fijarRecordarSesion } = await import('./portal-almacen-sesion.ts');

const CLAVE = 'sb-portal-auth';

beforeEach(() => {
  for (const a of [local, sesion]) { a.removeItem(CLAVE); a.removeItem('sb-portal-recordar'); }
});

test('por defecto RECUERDA — el comportamiento de antes no cambia', () => {
  assert.equal(recuerdaSesion(), true);
});

test('recordando, la sesión va a localStorage y sobrevive al cierre del navegador', () => {
  fijarRecordarSesion(true);
  almacenSesionPortal.setItem(CLAVE, 'token-1');
  assert.equal(local.getItem(CLAVE), 'token-1');
  assert.equal(sesion.getItem(CLAVE), null);
});

test('SIN recordar, la sesión va a sessionStorage y muere con la pestaña', () => {
  fijarRecordarSesion(false);
  almacenSesionPortal.setItem(CLAVE, 'token-2');
  assert.equal(sesion.getItem(CLAVE), 'token-2');
  assert.equal(local.getItem(CLAVE), null, 'no debe quedar copia en localStorage');
});

test('nunca deja DOS copias vivas', () => {
  fijarRecordarSesion(true);
  almacenSesionPortal.setItem(CLAVE, 'token-a');
  fijarRecordarSesion(false);
  almacenSesionPortal.setItem(CLAVE, 'token-b');
  assert.equal(local.getItem(CLAVE), null);
  assert.equal(sesion.getItem(CLAVE), 'token-b');
});

test('al leer mira TAMBIÉN el otro almacén: cambiar el interruptor no echa a nadie', () => {
  // Entró recordando; luego desmarca. La sesión sigue en localStorage y debe
  // encontrarse igual — desloguear a alguien por tocar un ajuste sería absurdo.
  fijarRecordarSesion(true);
  almacenSesionPortal.setItem(CLAVE, 'token-viva');
  local.setItem(CLAVE, 'token-viva');
  (globalThis as unknown as { window: { localStorage: Almacen } }).window.localStorage.setItem('sb-portal-recordar', '0');
  assert.equal(almacenSesionPortal.getItem(CLAVE), 'token-viva');
});

test('fijarRecordarSesion MUDA la sesión en curso, no solo la preferencia', () => {
  // Sin la mudanza, desmarcar dejaría el token en localStorage y seguiría
  // sobreviviendo al cierre: el interruptor diría una cosa y el navegador otra.
  fijarRecordarSesion(true);
  almacenSesionPortal.setItem(CLAVE, 'token-mudanza');
  fijarRecordarSesion(false);
  assert.equal(sesion.getItem(CLAVE), 'token-mudanza', 'debe haberse mudado a sessionStorage');
  assert.equal(local.getItem(CLAVE), null, 'no debe quedar en localStorage');
});

test('y muda de vuelta al volver a marcar', () => {
  fijarRecordarSesion(false);
  almacenSesionPortal.setItem(CLAVE, 'token-vuelta');
  fijarRecordarSesion(true);
  assert.equal(local.getItem(CLAVE), 'token-vuelta');
  assert.equal(sesion.getItem(CLAVE), null);
});

test('cerrar sesión borra de LOS DOS almacenes', () => {
  // Dejar una copia en el almacén inactivo resucitaría la sesión al volver a
  // cambiar el interruptor.
  local.setItem(CLAVE, 'token-x');
  sesion.setItem(CLAVE, 'token-x');
  almacenSesionPortal.removeItem(CLAVE);
  assert.equal(local.getItem(CLAVE), null);
  assert.equal(sesion.getItem(CLAVE), null);
});

test('sin sesión previa, cambiar la preferencia no inventa una', () => {
  fijarRecordarSesion(false);
  assert.equal(local.getItem(CLAVE), null);
  assert.equal(sesion.getItem(CLAVE), null);
});
