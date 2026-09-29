// CI-1, Fase 1: el gotcha de grants, documentado ya CUATRO veces en
// `.claude/tentare-os.md` — cambiar la firma de una RPC endurecida
// (`CREATE OR REPLACE FUNCTION` con parámetros nuevos) crea un objeto
// DISTINTO en Postgres, y el nuevo objeto nace con `EXECUTE ON FUNCTION ...
// TO PUBLIC` por defecto. `anon` hereda de `PUBLIC`, así que una RPC que se
// creía cerrada vuelve a estar abierta hasta que alguien lo nota — y "alguien
// lo nota" ha sido, hasta ahora, siempre una auditoría manual con
// `has_function_privilege` (#769, #567, P2-14…).
//
// Este fichero deja esa comprobación corriendo en cada PR contra las RPCs de
// dinero/reservas endurecidas explícitamente en el repo, usando conexión
// directa a Postgres (`sqlLocal()`) porque `has_function_privilege` no es
// algo que PostgREST pueda responder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sqlLocal } from '../../lib/db/rls-test-helpers.ts';

const sql = sqlLocal();

interface Caso {
  /** Firma exacta tal y como quedó en la última migración que la tocó — `regprocedure` la resuelve sola. */
  firma: string;
  anon: boolean;
  authenticated: boolean;
  serviceRole: boolean;
}

// Un `false` aquí no significa "nunca debería poder" en términos de negocio —
// significa "está así hoy, deliberadamente, y un cambio de firma no debería
// tocarlo sin querer". Si el día de mañana una RPC pasa a admitir un rol
// nuevo A PROPÓSITO, este test se actualiza en el MISMO PR que lo decide.
const CASOS: Caso[] = [
  // reservar_plaza: sin llamador de cliente (los tres del repo son
  // service-role, `lib/db/supabase-data-admin.ts`) — RES-6, reendurecido tras
  // reabrirse dos veces por cambios de firma (auditoría 19-sep).
  { firma: 'reservar_plaza(text, text, text, text, boolean, boolean, text, boolean, boolean, text)', anon: false, authenticated: false, serviceRole: true },
  { firma: 'cancelar_reserva_plaza(text, text, text, boolean)', anon: false, authenticated: true, serviceRole: true },
  { firma: 'mis_estudios()', anon: false, authenticated: true, serviceRole: true },
];

for (const caso of CASOS) {
  test(`grants de ${caso.firma}`, async () => {
    const [fila] = await sql<{ existe: boolean }[]>`
      select to_regprocedure(${caso.firma}) is not null as existe
    `;
    assert.ok(
      fila?.existe,
      `${caso.firma} no existe en este esquema — ¿cambió de firma? Actualiza este test junto con la migración que la tocó.`,
    );

    for (const [rol, esperado] of [
      ['anon', caso.anon], ['authenticated', caso.authenticated], ['service_role', caso.serviceRole],
    ] as const) {
      const [{ tiene }] = await sql<{ tiene: boolean }[]>`
        select has_function_privilege(${rol}, ${caso.firma}::regprocedure, 'EXECUTE') as tiene
      `;
      assert.equal(
        tiene, esperado,
        `${caso.firma}: se esperaba EXECUTE=${esperado} para ${rol}, es ${tiene}. `
        + 'Si tocaste la firma de esta función, revisa REVOKE FROM PUBLIC + GRANT explícito '
        + '(gotcha de grants, .claude/tentare-os.md).',
      );
    }
  });
}

test.after(async () => { await sql.end(); });
