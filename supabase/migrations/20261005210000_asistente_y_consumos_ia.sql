-- ─────────────────────────────────────────────────────────────────────────────
-- El asistente de Tentare (fase 1, solo lectura) y el libro de consumos de IA.
-- Encargo del fundador del 5-oct-2026; spec en bdd-artefactos/spec-asistente-fase1.md.
--
--   asistente_conversaciones / asistente_mensajes
--     El historial con autoridad del SERVIDOR: el navegador no puede inventar
--     resultados de herramientas ni inflar el contexto. SIN NOMBRES: las
--     personas viajan como referencias (`[ALUMNA_3]`) y `referencias` guarda
--     ref → id; los nombres se resuelven al leer, en el servidor, y solo van al
--     navegador. El borrado RGPD de una socia no deja rastro aquí.
--     Retención 90 días (la purga la hace la ruta al abrir una conversación nueva).
--
--   ia_consumos
--     Una fila por pregunta: se RESERVA antes de llamar a Anthropic y se CIERRA
--     con lo medido. Sin contenido (solo tokens, coste y unidades): se conserva.
--
--   ia_packs
--     Consultas compradas aparte (fase 3 las vende; aquí existe vacía y el
--     saldo ya las cuenta, así que la aritmética del saldo es la definitiva).
--
-- RPC, todas SOLO service_role:
--   ia_cuota_mensual(plan, en_prueba)  la cuota (espejo TS: lib/billing/entitlements.ts)
--   ia_saldo_consultas(estudio)        la ÚNICA dueña del saldo
--   ia_reservar_consulta(...)          fail-closed: sin saldo o sobre los topes, no hay llamada
--   ia_cerrar_consulta(...)            la ÚNICA dueña de la fórmula de unidades; idempotente
--
-- ⚠️ Gotcha de RETURNS TABLE (tentare-os.md, Fase 2b): sus columnas son variables
-- dentro del cuerpo. Aquí `unidades`, `periodo` y `disponibles` coinciden con
-- columnas de las tablas, así que TODA columna va calificada con su alias y
-- además `#variable_conflict use_column`.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Conversaciones ──────────────────────────────────────────────────────────
create table public.asistente_conversaciones (
  id uuid primary key default gen_random_uuid(),
  studio_id text not null references public.studios(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  rol text not null check (rol in ('PROPIETARIO', 'MANAGER')),
  -- La primera pregunta, ya seudonimizada.
  titulo text check (char_length(titulo) <= 120),
  -- ref → { tipo, id }. Ids, nunca nombres.
  referencias jsonb not null default '{}'::jsonb,
  -- input + cache_read + cache_creation de la última llamada: el tope de 40K.
  tokens_contexto integer not null default 0,
  -- Toma de turno (compare-and-set en la ruta): dos pestañas no responden a la vez.
  en_curso_desde timestamptz,
  creada_en timestamptz not null default now(),
  ultima_en timestamptz not null default now()
);
create index asistente_conversaciones_usuario on public.asistente_conversaciones (studio_id, auth_user_id, ultima_en desc);
comment on table public.asistente_conversaciones is
  'Conversaciones del asistente (fase 1). Sin nombres: referencias guarda ref → id. Solo escribe el servidor.';

create table public.asistente_mensajes (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references public.asistente_conversaciones(id) on delete cascade,
  studio_id text not null references public.studios(id) on delete cascade,
  orden integer not null,
  rol text not null check (rol in ('user', 'assistant')),
  -- Bloques de Anthropic tal cual se enviaron/recibieron (seudonimizados).
  contenido jsonb not null,
  -- BloqueAsistente[] del turno (ids y refs).
  bloques jsonb not null default '[]'::jsonb,
  consumo_id uuid,
  creado_en timestamptz not null default now(),
  unique (conversacion_id, orden)
);
create index asistente_mensajes_estudio on public.asistente_mensajes (studio_id);
comment on table public.asistente_mensajes is
  'Mensajes de una conversación del asistente, seudonimizados. Solo escribe el servidor.';

-- ── Libro de consumos ───────────────────────────────────────────────────────
create table public.ia_consumos (
  id uuid primary key default gen_random_uuid(),
  studio_id text not null references public.studios(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  origen text not null check (origen in ('ASISTENTE')),
  conversacion_id uuid references public.asistente_conversaciones(id) on delete set null,
  modelo text not null,
  estado text not null default 'RESERVADA' check (estado in ('RESERVADA', 'CONSUMIDA', 'FALLIDA', 'LIBERADA')),
  -- Mes de Madrid al reservar.
  periodo text not null check (periodo ~ '^\d{4}-\d{2}$'),
  coste_max_usd numeric(10,6) not null check (coste_max_usd > 0),
  input_tokens integer not null default 0,
  cache_read_input_tokens integer not null default 0,
  cache_creation_input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  n_llamadas smallint not null default 0,
  n_herramientas smallint not null default 0,
  -- Registro de auditoría de QUÉ datos se consultaron (los nombres de las
  -- herramientas, nunca sus resultados): quién (auth_user_id), cuándo y qué.
  herramientas text[] not null default '{}',
  coste_usd numeric(10,6),
  unidades smallint not null default 0 check (unidades between 0 and 5),
  unidades_cuota smallint not null default 0,
  unidades_pack smallint not null default 0,
  unidades_sin_saldo smallint not null default 0,
  codigo_error text,
  creado_en timestamptz not null default now(),
  cerrado_en timestamptz,
  check (unidades = unidades_cuota + unidades_pack + unidades_sin_saldo)
);
create index ia_consumos_estudio_periodo on public.ia_consumos (studio_id, periodo);
create index ia_consumos_dia on public.ia_consumos (creado_en);
create index ia_consumos_reservadas on public.ia_consumos (studio_id) where estado = 'RESERVADA';
create index ia_consumos_conversacion on public.ia_consumos (conversacion_id) where conversacion_id is not null;
comment on table public.ia_consumos is
  'Una fila por pregunta a la IA: reservada antes de llamar, cerrada con lo medido. Sin contenido. Solo escribe el servidor (RPC).';

alter table public.asistente_mensajes
  add constraint asistente_mensajes_consumo_fk foreign key (consumo_id) references public.ia_consumos(id) on delete set null;
create index asistente_mensajes_consumo on public.asistente_mensajes (consumo_id) where consumo_id is not null;

-- ── Packs (fase 3 los vende; IVA incluido en precio_eur) ────────────────────
create table public.ia_packs (
  id uuid primary key default gen_random_uuid(),
  studio_id text not null references public.studios(id) on delete cascade,
  unidades integer not null check (unidades in (100, 300, 1000)),
  unidades_usadas integer not null default 0 check (unidades_usadas between 0 and unidades),
  -- Con IVA incluido (como los planes de /precios). Catálogo: lib/asistente/packs.ts.
  precio_eur numeric(6,2) not null,
  comprado_en timestamptz not null default now(),
  -- comprado_en + 12 meses; lo pone quien inserta.
  caduca_en timestamptz not null,
  estado text not null default 'ACTIVO' check (estado in ('ACTIVO', 'REEMBOLSADO')),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  check (caduca_en > comprado_en)
);
create index ia_packs_vigentes on public.ia_packs (studio_id, caduca_en) where estado = 'ACTIVO';
comment on table public.ia_packs is
  'Packs de consultas de IA comprados por el estudio (fase 3). En fase 1, vacía. Solo escribe el servidor.';

-- ── RLS: el navegador solo LEE lo suyo, y nadie escribe desde él ────────────
alter table public.asistente_conversaciones enable row level security;
alter table public.asistente_mensajes enable row level security;
alter table public.ia_consumos enable row level security;
alter table public.ia_packs enable row level security;
revoke all on table public.asistente_conversaciones from anon, authenticated;
revoke all on table public.asistente_mensajes from anon, authenticated;
revoke all on table public.ia_consumos from anon, authenticated;
revoke all on table public.ia_packs from anon, authenticated;
grant select on table public.asistente_conversaciones to authenticated;
grant select on table public.asistente_mensajes to authenticated;
grant select on table public.ia_consumos to authenticated;
grant select on table public.ia_packs to authenticated;

-- Una conversación es de quien la tuvo: la gerente no lee las de la propietaria
-- ni al revés. Mismo criterio en la ruta (studio_id Y auth_user_id).
create policy asistente_conversaciones_propias on public.asistente_conversaciones for select to authenticated
  using (
    studio_id = (select public.current_studio_id())
    and auth_user_id = (select auth.uid())
    and (select public.current_rol()) in ('PROPIETARIO', 'MANAGER')
  );

create policy asistente_mensajes_propios on public.asistente_mensajes for select to authenticated
  using (
    studio_id = (select public.current_studio_id())
    and (select public.current_rol()) in ('PROPIETARIO', 'MANAGER')
    and exists (
      select 1 from public.asistente_conversaciones c
       where c.id = asistente_mensajes.conversacion_id
         and c.studio_id = asistente_mensajes.studio_id
         and c.auth_user_id = (select auth.uid())
    )
  );

-- Los consumos: la propietaria, todos los del estudio; la gerente, los suyos.
create policy ia_consumos_lectura on public.ia_consumos for select to authenticated
  using (
    studio_id = (select public.current_studio_id())
    and (
      (select public.current_rol()) = 'PROPIETARIO'
      or ((select public.current_rol()) = 'MANAGER' and auth_user_id = (select auth.uid()))
    )
  );

-- Los packs son dinero: solo la propietaria.
create policy ia_packs_lectura on public.ia_packs for select to authenticated
  using (
    studio_id = (select public.current_studio_id())
    and (select public.current_rol()) = 'PROPIETARIO'
  );

-- La restrictiva de 20261003102845 en toda tabla con RLS (supabase/tests/rls-doble-factor.test.ts).
create policy exige_doble_factor on public.asistente_conversaciones as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()));
create policy exige_doble_factor on public.asistente_mensajes as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()));
create policy exige_doble_factor on public.ia_consumos as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()));
create policy exige_doble_factor on public.ia_packs as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()));

-- ── La cuota ────────────────────────────────────────────────────────────────
-- Por mes de Madrid según el plan (Founding Studio = BASE). En la prueba
-- gratuita, 30 en TOTAL, no por mes (decisión del 5-oct-2026: una cuenta de
-- prueba no estrena las 200 de Estudio). Espejo TS para los textos y su test
-- cruzado: `CONSULTAS_ASISTENTE` en lib/billing/entitlements.ts.
create or replace function public.ia_cuota_mensual(p_plan text, p_en_prueba boolean)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(p_en_prueba, false) then 30
    when p_plan = 'ESTUDIO' then 200
    when p_plan = 'CADENA' then 500
    else 50
  end;
$$;

-- ── El saldo: la ÚNICA dueña de la aritmética ───────────────────────────────
-- disponibles = lo que queda de cuota + lo que queda de packs vigentes − lo que
-- está en vuelo. Una RESERVADA de menos de 5 minutos cuenta 1 (la pregunta que
-- se está respondiendo); una más vieja, 5 (un proceso muerto: Anthropic pudo
-- cobrar lo máximo; conservador hasta que la siguiente reserva la limpie).
create or replace function public.ia_saldo_consultas(p_studio_id text)
returns table (
  periodo text, en_prueba boolean, cuota integer, usadas integer, en_vuelo integer,
  packs jsonb, disponibles integer, renueva_el date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_plan text;
  v_status text;
  v_sub text;
  v_prueba boolean;
  v_periodo text := to_char(now() at time zone 'Europe/Madrid', 'YYYY-MM');
  v_cuota integer;
  v_usadas integer;
  v_vuelo integer;
  v_packs_quedan integer;
  v_packs jsonb;
begin
  select s.plan, s.subscription_status, s.subscription_id into v_plan, v_status, v_sub
    from public.studios s where s.id = p_studio_id;
  if not found then return; end if;

  -- La prueba LOCAL (sin tarjeta): 'trialing' sin suscripción de Stripe.
  v_prueba := coalesce(v_status = 'trialing' and v_sub is null, false);
  v_cuota := public.ia_cuota_mensual(v_plan, v_prueba);

  select coalesce(sum(c.unidades_cuota), 0)::integer into v_usadas
    from public.ia_consumos c
   where c.studio_id = p_studio_id and c.estado = 'CONSUMIDA'
     and (v_prueba or c.periodo = v_periodo);

  select coalesce(sum(case when c.creado_en > now() - interval '5 minutes' then 1 else 5 end), 0)::integer into v_vuelo
    from public.ia_consumos c
   where c.studio_id = p_studio_id and c.estado = 'RESERVADA';

  select coalesce(sum(p.unidades - p.unidades_usadas), 0)::integer,
         coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'quedan', p.unidades - p.unidades_usadas, 'caduca_en', p.caduca_en)
                            order by p.caduca_en), '[]'::jsonb)
    into v_packs_quedan, v_packs
    from public.ia_packs p
   where p.studio_id = p_studio_id and p.estado = 'ACTIVO' and p.caduca_en > now() and p.unidades_usadas < p.unidades;

  return query select
    v_periodo, v_prueba, v_cuota, v_usadas, v_vuelo, v_packs,
    greatest(0, greatest(0, v_cuota - v_usadas) + v_packs_quedan - v_vuelo)::integer,
    case when v_prueba then null
         else (date_trunc('month', now() at time zone 'Europe/Madrid') + interval '1 month')::date end;
end;
$$;

-- ── Reservar una consulta (fail-closed) ─────────────────────────────────────
-- Antes de llamar a Anthropic. El FOR UPDATE de la fila del estudio serializa
-- reservas y cierres del MISMO estudio (milisegundos): dos pestañas no gastan la
-- última consulta las dos. Topes de catástrofe en dólares (coste real o, si no
-- se ha cerrado, el máximo reservado): 3 $/día por estudio y 50 $/día en total
-- (este sin bloqueo global a propósito: el exceso posible es concurrencia ×
-- 0,15 $; es un freno de catástrofes, no de céntimos).
create or replace function public.ia_reservar_consulta(
  p_studio_id text, p_auth_user_id uuid, p_origen text, p_conversacion_id uuid, p_modelo text, p_coste_max_usd numeric
)
returns table (consumo_id uuid, codigo text, disponibles integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_saldo record;
  v_inicio_dia timestamptz := (date_trunc('day', now() at time zone 'Europe/Madrid')) at time zone 'Europe/Madrid';
  v_gasto_estudio numeric;
  v_gasto_global numeric;
  v_id uuid;
begin
  if p_coste_max_usd is null or p_coste_max_usd <= 0 or p_coste_max_usd > 1 then
    raise exception 'coste máximo fuera de rango: %', p_coste_max_usd;
  end if;

  perform 1 from public.studios s where s.id = p_studio_id for update;
  if not found then
    return query select null::uuid, 'SIN_ESTUDIO'::text, 0;
    return;
  end if;

  -- Huérfanas: una reserva de hace más de 10 minutos es de una función que murió
  -- (la ruta tiene maxDuration = 60). Pasa a FALLIDA con su máximo como coste
  -- (Anthropic pudo cobrarlo) y 0 unidades a la clienta: lo absorbe Tentare.
  update public.ia_consumos c
     set estado = 'FALLIDA', codigo_error = 'HUERFANA', coste_usd = c.coste_max_usd, cerrado_en = now()
   where c.studio_id = p_studio_id and c.estado = 'RESERVADA' and c.creado_en < now() - interval '10 minutes';

  select * into v_saldo from public.ia_saldo_consultas(p_studio_id) s;
  if coalesce(v_saldo.disponibles, 0) < 1 then
    return query select null::uuid, 'SIN_SALDO'::text, coalesce(v_saldo.disponibles, 0);
    return;
  end if;

  select coalesce(sum(coalesce(c.coste_usd, c.coste_max_usd)), 0) into v_gasto_estudio
    from public.ia_consumos c
   where c.studio_id = p_studio_id and c.creado_en >= v_inicio_dia and c.estado <> 'LIBERADA';
  if v_gasto_estudio + p_coste_max_usd > 3 then
    return query select null::uuid, 'TOPE_DIARIO_ESTUDIO'::text, v_saldo.disponibles;
    return;
  end if;

  select coalesce(sum(coalesce(c.coste_usd, c.coste_max_usd)), 0) into v_gasto_global
    from public.ia_consumos c
   where c.creado_en >= v_inicio_dia and c.estado <> 'LIBERADA';
  if v_gasto_global + p_coste_max_usd > 50 then
    return query select null::uuid, 'TOPE_DIARIO_GLOBAL'::text, v_saldo.disponibles;
    return;
  end if;

  insert into public.ia_consumos (studio_id, auth_user_id, origen, conversacion_id, modelo, periodo, coste_max_usd)
  values (p_studio_id, p_auth_user_id, p_origen, p_conversacion_id, p_modelo, v_saldo.periodo, p_coste_max_usd)
  returning id into v_id;

  return query select v_id, 'OK'::text, v_saldo.disponibles;
end;
$$;

-- ── Cerrar una consulta (idempotente) ───────────────────────────────────────
-- La ÚNICA dueña de la fórmula: 1 unidad por cada 0,03 $ empezados, de 1 a 5,
-- solo si se CONSUMIÓ. FALLIDA/LIBERADA = 0 unidades a la clienta, con el coste
-- real anotado (lo absorbe Tentare). Reparto: primero la cuota que queda, luego
-- los packs vigentes por caducidad (el que antes caduca, antes se gasta), y el
-- resto `unidades_sin_saldo` (la última pregunta del mes puede pasarse en ≤ 4:
-- se anota, no se esconde). Una segunda llamada con el mismo id devuelve lo ya
-- cerrado sin tocar nada.
create or replace function public.ia_cerrar_consulta(
  p_consumo_id uuid, p_studio_id text, p_estado text,
  p_input integer, p_cache_read integer, p_cache_creation integer, p_output integer,
  p_coste_usd numeric, p_n_llamadas integer, p_n_herramientas integer, p_codigo_error text, p_herramientas text[]
)
returns table (unidades_cobradas integer, disponibles integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_c record;
  v_saldo record;
  v_u integer;
  v_cuota_queda integer;
  v_de_cuota integer := 0;
  v_de_pack integer := 0;
  v_resto integer;
  v_pack record;
  v_toma integer;
begin
  if p_estado not in ('CONSUMIDA', 'FALLIDA', 'LIBERADA') then
    raise exception 'estado de cierre no válido: %', p_estado;
  end if;

  -- Mismo orden de bloqueo que la reserva (estudio y luego consumo): sin interbloqueos.
  perform 1 from public.studios s where s.id = p_studio_id for update;

  select c.* into v_c from public.ia_consumos c
   where c.id = p_consumo_id and c.studio_id = p_studio_id
   for update;
  if not found then
    raise exception 'consumo % no existe en el estudio', p_consumo_id;
  end if;

  if v_c.estado <> 'RESERVADA' then
    select * into v_saldo from public.ia_saldo_consultas(p_studio_id) s;
    return query select v_c.unidades::integer, coalesce(v_saldo.disponibles, 0);
    return;
  end if;

  v_u := case when p_estado = 'CONSUMIDA'
              then least(5, greatest(1, ceil(coalesce(p_coste_usd, 0) / 0.03)))::integer
              else 0 end;

  if v_u > 0 then
    -- Lo que queda de cuota SIN contar esta reserva (aún RESERVADA): el saldo la
    -- cuenta como «en vuelo», y aquí se está liquidando precisamente ella.
    select * into v_saldo from public.ia_saldo_consultas(p_studio_id) s;
    v_cuota_queda := greatest(0, v_saldo.cuota - v_saldo.usadas);
    v_de_cuota := least(v_u, v_cuota_queda);
    v_resto := v_u - v_de_cuota;

    if v_resto > 0 then
      for v_pack in
        select p.id, p.unidades - p.unidades_usadas as quedan
          from public.ia_packs p
         where p.studio_id = p_studio_id and p.estado = 'ACTIVO' and p.caduca_en > now() and p.unidades_usadas < p.unidades
         order by p.caduca_en, p.id
         for update
      loop
        exit when v_resto <= 0;
        v_toma := least(v_resto, v_pack.quedan);
        update public.ia_packs p set unidades_usadas = p.unidades_usadas + v_toma where p.id = v_pack.id;
        v_de_pack := v_de_pack + v_toma;
        v_resto := v_resto - v_toma;
      end loop;
    end if;
  end if;

  update public.ia_consumos c set
    estado = p_estado,
    input_tokens = greatest(0, coalesce(p_input, 0)),
    cache_read_input_tokens = greatest(0, coalesce(p_cache_read, 0)),
    cache_creation_input_tokens = greatest(0, coalesce(p_cache_creation, 0)),
    output_tokens = greatest(0, coalesce(p_output, 0)),
    n_llamadas = least(32767, greatest(0, coalesce(p_n_llamadas, 0))),
    n_herramientas = least(32767, greatest(0, coalesce(p_n_herramientas, 0))),
    herramientas = coalesce(p_herramientas, '{}'),
    coste_usd = greatest(0, coalesce(p_coste_usd, 0)),
    unidades = v_u,
    unidades_cuota = v_de_cuota,
    unidades_pack = v_de_pack,
    unidades_sin_saldo = v_u - v_de_cuota - v_de_pack,
    codigo_error = p_codigo_error,
    cerrado_en = now()
  where c.id = p_consumo_id;

  select * into v_saldo from public.ia_saldo_consultas(p_studio_id) s;
  return query select v_u, coalesce(v_saldo.disponibles, 0);
end;
$$;

-- ── Solo service_role, con los TRES pasos ───────────────────────────────────
-- `pg_default_acl` de este proyecto da EXECUTE directo a anon/authenticated en
-- toda función nueva: revocar PUBLIC no basta (tentare-os.md, «Seguridad»).
revoke all on function public.ia_cuota_mensual(text, boolean) from public;
revoke all on function public.ia_cuota_mensual(text, boolean) from anon;
revoke all on function public.ia_cuota_mensual(text, boolean) from authenticated;
grant execute on function public.ia_cuota_mensual(text, boolean) to service_role;

revoke all on function public.ia_saldo_consultas(text) from public;
revoke all on function public.ia_saldo_consultas(text) from anon;
revoke all on function public.ia_saldo_consultas(text) from authenticated;
grant execute on function public.ia_saldo_consultas(text) to service_role;

revoke all on function public.ia_reservar_consulta(text, uuid, text, uuid, text, numeric) from public;
revoke all on function public.ia_reservar_consulta(text, uuid, text, uuid, text, numeric) from anon;
revoke all on function public.ia_reservar_consulta(text, uuid, text, uuid, text, numeric) from authenticated;
grant execute on function public.ia_reservar_consulta(text, uuid, text, uuid, text, numeric) to service_role;

revoke all on function public.ia_cerrar_consulta(uuid, text, text, integer, integer, integer, integer, numeric, integer, integer, text, text[]) from public;
revoke all on function public.ia_cerrar_consulta(uuid, text, text, integer, integer, integer, integer, numeric, integer, integer, text, text[]) from anon;
revoke all on function public.ia_cerrar_consulta(uuid, text, text, integer, integer, integer, integer, numeric, integer, integer, text, text[]) from authenticated;
grant execute on function public.ia_cerrar_consulta(uuid, text, text, integer, integer, integer, integer, numeric, integer, integer, text, text[]) to service_role;

-- Y se comprueba aquí, no se fía del comentario: si anon o authenticated pueden
-- ejecutar cualquiera de las cuatro, la migración no se aplica. (Lo vigila
-- también supabase/tests/rls-grants-funciones.test.ts.)
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.ia_cuota_mensual(text, boolean)',
    'public.ia_saldo_consultas(text)',
    'public.ia_reservar_consulta(text, uuid, text, uuid, text, numeric)',
    'public.ia_cerrar_consulta(uuid, text, text, integer, integer, integer, integer, numeric, integer, integer, text, text[])'
  ] loop
    if has_function_privilege('anon', v_fn, 'EXECUTE') then
      raise exception 'anon puede ejecutar %', v_fn;
    end if;
    if has_function_privilege('authenticated', v_fn, 'EXECUTE') then
      raise exception 'authenticated puede ejecutar %: cualquier sesión se daría consultas o leería el saldo de otro estudio', v_fn;
    end if;
    if not has_function_privilege('service_role', v_fn, 'EXECUTE') then
      raise exception 'service_role no puede ejecutar %: el asistente se quedaría sin libro', v_fn;
    end if;
  end loop;
end
$$;
