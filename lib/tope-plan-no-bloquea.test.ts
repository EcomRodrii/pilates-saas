import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// El tope de clientas del plan (150 alumnas activas en Base) se ENSEÑA en
// Suscripción y hoy no bloquea ninguna alta: decisión del fundador del
// 1-oct-2026, en `.claude/tentare-os.md`.
//
// Lo que había bloqueaba contando las fichas no dadas de baja (interesadas e
// inactivas de hace años incluidas), que no son las «alumnas activas» que
// promete el plan. Y solo en algunas puertas: las Activas nacen al asignar un
// plan, vender en caja, reactivar o descongelar, que no tenían ninguna.
//
// Cuando haga falta frenar, irá en TODAS las acciones de mostrador que hacen
// Activa a alguien, con una sola función dueña que cuente por estado. Esta
// prueba existe para que nadie vuelva a poner una puerta suelta que cuente
// otra cosa.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..');

function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap(nombre => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return nombre === 'node_modules' ? [] : ficheros(ruta);
    return /\.(ts|tsx)$/.test(nombre) && !/\.test\.ts$/.test(nombre) ? [ruta] : [];
  });
}

test('ninguna ruta ni módulo bloquea altas por el tope del plan', () => {
  const conTope = ['app', 'lib', 'components']
    .flatMap(d => ficheros(join(RAIZ, d)))
    .filter(f => /LIMITE_SOCIAS|evaluarLimiteSocias|bloqueoPorLimiteSocias|verificar-limite/.test(readFileSync(f, 'utf8')))
    .map(f => relative(RAIZ, f));
  assert.deepEqual(conTope, [], `Vuelve a haber una puerta del tope en: ${conTope.join(', ')}. Hoy no bloquea (1-oct-2026); si hay que frenar, en todas las acciones que hacen Activa a alguien y contando por estado.`);
});
