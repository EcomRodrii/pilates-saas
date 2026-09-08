-- ═══════════════════════════════════════════════════════════════════════════
-- Los créditos pueden caducar. Por FECHA, y en un solo sitio.
--
-- La forma la decidió ya este repo para las recuperaciones, escrita en 0086:
-- «una recuperación está viva si estado='DISPONIBLE' y caduca_el >= hoy. No
-- hace falta cron para marcarlas CADUCADA (se trata por fecha)».
--
-- Aplicada aquí significa que NADA se borra ni se pone a cero en disco: el
-- saldo guardado sigue ahí y lo que cambia es cómo se lee. Frente a un barrido
-- nocturno que pusiera saldos a cero:
--
--   · No hay ventana en la que el saldo esté caducado y todavía gastable
--     (entre la medianoche y el cron), ni al revés.
--   · Si el estudio se arrepiente y quita la caducidad, los saldos vuelven —
--     con un barrido destructivo no habría nada que devolver.
--   · No hay que inventar apuntes de «caducado», ni tocar `total_ganado`: el
--     nivel sale de ahí y caducar no puede bajar de nivel a nadie.
--
-- Por defecto NO caduca nada (`creditos_caducan_meses` NULL): ningún estudio
-- existente cambia de comportamiento hasta que lo active a mano.
--
-- ── Por qué un TRIGGER y no tocar las RPC ───────────────────────────────────
-- Hay TRES puertas que suman saldo (`ajustar_creditos`,
-- `otorgar_credito_disparador`, `otorgar_creditos_compra`) y no son mías todas.
-- Repetir la regla en las tres significa copiar cuerpos enteros de funciones
-- ajenas y confiar en que la cuarta puerta que alguien escriba se acuerde.
--
-- La regla es una invariante de los DATOS —un saldo caducado no se arrastra—,
-- así que vive donde no se puede esquivar.
--
-- ── Por qué solo actúa al GANAR ─────────────────────────────────────────────
-- El colapso del saldo caducado se hace restando el saldo viejo
-- (`new.saldo - old.saldo`), lo que asume que la sentencia venía SUMANDO. Esa
-- suposición no es gratis: la primera versión de esto actuaba en cualquier
-- UPDATE, y bastó un `update member_credits set saldo = 200 ...` de preparación
-- en una prueba para que el trigger lo convirtiera en -300. Un arreglo de datos
-- a mano habría hecho lo mismo, en silencio y sobre dinero.
--
-- Por eso solo entra cuando `total_ganado` SUBE, que es la única situación en
-- la que las tres puertas escriben sumando y —no por casualidad— la única en la
-- que hace falta: es al ganar cuando la caducidad se renueva y el saldo viejo
-- podría resucitar. Un UPDATE absoluto que no toque `total_ganado` pasa de
-- largo sin que el trigger lo toque.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.studios
  add column if not exists creditos_caducan_meses integer;

comment on column public.studios.creditos_caducan_meses is
  'Meses que duran los créditos desde la última vez que se ganaron. NULL = no caducan.';

alter table public.member_credits
  add column if not exists caduca_el date;

comment on column public.member_credits.caduca_el is
  'Fecha en que caduca el saldo. NULL = no caduca. La empuja el trigger con cada ganancia.';

-- El saldo REALMENTE disponible hoy. `stable`, no `immutable`: depende de current_date.
create or replace function public.saldo_vivo(p_saldo integer, p_caduca date)
  returns integer
  language sql
  stable
  set search_path to ''
as $$
  select case when p_caduca is null or p_caduca >= current_date then coalesce(p_saldo, 0) else 0 end;
$$;

-- La caducidad que le toca a este estudio si gana créditos HOY. NULL = no caduca.
create or replace function public.caduca_creditos(p_studio_id text)
  returns date
  language sql
  stable
  set search_path to 'public', 'pg_temp'
as $$
  select case
    when s.creditos_caducan_meses is null or s.creditos_caducan_meses <= 0 then null
    else (current_date + (s.creditos_caducan_meses || ' months')::interval)::date
  end
  from studios s where s.id = p_studio_id;
$$;

create or replace function public.member_credits_caducidad()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
begin
  -- Solo al GANAR. Gastar o devolver un canje no renueva la caducidad —si no,
  -- cancelar un canje alargaría la vida del saldo, lo contrario de lo que el
  -- estudio configuró— y tampoco necesita colapsar nada: de eso se encarga
  -- `saldo_vivo` en la lectura y el guard de `ajustar_creditos` en el gasto.
  if tg_op = 'UPDATE' then
    if new.total_ganado > old.total_ganado then
      -- El saldo caducado no resucita al ganar de nuevo. La sentencia venía
      -- sumando sobre el saldo viejo; se le resta para que parta de cero.
      if old.caduca_el is not null and old.caduca_el < current_date then
        new.saldo := new.saldo - old.saldo;
      end if;
      new.caduca_el := public.caduca_creditos(new.studio_id);
    end if;
  else
    -- Primera fila de esta socia: solo nace con caducidad si nace ganando.
    if new.total_ganado > 0 then
      new.caduca_el := public.caduca_creditos(new.studio_id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists member_credits_caducidad on public.member_credits;
create trigger member_credits_caducidad
  before insert or update on public.member_credits
  for each row execute function public.member_credits_caducidad();

revoke all on function public.saldo_vivo(integer, date) from public, anon;
grant execute on function public.saldo_vivo(integer, date) to authenticated, service_role;
revoke all on function public.caduca_creditos(text) from public, anon;
grant execute on function public.caduca_creditos(text) to authenticated, service_role;

-- ── Y que no se pueda GASTAR lo caducado ────────────────────────────────────
-- El trigger no cubre esto a propósito (ver arriba): descontar no es ganar.
-- `canjearRecompensaPublica` ya refusa antes, leyendo el saldo vivo, pero la
-- RPC es la última puerta y no puede fiarse de que quien llame haya mirado.
create or replace function public.ajustar_creditos(p_socio_id text, p_studio_id text, p_delta_saldo integer, p_delta_ganado integer, p_delta_canjeado integer)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_saldo int; v_vivo int;
begin
  perform public.validar_studio_mismatch(p_studio_id);
  perform public.validar_socio_del_studio(p_socio_id, p_studio_id);

  if auth.uid() is not null and p_delta_saldo > 0 then
    raise exception 'GANANCIA_NO_PERMITIDA_AQUI';
  end if;

  -- Se mira el saldo VIVO, no el guardado: con la caducidad pasada el guardado
  -- puede seguir diciendo 500 y no ser gastables.
  if p_delta_saldo < 0 then
    select public.saldo_vivo(mc.saldo, mc.caduca_el) into v_vivo
      from member_credits mc where mc.socio_id = p_socio_id and mc.studio_id = p_studio_id;
    if coalesce(v_vivo, 0) + p_delta_saldo < 0 then
      raise exception 'SALDO_INSUFICIENTE';
    end if;
  end if;

  insert into member_credits (socio_id, studio_id, saldo, total_ganado, total_canjeado, actualizado_en)
    values (p_socio_id, p_studio_id, p_delta_saldo, p_delta_ganado, p_delta_canjeado, now())
  on conflict (socio_id) do update set
    saldo = member_credits.saldo + p_delta_saldo,
    total_ganado = member_credits.total_ganado + p_delta_ganado,
    total_canjeado = member_credits.total_canjeado + p_delta_canjeado,
    actualizado_en = now()
  returning saldo into v_saldo;

  if v_saldo < 0 then
    raise exception 'SALDO_INSUFICIENTE';
  end if;

  return v_saldo;
end;
$function$;
