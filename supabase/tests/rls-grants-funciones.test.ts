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
  // Revocado a `authenticated` en 20260902211300 (auditoría 21ª pasada, P-1):
  // el panel llamaba a esta RPC directo desde el navegador, saltándose
  // `ejecutarCancelacionReserva` (que sí dispara las notificaciones). Ya no
  // queda ningún llamador fuera de `admin.rpc(...)` — solo service_role.
  { firma: 'cancelar_reserva_plaza(text, text, text, boolean)', anon: false, authenticated: false, serviceRole: true },
  { firma: 'mis_estudios()', anon: false, authenticated: true, serviceRole: true },
  // Función de TRIGGER (un tipo de clase archivado no programa clases nuevas,
  // migr 20260930215125): solo la dispara `sesiones`, nadie la llama. El
  // permiso se comprueba al crear el trigger, no al dispararse.
  { firma: 'sesiones_no_programa_tipo_archivado()', anon: false, authenticated: false, serviceRole: true },
  // Función de TRIGGER (la hora del cobro, el envío al banco y el día de cargo,
  // migr recibos_marcas_de_tiempo, 2-oct-2026): solo la dispara `recibos`.
  { firma: 'recibos_marcas_de_tiempo()', anon: false, authenticated: false, serviceRole: true },
  // 20260930215106 la redefine (tope configurable) con la misma firma: la llama
  // el panel (ficha, importación) con su sesión y el servidor con service_role.
  { firma: 'crear_recuperacion(text, text, text, text, text, date)', anon: false, authenticated: true, serviceRole: true },
  // Motor de derechos (migr 20261002133851 y 20261002134040). Las tres mueven saldo de sesiones:
  // `consumir_bono_interno` y `liberar_derecho` solo las llama el servidor; la devolución por
  // reserva ya la podía llamar la gestión desde el panel y se queda como estaba (la propia
  // función comprueba estudio y rol).
  { firma: 'consumir_bono_interno(text, text, text)', anon: false, authenticated: false, serviceRole: true },
  { firma: 'liberar_derecho(text, text, text)', anon: false, authenticated: false, serviceRole: true },
  { firma: 'devolver_sesion_bono_por_reserva(text, text)', anon: false, authenticated: true, serviceRole: true },
  // Reglas de elegibilidad (migr 20261002134242): solo las llama el servidor, y el cambio de cuerpo no toca sus permisos.
  { firma: 'calcular_excede_limite_semanal(text, text, text, timestamp with time zone)', anon: false, authenticated: false, serviceRole: true },
  { firma: 'elegir_bono_consumible(text, text, text, date)', anon: false, authenticated: false, serviceRole: true },
  // Cierre de integridad (migr 20261002144018): la devolución a ciegas ya no es del navegador, y la cancelación atómica de
  // las reservas de una clase solo la llama el servidor.
  { firma: 'devolver_sesion_bono(text, text)', anon: false, authenticated: false, serviceRole: true },
  { firma: 'cancelar_reservas_de_sesion(text, text, text)', anon: false, authenticated: false, serviceRole: true },
  // Elegibilidad de una reserva en un solo sitio, solo lectura (migr 20261002145300): como `reservar_plaza`, solo el servidor.
  { firma: 'evaluar_reserva(text, text, text, jsonb)', anon: false, authenticated: false, serviceRole: true },
  // Anular una recuperación (migr 20261002144936): la llama el panel con su sesión (la propia función comprueba estudio y rol).
  { firma: 'anular_recuperacion(text, text)', anon: false, authenticated: true, serviceRole: true },
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

// ── Fase 2: el catálogo entero, no solo las RPCs de arriba ───────────────────
//
// La lista de CASOS cubre tres funciones, y el gotcha se ha pisado con las que
// no estaban en ninguna lista: una RPC nueva, o con la firma cambiada, nace con
// EXECUTE para PUBLIC (y por él para `anon`). Estos dos tests no miran funciones
// concretas sino TODAS las SECURITY DEFINER de `public`, que son las que se
// ejecutan con privilegios de su dueño y se saltan la RLS.

/** SECURITY DEFINER de `public` ejecutables por `anon`, con la firma legible. */
async function anonEjecutables(soloConEstudioOSocia: boolean): Promise<string[]> {
  const filas = await sql<{ firma: string; toma_estudio_o_socia: boolean }[]>`
    select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as firma,
           (pg_get_function_identity_arguments(p.oid) like '%p_studio_id %'
            or pg_get_function_identity_arguments(p.oid) like '%p_socio_id %') as toma_estudio_o_socia
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and p.prokind = 'f'
      and has_function_privilege('anon', p.oid, 'EXECUTE')
    order by 1
  `;
  return filas.filter(f => !soloConEstudioOSocia || f.toma_estudio_o_socia).map(f => f.firma);
}

test('ninguna función SECURITY DEFINER que recibe p_studio_id o p_socio_id es ejecutable por anon', async () => {
  // El principio, sin lista: quien no ha iniciado sesión no puede pedirle a una
  // función privilegiada que actúe sobre un estudio o una socia. Hoy no hay
  // ninguna; si aparece una, la puerta está abierta a cualquiera con la clave pública.
  assert.deepEqual(
    await anonEjecutables(true), [],
    'una función SECURITY DEFINER que recibe estudio o socia es ejecutable por anon. '
    + 'Si es nueva o cambió de firma: REVOKE ... FROM PUBLIC + GRANT explícito a los roles que la necesitan '
    + '(gotcha de grants, .claude/tentare-os.md), y comprueba con has_function_privilege.',
  );
});

// Las únicas SECURITY DEFINER que `anon` puede ejecutar, y por qué es así. Una
// nueva NO se añade aquí sin decidir que debe ser pública: lo normal es cerrarla.
const ANON_EJECUTABLES_CONOCIDAS = [
  // Trigger functions: nacen con EXECUTE por el ACL por defecto, pero no se pueden
  // invocar como RPC («trigger functions can only be called as triggers»).
  'member_credits_caducidad()',
  'red_experiencias_proteger_verificacion()',
  'red_perfiles_identidad_proteger_verificacion()',
  'red_perfiles_proteger_verificacion()',
  'red_referencias_proteger_estado()',
  'red_verificaciones_proteger_estado()',
  // Ayudantes de RLS: las políticas los llaman con los privilegios de quien
  // consulta, así que `anon` tiene que poder ejecutarlos (devuelven false sin sesión).
  'puede_configurar_negocio()',
  'puede_gestionar_clientas()',
  'puede_gestionar_equipo()',
  'puede_gestionar_ficha_instructor(p_instructor_id text)',
  'puede_mover_dinero()',
  'puede_ver_finanzas()',
  // La reserva pública (/reservar/:slug) resuelve el estudio por su slug sin sesión.
  'studio_id_por_slug(p_slug text)',
];

test('las SECURITY DEFINER ejecutables por anon son solo las conocidas', async () => {
  const actuales = await anonEjecutables(false);
  const sobran = actuales.filter(f => !ANON_EJECUTABLES_CONOCIDAS.includes(f));
  const faltan = ANON_EJECUTABLES_CONOCIDAS.filter(f => !actuales.includes(f));
  assert.deepEqual(
    sobran, [],
    `nuevas funciones SECURITY DEFINER ejecutables por anon: ${sobran.join(', ')}. `
    + 'Lo normal es que no deban serlo (REVOKE ... FROM PUBLIC + GRANT explícito). '
    + 'Si debe ser pública a propósito, añádela a ANON_EJECUTABLES_CONOCIDAS con su motivo.',
  );
  assert.deepEqual(
    faltan, [],
    `ya no son ejecutables por anon (¿se cerraron o cambiaron de firma?): ${faltan.join(', ')}. `
    + 'Quítalas de ANON_EJECUTABLES_CONOCIDAS, o si cambió la firma, actualízala.',
  );
});

test.after(async () => { await sql.end(); });
