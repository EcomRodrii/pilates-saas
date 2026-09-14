-- Consumo de bono idempotente POR RESERVA (1 de 2: columnas + RPC).
--
-- PROBLEMA
-- Tras decidir una plaza, el servidor descuenta la sesión del bono en un paso
-- aparte (`consumir_sesion_bono`): un decremento atómico condicional sobre la
-- suscripción, pero SIN ningún vínculo con la reserva. Si el proceso muere
-- entre el INSERT de la reserva y el decremento, el reintento del mismo intento
-- no puede saber si ya se descontó: no descuenta (clase servida sin cobrar), y
-- tampoco se puede «volver a llamar por si acaso» (descontaría dos veces).
--
-- ARREGLO
-- 1. La reserva guarda la DECISIÓN de cobro: `bono_decidido_en` (la marca) y
--    `bono_suscripcion_id` (de qué suscripción salió la sesión; NULL con marca
--    = se decidió NO cobrar: sin bono que la cubra, o sin saldo). Sin FK a
--    propósito: un ON DELETE SET NULL dispararía los triggers de UPDATE de
--    `reservas` al borrar suscripciones.
-- 2. `consumir_sesion_bono_reserva` decide en UNA transacción: bloquea la
--    reserva (FOR UPDATE), mira la marca, descuenta si toca y marca. Con
--    `p_suscripcion_id` NULL registra «sin bono». Llamarla N veces decide UNA.
-- 3. `bono_consumo_rastreado`:
--      true  = la reserva nació con esto desplegado: sin marca significa de
--              verdad «sin decidir», y un REINTENTO puede completar el cobro.
--      NULL  = legada (existía antes), o false = la insertó un camino que NO
--              cobra nunca por esta vía (plazas fijas materializadas, el
--              importador). Para ambas, «sin marca» no prueba nada: un
--              reintento no cobra (`NO_VERIFICABLE`), igual que antes.
--    Esta migración NO pone default: todas las filas, también las que se creen
--    entre esta migración y la 2 de 2, quedan a NULL (no rastreadas).
--
-- ⚠️ ORDEN DE APLICACIÓN (no negociable):
--   1. Desplegar el código (funciona sin nada de esto: si la RPC no existe cae
--      al descuento de siempre, y un reintento no descuenta, como hoy).
--   2. Aplicar ESTA migración.
--   3. Confirmar que PostgREST ya ve la RPC: llamada REST con service_role y un
--      id inexistente → `RESERVA_NO_ENCONTRADA`, NO `PGRST202` (check 3 abajo).
--   4. Solo entonces aplicar `20260914130100_reservas_bono_rastreo_por_defecto`.
-- Por qué: entre el COMMIT del DDL y la recarga de la caché de PostgREST, el
-- código no ve la RPC y descuenta con la vieja, sin marca. Si en ese hueco las
-- filas nuevas ya nacieran rastreadas, un reintento posterior las cobraría otra
-- vez. Sin default, esas filas nacen no rastreadas y el hueco es inofensivo.
-- (Por eso el código tampoco intenta escribir la marca a mano al caer al
-- descuento viejo: si no ve la RPC tampoco ve las columnas, que llegan en el
-- mismo DDL.) Un `supabase db push` que aplique las dos de golpe se salta esta
-- garantía.
--
-- ⚠️ NUNCA volver al código anterior con la 2 de 2 aplicada: el código viejo
-- descuenta sin marca sobre filas rastreadas y el nuevo, al volver, las cobraría
-- otra vez en un reintento. Si hay que revertir el código, primero
-- `alter table public.reservas alter column bono_consumo_rastreado drop default;`.
-- Con solo esta migración aplicada el código viejo es inofensivo (no rastrea).
--
-- Qué NO cambia: `consumir_sesion_bono` y `devolver_sesion_bono` (misma firma,
-- mismos grants). La devolución al cancelar sigue eligiendo el bono con
-- `bonoDevolvible` en TS; lo que sí hace ahora el servidor es NO devolver una
-- sesión que una reserva rastreada nunca llegó a cobrar.
--
-- Triggers de `reservas` revisados: escribir solo estas columnas no dispara
-- nada con efectos (penalización: transición a/desde NO_ASISTIO; valoración:
-- cambio de valoración; cancelación tardía: transición a CANCELADA;
-- autorización: UPDATE OF estado/sesion_id/socio_id; aforo en vivo: cambio de
-- estado, spot, check-in, posición de espera u oferta).

alter table public.reservas
  add column if not exists bono_suscripcion_id text,
  add column if not exists bono_decidido_en timestamptz,
  add column if not exists bono_consumo_rastreado boolean;

comment on column public.reservas.bono_decidido_en is
  'Cuándo se decidió el cobro de bono de ESTA reserva (consumir_sesion_bono_reserva). Con bono_suscripcion_id = se descontó de ahí; sin él = se decidió no cobrar. NULL = sin decidir. Es la marca de idempotencia.';
comment on column public.reservas.bono_suscripcion_id is
  'Suscripción de la que se descontó la sesión de esta reserva. Auditoría y guardia de devolución; sin FK a propósito.';
comment on column public.reservas.bono_consumo_rastreado is
  'true = nació con el cobro por reserva desplegado: sin marca = sin decidir. NULL = legada; false = la insertó un camino que no cobra (plaza fija, importador). En ambos casos un reintento no cobra.';

create or replace function public.consumir_sesion_bono_reserva(
  p_reserva_id text,
  -- NULL = la socia no tiene bono que cubra la clase: se registra la decisión.
  p_suscripcion_id text,
  p_studio_id text,
  p_reintento boolean default false
)
-- ⚠️ Nombres de salida que no coinciden con ninguna columna de las tablas que
-- se leen (gotcha 42702 de RETURNS TABLE), y aun así todo va con alias.
returns table(resultado text, saldo_restante integer, suscripcion_consumida_id text)
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $$
declare
  v_estado text;
  v_sesion_id text;
  v_socio_id text;
  v_decidido_en timestamptz;
  v_sus_previa text;
  v_rastreado boolean;
  v_sus_socio_id text;
  v_plan_id text;
  v_tipo_clase_id text;
  v_acotado boolean;
  v_saldo integer;
begin
  -- Solo servidor: la llaman los dueños de los hechos de reserva con
  -- service-role. Los grants ya lo cierran; esto es defensa en profundidad.
  if not public.es_llamada_servicio() then
    raise exception 'NO_AUTORIZADO';
  end if;

  -- El candado es la FILA DE LA RESERVA: dos llamadas simultáneas para la
  -- misma reserva se serializan aquí y la segunda ya ve la marca.
  select r.estado, r.sesion_id, r.socio_id, r.bono_decidido_en,
         r.bono_suscripcion_id, r.bono_consumo_rastreado
    into v_estado, v_sesion_id, v_socio_id, v_decidido_en,
         v_sus_previa, v_rastreado
    from public.reservas as r
   where r.id = p_reserva_id and r.studio_id = p_studio_id
   for update;

  if not found then
    return query select 'RESERVA_NO_ENCONTRADA'::text, null::integer, null::text;
    return;  -- `return query` no termina la función
  end if;

  if v_decidido_en is not null then
    if v_sus_previa is null then
      return query select 'YA_DECIDIDA'::text, null::integer, null::text;
      return;
    end if;
    return query
      select 'YA_CONSUMIDA'::text,
             (select s.sesiones_restantes
                from public.suscripciones as s
               where s.id = v_sus_previa and s.studio_id = p_studio_id),
             v_sus_previa;
    return;
  end if;

  -- Solo se cobra una plaza que se ocupa. Una reserva cancelada, en espera o
  -- pendiente de aprobación no descuenta, aunque la pida un reintento tardío.
  if v_estado not in ('CONFIRMADA', 'ASISTIDA', 'NO_ASISTIO') then
    return query select 'NO_OCUPA_PLAZA'::text, null::integer, null::text;
    return;
  end if;

  if p_reintento and v_rastreado is not true then
    return query select 'NO_VERIFICABLE'::text, null::integer, null::text;
    return;
  end if;

  if p_suscripcion_id is null then
    -- Sin bono que la cubra (mensual, clase suelta ya usada…). Se registra: si
    -- la socia compra un bono después, un reintento no le cobra esta clase.
    update public.reservas as r
       set bono_decidido_en = now(), bono_suscripcion_id = null
     where r.id = p_reserva_id;
    return query select 'SIN_BONO'::text, null::integer, null::text;
    return;
  end if;

  if v_sesion_id is null then
    raise exception 'SESION_REQUERIDA';
  end if;

  select s.plan_id, s.socio_id into v_plan_id, v_sus_socio_id
    from public.suscripciones as s
   where s.id = p_suscripcion_id and s.studio_id = p_studio_id;

  if v_sus_socio_id is null or v_sus_socio_id is distinct from v_socio_id then
    raise exception 'SUSCRIPCION_NO_ES_DE_LA_SOCIA';
  end if;

  -- Misma cobertura por tipo de clase que `consumir_sesion_bono` (migr 0129).
  select ss.tipo_clase_id into v_tipo_clase_id
    from public.sesiones as ss
   where ss.id = v_sesion_id and ss.studio_id = p_studio_id;

  select exists (
    select 1 from public.plan_tipos_clase as ptc
     where ptc.plan_id = v_plan_id and ptc.studio_id = p_studio_id
  ) into v_acotado;

  if v_acotado and v_tipo_clase_id is not null and not exists (
    select 1 from public.plan_tipos_clase as ptc
     where ptc.plan_id = v_plan_id and ptc.studio_id = p_studio_id
       and ptc.tipo_clase_id = v_tipo_clase_id
  ) then
    raise exception 'BONO_NO_CUBRE_CLASE';
  end if;

  update public.suscripciones as s
     set sesiones_restantes = s.sesiones_restantes - 1
   where s.id = p_suscripcion_id
     and s.studio_id = p_studio_id
     and s.sesiones_restantes > 0
  returning s.sesiones_restantes into v_saldo;

  if not found then
    -- Sin saldo (otra reserva se llevó la última sesión). También se registra:
    -- la clase queda sin cobrar (el servidor lo reporta), pero un reintento
    -- no la cobra de un bono comprado después.
    update public.reservas as r
       set bono_decidido_en = now(), bono_suscripcion_id = null
     where r.id = p_reserva_id;
    return query select 'SIN_SALDO'::text, null::integer, null::text;
    return;
  end if;

  update public.reservas as r
     set bono_suscripcion_id = p_suscripcion_id,
         bono_decidido_en = now()
   where r.id = p_reserva_id;

  return query select 'CONSUMIDA'::text, v_saldo, p_suscripcion_id;
end;
$$;

-- Firma nueva = función nueva con EXECUTE por defecto a PUBLIC, y el
-- `pg_default_acl` de este proyecto lo da además DIRECTO a anon/authenticated.
-- Los tres REVOKE hacen falta.
revoke all on function public.consumir_sesion_bono_reserva(text, text, text, boolean) from public;
revoke all on function public.consumir_sesion_bono_reserva(text, text, text, boolean) from anon;
revoke all on function public.consumir_sesion_bono_reserva(text, text, text, boolean) from authenticated;
grant execute on function public.consumir_sesion_bono_reserva(text, text, text, boolean) to service_role;

-- ─── Plazas fijas: nacen NO rastreadas ───────────────────────────────────────
-- Las inserta el cron CONFIRMADAS y nunca se cobran (su compensación al
-- cancelar es una recuperación, no una sesión de bono). Sin esto, con el
-- default de la 2 de 2 nacerían rastreadas y sin marca: justo la señal de
-- «cobro pendiente» que un reintento completaría.
--
-- Cuerpo IDÉNTICO al de 20260907152834 salvo la columna nueva del INSERT.
-- Misma firma (integer default 42) → `create or replace` conserva dueño, ACL
-- (EXECUTE solo service_role desde 20260807151942) y SECURITY DEFINER. Si la
-- definición viva difiere de ese fichero, rehacer esto sobre la viva (check 0).
create or replace function public.materializar_plazas_fijas(p_horizonte_dias integer default 42)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_creadas int;
begin
  with matches as (
    select
      pf.id         as plaza_id,
      pf.studio_id,
      pf.socio_id,
      pf.creada_en,
      s.id          as sesion_id,
      case when pf.spot_id is not null and not exists (
             select 1 from reservas r3
             where r3.sesion_id = s.id and r3.spot_id = pf.spot_id
               and r3.estado in ('CONFIRMADA','ASISTIDA')
           ) then pf.spot_id else null end as spot_asignado,
      row_number() over (partition by pf.socio_id, s.id order by pf.creada_en, pf.id) as rn_dup
    from plazas_fijas pf
    join sesiones s
      on s.studio_id = pf.studio_id
     and s.sala_id = pf.sala_id
     and coalesce(s.cancelada, false) = false
     and s.inicio >= now()
     and s.inicio <  now() + make_interval(days => p_horizonte_dias)
     and extract(dow from s.inicio at time zone 'Europe/Madrid') = pf.dia_semana
     and (s.inicio at time zone 'Europe/Madrid')::time = pf.hora_inicio
     and (pf.tipo_clase_id is null or s.tipo_clase_id = pf.tipo_clase_id)
     and (s.inicio at time zone 'Europe/Madrid')::date >= pf.vigencia_desde
     and (pf.vigencia_hasta is null or (s.inicio at time zone 'Europe/Madrid')::date <= pf.vigencia_hasta)
    where pf.estado = 'ACTIVA'
      -- P-4: un día cerrado no materializa ninguna plaza fija, ni siquiera
      -- si el cierre se declaró DESPUÉS de crear la sesión o la plaza fija.
      and not public.fecha_en_cierre(pf.studio_id, (s.inicio at time zone 'Europe/Madrid')::date)
      and exists (
        select 1 from suscripciones su
        where su.socio_id = pf.socio_id and su.studio_id = pf.studio_id and su.estado = 'ACTIVA'
      )
      and not exists (
        select 1 from reservas r
        where r.sesion_id = s.id and r.socio_id = pf.socio_id
          and r.estado in ('CONFIRMADA','LISTA_ESPERA','ASISTIDA')
      )
      and not exists (
        select 1 from reservas r5
        where r5.sesion_id = s.id and r5.socio_id = pf.socio_id
          and r5.estado = 'CANCELADA' and r5.id like 'res-pf-%'
      )
  ),
  candidatas as (
    select
      m.*,
      greatest(0, aforo_efectivo(m.sesion_id) - (
        select count(*) from reservas r2
        where r2.sesion_id = m.sesion_id and r2.estado in ('CONFIRMADA','ASISTIDA')
      )) as huecos,
      row_number() over (partition by m.sesion_id order by m.creada_en, m.plaza_id) as rn
    from matches m
    where m.rn_dup = 1
  )
  insert into reservas (id, studio_id, sesion_id, socio_id, estado, spot_id, posicion_espera, check_in_en, creado_en, bono_consumo_rastreado)
  select 'res-pf-' || gen_random_uuid()::text, studio_id, sesion_id, socio_id, 'CONFIRMADA', spot_asignado, null, null, now(), false
  from candidatas
  where rn <= huecos;

  get diagnostics v_creadas = row_count;
  return v_creadas;
end;
$function$;

-- Decisión por escrito sobre anon (regla de toda SECURITY DEFINER desde el
-- corte RGPD). No cambia nada: anon y PUBLIC ya no tienen EXECUTE desde 0084, y
-- authenticated tampoco desde 20260807151942. service_role se queda como está.
revoke all on function public.materializar_plazas_fijas(integer) from public, anon;

-- ─── Comprobaciones (execute_sql / REST; NO forman parte de la migración) ────
--
-- 0) ANTES de aplicar: la plaza fija viva es la del fichero 20260907152834.
--    select pg_get_functiondef('public.materializar_plazas_fijas(integer)'::regprocedure);
--    Si difiere (aparte de espacios), rehacer el bloque de arriba sobre la viva.
--
-- 1) Tras aplicar cada una: `list_migrations` y cruzar por NOMBRE
--    (`reservas_bono_decidido_por_reserva`, `reservas_bono_rastreo_por_defecto`),
--    nunca por número. Renombrar los ficheros a la versión aplicada.
--
-- 2) Grants y forma. Esperado: f, f, t · prosecdef = false · proconfig con
--    search_path=public, pg_temp. La plaza fija sigue f, f, t y prosecdef = true.
--   select
--     has_function_privilege('anon', 'public.consumir_sesion_bono_reserva(text,text,text,boolean)', 'EXECUTE') as anon,
--     has_function_privilege('authenticated', 'public.consumir_sesion_bono_reserva(text,text,text,boolean)', 'EXECUTE') as authenticated,
--     has_function_privilege('service_role', 'public.consumir_sesion_bono_reserva(text,text,text,boolean)', 'EXECUTE') as service_role;
--   select p.proname, p.prosecdef, p.proconfig from pg_proc p
--    where p.oid in ('public.consumir_sesion_bono_reserva(text,text,text,boolean)'::regprocedure,
--                    'public.materializar_plazas_fijas(integer)'::regprocedure);
--   select
--     has_function_privilege('anon', 'public.materializar_plazas_fijas(integer)', 'EXECUTE') as anon,
--     has_function_privilege('authenticated', 'public.materializar_plazas_fijas(integer)', 'EXECUTE') as authenticated,
--     has_function_privilege('service_role', 'public.materializar_plazas_fijas(integer)', 'EXECUTE') as service_role;
--
-- 3) ANTES de la 2 de 2: PostgREST ve la RPC. Con la clave de servicio en el
--    entorno (nunca pegada en ningún fichero):
--   curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/consumir_sesion_bono_reserva" \
--     -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
--     -H 'Content-Type: application/json' \
--     -d '{"p_reserva_id":"res-no-existe","p_suscripcion_id":null,"p_studio_id":"no-existe","p_reintento":false}'
--   Esperado: [{"resultado":"RESERVA_NO_ENCONTRADA",...}]. Un PGRST202 = aún no:
--   esperar/recargar (`notify pgrst, 'reload schema';`) y repetir. Sin esto, NO
--   aplicar la 2 de 2.
--
-- 4) Justo después de la 2 de 2: default puesto y todo lo previo legado.
--   select column_name, column_default from information_schema.columns
--    where table_schema = 'public' and table_name = 'reservas' and column_name like 'bono\_%';
--   select count(*) filter (where bono_consumo_rastreado is null) as legadas,
--          count(*) filter (where bono_consumo_rastreado) as rastreadas,
--          count(*) filter (where bono_consumo_rastreado = false) as no_cobran
--     from public.reservas;
--
-- 5) Escenario, tras la 2 de 2, SIEMPRE dentro de BEGIN … ROLLBACK.
--   begin;
--   do $v$
--   declare
--     v_sus record; v_ses text; r record;
--     v_res text := 'res-verif-' || gen_random_uuid()::text;
--     v_res2 text := 'res-verif-' || gen_random_uuid()::text;
--   begin
--     select s.id, s.studio_id, s.socio_id, s.plan_id, s.sesiones_restantes into v_sus
--       from public.suscripciones s
--      where s.sesiones_restantes > 1 and s.socio_id is not null
--      limit 1;
--     select ss.id into v_ses
--       from public.sesiones ss
--       left join public.tipos_clase tc on tc.id = ss.tipo_clase_id
--      where ss.studio_id = v_sus.studio_id
--        and not coalesce(tc.requiere_autorizacion, false)
--        and (not exists (select 1 from public.plan_tipos_clase p where p.plan_id = v_sus.plan_id)
--             or ss.tipo_clase_id in (select p.tipo_clase_id from public.plan_tipos_clase p where p.plan_id = v_sus.plan_id))
--        and not exists (select 1 from public.reservas x where x.sesion_id = ss.id and x.socio_id = v_sus.socio_id)
--      limit 1;
--     -- El «crash»: la reserva existe (nace rastreada) y el bono no se descontó.
--     insert into public.reservas (id, studio_id, sesion_id, socio_id, estado)
--       values (v_res, v_sus.studio_id, v_ses, v_sus.socio_id, 'CONFIRMADA');
--     assert (select bono_consumo_rastreado from public.reservas where id = v_res), 'una reserva nueva nace rastreada';
--     select * into r from public.consumir_sesion_bono_reserva(v_res, v_sus.id, v_sus.studio_id, true);
--     assert r.resultado = 'CONSUMIDA' and r.saldo_restante = v_sus.sesiones_restantes - 1, format('reintento: %s', r);
--     select * into r from public.consumir_sesion_bono_reserva(v_res, v_sus.id, v_sus.studio_id, true);
--     assert r.resultado = 'YA_CONSUMIDA', format('segundo reintento: %s', r);
--     select * into r from public.consumir_sesion_bono_reserva(v_res, v_sus.id, v_sus.studio_id, false);
--     assert r.resultado = 'YA_CONSUMIDA', format('llamada concurrente perdedora: %s', r);
--     assert (select sesiones_restantes from public.suscripciones where id = v_sus.id) = v_sus.sesiones_restantes - 1, 'descontada UNA vez';
--     -- Sin bono: se registra, y un reintento con bono ya no cobra.
--     update public.reservas set estado = 'CANCELADA' where id = v_res;
--     insert into public.reservas (id, studio_id, sesion_id, socio_id, estado)
--       values (v_res2, v_sus.studio_id, v_ses, v_sus.socio_id, 'CONFIRMADA');
--     select * into r from public.consumir_sesion_bono_reserva(v_res2, null, v_sus.studio_id, false);
--     assert r.resultado = 'SIN_BONO', format('sin bono: %s', r);
--     select * into r from public.consumir_sesion_bono_reserva(v_res2, v_sus.id, v_sus.studio_id, true);
--     assert r.resultado = 'YA_DECIDIDA', format('reintento tras decidir sin bono: %s', r);
--     assert (select sesiones_restantes from public.suscripciones where id = v_sus.id) = v_sus.sesiones_restantes - 1, 'sin cobro extra';
--     -- No rastreada (plaza fija, importador): un reintento no cobra.
--     update public.reservas set bono_consumo_rastreado = false, bono_decidido_en = null where id = v_res2;
--     select * into r from public.consumir_sesion_bono_reserva(v_res2, v_sus.id, v_sus.studio_id, true);
--     assert r.resultado = 'NO_VERIFICABLE', format('no rastreada: %s', r);
--     -- Cancelada: no se cobra.
--     update public.reservas set estado = 'CANCELADA' where id = v_res2;
--     select * into r from public.consumir_sesion_bono_reserva(v_res2, v_sus.id, v_sus.studio_id, false);
--     assert r.resultado = 'NO_OCUPA_PLAZA', format('cancelada: %s', r);
--     raise notice 'OK: cobro por reserva verificado';
--   end $v$;
--   -- Un rol de cliente no puede llamarla (esperado: 42501 permission denied).
--   set local role authenticated;
--   select * from public.consumir_sesion_bono_reserva('x', null, 'x', false);
--   rollback;
--
-- 6) Unas horas después de la 2 de 2. Esperado ~0: cada fila es un cobro que
--    no llegó a decidirse (buscar `[consumirBonoServidor]` en Sentry). Y ninguna
--    plaza fija nueva rastreada.
--   select count(*) from public.reservas
--    where bono_consumo_rastreado and bono_decidido_en is null
--      and estado in ('CONFIRMADA', 'ASISTIDA', 'NO_ASISTIO')
--      and id not like 'res-pf-%';
--   select count(*) from public.reservas
--    where id like 'res-pf-%' and bono_consumo_rastreado is not false
--      and bono_consumo_rastreado is not null;
