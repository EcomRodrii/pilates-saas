import { test } from 'node:test';
import assert from 'node:assert/strict';
import { limpiarHuerfanosTrasRegistrar, purgarDocumentoResuelto, suprimirPerfilNetwork } from './documentos-servidor.ts';
import type { ObjetoCarpeta } from './supresion-documentos.ts';

// Cliente service_role FALSO: lo justo para seguir el ORDEN de las operaciones
// y simular que Storage o la BD dicen que no. Lo que se prueba aquí es que
// nunca se devuelve éxito si algo falló, y que la fila no se borra antes que
// los documentos.

const UID = '11111111-2222-3333-4444-555555555555';

interface Estado {
  perfil: { id: string } | null;
  errorPerfil?: boolean;
  carpeta: ObjetoCarpeta[];
  falloRemoveEn?: string;       // bucket cuyo remove falla
  removeNoBorra?: boolean;      // remove dice que sí pero el objeto sigue ahí
  falloList?: boolean;
  referencias?: { documento_path: string | null; documento_path_reverso?: string | null }[];
  errorReferencias?: boolean;
  countDelete?: number;
  errorInsertAuditoria?: boolean;
}

function fake(estado: Estado) {
  const log: string[] = [];
  const removes: { bucket: string; paths: string[] }[] = [];
  const updates: { table: string; cambios: Record<string, unknown>; filtros: Record<string, unknown> }[] = [];
  const inserts: { table: string; row: Record<string, unknown> }[] = [];

  const storage = {
    from(bucket: string) {
      return {
        async list(_prefix: string, opts: { offset: number }) {
          log.push(`list:${bucket}`);
          if (estado.falloList) return { data: null, error: { message: 'list falló' } };
          return { data: opts.offset > 0 ? [] : [...estado.carpeta], error: null };
        },
        async remove(paths: string[]) {
          log.push(`remove:${bucket}`);
          removes.push({ bucket, paths });
          if (estado.falloRemoveEn === bucket) return { data: null, error: { message: 'remove falló' } };
          const nombres = new Set(paths.map(p => p.split('/').pop()));
          const borrados = bucket === 'red-documentos-identidad' ? estado.carpeta.filter(o => nombres.has(o.name)) : paths.map(name => ({ name }));
          if (bucket === 'red-documentos-identidad' && !estado.removeNoBorra) {
            estado.carpeta = estado.carpeta.filter(o => !nombres.has(o.name));
          }
          return { data: borrados, error: null };
        },
      };
    },
  };

  function from(table: string) {
    const q = { op: 'select', filtros: {} as Record<string, unknown>, cambios: {} as Record<string, unknown>, row: {} as Record<string, unknown> };
    const resolver = (): unknown => {
      if (q.op === 'select' && table === 'red_perfiles') {
        return estado.errorPerfil ? { data: null, error: { message: 'x' } } : { data: estado.perfil, error: null };
      }
      if (q.op === 'select') {
        return estado.errorReferencias ? { data: null, error: { message: 'x' } } : { data: estado.referencias ?? [], error: null };
      }
      if (q.op === 'delete') {
        log.push(`delete:${table}`);
        return { data: null, error: null, count: estado.countDelete ?? 1 };
      }
      if (q.op === 'update') {
        log.push(`update:${table}`);
        updates.push({ table, cambios: q.cambios, filtros: q.filtros });
        return { data: null, error: null };
      }
      log.push(`insert:${table}`);
      inserts.push({ table, row: q.row });
      return { data: null, error: estado.errorInsertAuditoria ? { message: 'x' } : null };
    };
    const b = {
      select: () => b,
      eq: (k: string, v: unknown) => { q.filtros[k] = v; return b; },
      delete: () => { q.op = 'delete'; return b; },
      update: (c: Record<string, unknown>) => { q.op = 'update'; q.cambios = c; return b; },
      insert: (r: Record<string, unknown>) => { q.op = 'insert'; q.row = r; return b; },
      maybeSingle: () => Promise.resolve(resolver()),
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(resolver()).then(ok, ko),
    };
    return b;
  }

  return { admin: { storage, from } as never, log, removes, updates, inserts };
}

const doc = (name: string): ObjetoCarpeta => ({ name, id: `id-${name}`, created_at: '2026-09-01T00:00:00Z' });

// ─── Supresión del perfil ────────────────────────────────────────────────────

test('suprimir: borra documentos y foto ANTES de la fila, y deja un registro sin datos personales', async () => {
  const f = fake({
    perfil: { id: 'red-1' },
    carpeta: [doc('identidad-anverso-1.jpg'), doc('identidad-reverso-2.jpg'), doc('portfolio-3.webp'), { name: 'carpeta', id: null }],
  });
  const r = await suprimirPerfilNetwork(f.admin, UID);

  assert.deepEqual(r, { ok: true, perfilId: 'red-1', documentosBorrados: 3, fotoBorrada: true });
  assert.deepEqual(f.removes[0], {
    bucket: 'red-documentos-identidad',
    paths: [`${UID}/identidad-anverso-1.jpg`, `${UID}/identidad-reverso-2.jpg`, `${UID}/portfolio-3.webp`],
  });
  assert.deepEqual(f.removes[1], { bucket: 'avatars', paths: ['network-red-1'] });
  assert.ok(f.log.indexOf('delete:red_perfiles') > f.log.lastIndexOf('remove:avatars'), 'la fila se borra después de Storage');

  const auditoria = f.inserts.find(i => i.table === 'plataforma_auditoria')!;
  assert.equal(auditoria.row.actor_auth_user_id, null);
  assert.equal(auditoria.row.accion, 'network.perfil.suprimido');
  assert.ok(!JSON.stringify(auditoria.row).includes(UID), 'el registro no lleva la cuenta');
  assert.equal('ip' in auditoria.row || 'user_agent' in auditoria.row, false);
});

test('suprimir: si Storage no borra los documentos, NO se toca la fila y no se anuncia éxito', async () => {
  const f = fake({ perfil: { id: 'red-1' }, carpeta: [doc('identidad-1.jpg')], falloRemoveEn: 'red-documentos-identidad' });
  const r = await suprimirPerfilNetwork(f.admin, UID);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.codigo, 'STORAGE');
  assert.ok(!f.log.includes('delete:red_perfiles'));
});

test('suprimir: si la foto pública no se borra, tampoco se borra la fila', async () => {
  const f = fake({ perfil: { id: 'red-1' }, carpeta: [], falloRemoveEn: 'avatars' });
  const r = await suprimirPerfilNetwork(f.admin, UID);
  assert.equal(r.ok === false && r.codigo, 'STORAGE');
  assert.ok(!f.log.includes('delete:red_perfiles'));
});

test('suprimir: Storage dice que sí pero la carpeta sigue con ficheros → no se da por hecho', async () => {
  const f = fake({ perfil: { id: 'red-1' }, carpeta: [doc('identidad-1.jpg')], removeNoBorra: true });
  const r = await suprimirPerfilNetwork(f.admin, UID);
  assert.equal(r.ok === false && r.codigo, 'STORAGE');
  assert.ok(!f.log.includes('delete:red_perfiles'));
});

test('suprimir: si no se puede listar la carpeta, no se borra nada', async () => {
  const f = fake({ perfil: { id: 'red-1' }, carpeta: [doc('identidad-1.jpg')], falloList: true });
  const r = await suprimirPerfilNetwork(f.admin, UID);
  assert.equal(r.ok === false && r.codigo, 'STORAGE');
  assert.equal(f.removes.length, 0);
});

test('suprimir: la fila no se borra (0 filas) → error honesto, aunque Storage ya esté limpio', async () => {
  const f = fake({ perfil: { id: 'red-1' }, carpeta: [], countDelete: 0 });
  const r = await suprimirPerfilNetwork(f.admin, UID);
  assert.equal(r.ok === false && r.codigo, 'FILA');
});

test('suprimir: sin perfil no toca Storage', async () => {
  const f = fake({ perfil: null, carpeta: [doc('identidad-1.jpg')] });
  const r = await suprimirPerfilNetwork(f.admin, UID);
  assert.equal(r.ok === false && r.codigo, 'SIN_PERFIL');
  assert.equal(f.removes.length, 0);
});

test('suprimir: si falla el registro de auditoría, la supresión ya hecha sigue siendo un éxito', async () => {
  const f = fake({ perfil: { id: 'red-1' }, carpeta: [], errorInsertAuditoria: true });
  const r = await suprimirPerfilNetwork(f.admin, UID);
  assert.equal(r.ok, true);
});

// ─── Documento al resolver ───────────────────────────────────────────────────

test('resolver identidad: borra anverso y reverso y luego anula los paths con la fecha del borrado', async () => {
  const f = fake({ perfil: null, carpeta: [doc('identidad-anverso-1.jpg'), doc('identidad-reverso-2.jpg')] });
  const r = await purgarDocumentoResuelto(f.admin, {
    tipo: 'identidad', id: 'redveri-1', conservar: false,
    fila: { documento_path: `${UID}/identidad-anverso-1.jpg`, documento_path_reverso: `${UID}/identidad-reverso-2.jpg` },
  });
  assert.deepEqual(r, { documentoBorrado: true });
  assert.deepEqual(f.removes[0].paths, [`${UID}/identidad-anverso-1.jpg`, `${UID}/identidad-reverso-2.jpg`]);
  const u = f.updates[0];
  assert.equal(u.table, 'red_verificaciones_identidad');
  assert.equal(u.cambios.documento_path, null);
  assert.equal(u.cambios.documento_path_reverso, null);
  assert.ok(typeof u.cambios.documento_borrado_en === 'string');
  assert.deepEqual(u.filtros, { id: 'redveri-1' });
});

test('resolver: si Storage falla, la fila conserva el path (reintentable) y no se dice «borrado»', async () => {
  const f = fake({ perfil: null, carpeta: [], falloRemoveEn: 'red-documentos-identidad' });
  const r = await purgarDocumentoResuelto(f.admin, { tipo: 'certificacion', id: 'redcert-1', conservar: false, fila: { documento_path: `${UID}/certificacion-1.pdf` } });
  assert.deepEqual(r, { documentoBorrado: false });
  assert.equal(f.updates.length, 0);
});

test('resolver: con la decisión de conservar, ni Storage ni fila', async () => {
  const f = fake({ perfil: null, carpeta: [] });
  const r = await purgarDocumentoResuelto(f.admin, { tipo: 'certificacion', id: 'redcert-1', conservar: true, fila: { documento_path: `${UID}/certificacion-1.pdf` } });
  assert.deepEqual(r, { documentoBorrado: false });
  assert.equal(f.removes.length + f.updates.length, 0);
});

// ─── Huérfanos al volver a subir ─────────────────────────────────────────────

test('volver a subir identidad: se borra solo la subida anterior que quedó sin fila', async () => {
  const f = fake({
    perfil: null,
    carpeta: [doc('identidad-anverso-1.jpg'), doc('identidad-anverso-2.jpg'), doc('identidad-reverso-3.jpg'), doc('certificacion-4.pdf')],
    referencias: [{ documento_path: `${UID}/identidad-anverso-2.jpg`, documento_path_reverso: `${UID}/identidad-reverso-3.jpg` }],
  });
  const n = await limpiarHuerfanosTrasRegistrar(f.admin, { authUserId: UID, perfilId: 'red-1', prefijo: 'identidad', margenMs: 0 });
  assert.equal(n, 1);
  assert.deepEqual(f.removes[0].paths, [`${UID}/identidad-anverso-1.jpg`]);
});

test('volver a subir: si no se pueden leer las referencias, no se borra nada', async () => {
  const f = fake({ perfil: null, carpeta: [doc('identidad-anverso-1.jpg')], errorReferencias: true });
  const n = await limpiarHuerfanosTrasRegistrar(f.admin, { authUserId: UID, perfilId: 'red-1', prefijo: 'identidad', margenMs: 0 });
  assert.equal(n, 0);
  assert.equal(f.removes.length, 0);
});
