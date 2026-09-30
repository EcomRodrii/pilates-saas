import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ACCESO_NETWORK_EN_MANTENIMIENTO,
  MENSAJE_ACCESO_NETWORK_CERRADO,
  MENSAJE_ALTA_NETWORK_CERRADA,
} from './mantenimiento.ts';

// El cierre de Network no se queda en las pantallas: crear un perfil NUEVO
// también lo rechaza el servidor, y editar el que ya existe no. El handler
// necesita Supabase y una sesión, que `node --test` no monta, así que se lee el
// texto de la ruta (mismo recurso que otros tests de `app/api/`).
const ruta = readFileSync(new URL('../../app/api/network/perfil/route.ts', import.meta.url), 'utf8');

function cuerpoDe(metodo: 'GET' | 'PUT' | 'DELETE'): string {
  const i = ruta.indexOf(`export async function ${metodo}(`);
  assert.ok(i >= 0, `no se encontró ${metodo}`);
  const siguiente = ruta.indexOf('\nexport async function ', i + 1);
  return ruta.slice(i, siguiente === -1 ? undefined : siguiente);
}

test('PUT rechaza CREAR un perfil con el interruptor cerrado, y solo si no existe ya', () => {
  const put = cuerpoDe('PUT');
  const guardia = put.match(/if \(([^)]*ACCESO_NETWORK_EN_MANTENIMIENTO[^)]*)\) return errorPeticion\(MENSAJE_ALTA_NETWORK_CERRADA, 503\);/);
  assert.ok(guardia, 'PUT no rechaza el alta con 503 cuando Network está cerrado.');
  assert.match(
    guardia[1],
    /!existente\s*&&\s*ACCESO_NETWORK_EN_MANTENIMIENTO/,
    'la guardia tiene que aplicarse SOLO al alta (sin perfil previo): con un perfil existente, editar sigue abierto.',
  );
});

test('la guardia va antes de geocodificar y antes de escribir', () => {
  const put = cuerpoDe('PUT');
  const guardia = put.indexOf('ACCESO_NETWORK_EN_MANTENIMIENTO');
  const geocodificar = put.indexOf('geocodificarDireccion(');
  const insertar = put.indexOf('.insert(');
  assert.ok(guardia >= 0 && geocodificar >= 0 && insertar >= 0);
  assert.ok(guardia < geocodificar, 'se consulta a un tercero para un alta que se va a rechazar.');
  assert.ok(guardia < insertar, 'la guardia llega después del INSERT.');
});

test('el aviso del servidor es el mismo texto que enseña la pantalla', () => {
  const pagina = readFileSync(new URL('../../app/network/crear-perfil/page.tsx', import.meta.url), 'utf8');
  assert.match(pagina, /MENSAJE_ALTA_NETWORK_CERRADA/, 'crear-perfil ya no usa el aviso compartido.');
  assert.ok(!pagina.includes('temporalmente cerrada'), 'crear-perfil vuelve a llevar el aviso escrito a mano.');
  const acceso = readFileSync(new URL('../../app/network/acceso/page.tsx', import.meta.url), 'utf8');
  assert.match(acceso, /MENSAJE_ACCESO_NETWORK_CERRADO/, 'acceso ya no usa el aviso compartido.');
  assert.ok(!acceso.includes('temporalmente cerrado'), 'acceso vuelve a llevar el aviso escrito a mano.');
});

test('los avisos existen y dicen que es temporal', () => {
  assert.equal(typeof ACCESO_NETWORK_EN_MANTENIMIENTO, 'boolean');
  for (const m of [MENSAJE_ACCESO_NETWORK_CERRADO, MENSAJE_ALTA_NETWORK_CERRADA]) {
    assert.match(m, /temporalmente cerrad/);
  }
});
