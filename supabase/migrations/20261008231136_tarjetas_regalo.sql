-- ─────────────────────────────────────────────────────────────────────────────
-- Tarjeta regalo (MVP). Saldo en euros, canjeable en varias veces.
--
-- Qué es y qué NO es (decisiones de tentare-producto, 9-oct-2026):
--   · Es un PASIVO del estudio hasta que se usa. NO es un recibo, NO es ingreso
--     de clase y NO entra en `recibos` ni en las cifras de Informes: lo vendido y
--     lo usado viven aquí, en su propio libro. Ver docs/tarjeta-regalo.md.
--   · El libro `movimientos_regalo` es solo de inserción: saldo = suma de `delta`.
--     Misma idea que `movimientos_derecho`.
--   · Nada de esto lo escribe el navegador. Las escrituras son RPC de
--     `service_role` (la app las llama tras comprobar rol y, en la compra, tras
--     confirmar el cobro con Stripe).
--   · La caducidad se evalúa al LEER y al GASTAR con `hoy_estudio()` (el día de
--     Madrid, nunca `current_date`). No hay cron: una tarjeta caducada no se
--     "reconoce" sola como ingreso; qué hacer con ese saldo es una decisión
--     pendiente de la gestoría.
--   · El código se guarda en claro (hay que poder reenviar el correo) pero la
--     búsqueda va por su huella SHA-256; el navegador no lee ninguna de las dos
--     columnas (grant por columnas, abajo).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Ajustes del estudio ──────────────────────────────────────────────────────
create table public.regalo_ajustes (
  studio_id             text primary key references public.studios(id) on delete cascade,
  activo                boolean not null default false,
  importes_eur          integer[] not null default '{25,50,100}',
  permite_importe_libre boolean not null default true,
  importe_min_eur       integer not null default 10 check (importe_min_eur between 1 and 1000),
  importe_max_eur       integer not null default 300 check (importe_max_eur between 1 and 2000),
  caducidad_meses       integer not null default 12 check (caducidad_meses between 1 and 60),
  terminos              text check (terminos is null or char_length(terminos) <= 4000),
  actualizado_en        timestamptz not null default now(),
  constraint regalo_ajustes_rango check (importe_min_eur <= importe_max_eur),
  constraint regalo_ajustes_importes check (
    cardinality(importes_eur) <= 6 and 0 < all (importes_eur) and 2000 >= all (importes_eur)
  )
);
comment on table public.regalo_ajustes is
  'Producto «Tarjeta regalo» de cada estudio (uno por estudio). Apagado de serie: se vende solo si la propietaria lo activa. Solo lo escribe el servidor.';

-- 2. Tarjetas ─────────────────────────────────────────────────────────────────
create table public.tarjetas_regalo (
  id                  uuid primary key default gen_random_uuid(),
  studio_id           text not null references public.studios(id) on delete cascade,
  codigo              text not null,
  codigo_hash         text not null,
  importe_inicial     numeric(10,2) not null check (importe_inicial > 0),
  origen              text not null check (origen in ('ONLINE', 'MANUAL')),
  checkout_session_id text,
  payment_intent_id   text,
  metodo_manual       text check (metodo_manual is null or metodo_manual in ('EFECTIVO', 'TARJETA', 'BIZUM', 'TRANSFERENCIA')),
  comprador_nombre    text check (comprador_nombre is null or char_length(comprador_nombre) <= 120),
  comprador_email     text check (comprador_email is null or char_length(comprador_email) <= 200),
  destinatario_nombre text check (destinatario_nombre is null or char_length(destinatario_nombre) <= 120),
  destinatario_email  text check (destinatario_email is null or char_length(destinatario_email) <= 200),
  mensaje             text check (mensaje is null or char_length(mensaje) <= 400),
  caduca_en           date not null,
  estado              text not null default 'ACTIVA' check (estado in ('ACTIVA', 'ANULADA')),
  anulada_motivo      text,
  anulada_en          timestamptz,
  socio_id            text,
  vinculada_en        timestamptz,
  correo_enviado_en   timestamptz,
  creada_en           timestamptz not null default now(),
  constraint tarjetas_regalo_origen_coherente check (
    (origen = 'ONLINE' and checkout_session_id is not null)
    or (origen = 'MANUAL' and checkout_session_id is null and metodo_manual is not null)
  )
);
comment on table public.tarjetas_regalo is
  'Tarjetas regalo vendidas. El saldo NO es una columna: es la suma de movimientos_regalo.delta. `estado` solo distingue ACTIVA/ANULADA; agotada y caducada se derivan en la vista tarjetas_regalo_estado.';

create unique index tarjetas_regalo_codigo_unico on public.tarjetas_regalo (studio_id, codigo_hash);
create unique index tarjetas_regalo_sesion_unica on public.tarjetas_regalo (studio_id, checkout_session_id) where checkout_session_id is not null;
create index tarjetas_regalo_por_estudio on public.tarjetas_regalo (studio_id, creada_en desc);
create index tarjetas_regalo_por_socia on public.tarjetas_regalo (studio_id, socio_id) where socio_id is not null;

-- 3. El libro (solo de inserción: se bloquea UPDATE; DELETE queda para el borrado en cascada de un estudio) ─────────────────────────────────────────────────────────────────
create table public.movimientos_regalo (
  id         uuid primary key default gen_random_uuid(),
  studio_id  text not null references public.studios(id) on delete cascade,
  tarjeta_id uuid not null references public.tarjetas_regalo(id) on delete cascade,
  tipo       text not null check (tipo in ('COMPRA', 'USO', 'ANULACION')),
  delta      numeric(10,2) not null check (
    (tipo = 'COMPRA' and delta > 0) or (tipo in ('USO', 'ANULACION') and delta < 0)
  ),
  idem_key   text,
  actor_tipo text not null default 'sistema' check (actor_tipo in ('staff', 'webhook', 'sistema')),
  actor_id   text,
  motivo     text,
  nota       text check (nota is null or char_length(nota) <= 300),
  recibo_id  text,
  creado_en  timestamptz not null default now()
);
comment on table public.movimientos_regalo is
  'Libro de la tarjeta regalo, solo de inserción. COMPRA suma, USO y ANULACION restan. Un movimiento no se corrige: se compensa con otro.';

create unique index movimientos_regalo_una_compra on public.movimientos_regalo (tarjeta_id) where tipo = 'COMPRA';
create unique index movimientos_regalo_idem on public.movimientos_regalo (tarjeta_id, idem_key) where idem_key is not null;
create index movimientos_regalo_por_tarjeta on public.movimientos_regalo (tarjeta_id, creado_en);

create or replace function public.movimientos_regalo_inmutable()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  raise exception 'movimientos_regalo: el libro es solo de inserción, un movimiento no se modifica';
end;
$fn$;
revoke all on function public.movimientos_regalo_inmutable() from public, anon, authenticated;

create trigger trg_movimientos_regalo_inmutable
  before update on public.movimientos_regalo
  for each row execute function public.movimientos_regalo_inmutable();

-- 4. Vistas: saldo y estado efectivo; conciliación (debe salir vacía) ────────
create view public.tarjetas_regalo_estado with (security_invoker = true) as
select
  t.id as tarjeta_id,
  t.studio_id,
  coalesce(sum(m.delta), 0)::numeric(10,2) as saldo,
  case
    when t.estado = 'ANULADA' then 'ANULADA'
    when coalesce(sum(m.delta), 0) <= 0 then 'AGOTADA'
    when t.caduca_en < public.hoy_estudio() then 'CADUCADA'
    else 'ACTIVA'
  end as estado_efectivo
from public.tarjetas_regalo t
left join public.movimientos_regalo m on m.tarjeta_id = t.id
group by t.id;
comment on view public.tarjetas_regalo_estado is
  'Saldo (suma del libro) y estado efectivo de cada tarjeta. La caducidad se mira con hoy_estudio() (Madrid).';

create view public.regalo_conciliacion with (security_invoker = true) as
select t.id as tarjeta_id, t.studio_id, t.importe_inicial,
       coalesce(sum(m.delta), 0) as saldo,
       coalesce(sum(m.delta) filter (where m.tipo = 'COMPRA'), 0) as comprado
from public.tarjetas_regalo t
left join public.movimientos_regalo m on m.tarjeta_id = t.id
group by t.id
having coalesce(sum(m.delta), 0) < 0
    or coalesce(sum(m.delta) filter (where m.tipo = 'COMPRA'), 0) <> t.importe_inicial
    or (t.estado = 'ANULADA' and coalesce(sum(m.delta), 0) <> 0);
comment on view public.regalo_conciliacion is
  'Tarjetas cuyo libro no cuadra (saldo negativo, compra distinta del importe, anulada con saldo). Tiene que estar siempre vacía.';

-- 5. RLS: lectura para quien ve finanzas; escritura, nadie del navegador ─────
alter table public.regalo_ajustes enable row level security;
alter table public.tarjetas_regalo enable row level security;
alter table public.movimientos_regalo enable row level security;

create policy regalo_ajustes_lectura on public.regalo_ajustes
  for select to authenticated
  using (studio_id = (select public.current_studio_id()) and (select public.puede_ver_finanzas()));
create policy tarjetas_regalo_lectura on public.tarjetas_regalo
  for select to authenticated
  using (studio_id = (select public.current_studio_id()) and (select public.puede_ver_finanzas()));
create policy movimientos_regalo_lectura on public.movimientos_regalo
  for select to authenticated
  using (studio_id = (select public.current_studio_id()) and (select public.puede_ver_finanzas()));

-- Verificación en dos pasos del equipo (tentare-os): restrictiva en cada tabla nueva.
do $$
declare v_tabla text;
begin
  foreach v_tabla in array array['regalo_ajustes', 'tarjetas_regalo', 'movimientos_regalo']
  loop
    execute format('drop policy if exists exige_doble_factor on public.%I', v_tabla);
    execute format(
      'create policy exige_doble_factor on public.%I as restrictive for all to authenticated '
      'using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()))',
      v_tabla);
  end loop;
end $$;

-- Grants: REVOKE de tabla + GRANT por columnas (un REVOKE de columna no resta de un
-- grant de tabla). El navegador nunca lee `codigo` ni `codigo_hash`.
revoke all on public.regalo_ajustes, public.tarjetas_regalo, public.movimientos_regalo from anon, authenticated;
revoke all on public.tarjetas_regalo_estado, public.regalo_conciliacion from anon, authenticated;
grant select on public.regalo_ajustes to authenticated;
grant select (id, studio_id, importe_inicial, origen, comprador_nombre, comprador_email, destinatario_nombre,
              destinatario_email, mensaje, caduca_en, estado, anulada_motivo, anulada_en, socio_id, vinculada_en,
              correo_enviado_en, creada_en)
  on public.tarjetas_regalo to authenticated;
grant select on public.movimientos_regalo to authenticated;
grant select on public.tarjetas_regalo_estado to authenticated;
grant all on public.regalo_ajustes, public.tarjetas_regalo, public.movimientos_regalo,
             public.tarjetas_regalo_estado, public.regalo_conciliacion to service_role;

-- 6. Funciones ───────────────────────────────────────────────────────────────

-- Normaliza lo que escribe una persona: sin guiones ni espacios, mayúsculas, sin el prefijo RG.
create or replace function public.regalo_normalizar_codigo(p_codigo text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when length(n) = 18 and left(n, 2) = 'RG' then substr(n, 3)
    else n
  end
  from (select upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g')) as n) x;
$$;

create or replace function public.regalo_huella_codigo(p_codigo text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(public.regalo_normalizar_codigo(p_codigo), 'sha256'), 'hex');
$$;

-- ⚠️ extensions.gen_random_bytes, NO random() (PRNG sembrable). 16 símbolos de un
-- alfabeto de 32 = 80 bits, sin 0/O/1/I para poder dictarlo por teléfono.
create or replace function public.regalo_generar_codigo()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea := extensions.gen_random_bytes(16);
  v_nucleo text := '';
  i int;
begin
  for i in 0..15 loop
    v_nucleo := v_nucleo || substr(v_alfabeto, (get_byte(v_bytes, i) & 31) + 1, 1);
  end loop;
  return 'RG-' || substr(v_nucleo, 1, 4) || '-' || substr(v_nucleo, 5, 4) || '-' || substr(v_nucleo, 9, 4) || '-' || substr(v_nucleo, 13, 4);
end;
$$;

-- Crea la tarjeta y su COMPRA. Idempotente por (estudio, sesión de pago): un
-- reintento del webhook devuelve la misma tarjeta con creada = false.
create or replace function public.regalo_crear(
  p_studio_id text, p_origen text, p_session_id text, p_payment_intent text, p_importe numeric,
  p_comprador_nombre text, p_comprador_email text, p_destinatario_nombre text, p_destinatario_email text,
  p_mensaje text, p_caducidad_meses integer, p_metodo_manual text, p_actor_tipo text, p_actor_id text
) returns table (tarjeta_id uuid, codigo text, creada boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_codigo text;
  v_intentos int := 0;
begin
  if p_importe is null or p_importe <= 0 then
    raise exception 'regalo_crear: importe no válido';
  end if;

  if p_session_id is not null then
    select t.id, t.codigo into v_id, v_codigo
      from public.tarjetas_regalo t
     where t.studio_id = p_studio_id and t.checkout_session_id = p_session_id;
    if found then
      return query select v_id, v_codigo, false;
      return;
    end if;
  end if;

  loop
    v_codigo := public.regalo_generar_codigo();
    begin
      insert into public.tarjetas_regalo (
        studio_id, codigo, codigo_hash, importe_inicial, origen, checkout_session_id, payment_intent_id,
        metodo_manual, comprador_nombre, comprador_email, destinatario_nombre, destinatario_email, mensaje, caduca_en
      ) values (
        p_studio_id, v_codigo, public.regalo_huella_codigo(v_codigo), p_importe, p_origen, p_session_id, p_payment_intent,
        p_metodo_manual, p_comprador_nombre, p_comprador_email, p_destinatario_nombre, p_destinatario_email, p_mensaje,
        (public.hoy_estudio() + make_interval(months => p_caducidad_meses))::date
      ) returning id into v_id;
      exit;
    exception when unique_violation then
      -- O dos webhooks a la vez con la misma sesión, o (casi imposible) un código repetido.
      if p_session_id is not null then
        select t.id, t.codigo into v_id, v_codigo
          from public.tarjetas_regalo t
         where t.studio_id = p_studio_id and t.checkout_session_id = p_session_id;
        if found then
          return query select v_id, v_codigo, false;
          return;
        end if;
      end if;
      v_intentos := v_intentos + 1;
      if v_intentos >= 5 then raise; end if;
    end;
  end loop;

  insert into public.movimientos_regalo (studio_id, tarjeta_id, tipo, delta, actor_tipo, actor_id, motivo)
  values (p_studio_id, v_id, 'COMPRA', p_importe, p_actor_tipo, p_actor_id, p_origen);

  return query select v_id, v_codigo, true;
end;
$$;

-- Vincula la tarjeta a la ficha de la alumna que la canjea (no mueve dinero).
create or replace function public.regalo_vincular(p_studio_id text, p_huella text, p_socio_id text)
returns table (ok boolean, motivo text, tarjeta_id uuid, saldo numeric, caduca_en date)
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tarjetas_regalo%rowtype;
  v_saldo numeric;
begin
  select * into t from public.tarjetas_regalo x
   where x.studio_id = p_studio_id and x.codigo_hash = p_huella for update;
  if not found then
    return query select false, 'no-existe'::text, null::uuid, null::numeric, null::date; return;
  end if;
  select coalesce(sum(m.delta), 0) into v_saldo from public.movimientos_regalo m where m.tarjeta_id = t.id;
  if t.estado = 'ANULADA' then
    return query select false, 'anulada'::text, t.id, v_saldo, t.caduca_en; return;
  end if;
  if t.caduca_en < public.hoy_estudio() then
    return query select false, 'caducada'::text, t.id, v_saldo, t.caduca_en; return;
  end if;
  if t.socio_id is not null and t.socio_id <> p_socio_id then
    return query select false, 'ya-vinculada'::text, t.id, v_saldo, t.caduca_en; return;
  end if;
  if t.socio_id is null then
    update public.tarjetas_regalo set socio_id = p_socio_id, vinculada_en = now() where id = t.id;
  end if;
  if v_saldo <= 0 then
    return query select false, 'agotada'::text, t.id, v_saldo, t.caduca_en; return;
  end if;
  return query select true, null::text, t.id, v_saldo, t.caduca_en;
end;
$$;

-- Gasta saldo. Candado de fila + clave de idempotencia: dos cobros a la vez o un
-- reintento no pueden gastar dos veces ni dejar el saldo negativo.
create or replace function public.regalo_usar(
  p_studio_id text, p_tarjeta_id uuid, p_importe numeric, p_idem_key text,
  p_actor_id text, p_nota text, p_recibo_id text
) returns table (ok boolean, motivo text, saldo numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tarjetas_regalo%rowtype;
  v_saldo numeric;
  v_previo numeric;
begin
  if p_importe is null or p_importe <= 0 or p_idem_key is null or length(p_idem_key) < 8 then
    return query select false, 'peticion-invalida'::text, null::numeric; return;
  end if;
  select * into t from public.tarjetas_regalo x
   where x.id = p_tarjeta_id and x.studio_id = p_studio_id for update;
  if not found then
    return query select false, 'no-existe'::text, null::numeric; return;
  end if;
  select coalesce(sum(m.delta), 0) into v_saldo from public.movimientos_regalo m where m.tarjeta_id = t.id;

  select m.delta into v_previo from public.movimientos_regalo m
   where m.tarjeta_id = t.id and m.idem_key = p_idem_key;
  if found then
    -- Mismo intento repetido: ya está hecho. Si el importe no coincide, no es el mismo intento.
    if -v_previo = p_importe then
      return query select true, null::text, v_saldo; return;
    end if;
    return query select false, 'clave-reutilizada'::text, v_saldo; return;
  end if;

  if t.estado = 'ANULADA' then return query select false, 'anulada'::text, v_saldo; return; end if;
  if t.caduca_en < public.hoy_estudio() then return query select false, 'caducada'::text, v_saldo; return; end if;
  if v_saldo < p_importe then return query select false, 'saldo-insuficiente'::text, v_saldo; return; end if;

  insert into public.movimientos_regalo (studio_id, tarjeta_id, tipo, delta, idem_key, actor_tipo, actor_id, nota, recibo_id)
  values (p_studio_id, t.id, 'USO', -p_importe, p_idem_key, 'staff', p_actor_id, p_nota, p_recibo_id);
  return query select true, null::text, v_saldo - p_importe;
end;
$$;

-- Anula con motivo: resta el saldo que quede (lo ya gastado no vuelve) y cierra la tarjeta.
create or replace function public.regalo_anular(p_studio_id text, p_tarjeta_id uuid, p_motivo text, p_actor_tipo text, p_actor_id text)
returns table (ok boolean, motivo text, saldo_retirado numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tarjetas_regalo%rowtype;
  v_saldo numeric;
begin
  if p_motivo is null or length(trim(p_motivo)) < 3 then
    return query select false, 'motivo-obligatorio'::text, null::numeric; return;
  end if;
  select * into t from public.tarjetas_regalo x
   where x.id = p_tarjeta_id and x.studio_id = p_studio_id for update;
  if not found then
    return query select false, 'no-existe'::text, null::numeric; return;
  end if;
  if t.estado = 'ANULADA' then
    return query select true, null::text, 0::numeric; return;
  end if;
  select coalesce(sum(m.delta), 0) into v_saldo from public.movimientos_regalo m where m.tarjeta_id = t.id;
  if v_saldo > 0 then
    insert into public.movimientos_regalo (studio_id, tarjeta_id, tipo, delta, actor_tipo, actor_id, motivo)
    values (p_studio_id, t.id, 'ANULACION', -v_saldo, p_actor_tipo, p_actor_id, left(trim(p_motivo), 300));
  end if;
  update public.tarjetas_regalo
     set estado = 'ANULADA', anulada_motivo = left(trim(p_motivo), 300), anulada_en = now()
   where id = t.id;
  return query select true, null::text, v_saldo;
end;
$$;

-- Grants explícitos (tentare-os): REVOKE a PUBLIC, anon y authenticated + GRANT a service_role.
-- Escritos función a función (y no en bucle) para que la guardia de migraciones y quien lea
-- vean la decisión sobre anon de cada SECURITY DEFINER.
revoke all on function public.regalo_generar_codigo() from public, anon, authenticated;
grant execute on function public.regalo_generar_codigo() to service_role;
revoke all on function public.regalo_normalizar_codigo(text) from public, anon, authenticated;
grant execute on function public.regalo_normalizar_codigo(text) to service_role;
revoke all on function public.regalo_huella_codigo(text) from public, anon, authenticated;
grant execute on function public.regalo_huella_codigo(text) to service_role;
revoke all on function public.regalo_crear(text, text, text, text, numeric, text, text, text, text, text, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.regalo_crear(text, text, text, text, numeric, text, text, text, text, text, integer, text, text, text) to service_role;
revoke all on function public.regalo_vincular(text, text, text) from public, anon, authenticated;
grant execute on function public.regalo_vincular(text, text, text) to service_role;
revoke all on function public.regalo_usar(text, uuid, numeric, text, text, text, text) from public, anon, authenticated;
grant execute on function public.regalo_usar(text, uuid, numeric, text, text, text, text) to service_role;
revoke all on function public.regalo_anular(text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.regalo_anular(text, uuid, text, text, text) to service_role;
