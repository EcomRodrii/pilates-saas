-- Consumo de bono idempotente POR RESERVA.
--
-- PROBLEMA
-- Tras decidir una plaza, el servidor descuenta la sesión del bono en un paso
-- aparte (`consumir_sesion_bono`): un decremento atómico condicional sobre la
-- suscripción, pero SIN ningún vínculo con la reserva. Eso lo deja en «como
-- mucho una vez»:
--  · Si el proceso muere entre el INSERT de la reserva y el decremento, el
--    reintento del mismo intento (mostrador con el mismo id, reintento del
--    webhook de pago) no puede saber si ya se descontó, así que no descuenta:
--    clase servida sin cobrar el bono.
--  · Y no se puede «volver a llamar por si acaso»: sin marca, descontaría dos
--    veces.
--
-- ARREGLO
-- 1. La reserva guarda de qué suscripción se descontó y cuándo
--    (`bono_suscripcion_id`, `bono_consumido_en`). La marca es
--    `bono_consumido_en`; el id es para auditar y para devolver al bono
--    correcto en el futuro. Sin FK a propósito: un ON DELETE SET NULL
--    dispararía los triggers de UPDATE de `reservas` al borrar suscripciones, y
--    un id colgando no rompe nada (la marca es la fecha, no el id).
-- 2. `consumir_sesion_bono_reserva` hace en UNA transacción: bloquea la
--    reserva (FOR UPDATE), mira la marca, decrementa condicionalmente y pone la
--    marca. Llamarla N veces descuenta como mucho UNA sesión por reserva, así
--    que el servidor puede reintentar hasta que se haga.
-- 3. `bono_consumo_rastreado` distingue las reservas LEGADAS. Las filas que ya
--    existen al aplicar esto quedan a NULL (ADD COLUMN sin default); las nuevas
--    nacen a `true` (el default se pone DESPUÉS, así no rellena las viejas).
--    Una reserva legada pudo descontarse con la RPC vieja, que no deja marca:
--    para ella «sin marca» NO significa «sin descontar». Por eso un REINTENTO
--    (`p_reintento = true`) sobre una legada no descuenta nada
--    (`NO_VERIFICABLE`, el comportamiento de antes); la PRIMERA llamada de un
--    hecho (p. ej. promocionar hoy una lista de espera creada ayer) sí descuenta
--    y deja la marca.
--
-- ⚠️ ORDEN DE DESPLIEGUE: primero el código, luego esta migración. El código
-- funciona sin ella (si la RPC no existe cae a `consumir_sesion_bono` y en un
-- reintento no descuenta, igual que hoy). Al revés —migración antes que
-- código— una reserva creada en esa ventana nace «rastreada» pero la descuenta
-- el código viejo sin marca, y un reintento posterior ya con el código nuevo
-- la descontaría otra vez.
--
-- Qué NO cambia: `consumir_sesion_bono` y `devolver_sesion_bono` siguen igual
-- (misma firma, mismos grants). La devolución al cancelar sigue eligiendo el
-- bono con `bonoDevolvible` en TS; hacerla por la marca toca cinco caminos
-- (cancelar reserva, cancelar clase entera en servidor y en panel, mínimo de
-- asistentes, cierre del centro) y las reservas legadas, así que va aparte.
--
-- Triggers de `reservas` revisados: escribir solo estas columnas no dispara
-- nada con efectos (penalización: transición a/desde NO_ASISTIO; valoración:
-- cambio de valoración; cancelación tardía: transición a CANCELADA;
-- autorización: UPDATE OF estado/sesion_id/socio_id; aforo en vivo: cambio de
-- estado, spot, check-in, posición de espera u oferta).

alter table public.reservas
  add column if not exists bono_suscripcion_id text,
  add column if not exists bono_consumido_en timestamptz,
  add column if not exists bono_consumo_rastreado boolean;

-- Después del ADD COLUMN, no dentro: así las filas existentes se quedan a NULL
-- (legadas) y solo las nuevas nacen rastreadas. Solo toca el catálogo.
alter table public.reservas
  alter column bono_consumo_rastreado set default true;

comment on column public.reservas.bono_consumido_en is
  'Cuándo se descontó la sesión de bono de ESTA reserva (consumir_sesion_bono_reserva). NULL = no se ha descontado por esta vía. Es la marca de idempotencia.';
comment on column public.reservas.bono_suscripcion_id is
  'Suscripción de la que se descontó la sesión de esta reserva. Auditoría; sin FK a propósito.';
comment on column public.reservas.bono_consumo_rastreado is
  'true = la reserva nació con el consumo por reserva ya desplegado, así que bono_consumido_en NULL significa de verdad «sin descontar». NULL = legada: pudo descontarse con la RPC vieja sin dejar marca.';

create or replace function public.consumir_sesion_bono_reserva(
  p_reserva_id text,
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
  v_consumido_en timestamptz;
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
  select r.estado, r.sesion_id, r.socio_id, r.bono_consumido_en,
         r.bono_suscripcion_id, r.bono_consumo_rastreado
    into v_estado, v_sesion_id, v_socio_id, v_consumido_en,
         v_sus_previa, v_rastreado
    from public.reservas as r
   where r.id = p_reserva_id and r.studio_id = p_studio_id
   for update;

  if not found then
    return query select 'RESERVA_NO_ENCONTRADA'::text, null::integer, null::text;
    return;  -- `return query` no termina la función
  end if;

  if v_consumido_en is not null then
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
    -- Sin saldo (otra reserva se llevó la última sesión): no se marca, así que
    -- sigue constando como no descontada.
    return query select 'SIN_SALDO'::text, null::integer, null::text;
    return;
  end if;

  update public.reservas as r
     set bono_suscripcion_id = p_suscripcion_id,
         bono_consumido_en = now()
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

-- ─── Verificación tras aplicar (execute_sql, NO forma parte de la migración) ──
--
-- 1) Grants. Esperado: anon=f, authenticated=f, service_role=t.
--   select
--     has_function_privilege('anon', 'public.consumir_sesion_bono_reserva(text,text,text,boolean)', 'EXECUTE') as anon,
--     has_function_privilege('authenticated', 'public.consumir_sesion_bono_reserva(text,text,text,boolean)', 'EXECUTE') as authenticated,
--     has_function_privilege('service_role', 'public.consumir_sesion_bono_reserva(text,text,text,boolean)', 'EXECUTE') as service_role;
--
-- 2) Columnas y legado. Esperado: tres columnas, default `true` solo en
--    `bono_consumo_rastreado`, y TODAS las filas previas con rastreado NULL.
--   select column_name, data_type, column_default
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'reservas' and column_name like 'bono\_%';
--   select count(*) filter (where bono_consumo_rastreado is null) as legadas,
--          count(*) filter (where bono_consumo_rastreado) as rastreadas
--     from public.reservas;
--
-- 3) Escenario completo, SIEMPRE dentro de BEGIN … ROLLBACK. Cada `assert`
--    aborta con su mensaje si falla.
--   begin;
--   do $v$
--   declare
--     v_sus record; v_ses text; r record;
--     v_res text := 'res-verif-' || gen_random_uuid()::text;
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
--     -- El reintento completa el descuento…
--     select * into r from public.consumir_sesion_bono_reserva(v_res, v_sus.id, v_sus.studio_id, true);
--     assert r.resultado = 'CONSUMIDA' and r.saldo_restante = v_sus.sesiones_restantes - 1, format('reintento: %s', r);
--     -- …y ninguna llamada más vuelve a descontar.
--     select * into r from public.consumir_sesion_bono_reserva(v_res, v_sus.id, v_sus.studio_id, true);
--     assert r.resultado = 'YA_CONSUMIDA', format('segundo reintento: %s', r);
--     select * into r from public.consumir_sesion_bono_reserva(v_res, v_sus.id, v_sus.studio_id, false);
--     assert r.resultado = 'YA_CONSUMIDA', format('primera llamada tras marca: %s', r);
--     assert (select sesiones_restantes from public.suscripciones where id = v_sus.id) = v_sus.sesiones_restantes - 1, 'descontada UNA vez';
--     -- Legada: un reintento no descuenta, la primera llamada del hecho sí.
--     update public.reservas set bono_consumo_rastreado = null, bono_consumido_en = null, bono_suscripcion_id = null where id = v_res;
--     select * into r from public.consumir_sesion_bono_reserva(v_res, v_sus.id, v_sus.studio_id, true);
--     assert r.resultado = 'NO_VERIFICABLE', format('legada en reintento: %s', r);
--     select * into r from public.consumir_sesion_bono_reserva(v_res, v_sus.id, v_sus.studio_id, false);
--     assert r.resultado = 'CONSUMIDA', format('legada, primera llamada: %s', r);
--     -- Una plaza que no se ocupa no descuenta.
--     update public.reservas set estado = 'CANCELADA', bono_consumido_en = null where id = v_res;
--     select * into r from public.consumir_sesion_bono_reserva(v_res, v_sus.id, v_sus.studio_id, false);
--     assert r.resultado = 'NO_OCUPA_PLAZA', format('cancelada: %s', r);
--     raise notice 'OK: consumo por reserva verificado';
--   end $v$;
--   -- Un rol de cliente no puede llamarla (esperado: 42501 permission denied).
--   set local role authenticated;
--   select * from public.consumir_sesion_bono_reserva('x', 'x', 'x', false);
--   rollback;
