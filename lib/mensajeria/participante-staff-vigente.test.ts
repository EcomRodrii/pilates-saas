import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { authUserIdsParaNotificar } from './destinatarios.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Guardián: la baja de alguien del equipo cierra también su mensajería.
//
// Las policies de conversaciones, participantes, mensajes y Realtime autorizan
// a quien participa con `es_participante_conversacion()`. Una fila STAFF de
// `conversacion_participantes` no se borra con la baja, así que si la función
// vuelve a mirar solo esa fila, la baja deja de llegar a la mensajería sin que
// falle nada. Mismo enfoque que `abrir-conversacion-misma-clave.test.ts`: se lee
// la migración MÁS NUEVA que define la función, no un fichero fijo.
//
// La otra mitad: los avisos de mensaje nuevo (`authUserIdsParaNotificar`) se
// resuelven con service-role, donde la RLS no actúa, y llevan un trozo del
// mensaje. Tienen que aplicar el mismo criterio.
// ─────────────────────────────────────────────────────────────────────────────

const MIGRACIONES = join(import.meta.dirname, '..', '..', 'supabase/migrations');

function ultimaDefinicion(): { fichero: string; sql: string } {
  const candidatas = readdirSync(MIGRACIONES)
    .filter((f) => f.endsWith('.sql'))
    .filter((f) => /function public\.es_participante_conversacion\s*\(/.test(readFileSync(join(MIGRACIONES, f), 'utf8')))
    .sort();
  assert.ok(candidatas.length > 0, 'ninguna migración define es_participante_conversacion: ¿cambió el nombre?');
  const fichero = candidatas[candidatas.length - 1];
  return { fichero, sql: readFileSync(join(MIGRACIONES, fichero), 'utf8') };
}

test('es_participante_conversacion exige ficha activa en el estudio para una fila STAFF', () => {
  const { fichero, sql } = ultimaDefinicion();
  const cuerpo = sql.slice(sql.indexOf('function public.es_participante_conversacion'));
  assert.match(cuerpo, /rol_en_conversacion\s*=\s*'SOCIO'/, `${fichero}: la fila SOCIO debe seguir contando`);
  assert.match(cuerpo, /coalesce\(i\.activo,\s*true\)/, `${fichero}: una fila STAFF sin ficha activa no debe contar`);
  assert.match(cuerpo, /i\.studio_id\s*=\s*c\.studio_id/,
    `${fichero}: la ficha activa tiene que ser la del estudio de la conversación, no otra sede`);
  assert.match(cuerpo, /owner_auth_user_id\s*=\s*cp\.auth_user_id/, `${fichero}: la dueña no se queda fuera`);
});

// ── Avisos ───────────────────────────────────────────────────────────────────

type Fila = Record<string, unknown>;

/** Lo justo de supabase-js para `destinatarios.ts`: select/eq/in/maybeSingle. */
function adminFalso(tablas: Record<string, Fila[]>): SupabaseClient {
  return {
    from(tabla: string) {
      let filas = tablas[tabla] ?? [];
      const q = {
        select: () => q,
        eq: (col: string, val: unknown) => { filas = filas.filter((f) => f[col] === val); return q; },
        in: (col: string, vals: unknown[]) => { filas = filas.filter((f) => vals.includes(f[col])); return q; },
        maybeSingle: async () => ({ data: filas[0] ?? null, error: null }),
        then: (ok: (r: { data: Fila[]; error: null }) => unknown) => Promise.resolve({ data: filas, error: null }).then(ok),
      };
      return q;
    },
  } as unknown as SupabaseClient;
}

const conversacion = { id: 'c1', studio_id: 's1', tipo: 'ALUMNA_INSTRUCTORA' };

function tablas(activa: boolean): Record<string, Fila[]> {
  return {
    studios: [{ id: 's1', owner_auth_user_id: 'duena' }],
    instructores: [
      { studio_id: 's1', auth_user_id: 'profe', activo: activa, rol: 'INSTRUCTOR' },
      // Activa en OTRA sede: no cuenta para esta conversación.
      { studio_id: 's2', auth_user_id: 'profe', activo: true, rol: 'INSTRUCTOR' },
    ],
    conversacion_participantes: [
      { conversacion_id: 'c1', auth_user_id: 'socia', rol_en_conversacion: 'SOCIO' },
      { conversacion_id: 'c1', auth_user_id: 'profe', rol_en_conversacion: 'STAFF' },
    ],
  };
}

test('la instructora activa recibe el aviso del mensaje de la socia', async () => {
  assert.deepEqual(await authUserIdsParaNotificar(adminFalso(tablas(true)), conversacion, 'socia'), ['profe']);
});

test('la instructora dada de baja en este estudio no recibe el aviso, aunque siga activa en otra sede', async () => {
  assert.deepEqual(await authUserIdsParaNotificar(adminFalso(tablas(false)), conversacion, 'socia'), []);
});

test('la socia sigue recibiendo el aviso aunque la instructora esté de baja', async () => {
  assert.deepEqual(await authUserIdsParaNotificar(adminFalso(tablas(false)), conversacion, 'profe'), ['socia']);
});
