import test from 'node:test';
import assert from 'node:assert/strict';
import { deshacerBatch, ORDEN_DESHACER } from './batches.ts';

// Guardián del 🔴 de la 39ª pasada (9-sep-2026).
//
// `deshacerBatch` prometía —y la pantalla lo repite tres veces— «se borra
// exactamente lo que creó esta importación, y nada más». Era falso: 39 tablas
// cuelgan de `socios` con ON DELETE CASCADE (recibos, member_credits,
// credit_transactions, condiciones_salud, notas_progreso, documentos_socio…) y
// 4 de `sesiones`. Postgres las arrastraba en silencio, así que el guardarraíl
// —que solo reacciona al 23503— no disparaba nunca: solo lo hace para las 7 FK
// que son NO ACTION. Deshacer una migración de hace tres días se llevaba por
// delante todo lo que esas socias hicieron DESPUÉS de migrar, y devolvía ok:true.
//
// Estos tests fijan las tres propiedades del arreglo: se PREGUNTA antes de
// borrar, se PARA si hay algo ajeno, y se falla CERRADO si no se puede saber.

interface Llamada { tabla: string; ids: string[] }

function fakeAdmin(opciones: {
  ids: Record<string, string[]>;
  // Qué devuelve el preflight por tabla: filas hijas ajenas al lote.
  dependencias?: Record<string, { tabla_hija: string; filas: number }[]>;
  // Simula que el propio preflight falla (RPC caída, función sin desplegar).
  rpcRota?: boolean;
  borrados: Llamada[];
  rpcs: { tabla: string; ids: string[] }[];
}) {
  const { ids, dependencias = {}, rpcRota = false, borrados, rpcs } = opciones;
  return {
    rpc(nombre: string, args: { p_tabla: string; p_ids: string[] }) {
      assert.equal(nombre, 'migracion_dependencias_bloqueantes');
      rpcs.push({ tabla: args.p_tabla, ids: args.p_ids });
      if (rpcRota) return Promise.resolve({ data: null, error: { message: 'función no encontrada' } });
      return Promise.resolve({ data: dependencias[args.p_tabla] ?? [], error: null });
    },
    from(tabla: string) {
      if (tabla === 'migracion_batches') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({
                  data: { ids_creados: ids, deshecho_en: null }, error: null,
                }),
              }),
            }),
          }),
          update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
        };
      }
      return {
        delete: () => ({
          in: (_c: string, trozo: string[]) => ({
            eq: () => ({
              select: () => {
                borrados.push({ tabla, ids: trozo });
                return Promise.resolve({ data: trozo.map(id => ({ id })), error: null });
              },
            }),
          }),
        }),
      };
    },
  } as never;
}

test('el deshacer PREGUNTA por la cascada antes de borrar cada entidad', async () => {
  const borrados: Llamada[] = [];
  const rpcs: { tabla: string; ids: string[] }[] = [];
  const admin = fakeAdmin({ ids: { socios: ['soc-1'], reservas: ['res-1'] }, borrados, rpcs });

  const r = await deshacerBatch(admin, { studioId: 'st-1', batchId: 'mig-abcdef' });
  assert.equal(r.ok, true);

  // Una consulta de preflight por entidad con ids, y ninguna de más.
  assert.deepEqual(rpcs.map(x => x.tabla).sort(), ['reservas', 'socios']);
  // Y en el orden de dependencias: reservas antes que socios, para que cuando
  // se pregunte por socios lo que quede colgando sea forzosamente ajeno.
  assert.ok(ORDEN_DESHACER.indexOf('reservas') < ORDEN_DESHACER.indexOf('socios'));
  assert.deepEqual(borrados.map(b => b.tabla), ['reservas', 'socios']);
});

test('si la cascada se llevaría datos ajenos, NO borra nada y lo dice', async () => {
  const borrados: Llamada[] = [];
  const rpcs: { tabla: string; ids: string[] }[] = [];
  const admin = fakeAdmin({
    ids: { socios: ['soc-1'] },
    dependencias: {
      socios: [
        { tabla_hija: 'recibos', filas: 12 },
        { tabla_hija: 'reservas', filas: 41 },
      ],
    },
    borrados, rpcs,
  });

  const r = await deshacerBatch(admin, { studioId: 'st-1', batchId: 'mig-abcdef' });

  assert.equal(r.ok, false, 'no puede dar por bueno un borrado que destruye datos ajenos');
  assert.deepEqual(borrados, [], 'no se ha borrado NADA');
  // El mensaje tiene que decir cuántos registros y de qué, no un genérico.
  assert.match(r.error ?? '', /53/, 'suma las filas en peligro (12 + 41)');
  assert.match(r.error ?? '', /recibos/);
  assert.match(r.error ?? '', /No se ha borrado nada/);
});

test('el rastro del sistema NO puede bloquear el deshacer', async () => {
  // Regresión de la v1 del preflight, que la revisión independiente tumbó:
  // `recordatorio_envios` cuelga de `sesiones` y de `socios` con CASCADE y el
  // cron escribe ahí por cada aviso enviado. Sin lista de exclusión, a las
  // pocas horas de migrar TODO lote quedaba bloqueado para siempre — un
  // guardarraíl que nunca deja pasar es tan inútil como el que nunca frena.
  const rpcs: { tabla: string; ids: string[] }[] = [];
  const ignorados: string[][] = [];
  const admin = {
    rpc(_n: string, args: { p_tabla: string; p_ids: string[]; p_ignorar: string[]; p_excluir: Record<string, string[]> }) {
      rpcs.push({ tabla: args.p_tabla, ids: args.p_ids });
      ignorados.push(args.p_ignorar);
      // El lote creó estas reservas: deben viajar como exclusión, no como bloqueo.
      assert.deepEqual(args.p_excluir.reservas, ['res-1']);
      return Promise.resolve({ data: [], error: null });
    },
    from: (tabla: string) => tabla === 'migracion_batches'
      ? {
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { ids_creados: { socios: ['soc-1'], reservas: ['res-1'] }, deshecho_en: null }, error: null }) }) }) }),
        update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
      }
      : { delete: () => ({ in: (_c: string, t: string[]) => ({ eq: () => ({ select: () => Promise.resolve({ data: t.map(id => ({ id })), error: null }) }) }) }) },
  } as never;

  const r = await deshacerBatch(admin, { studioId: 'st-1', batchId: 'mig-abcdef' });
  assert.equal(r.ok, true);
  for (const lista of ignorados) {
    assert.ok(lista.includes('recordatorio_envios'), 'el cron de recordatorios no puede bloquear el deshacer');
    assert.ok(lista.includes('comunicaciones_socio'), 'el log de envíos no puede bloquear el deshacer');
  }
});

test('si el preflight falla, falla CERRADO: no borra', async () => {
  const borrados: Llamada[] = [];
  const rpcs: { tabla: string; ids: string[] }[] = [];
  const admin = fakeAdmin({ ids: { socios: ['soc-1'] }, rpcRota: true, borrados, rpcs });

  const r = await deshacerBatch(admin, { studioId: 'st-1', batchId: 'mig-abcdef' });

  assert.equal(r.ok, false);
  assert.deepEqual(borrados, [], 'sin poder comprobar la cascada, no se borra');
  assert.match(r.error ?? '', /No se ha podido comprobar/);
});
