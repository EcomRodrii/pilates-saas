import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estudioNacioConAltaNueva } from './bienvenida-nueva-servidor.ts';

// `/api/estudio/interruptores` enciende `altaNueva` para el estudio que nació del
// alta nueva. Esa ruta contesta también a los demás interruptores: esto no
// puede lanzar nunca.

type Fila = Record<string, unknown> | null;

function adminFalso(o: { estudio?: Fila; alta?: Fila; errorEstudio?: boolean; errorAlta?: boolean; revienta?: boolean }) {
  const pedidas: { tabla: string; columna: string; valor: string }[] = [];
  const admin = {
    from(tabla: string) {
      if (o.revienta) throw new Error('sin red');
      return {
        select: () => ({
          eq: (columna: string, valor: string) => ({
            maybeSingle: async () => {
              pedidas.push({ tabla, columna, valor });
              if (tabla === 'studios') return o.errorEstudio ? { data: null, error: { message: 'x' } } : { data: o.estudio ?? null, error: null };
              return o.errorAlta ? { data: null, error: { message: 'x' } } : { data: o.alta ?? null, error: null };
            },
          }),
        }),
      };
    },
  };
  return { admin: admin as unknown as Parameters<typeof estudioNacioConAltaNueva>[0], pedidas };
}

const ESTUDIO = { owner_auth_user_id: 'u-1', cadena_id: null };

test('mira la versión del alta de la DUEÑA del estudio de la sesión', async () => {
  const { admin, pedidas } = adminFalso({ estudio: ESTUDIO, alta: { version: 'v2' } });
  assert.equal(await estudioNacioConAltaNueva(admin, 's-1'), true);
  assert.deepEqual(pedidas, [
    { tabla: 'studios', columna: 'id', valor: 's-1' },
    { tabla: 'altas_estudio', columna: 'auth_user_id', valor: 'u-1' },
  ]);
  assert.equal(await estudioNacioConAltaNueva(adminFalso({ estudio: ESTUDIO, alta: { version: 'v2_prueba' } }).admin, 's-1'), true);
});

test('el alta de siempre, sin fila de alta o una sede de cadena: la bienvenida de siempre', async () => {
  assert.equal(await estudioNacioConAltaNueva(adminFalso({ estudio: ESTUDIO, alta: { version: 'v1' } }).admin, 's-1'), false);
  assert.equal(await estudioNacioConAltaNueva(adminFalso({ estudio: ESTUDIO, alta: null }).admin, 's-1'), false);
  const sede = adminFalso({ estudio: { owner_auth_user_id: 'u-1', cadena_id: 'c-1' }, alta: { version: 'v2' } });
  assert.equal(await estudioNacioConAltaNueva(sede.admin, 's-2'), false);
  assert.equal(sede.pedidas.length, 1, 'una sede de cadena ni siquiera pregunta por el alta');
});

test('si algo falla, `false` y nunca lanza', async () => {
  assert.equal(await estudioNacioConAltaNueva(adminFalso({ errorEstudio: true }).admin, 's-1'), false);
  assert.equal(await estudioNacioConAltaNueva(adminFalso({ estudio: ESTUDIO, errorAlta: true }).admin, 's-1'), false);
  assert.equal(await estudioNacioConAltaNueva(adminFalso({ revienta: true }).admin, 's-1'), false);
  assert.equal(await estudioNacioConAltaNueva(adminFalso({ estudio: null }).admin, 's-1'), false);
});
