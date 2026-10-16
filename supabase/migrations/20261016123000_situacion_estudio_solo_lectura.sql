-- ═══════════════════════════════════════════════════════════════════════════
-- La situación de cada estudio, en SOLO LECTURA (bajas, fase 2), y su informe diario.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Deriva en qué estado está cada estudio (ACTIVO_PAGO, PAGO_PENDIENTE, GRATIS,
-- GRATIS_EN_MARGEN, INACTIVO, SUSPENDIDO, EN_BAJA, ELIMINADO) a partir de lo que
-- ya hay en la base. No cambia el comportamiento de nada: ninguna función toca
-- una fila de negocio. Lo único que se escribe son las marcas de uso y el informe
-- diario, y solo con BAJAS_AUTOMATICAS=informe (lo decide el servidor).
--
-- 1) Marcas de uso en `studios`, de servidor y como mucho una vez al día (Madrid):
--    · ultimo_uso_panel_en — alguien del equipo abrió el panel o la app del equipo;
--    · ultimo_uso_app_en   — una alumna abrió su app con la sesión iniciada.
--    Las escriben `marcar_uso_panel` / `marcar_uso_app` (service_role). Nacen sin
--    GRANT para `authenticated`: el UPDATE de `studios` va por columnas, y el
--    INSERT también desde 20261016115000. Una marca posterior al día que se evalúa
--    no cuenta: un valor inventado no alarga la actividad.
--
-- 2) `senales_actividad_real` / `ultima_actividad_real(estudio, hoy)`: la última
--    señal de uso real, por fuente. Cuentan las acciones del equipo, abrir el panel
--    o la app, las reservas (no las de clase fija, que se crean solas), los escaneos
--    de acceso, los cobros hechos por personas (sin `cobro_off_session_clave`) y las
--    ventas de caja. No cuenta lo que hace Tentare solo: origen TENTARE, plazas
--    fijas, cargos automáticos, renovaciones, crons.
--
-- 3) `situacion_estudio(estudio, hoy)` y `situacion_estudios(hoy)`: la situación,
--    con el ancla, los días de «Cierre del centro» (que no cuentan), los días sin
--    actividad, qué limita cada estado (gestión, servicio a alumnas, cobros
--    automáticos) y los casos dudosos. Las piezas puras van aparte para cruzarlas
--    con su gemela TS (lib/retencion/situacion-estudio.ts): `paga_plan`,
--    `fase_plan_gratis` y `situacion_derivada`.
--
-- 4) `estudio_situacion_diaria`: una fila por estudio y día de Madrid, para
--    comparar días y ver quién cambia de estado. La escribe
--    `registrar_situacion_diaria` (idempotente por estudio y día) desde el cron que
--    ya corre el ciclo de estudios vencidos. Solo service_role.
--
-- 5) Índices para leer las señales sin recorrer tablas.
-- ═══════════════════════════════════════════════════════════════════════════

set local lock_timeout = '5s';

-- ── 1) Marcas de uso ─────────────────────────────────────────────────────────
alter table public.studios
  add column if not exists ultimo_uso_panel_en timestamptz,
  add column if not exists ultimo_uso_app_en timestamptz;

comment on column public.studios.ultimo_uso_panel_en is
  'Último día (como mucho una marca al día de Madrid) en que alguien del equipo abrió el panel o la app del equipo. Lo escribe solo el servidor (marcar_uso_panel).';
comment on column public.studios.ultimo_uso_app_en is
  'Último día (como mucho una marca al día de Madrid) en que una alumna abrió su app con la sesión iniciada. Lo escribe solo el servidor (marcar_uso_app).';

create or replace function public.marcar_uso_panel(p_studio_id text)
returns boolean
language sql
volatile
set search_path = ''
as $$
  update public.studios st
     set ultimo_uso_panel_en = now()
   where st.id = p_studio_id
     and (st.ultimo_uso_panel_en is null
          or st.ultimo_uso_panel_en < ((select public.hoy_estudio())::timestamp at time zone 'Europe/Madrid'))
  returning true;
$$;

create or replace function public.marcar_uso_app(p_socio_id text)
returns boolean
language sql
volatile
set search_path = ''
as $$
  update public.studios st
     set ultimo_uso_app_en = now()
    from public.socios so
   where so.id = p_socio_id
     and st.id = so.studio_id
     and (st.ultimo_uso_app_en is null
          or st.ultimo_uso_app_en < ((select public.hoy_estudio())::timestamp at time zone 'Europe/Madrid'))
  returning true;
$$;

-- ── 5) Índices de las señales ────────────────────────────────────────────────
create index if not exists idx_reservas_studio_creado_sin_plaza_fija
  on public.reservas (studio_id, creado_en desc) where id not like 'res-pf-%';
create index if not exists idx_recibos_studio_cobrado_por_persona
  on public.recibos (studio_id, fecha_cobro desc) where estado = 'COBRADO' and cobro_off_session_clave is null;
create index if not exists idx_ventas_pos_studio_realizada
  on public.ventas_pos (studio_id, realizada_en desc);
create index if not exists idx_auditoria_estudio_studio_persona
  on public.auditoria_estudio (studio_id, ocurrido_en desc) where actor_uid is not null;

-- ── 2) La actividad real ─────────────────────────────────────────────────────
-- Una fila por fuente, con su última señal hasta el final del día `p_hoy` (Madrid):
-- lo posterior no cuenta, ni una marca con fecha inventada.
create or replace function public.senales_actividad_real(p_studio_id text, p_hoy date default public.hoy_estudio())
returns table (fuente text, ultima timestamptz)
language sql
stable
set search_path = ''
as $$
  with lim as (select ((p_hoy + 1)::timestamp at time zone 'Europe/Madrid') as fin)
  select x.fuente, x.ultima from lim cross join lateral (
    select 'equipo'::text, (select max(a.creado_en) from public.actividad_reciente a
             where a.studio_id = p_studio_id and a.origen = 'EQUIPO' and a.creado_en < lim.fin)
    union all
    select 'auditoria', (select max(au.ocurrido_en) from public.auditoria_estudio au
             where au.studio_id = p_studio_id and au.actor_uid is not null and au.ocurrido_en < lim.fin)
    union all
    select 'panel', (select st.ultimo_uso_panel_en from public.studios st
             where st.id = p_studio_id and st.ultimo_uso_panel_en < lim.fin)
    union all
    select 'app', (select st.ultimo_uso_app_en from public.studios st
             where st.id = p_studio_id and st.ultimo_uso_app_en < lim.fin)
    union all
    select 'reservas', (select max(r.creado_en) from public.reservas r
             where r.studio_id = p_studio_id and r.id not like 'res-pf-%' and r.creado_en < lim.fin)
    union all
    select 'accesos', (select max(e.ocurrido_en) from public.accesos_escaneos e
             where e.studio_id = p_studio_id and e.ocurrido_en < lim.fin)
    union all
    select 'cobros', (select max(rc.fecha_cobro) from public.recibos rc
             where rc.studio_id = p_studio_id and rc.estado = 'COBRADO' and rc.cobro_off_session_clave is null
               and rc.fecha_cobro <= p_hoy)::timestamp at time zone 'Europe/Madrid'
    union all
    select 'caja', (select max(v.realizada_en) from public.ventas_pos v
             where v.studio_id = p_studio_id and v.realizada_en < lim.fin)
  ) as x(fuente, ultima);
$$;

create or replace function public.ultima_actividad_real(p_studio_id text, p_hoy date default public.hoy_estudio())
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select max(s.ultima) from public.senales_actividad_real(p_studio_id, p_hoy) s;
$$;

-- ── 3) Piezas puras (gemelas en lib/retencion/situacion-estudio.ts) ──────────

-- ¿Paga este plan? Espejo de `pagaPlan` (lib/billing/plan-gratis.ts): activa, en
-- reintento, o prueba de Stripe (la prueba local también es 'trialing', sin id).
create or replace function public.paga_plan(p_estado text, p_subscription_id text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_estado in ('active', 'past_due') or (p_estado = 'trialing' and nullif(p_subscription_id, '') is not null), false);
$$;

-- La fase del plan gratis del grupo: espejo de `estadoGratis` (lib/billing/plan-gratis.ts).
-- Sin cifras (`p_alumnas`/`p_reservas` null) no se cierra nada, salvo un margen ya agotado.
create or replace function public.fase_plan_gratis(p_alumnas integer, p_reservas integer, p_excedido_desde date, p_hoy date)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  c_limite_alumnas constant integer := 150;
  c_limite_reservas constant integer := 250;
  c_margen_dias constant integer := 30;
  c_aviso_pct constant numeric := 0.8;
begin
  if p_excedido_desde is not null and p_hoy >= p_excedido_desde + c_margen_dias then
    return 'CERRADO';
  end if;
  if p_alumnas is null or p_reservas is null then
    return 'SIN_MEDIR';
  end if;
  if p_alumnas > c_limite_alumnas or p_reservas > c_limite_reservas then
    return case when (coalesce(p_excedido_desde, p_hoy) + c_margen_dias) - p_hoy > 0 then 'MARGEN' else 'CERRADO' end;
  end if;
  if p_alumnas >= ceil(c_limite_alumnas * c_aviso_pct) or p_reservas >= ceil(c_limite_reservas * c_aviso_pct) then
    return 'CERCA';
  end if;
  return 'DENTRO';
end;
$$;

-- La situación, derivada de sus entradas, y qué limita: espejo de `situacionDerivada`.
--   · gestion_limitada — el panel de la propietaria se cierra o se limita;
--   · servicio_alumnas_suspendido — las alumnas solo pueden consultar;
--   · cobros_automaticos_pausados — lo que se cobra solo (renovaciones, reintentos…) se para.
-- Quien paga va primero y no tiene ninguna de las tres.
create or replace function public.situacion_derivada(
  p_estado text,
  p_subscription_id text,
  p_tiene_cadena boolean,
  p_cadena_estado text,
  p_cadena_subscription_id text,
  p_es_demo boolean,
  p_contrato_terminado boolean,
  p_supresion_pedida boolean,
  p_purgado boolean,
  p_fase_gratis text,
  p_dias_sin_actividad integer
)
returns table (
  estado text, motivo text, variante text, paga boolean,
  gestion_limitada boolean, servicio_alumnas_suspendido boolean, cobros_automaticos_pausados boolean
)
language plpgsql
immutable
set search_path = ''
as $$
declare
  c_dias_inactivo constant integer := 60;
  c_dias_suspendido constant integer := 90;
  v_tiene_cadena boolean := coalesce(p_tiene_cadena, false);
  v_demo boolean := coalesce(p_es_demo, false);
  v_dias integer := coalesce(p_dias_sin_actividad, 0);
begin
  -- Quien paga, primero y sin excepciones: ni una baja, ni una purga, ni la falta de uso.
  if public.paga_plan(p_estado, p_subscription_id)
     or (v_tiene_cadena and public.paga_plan(p_cadena_estado, p_cadena_subscription_id)) then
    return query select 'ACTIVO_PAGO'::text, null::text, null::text, true, false, false, false;
    return;
  end if;
  if coalesce(p_purgado, false) then
    return query select 'ELIMINADO'::text, null::text, null::text, false, true, true, true;
    return;
  end if;
  if coalesce(p_supresion_pedida, false) then
    return query select 'EN_BAJA'::text, 'borrado_pedido'::text, null::text, false, true, true, true;
    return;
  end if;
  if coalesce(p_contrato_terminado, false) then
    return query select 'EN_BAJA'::text, 'sin_plan'::text, null::text, false, true, true, true;
    return;
  end if;
  -- Contrato vivo en Stripe: no se suspende ni se pausa nada (el panel pide actualizar la tarjeta, como hoy).
  if p_estado = 'unpaid' or (v_tiene_cadena and p_cadena_estado = 'unpaid') then
    return query select 'PAGO_PENDIENTE'::text, null::text, null::text, false, true, false, false;
    return;
  end if;
  if p_estado in ('gratis', 'gratis_cerrado')
     or (p_estado = 'trialing' and nullif(p_subscription_id, '') is null)
     or (p_estado = 'incomplete' and not v_tiene_cadena) then
    -- El límite del gratis gana a la falta de uso: ese estudio funciona y sus alumnas siguen.
    if p_estado = 'gratis_cerrado' or p_fase_gratis = 'CERRADO' then
      return query select 'SUSPENDIDO'::text, 'limite_gratis'::text, 'funciona'::text, false, true, false, true;
    elsif not v_demo and v_dias >= c_dias_suspendido then
      return query select 'SUSPENDIDO'::text, 'abandono'::text, 'sin_senales'::text, false, true, true, true;
    elsif not v_demo and v_dias >= c_dias_inactivo then
      return query select 'INACTIVO'::text, 'abandono'::text, null::text, false, false, false, true;
    elsif p_fase_gratis = 'MARGEN' then
      return query select 'GRATIS_EN_MARGEN'::text, null::text, null::text, false, false, false, false;
    else
      return query select 'GRATIS'::text, null::text, null::text, false, false, false, false;
    end if;
    return;
  end if;
  return query select 'SUSPENDIDO'::text, 'sin_plan'::text, 'funciona'::text, false, true, false, true;
end;
$$;

-- ── 3) La situación de un estudio, y la de todos ─────────────────────────────
create or replace function public.situacion_estudio(p_studio_id text, p_hoy date default public.hoy_estudio())
returns table (
  studio_id text,
  estado text,
  motivo text,
  variante text,
  paga boolean,
  gestion_limitada boolean,
  servicio_alumnas_suspendido boolean,
  cobros_automaticos_pausados boolean,
  es_demo boolean,
  suspendido_a_mano boolean,
  fase_gratis text,
  ultima_actividad timestamptz,
  ancla date,
  dias_de_cierre integer,
  dias_sin_actividad integer,
  senales jsonb,
  avisos text[]
)
language sql
stable
set search_path = ''
as $$
  with s as (
    select st.id, st.subscription_status, st.subscription_id, st.cadena_id, st.owner_auth_user_id,
           coalesce(st.es_demo, false) as es_demo, st.suspendido_en, st.contrato_terminado_en, st.supresion_pedida_en,
           st.creado_en, st.subscription_evento_en, st.ultimo_uso_panel_en, st.ultimo_uso_app_en,
           ca.id as cadena_encontrada,
           ca.subscription_status as cadena_estado, ca.subscription_id as cadena_subscription_id,
           ca.subscription_evento_en as cadena_evento_en
      from public.studios st
      left join public.cadenas ca on ca.id = st.cadena_id
     where st.id = p_studio_id
  ),
  -- El grupo de uso del gratis, como `leerUsoGratis`: el estudio y los gratis de su dueña.
  grupo as (
    select g.id
      from public.studios g, s
     where g.id = s.id
        or (s.owner_auth_user_id is not null and g.owner_auth_user_id = s.owner_auth_user_id
            and g.subscription_status in ('gratis', 'gratis_cerrado'))
  ),
  uso as (
    select case when count(u.studio_id) filter (where u.medido_en is not null and u.alumnas_activas is not null
                                                  and u.reservas_30_dias is not null) = (select count(*) from grupo)
                then sum(u.alumnas_activas)::integer end as alumnas,
           case when count(u.studio_id) filter (where u.medido_en is not null and u.alumnas_activas is not null
                                                  and u.reservas_30_dias is not null) = (select count(*) from grupo)
                then sum(u.reservas_30_dias)::integer end as reservas,
           min(u.excedido_desde) as excedido_desde
      from public.uso_plan_gratis u
     where u.studio_id in (select gr.id from grupo gr)
  ),
  fuentes as (select f.fuente, f.ultima from public.senales_actividad_real(p_studio_id, p_hoy) f),
  act as (select max(fu.ultima) as ultima, jsonb_object_agg(fu.fuente, fu.ultima) as por_fuente from fuentes fu),
  -- El ancla: la última actividad real, el alta o el último cambio de plan (el suyo o el de su cadena).
  anc as (
    select coalesce(greatest(
             (act.ultima at time zone 'Europe/Madrid')::date,
             (s.creado_en at time zone 'Europe/Madrid')::date,
             (s.subscription_evento_en at time zone 'Europe/Madrid')::date,
             (s.cadena_evento_en at time zone 'Europe/Madrid')::date
           ), p_hoy) as dia
      from s, act
  ),
  -- Los días de «Cierre del centro» entre el ancla (excluida) y hoy, cada uno una vez,
  -- y como mucho 365 por cierre (el tope de la prórroga de bonos).
  cie as (
    select count(distinct ce.primero + d.n)::integer as dias
      from (select greatest(c.desde, anc.dia + 1) as primero, least(c.hasta, c.desde + (365 - 1), p_hoy) as ultimo
              from public.cierres_estudio c cross join anc
             where c.studio_id = p_studio_id) as ce
      cross join lateral generate_series(0, ce.ultimo - ce.primero) as d(n)
  ),
  dias as (
    select greatest(p_hoy - anc.dia, 0) - cie.dias as sin_actividad from anc, cie
  ),
  fase as (select public.fase_plan_gratis(uso.alumnas, uso.reservas, uso.excedido_desde, p_hoy) as fase from uso),
  sit as (
    select x.*
      from s, dias, fase,
           lateral public.situacion_derivada(
             s.subscription_status, s.subscription_id, s.cadena_id is not null, s.cadena_estado, s.cadena_subscription_id,
             s.es_demo, s.contrato_terminado_en is not null, s.supresion_pedida_en is not null,
             exists (select 1 from public.ciclo_estudios_vencidos cv
                      where cv.studio_id = s.id and cv.fase = 'purga' and cv.ejecutada_en is not null),
             fase.fase, dias.sin_actividad
           ) x
  )
  select s.id, sit.estado, sit.motivo, sit.variante, sit.paga,
         sit.gestion_limitada, sit.servicio_alumnas_suspendido, sit.cobros_automaticos_pausados,
         s.es_demo, s.suspendido_en is not null, fase.fase, act.ultima, anc.dia, cie.dias, dias.sin_actividad,
         jsonb_build_object(
           'fuentes', act.por_fuente,
           'subscription_status', s.subscription_status,
           'con_suscripcion_stripe', nullif(s.subscription_id, '') is not null,
           'cadena', case when s.cadena_id is null then null
                          else jsonb_build_object('subscription_status', s.cadena_estado,
                                                  'con_suscripcion_stripe', nullif(s.cadena_subscription_id, '') is not null) end,
           'uso_gratis', jsonb_build_object('alumnas', uso.alumnas, 'reservas', uso.reservas, 'excedido_desde', uso.excedido_desde)
         ),
         -- Lo dudoso: no cambia el estado, se apunta para revisarlo a mano.
         array_remove(array[
           case when sit.paga and (s.subscription_status = 'past_due' or s.cadena_estado = 'past_due') then 'past_due_sin_plazo' end,
           case when sit.paga and s.cadena_id is not null
                     and s.cadena_estado = 'active' and nullif(s.cadena_subscription_id, '') is null then 'plan_de_cadena_a_mano'
                when sit.paga and s.cadena_id is null
                     and s.subscription_status = 'active' and nullif(s.subscription_id, '') is null then 'plan_a_mano' end,
           case when sit.paga and (s.contrato_terminado_en is not null or s.supresion_pedida_en is not null) then 'paga_con_baja_abierta' end,
           case when s.cadena_id is not null and s.cadena_encontrada is null then 'cadena_no_encontrada' end,
           case when s.subscription_status = 'trialing' and nullif(s.subscription_id, '') is null then 'prueba_local' end,
           case when s.subscription_status = 'incomplete' then 'pago_a_medias' end,
           case when sit.estado in ('GRATIS', 'GRATIS_EN_MARGEN', 'INACTIVO') and fase.fase = 'SIN_MEDIR' then 'gratis_sin_medir' end,
           case when s.es_demo and not sit.paga and dias.sin_actividad >= 60 then 'demo_fuera_de_transiciones' end,
           case when s.es_demo and s.cadena_id is not null and not exists (
                  select 1 from public.studios o
                   where o.cadena_id = s.cadena_id and o.id <> s.id
                     and (o.creado_en < s.creado_en or (o.creado_en = s.creado_en and o.id < s.id)))
                then 'demo_es_sede_principal_por_antiguedad' end,
           case when s.suspendido_en is not null then 'suspendido_a_mano' end,
           case when s.ultimo_uso_panel_en is null then 'sin_marca_de_panel' end,
           case when s.ultimo_uso_panel_en >= ((p_hoy + 1)::timestamp at time zone 'Europe/Madrid')
                  or s.ultimo_uso_app_en >= ((p_hoy + 1)::timestamp at time zone 'Europe/Madrid') then 'marca_posterior_al_dia' end
         ]::text[], null)
    from s, act, anc, cie, dias, uso, fase, sit;
$$;

create or replace function public.situacion_estudios(p_hoy date default public.hoy_estudio())
returns table (
  studio_id text,
  estado text,
  motivo text,
  variante text,
  paga boolean,
  gestion_limitada boolean,
  servicio_alumnas_suspendido boolean,
  cobros_automaticos_pausados boolean,
  es_demo boolean,
  suspendido_a_mano boolean,
  fase_gratis text,
  ultima_actividad timestamptz,
  ancla date,
  dias_de_cierre integer,
  dias_sin_actividad integer,
  senales jsonb,
  avisos text[]
)
language sql
stable
set search_path = ''
as $$
  select x.* from public.studios st cross join lateral public.situacion_estudio(st.id, p_hoy) x order by st.id;
$$;

-- ── 4) El informe diario ─────────────────────────────────────────────────────
create table if not exists public.estudio_situacion_diaria (
  studio_id text not null references public.studios (id) on delete cascade,
  dia date not null,
  estado text not null check (estado in (
    'ACTIVO_PAGO', 'PAGO_PENDIENTE', 'GRATIS', 'GRATIS_EN_MARGEN', 'INACTIVO', 'SUSPENDIDO', 'EN_BAJA', 'ELIMINADO', 'ERROR')),
  motivo text,
  variante text,
  paga boolean,
  gestion_limitada boolean,
  servicio_alumnas_suspendido boolean,
  cobros_automaticos_pausados boolean,
  -- Las señales usadas (ancla, días, fase del gratis, última señal por fuente…).
  senales jsonb not null default '{}'::jsonb,
  -- Los casos dudosos y, con estado ERROR, el fallo del cálculo.
  avisos text[] not null default '{}',
  calculado_en timestamptz not null default now(),
  primary key (studio_id, dia)
);

create index if not exists idx_estudio_situacion_diaria_dia on public.estudio_situacion_diaria (dia);

comment on table public.estudio_situacion_diaria is
  'Informe (solo lectura) de la situación de cada estudio, una fila por estudio y día de Madrid. Lo escribe registrar_situacion_diaria con BAJAS_AUTOMATICAS=informe; nada lo lee para decidir.';

alter table public.estudio_situacion_diaria enable row level security;
revoke all on table public.estudio_situacion_diaria from anon, authenticated;

drop policy if exists exige_doble_factor on public.estudio_situacion_diaria;
create policy exige_doble_factor on public.estudio_situacion_diaria as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()));

-- Una fila por estudio y día. Lo ya escrito ese día no se reescribe (solo un ERROR,
-- que se reintenta en la pasada siguiente). Un fallo en un estudio no corta los demás.
--
-- La marca del panel arranca la PRIMERA vez que un estudio entra en el informe con la
-- última sesión de alguien de su equipo (la propietaria o una ficha activa con cuenta):
-- hasta entonces no había marca, y sin ese punto de partida el informe vería inactivo a
-- quien abre el panel sin hacer cambios. `auth.sessions` no sirve como fuente continua
-- (es por persona y se borra al cerrar sesión): después manda la marca. Por eso es
-- SECURITY DEFINER, y solo para service_role.
create or replace function public.registrar_situacion_diaria(p_hoy date default public.hoy_estudio())
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id text;
  v_escritas integer := 0;
  v_ya integer := 0;
  v_errores integer := 0;
  v_sembradas integer := 0;
begin
  with x as (
    select eq.studio_id, max(greatest(se.refreshed_at at time zone 'UTC', se.updated_at, se.created_at)) as ultima
      from (select s.id as studio_id, s.owner_auth_user_id as uid
              from public.studios s where s.owner_auth_user_id is not null
            union
            select i.studio_id, i.auth_user_id
              from public.instructores i where i.auth_user_id is not null and coalesce(i.activo, true)) as eq
      join auth.sessions se on se.user_id = eq.uid
     group by eq.studio_id
  ), sembradas as (
    update public.studios st
       set ultimo_uso_panel_en = x.ultima
      from x
     where st.id = x.studio_id
       and st.ultimo_uso_panel_en is null
       and x.ultima <= now()
       and not exists (select 1 from public.estudio_situacion_diaria d where d.studio_id = st.id)
    returning 1
  )
  select count(*) into v_sembradas from sembradas;

  for v_id in select st.id from public.studios st order by st.id loop
    if exists (select 1 from public.estudio_situacion_diaria d
                where d.studio_id = v_id and d.dia = p_hoy and d.estado <> 'ERROR') then
      v_ya := v_ya + 1;
      continue;
    end if;
    begin
      insert into public.estudio_situacion_diaria as d (
        studio_id, dia, estado, motivo, variante, paga, gestion_limitada, servicio_alumnas_suspendido,
        cobros_automaticos_pausados, senales, avisos, calculado_en)
      select x.studio_id, p_hoy, x.estado, x.motivo, x.variante, x.paga, x.gestion_limitada, x.servicio_alumnas_suspendido,
             x.cobros_automaticos_pausados,
             x.senales || jsonb_build_object(
               'fase_gratis', x.fase_gratis, 'ultima_actividad', x.ultima_actividad, 'ancla', x.ancla,
               'dias_de_cierre', x.dias_de_cierre, 'dias_sin_actividad', x.dias_sin_actividad,
               'es_demo', x.es_demo, 'suspendido_a_mano', x.suspendido_a_mano),
             x.avisos, now()
        from public.situacion_estudio(v_id, p_hoy) x
      on conflict (studio_id, dia) do update
         set estado = excluded.estado, motivo = excluded.motivo, variante = excluded.variante, paga = excluded.paga,
             gestion_limitada = excluded.gestion_limitada, servicio_alumnas_suspendido = excluded.servicio_alumnas_suspendido,
             cobros_automaticos_pausados = excluded.cobros_automaticos_pausados, senales = excluded.senales,
             avisos = excluded.avisos, calculado_en = excluded.calculado_en
       where d.estado = 'ERROR';
      v_escritas := v_escritas + 1;
    exception when others then
      v_errores := v_errores + 1;
      -- Apuntar el fallo tampoco puede cortar a los demás (p. ej. un estudio borrado en medio).
      begin
        insert into public.estudio_situacion_diaria as d (studio_id, dia, estado, avisos, calculado_en)
        values (v_id, p_hoy, 'ERROR', array['error_calculo: ' || sqlstate || ' ' || sqlerrm], now())
        on conflict (studio_id, dia) do update set avisos = excluded.avisos, calculado_en = excluded.calculado_en
         where d.estado = 'ERROR';
      exception when others then
        null;
      end;
    end;
  end loop;

  return jsonb_build_object('dia', p_hoy, 'escritas', v_escritas, 'ya_estaban', v_ya, 'errores', v_errores,
                            'marcas_de_panel_iniciales', v_sembradas);
end;
$$;

-- ── Solo service_role ────────────────────────────────────────────────────────
-- `pg_default_acl` da EXECUTE directo a anon/authenticated: REVOKE de PUBLIC no basta.
revoke execute on function public.marcar_uso_panel(text) from public, anon, authenticated;
revoke execute on function public.marcar_uso_app(text) from public, anon, authenticated;
revoke execute on function public.senales_actividad_real(text, date) from public, anon, authenticated;
revoke execute on function public.ultima_actividad_real(text, date) from public, anon, authenticated;
revoke execute on function public.paga_plan(text, text) from public, anon, authenticated;
revoke execute on function public.fase_plan_gratis(integer, integer, date, date) from public, anon, authenticated;
revoke execute on function public.situacion_derivada(text, text, boolean, text, text, boolean, boolean, boolean, boolean, text, integer) from public, anon, authenticated;
revoke execute on function public.situacion_estudio(text, date) from public, anon, authenticated;
revoke execute on function public.situacion_estudios(date) from public, anon, authenticated;
revoke execute on function public.registrar_situacion_diaria(date) from public, anon, authenticated;

grant execute on function public.marcar_uso_panel(text) to service_role;
grant execute on function public.marcar_uso_app(text) to service_role;
grant execute on function public.senales_actividad_real(text, date) to service_role;
grant execute on function public.ultima_actividad_real(text, date) to service_role;
grant execute on function public.paga_plan(text, text) to service_role;
grant execute on function public.fase_plan_gratis(integer, integer, date, date) to service_role;
grant execute on function public.situacion_derivada(text, text, boolean, text, text, boolean, boolean, boolean, boolean, text, integer) to service_role;
grant execute on function public.situacion_estudio(text, date) to service_role;
grant execute on function public.situacion_estudios(date) to service_role;
grant execute on function public.registrar_situacion_diaria(date) to service_role;

-- ── Verificación ─────────────────────────────────────────────────────────────
do $$
declare
  f text;
  c text;
begin
  foreach f in array array[
    'public.marcar_uso_panel(text)', 'public.marcar_uso_app(text)',
    'public.senales_actividad_real(text, date)', 'public.ultima_actividad_real(text, date)',
    'public.paga_plan(text, text)', 'public.fase_plan_gratis(integer, integer, date, date)',
    'public.situacion_derivada(text, text, boolean, text, text, boolean, boolean, boolean, boolean, text, integer)',
    'public.situacion_estudio(text, date)', 'public.situacion_estudios(date)', 'public.registrar_situacion_diaria(date)'
  ] loop
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE')
       or not has_function_privilege('service_role', f, 'EXECUTE') then
      raise exception '% tiene que ser solo de service_role', f;
    end if;
  end loop;

  foreach c in array array['ultimo_uso_panel_en', 'ultimo_uso_app_en'] loop
    if has_column_privilege('authenticated', 'public.studios', c, 'UPDATE')
       or has_column_privilege('anon', 'public.studios', c, 'UPDATE')
       or has_column_privilege('anon', 'public.studios', c, 'INSERT')
       or has_column_privilege('anon', 'public.studios', c, 'SELECT') then
      raise exception 'studios.%: la escribe (o la lee sin sesión) alguien que no es el servidor', c;
    end if;
    -- El INSERT de `studios` va por columnas desde 20261016115000: una columna nueva nace no insertable.
    if has_column_privilege('authenticated', 'public.studios', c, 'INSERT') then
      raise exception 'studios.%: authenticated puede fijarla al crear un estudio (¿falta 20261016115000?)', c;
    end if;
  end loop;

  if has_any_column_privilege('anon', 'public.estudio_situacion_diaria', 'SELECT')
     or has_any_column_privilege('authenticated', 'public.estudio_situacion_diaria', 'SELECT')
     or has_any_column_privilege('authenticated', 'public.estudio_situacion_diaria', 'INSERT')
     or has_any_column_privilege('authenticated', 'public.estudio_situacion_diaria', 'UPDATE')
     or has_table_privilege('authenticated', 'public.estudio_situacion_diaria', 'DELETE') then
    raise exception 'estudio_situacion_diaria: solo la lee y la escribe el servidor';
  end if;
  if not exists (select 1 from pg_class where oid = 'public.estudio_situacion_diaria'::regclass and relrowsecurity)
     or not exists (select 1 from pg_policy where polrelid = 'public.estudio_situacion_diaria'::regclass
                     and polname = 'exige_doble_factor' and not polpermissive) then
    raise exception 'estudio_situacion_diaria: falta la RLS o la política exige_doble_factor';
  end if;
end $$;
