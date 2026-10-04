import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VINCULOS_CUENTA, type RecuentoVinculos } from '../socios/borrado-cuenta.ts';
import {
  MENSAJE_NO_BORRABLE, PALABRA_BORRAR_CUENTA, confirmaBorrarCuenta, decidirAutoborrado,
} from './borrar-cuenta.ts';
import { borrarMiCuenta } from './borrar-cuenta-servidor.ts';

// «Borrar mi cuenta de Tentare» (App Store 5.1.1(v)): quién puede borrarse desde
// la app de la alumna, y que el servidor no da nada por borrado sin confirmarlo.

const ceros = (): RecuentoVinculos => Object.fromEntries(VINCULOS_CUENTA.map((v) => [v.clave, 0]));

test('la palabra: BORRAR, con o sin mayúsculas y espacios; nada más', () => {
  assert.equal(PALABRA_BORRAR_CUENTA, 'BORRAR');
  for (const ok of ['BORRAR', 'borrar', ' Borrar ']) assert.equal(confirmaBorrarCuenta(ok), true, ok);
  for (const no of ['', 'BORRA', 'BORRAR CUENTA', 'borrár', null, undefined, 1, 'B'.repeat(60)]) {
    assert.equal(confirmaBorrarCuenta(no), false, String(no));
  }
});

test('solo alumna: se puede borrar, tenga una ficha o varias', () => {
  assert.deepEqual(decidirAutoborrado(ceros()), { borrar: true });
  assert.deepEqual(decidirAutoborrado({ ...ceros(), otras_fichas_socia: 3 }), { borrar: true });
});

test('dueña, equipo, plataforma o Network: no se borra por aquí, cada una con su motivo', () => {
  const casos: Array<[string, string]> = [
    ['duena_estudio', 'propietaria'], ['duena_cadena', 'propietaria'],
    ['instructora', 'equipo'],
    ['admin_plataforma', 'plataforma'], ['permiso_plataforma', 'plataforma'],
    ['perfil_network', 'network'], ['perfil_network_alumna', 'network'], ['network_resenas', 'network'],
  ];
  for (const [clave, motivo] of casos) {
    const r = decidirAutoborrado({ ...ceros(), otras_fichas_socia: 1, [clave]: 1 });
    assert.deepEqual(r, { borrar: false, motivo, vinculos: [clave] }, clave);
  }
});

test('con varias cosas, manda la que más hay que resolver: dueña antes que equipo', () => {
  const r = decidirAutoborrado({ ...ceros(), instructora: 2, duena_estudio: 1 });
  assert.equal(r.borrar, false);
  assert.equal(!r.borrar && r.motivo, 'propietaria');
});

test('fail-closed: un recuento que falta o falló no da vía libre (salvo el de sus fichas, que se deshacen)', () => {
  const sinInstructora: RecuentoVinculos = { ...ceros(), instructora: null };
  assert.deepEqual(decidirAutoborrado(sinInstructora), { borrar: false, motivo: 'no_verificable', sinComprobar: ['instructora'] });
  const { duena_cadena: _quitado, ...faltaUno } = ceros();
  assert.deepEqual(decidirAutoborrado(faltaUno), { borrar: false, motivo: 'no_verificable', sinComprobar: ['duena_cadena'] });
  assert.deepEqual(decidirAutoborrado({ ...ceros(), otras_fichas_socia: null }), { borrar: true });
});

test('cada motivo tiene su mensaje, y el de equipo dice qué hacer', () => {
  for (const m of ['propietaria', 'equipo', 'plataforma', 'network', 'no_verificable'] as const) {
    assert.ok(MENSAJE_NO_BORRABLE[m].length > 20, m);
  }
  assert.match(MENSAJE_NO_BORRABLE.equipo, /elimine del equipo/);
  assert.match(MENSAJE_NO_BORRABLE.no_verificable, /No se ha borrado nada/);
});

// ── El servidor, con un admin falso ──────────────────────────────────────────

type Falso = {
  vinculos?: Record<string, number | 'error'>;
  errorAvisos?: boolean;
  errorFichas?: boolean;
  errorBorrado?: { message?: string; status?: number; code?: string };
  sigueExistiendo?: boolean;
};

function adminFalso(o: Falso = {}) {
  const pasos: string[] = [];
  const admin = {
    from(tabla: string) {
      return {
        select(columna: string) {
          return {
            eq(_c: string, _v: string) {
              const clave = VINCULOS_CUENTA.find((v) => v.tabla === tabla && v.columna === columna)?.clave ?? `${tabla}.${columna}`;
              const r = o.vinculos?.[clave] ?? 0;
              return Promise.resolve(r === 'error' ? { count: null, error: { message: 'boom' } } : { count: r, error: null });
            },
          };
        },
        delete() {
          return {
            eq(c: string, v: string) {
              pasos.push(`delete ${tabla} ${c}=${v}`);
              return Promise.resolve({ error: o.errorAvisos ? { message: 'avisos caídos' } : null });
            },
          };
        },
        update(valores: Record<string, unknown>) {
          return {
            eq(c: string, v: string) {
              pasos.push(`update ${tabla} ${JSON.stringify(valores)} ${c}=${v}`);
              return Promise.resolve({ error: o.errorFichas ? { message: 'fichas caídas' } : null });
            },
          };
        },
      };
    },
    auth: {
      admin: {
        deleteUser(id: string) {
          pasos.push(`deleteUser ${id}`);
          return Promise.resolve({ error: o.errorBorrado ?? null });
        },
        getUserById(id: string) {
          pasos.push(`getUserById ${id}`);
          return Promise.resolve(o.sigueExistiendo
            ? { data: { user: { id } }, error: null }
            : { data: { user: null }, error: { status: 404, code: 'user_not_found', message: 'User not found' } });
        },
      },
    },
  };
  return { admin: admin as never, pasos };
}

test('alumna: quita sus avisos, desvincula sus fichas, borra la cuenta y lo confirma — solo la suya', async () => {
  const { admin, pasos } = adminFalso({ vinculos: { otras_fichas_socia: 2 } });
  assert.deepEqual(await borrarMiCuenta(admin, 'uid-1', { esperaBaseMs: 0 }), { ok: true });
  assert.deepEqual(pasos, [
    'delete push_subscription user_id=uid-1',
    'update socios {"auth_user_id":null} auth_user_id=uid-1',
    'deleteUser uid-1',
    'getUserById uid-1',
  ]);
});

test('dueña o equipo: no se escribe NADA', async () => {
  for (const clave of ['duena_estudio', 'instructora']) {
    const { admin, pasos } = adminFalso({ vinculos: { [clave]: 1 } });
    const r = await borrarMiCuenta(admin, 'uid-1', { esperaBaseMs: 0 });
    assert.equal(r.ok, false, clave);
    assert.deepEqual(pasos, [], clave);
  }
});

test('un recuento caído: no_verificable y no se escribe nada', async () => {
  const { admin, pasos } = adminFalso({ vinculos: { instructora: 'error' } });
  const r = await borrarMiCuenta(admin, 'uid-1', { esperaBaseMs: 0 });
  assert.deepEqual(r, { ok: false, motivo: 'no_verificable', vinculos: ['instructora'] });
  assert.deepEqual(pasos, []);
});

test('si falla un paso, se para ahí y no dice que está borrada', async () => {
  const avisos = adminFalso({ errorAvisos: true });
  assert.deepEqual(await borrarMiCuenta(avisos.admin, 'uid-1', { esperaBaseMs: 0 }),
    { ok: false, motivo: 'fallo', paso: 'avisos', error: 'avisos caídos' });
  assert.equal(avisos.pasos.some((p) => p.startsWith('deleteUser')), false);

  const fichas = adminFalso({ errorFichas: true });
  const rf = await borrarMiCuenta(fichas.admin, 'uid-1', { esperaBaseMs: 0 });
  assert.equal(rf.ok === false && rf.motivo === 'fallo' && rf.paso, 'fichas');
  assert.equal(fichas.pasos.some((p) => p.startsWith('deleteUser')), false);

  const auth = adminFalso({ errorBorrado: { status: 500, message: 'auth caído' } });
  const ra = await borrarMiCuenta(auth.admin, 'uid-1', { esperaBaseMs: 0 });
  assert.equal(ra.ok === false && ra.motivo === 'fallo' && ra.paso, 'cuenta');
  assert.equal(auth.pasos.filter((p) => p.startsWith('deleteUser')).length, 3, 'reintenta');
});

test('Auth dice «sin error» pero la cuenta sigue ahí: NO está borrada', async () => {
  const { admin } = adminFalso({ sigueExistiendo: true });
  const r = await borrarMiCuenta(admin, 'uid-1', { esperaBaseMs: 0 });
  assert.equal(r.ok === false && r.motivo === 'fallo' && r.paso, 'confirmar');
});

test('reintentar tras un borrado que ya ocurrió es seguro: «ya no existe» cuenta como hecho', async () => {
  const { admin } = adminFalso({ errorBorrado: { status: 404, code: 'user_not_found', message: 'User not found' } });
  assert.deepEqual(await borrarMiCuenta(admin, 'uid-1', { esperaBaseMs: 0 }), { ok: true });
});

// ── La ruta: identidad del JWT, con el segundo paso, y nada del cuerpo ───────

test('la ruta identifica con verificarUsuarioSupabase, exige la palabra y limita intentos', () => {
  const src = readFileSync(new URL('../../app/api/public/cuenta/borrar/route.ts', import.meta.url), 'utf8');
  assert.match(src, /verificarUsuarioSupabase\(req\)/);
  assert.doesNotMatch(src, /sinSegundoPaso/);
  assert.match(src, /enforceRateLimit\(/);
  assert.match(src, /confirmaBorrarCuenta\(/);
  assert.match(src, /borrarMiCuenta\(admin, user\.userId/);
  // Del cuerpo solo se lee la confirmación: ningún id.
  assert.doesNotMatch(src, /body\??\.(userId|authUserId|user_id|socioId|id)\b/);
});
