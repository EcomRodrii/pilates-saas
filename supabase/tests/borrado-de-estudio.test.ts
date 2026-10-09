// Borrar un estudio (migración 20261009120000), contra Postgres de verdad (job `calidad-rls`).
//
//  · el «review boost» (valoración y recompensa) NO bloquea el borrado y sobrevive como
//    histórico con `studio_id` a NULL (antes: 23503 por `review_boost_feedback_studio_id_fkey`);
//  · RED DE SEGURIDAD: ninguna FK nueva a `studios` puede quedarse en NO ACTION/RESTRICT sin
//    que alguien lo decida. Las que hoy bloquean están listadas abajo, cada una con su motivo.
//
// Ver `supabase/tests/rls-invariantes.test.ts` para por qué este fichero vive en `supabase/tests/`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clienteAdminLocal, crearStudioConPropietaria, limpiarFixtures, sqlLocal } from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();
const sql = sqlLocal();
test.after(async () => { await sql.end(); });

/**
 * FK a `studios` que HOY bloquean el borrado (NO ACTION o RESTRICT), con el motivo.
 *
 *  · verifactu_*: RESTRICT a propósito. Son registros fiscales con obligación de conservación;
 *    un estudio con registros no se borra, se da de baja.
 *  · el resto: NO ACTION sin decidir (se crearon sin `ON DELETE`, y su otro padre —socios,
 *    suscripciones, salas, recibos— tampoco cascada). Bloquean si el estudio tiene filas en
 *    ellas. Cada una necesita una decisión de negocio (borrar con el estudio o conservar como
 *    histórico), igual que se hizo con el review boost. Al decidirla, se SACA de esta lista.
 */
const BLOQUEAN_A_PROPOSITO = [
  'verifactu_decisiones_anteriores', 'verifactu_envios', 'verifactu_estudios',
  'verifactu_registros', 'verifactu_representacion_eventos', 'verifactu_representaciones',
];
const BLOQUEAN_SIN_DECIDIR = [
  'avisos_hueco', 'bloqueos_maquina', 'congelaciones', 'mandatos_sepa', 'pagos_historicos',
  'penalizaciones', 'plazas_fijas', 'recuperaciones', 'socio_excepciones',
];

test('ninguna FK nueva a studios bloquea el borrado sin que se haya decidido', async () => {
  const filas = await sql<{ tabla: string; accion: string }[]>`
    select c.conrelid::regclass::text as tabla, c.confdeltype::text as accion
      from pg_constraint c
     where c.contype = 'f' and c.confrelid = 'public.studios'::regclass and c.confdeltype in ('a', 'r')
     order by 1`;
  const hoy = filas.map(f => f.tabla).sort();
  const esperado = [...BLOQUEAN_A_PROPOSITO, ...BLOQUEAN_SIN_DECIDIR].sort();
  assert.deepEqual(hoy, esperado,
    'Una FK a studios sin ON DELETE (o RESTRICT) bloquea el borrado del estudio. Ponle CASCADE (datos del estudio), SET NULL (histórico que debe sobrevivir) o, si de verdad es RESTRICT, añádela a la lista con su motivo.');
  const restrict = filas.filter(f => f.accion === 'r').map(f => f.tabla).sort();
  assert.deepEqual(restrict, [...BLOQUEAN_A_PROPOSITO].sort(), 'solo los registros fiscales son RESTRICT');
});

test('el review boost no bloquea borrar el estudio y se conserva como histórico', async () => {
  const s = await crearStudioConPropietaria(admin);
  const feedbackId = crypto.randomUUID();
  const recompensaId = crypto.randomUUID();
  try {
    const f = await admin.from('review_boost_feedback').insert({ id: feedbackId, studio_id: s.studioId, rating: 5, comentario: 'prueba de borrado' });
    assert.ok(!f.error, f.error?.message);
    const r = await admin.from('review_boost_recompensas').insert({ id: recompensaId, studio_id: s.studioId, feedback_id: feedbackId, stripe_coupon_id: 'coupon_test' });
    assert.ok(!r.error, r.error?.message);

    const borrado = await admin.from('studios').delete().eq('id', s.studioId);
    assert.ok(!borrado.error, `borrar el estudio falló: ${borrado.error?.message}`);

    const { count } = await admin.from('studios').select('id', { count: 'exact', head: true }).eq('id', s.studioId);
    assert.equal(count, 0, 'el estudio se borró');
    const fb = await admin.from('review_boost_feedback').select('studio_id, rating, comentario').eq('id', feedbackId).single();
    assert.deepEqual(fb.data, { studio_id: null, rating: 5, comentario: 'prueba de borrado' }, 'la valoración sigue, sin estudio');
    const rc = await admin.from('review_boost_recompensas').select('studio_id, feedback_id').eq('id', recompensaId).single();
    assert.deepEqual(rc.data, { studio_id: null, feedback_id: feedbackId }, 'la recompensa sigue, sin estudio');
  } finally {
    await admin.from('review_boost_recompensas').delete().eq('id', recompensaId);
    await admin.from('review_boost_feedback').delete().eq('id', feedbackId);
    await limpiarFixtures(admin, [s]);
  }
});

test('«una respuesta por estudio» sigue vigente aunque studio_id admita NULL, y los huérfanos no estorban', async () => {
  const s = await crearStudioConPropietaria(admin);
  const ids: string[] = [];
  try {
    const nuevo = () => { const id = crypto.randomUUID(); ids.push(id); return id; };
    const a = await admin.from('review_boost_feedback').insert({ id: nuevo(), studio_id: s.studioId, rating: 4 });
    assert.ok(!a.error, a.error?.message);
    const dup = await admin.from('review_boost_feedback').insert({ id: nuevo(), studio_id: s.studioId, rating: 2 });
    assert.equal(dup.error?.code, '23505', 'un estudio vivo no puede responder dos veces');
    // Varias huérfanas a la vez: NULL no choca con NULL en un UNIQUE.
    for (let i = 0; i < 2; i++) {
      const o = await admin.from('review_boost_feedback').insert({ id: nuevo(), studio_id: null, rating: 3 });
      assert.ok(!o.error, o.error?.message);
    }
  } finally {
    await admin.from('review_boost_feedback').delete().in('id', ids);
    await limpiarFixtures(admin, [s]);
  }
});
