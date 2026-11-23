import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// La caché de lecturas de equipo (lib/auth-server.ts) no puede crecer sin que
// se note: tope de TTL, `sesion_activa` fuera (cambiar de sede se ve al
// instante) y los fallos no se cachean.
const src = readFileSync('lib/auth-server.ts', 'utf8');

test('TTL corto, y sesion_activa sigue leyéndose en cada petición', () => {
  const ttl = Number(/const TTL_EQUIPO_MS = ([\d_]+);/.exec(src)?.[1].replace(/_/g, ''));
  assert.ok(ttl > 0 && ttl <= 15_000, `TTL ${ttl} ms: una baja o «exigir verificación» no puede tardar más en notarse`);
  const cuerpo = src.slice(src.indexOf('function lecturasDeEquipoCacheadas'), src.indexOf('async function resolverConUsuario'));
  assert.ok(!cuerpo.includes('sesion_activa'), 'la sede activa no se cachea');
  assert.ok(src.includes("db.from('sesion_activa')"), 'sesion_activa se lee fuera de la caché');
  assert.ok(/r\.fallo[\s\S]*cacheEquipo\.delete/.test(cuerpo), 'un fallo no se queda en la caché');
});
