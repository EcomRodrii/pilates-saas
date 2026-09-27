import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VINCULOS_CUENTA } from './borrado-cuenta.ts';
import { borrarCuentaSiQuedaSuelta } from './cuenta-acceso-servidor.ts';

// El helper que decide si la cuenta de acceso de alguien suprimido se borra (socia o equipo).
// Fail-closed: borrar de más deja a una dueña o a una instructora sin poder entrar.

function adminFalso(o: { vinculos?: Record<string, number | 'error'>; errorBorrado?: { message?: string; status?: number; code?: string } | 'lanza' }) {
  const borrados: string[] = [];
  const consultas: string[] = [];
  return {
    borrados, consultas,
    admin: {
      from(tabla: string) {
        return {
          select(columna: string) {
            return {
              eq(_c: string, _v: string) {
                const clave = VINCULOS_CUENTA.find(v => v.tabla === tabla && v.columna === columna)?.clave ?? `${tabla}.${columna}`;
                consultas.push(clave);
                const r = o.vinculos?.[clave] ?? 0;
                return Promise.resolve(r === 'error' ? { count: null, error: { message: 'boom' } } : { count: r, error: null });
              },
            };
          },
        };
      },
      auth: {
        admin: {
          deleteUser(id: string) {
            borrados.push(id);
            if (o.errorBorrado === 'lanza') throw new Error('red caída');
            return Promise.resolve({ error: o.errorBorrado ?? null });
          },
        },
      },
    } as never,
  };
}

test('sin ningún otro vínculo, la cuenta se borra', async () => {
  const { admin, borrados, consultas } = adminFalso({});
  const r = await borrarCuentaSiQuedaSuelta(admin, 'uid-1', 'test');
  assert.deepEqual(borrados, ['uid-1']);
  assert.deepEqual(r, { pendiente: null, conservada: false });
  // Se comprueban TODOS los vínculos declarados.
  assert.equal(new Set(consultas).size, VINCULOS_CUENTA.length);
});

test('con otro vínculo (otra sede, socia, dueña…) la cuenta se CONSERVA a propósito: no borra ni es un pendiente', async () => {
  for (const clave of ['instructora', 'otras_fichas_socia', 'duena_estudio', 'perfil_network']) {
    const { admin, borrados } = adminFalso({ vinculos: { [clave]: 1 } });
    const r = await borrarCuentaSiQuedaSuelta(admin, 'uid-1', 'test');
    assert.deepEqual(borrados, [], clave);
    assert.deepEqual(r, { pendiente: null, conservada: true }, clave);
  }
});

test('un recuento que no se pudo hacer NO da vía libre: queda pendiente y no se borra nada', async () => {
  const { admin, borrados } = adminFalso({ vinculos: { instructora: 'error' } });
  const r = await borrarCuentaSiQuedaSuelta(admin, 'uid-1', 'test');
  assert.deepEqual(borrados, []);
  assert.equal(r.conservada, false);
  assert.equal(r.pendiente?.tercero, 'cuenta_acceso');
  assert.equal(r.pendiente?.ref, 'uid-1');
  assert.match(r.pendiente?.motivo ?? '', /No se pudieron comprobar sus otros vínculos/);
});

test('una cuenta que ya no existe es el resultado que se quiere; un fallo de verdad queda pendiente', async () => {
  const yaNoExiste = adminFalso({ errorBorrado: { message: 'User not found', status: 404, code: 'user_not_found' } });
  assert.deepEqual(await borrarCuentaSiQuedaSuelta(yaNoExiste.admin, 'uid-1', 'test'), { pendiente: null, conservada: false });
});
