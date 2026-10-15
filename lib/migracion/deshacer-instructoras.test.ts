import test from 'node:test';
import assert from 'node:assert/strict';
import { deshacerBatch } from './batches.ts';

// «Deshacer migración» borra lo que CREÓ el lote. Una instructora que creó el
// importador y la propietaria ya completó (email, cuenta vinculada, otro rol) deja
// de serlo: borrarla se llevaría su vínculo de acceso y el preflight de la
// cascada no lo ve (esas ediciones no dejan filas hijas).

function admin(opts: { instructoras: string[]; protegidas: string[]; fallaLectura?: boolean; borrados: { tabla: string; ids: string[] }[] }) {
  return {
    rpc: () => Promise.resolve({ data: [], error: null }),
    from(tabla: string) {
      if (tabla === 'migracion_batches') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { ids_creados: { instructores: opts.instructoras }, deshecho_en: null }, error: null }) }) }) }),
          update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
        };
      }
      return {
        select: () => ({ in: (_c: string, ids: string[]) => ({ eq: () => ({
          or: () => Promise.resolve(opts.fallaLectura
            ? { data: null, error: { message: 'boom' } }
            : { data: ids.filter(i => opts.protegidas.includes(i)).map(id => ({ id })), error: null }),
        }) }) }),
        delete: () => ({ in: (_c: string, t: string[]) => ({ eq: () => ({ select: () => { opts.borrados.push({ tabla, ids: t }); return Promise.resolve({ data: t.map(id => ({ id })), error: null }); } }) }) }),
      };
    },
  } as never;
}

test('no se borran las instructoras que la propietaria ya completó, y se cuentan', async () => {
  const borrados: { tabla: string; ids: string[] }[] = [];
  const r = await deshacerBatch(admin({ instructoras: ['inst-1', 'inst-2', 'inst-3'], protegidas: ['inst-2'], borrados }), { studioId: 'st-1', batchId: 'mig-abcdef' });
  assert.equal(r.ok, true);
  assert.deepEqual(borrados, [{ tabla: 'instructores', ids: ['inst-1', 'inst-3'] }]);
  assert.equal(r.instructorasConservadas, 1);
});

test('si todas están completadas no se borra ninguna', async () => {
  const borrados: { tabla: string; ids: string[] }[] = [];
  const r = await deshacerBatch(admin({ instructoras: ['inst-1'], protegidas: ['inst-1'], borrados }), { studioId: 'st-1', batchId: 'mig-abcdef' });
  assert.equal(r.ok, true);
  assert.deepEqual(borrados, []);
  assert.equal(r.instructorasConservadas, 1);
});

test('sin protegidas no hay aviso y se borran todas', async () => {
  const borrados: { tabla: string; ids: string[] }[] = [];
  const r = await deshacerBatch(admin({ instructoras: ['inst-1'], protegidas: [], borrados }), { studioId: 'st-1', batchId: 'mig-abcdef' });
  assert.equal(r.ok, true);
  assert.equal(r.instructorasConservadas, undefined);
  assert.equal(borrados[0].ids.length, 1);
});

test('si no se puede comprobar, falla CERRADO: no borra', async () => {
  const borrados: { tabla: string; ids: string[] }[] = [];
  const r = await deshacerBatch(admin({ instructoras: ['inst-1'], protegidas: [], fallaLectura: true, borrados }), { studioId: 'st-1', batchId: 'mig-abcdef' });
  assert.equal(r.ok, false);
  assert.deepEqual(borrados, []);
});
