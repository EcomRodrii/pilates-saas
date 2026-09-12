import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rebotesDeEmails } from './rebotes-consulta.ts';

// Un `SupabaseClient` de mentira que apunta lo que se le pidió, para poder
// afirmar sobre la consulta y no solo sobre el resultado.
function fakeAdmin(filas: { email: string; tipo: string }[]) {
  const visto: { tabla?: string; pedidos?: string[]; llamadas: number } = { llamadas: 0 };
  const admin = {
    from(tabla: string) {
      visto.tabla = tabla;
      return {
        select() {
          return {
            in(_col: string, valores: string[]) {
              visto.llamadas++;
              visto.pedidos = valores;
              return Promise.resolve({ data: filas.filter(f => valores.includes(f.email)) });
            },
          };
        },
      };
    },
  };
  return { admin: admin as unknown as Parameters<typeof rebotesDeEmails>[0], visto };
}

test('normaliza al preguntar: una ficha con mayúsculas encuentra su rebote', async () => {
  const { admin, visto } = fakeAdmin([{ email: 'maria@gmail.com', tipo: 'REBOTE' }]);
  const rotos = await rebotesDeEmails(admin, ['Maria@Gmail.COM']);

  assert.deepEqual(visto.pedidos, ['maria@gmail.com']);
  // Y la clave del resultado también va normalizada: quien la consulta lo hace
  // con `normalizarEmail(socio.email)`, no con lo que tenga escrito la ficha.
  assert.equal(rotos.get('maria@gmail.com'), 'REBOTE');
});

test('sin correos que preguntar NO va a la base de datos', async () => {
  const { admin, visto } = fakeAdmin([]);
  const rotos = await rebotesDeEmails(admin, [null, undefined, '', '   ']);

  assert.equal(visto.llamadas, 0, 'una ida y vuelta para preguntar por nada');
  assert.equal(rotos.size, 0);
});

test('deduplica: dos socias con el mismo correo se preguntan una vez', async () => {
  const { admin, visto } = fakeAdmin([]);
  await rebotesDeEmails(admin, ['a@b.com', 'A@B.com', 'a@b.com']);

  assert.deepEqual(visto.pedidos, ['a@b.com']);
});

test('una dirección sana no aparece en el mapa', async () => {
  const { admin } = fakeAdmin([{ email: 'rota@x.com', tipo: 'SUPRIMIDO' }]);
  const rotos = await rebotesDeEmails(admin, ['rota@x.com', 'sana@x.com']);

  assert.equal(rotos.get('rota@x.com'), 'SUPRIMIDO');
  assert.equal(rotos.has('sana@x.com'), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// El guardia que de verdad importa, y que un test de comportamiento no puede
// ver: `email_rebotes` es GLOBAL, así que una ruta que aceptara una lista de
// correos del cliente sería un oráculo — cualquiera con sesión de personal
// podría preguntar «¿rebota esta dirección?» por correos de otros estudios o
// de gente que no es clienta de nadie. Las direcciones tienen que salir de
// `socios` acotado al estudio de la sesión, dentro del propio servidor.
//
// Se comprueba leyendo el fichero porque el defecto sería justo lo contrario
// de lo que hace el código: no hay nada que ejecutar que lo destape. Mismo
// criterio que `paginas.test.ts` con las guardias de origen.
// ─────────────────────────────────────────────────────────────────────────────
test('⚠️ la ruta NO acepta correos del cliente: los saca de `socios` del estudio', () => {
  const src = readFileSync(new URL('../../app/api/clientas/rebotes/route.ts', import.meta.url), 'utf8');

  assert.match(src, /export async function GET/, 'debe ser de solo lectura (GET), sin cuerpo');
  assert.doesNotMatch(src, /req\.json\(\)/, 'leer un cuerpo es el primer paso para aceptar una lista ajena');
  assert.doesNotMatch(src, /searchParams/, 'tampoco por query string');
  assert.match(src, /from\('socios'\)/, 'las direcciones salen de socios');
  assert.match(src, /eq\('studio_id', sesion\.studioId\)/, 'acotadas al estudio de la SESIÓN');
  assert.match(src, /verificarSesionStaff/, 'y detrás de una sesión de personal');
});
