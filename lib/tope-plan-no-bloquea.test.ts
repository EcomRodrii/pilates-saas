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

const CODIGO = () => ['app', 'lib', 'components'].flatMap(d => ficheros(join(RAIZ, d)));

test('ninguna ruta ni módulo bloquea altas por el tope del plan', () => {
  const conTope = CODIGO()
    .filter(f => /LIMITE_SOCIAS|evaluarLimiteSocias|bloqueoPorLimiteSocias|verificar-limite/.test(readFileSync(f, 'utf8')))
    .map(f => relative(RAIZ, f));
  assert.deepEqual(conTope, [], `Vuelve a haber una puerta del tope en: ${conTope.join(', ')}. Hoy no bloquea (1-oct-2026); si hay que frenar, en todas las acciones que hacen Activa a alguien y contando por estado.`);
});

// Los nombres de arriba son los de las puertas que hubo; una nueva podría
// llamarse de otra forma. Por eso, además, una lista cerrada de quién lee el
// tope, cada uno con su motivo: hoy solo se lee para ENSEÑARLO.
const LEEN_EL_TOPE: Record<string, string> = {
  'lib/billing/entitlements.ts': 'lo define, por plan',
  'lib/billing/catalogo-planes.ts': 'la comparativa de planes y el resumen corto del alta',
  'lib/billing/uso-tope.ts': '«N de 150 clientas activas»',
  'app/precios/page.tsx': 'el tope de cada tarjeta de /precios',
  'app/suscripcion/page.tsx': 'enseña cuántas lleva el estudio',
};

test('el tope del plan solo se lee para enseñarlo', () => {
  const nuevos = CODIGO()
    .filter(f => /\bmaxSocios\b/.test(readFileSync(f, 'utf8')))
    .map(f => relative(RAIZ, f))
    .filter(f => !(f in LEEN_EL_TOPE));
  assert.deepEqual(nuevos, [], `Leen el tope del plan (maxSocios) sin estar en LEEN_EL_TOPE: ${nuevos.join(', ')}. Si es para enseñarlo, añádelos con su motivo; si es para frenar altas, eso no se hace hoy (decisión del 1-oct-2026, .claude/tentare-os.md).`);
});
