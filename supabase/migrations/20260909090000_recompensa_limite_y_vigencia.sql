-- ─────────────────────────────────────────────────────────────────────────────
-- Una recompensa puede tener LÍMITE POR SOCIA y VENTANA DE VIGENCIA.
--
-- Lo que faltaba del encargo de gamificación: el catálogo sabía cuánto cuesta
-- una recompensa y cuántas quedan (`stock`), pero no cuántas puede llevarse la
-- MISMA persona ni entre qué fechas se ofrece.
--
-- Sin límite por socia, la que más créditos acumula puede vaciar el stock
-- entero: 145 créditos en producción hoy dan para varias clases gratis
-- seguidas, y `crear_recuperacion` las concede una a una sin saber que salen
-- todas del mismo canje repetido. Sin vigencia, una promoción de verano sigue
-- viva en octubre salvo que alguien se acuerde de apagarla a mano.
--
-- Las dos comprobaciones NO pueden vivir en la aplicación. Leer y luego decidir
-- deja la ventana clásica: dos canjes a la vez leen «0 usadas» y los dos pasan.
-- Por eso `reservar_recompensa` bloquea la fila del catálogo (`for update`) y
-- hace vigencia + límite + stock bajo ese mismo cerrojo, que es el que el stock
-- ya usaba. La aplicación sigue validando antes, pero solo para dar un mensaje
-- decente: el que manda es este.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.reward_catalog
  add column if not exists limite_por_socia integer,
  add column if not exists disponible_desde date,
  add column if not exists disponible_hasta date;

comment on column public.reward_catalog.limite_por_socia is
  'Cuántas veces puede canjearla la MISMA socia. NULL = sin límite. Los canjes cancelados no cuentan.';
comment on column public.reward_catalog.disponible_desde is
  'Primer día en que se puede canjear (hora de Madrid). NULL = sin fecha de inicio.';
comment on column public.reward_catalog.disponible_hasta is
  'Último día en que se puede canjear, incluido. NULL = sin fecha de fin.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reward_catalog_limite_positivo') then
    alter table public.reward_catalog
      add constraint reward_catalog_limite_positivo
      check (limite_por_socia is null or limite_por_socia > 0);
  end if;
  -- Una ventana invertida no es «cerrada», es un error de captura que dejaría
  -- la recompensa muerta sin que nadie entienda por qué.
  if not exists (select 1 from pg_constraint where conname = 'reward_catalog_ventana_coherente') then
    alter table public.reward_catalog
      add constraint reward_catalog_ventana_coherente
      check (disponible_desde is null or disponible_hasta is null or disponible_hasta >= disponible_desde);
  end if;
end $$;

-- El conteo del límite filtra por (studio, socio, ítem). Sin índice sería un
-- seq scan bajo el cerrojo del catálogo, que es justo donde no conviene tardar.
create index if not exists idx_reward_redemptions_socio_item
  on public.reward_redemptions (studio_id, socio_id, catalog_item_id);

create or replace function public.reservar_recompensa(
  p_item_id text,
  p_studio_id text,
  p_socio_id text
) returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_activo boolean;
  v_stock int;
  v_limite int;
  v_desde date;
  v_hasta date;
  v_usadas int;
  -- La base va en UTC. Si el «hoy» se calculara así, una recompensa que la app
  -- anuncia disponible el día 1 se rechazaría hasta las 02:00 hora local: la
  -- pantalla diría que sí y el servidor que no. El estudio piensa en su
  -- calendario, no en el del servidor.
  v_hoy date := (now() at time zone 'Europe/Madrid')::date;
begin
  perform public.validar_studio_mismatch(p_studio_id);

  -- Mismo guardián que `ajustar_stock`: con service role (`auth.uid()` nulo)
  -- entra el canje público, que ya ha verificado la identidad contra el JWT;
  -- con sesión de navegador entra el panel, y ahí hace falta rol de gestión.
  -- Una socia autenticada NO pasa: podría reservar stock sin pagar créditos.
  if auth.uid() is not null and not public.puede_gestionar_clientas() then
    raise exception 'NO_AUTORIZADO';
  end if;

  -- `for update` serializa TODOS los canjes de este ítem. Es lo que hace que
  -- contar los ya usados sea fiable: sin el cerrojo, dos peticiones simultáneas
  -- de la misma socia leerían el mismo conteo y las dos pasarían el límite.
  select activo, stock, limite_por_socia, disponible_desde, disponible_hasta
    into v_activo, v_stock, v_limite, v_desde, v_hasta
  from reward_catalog
  where id = p_item_id and studio_id = p_studio_id
  for update;

  if not found or not v_activo then
    raise exception 'NO_DISPONIBLE';
  end if;

  if (v_desde is not null and v_hoy < v_desde)
     or (v_hasta is not null and v_hoy > v_hasta) then
    raise exception 'FUERA_DE_VIGENCIA';
  end if;

  if v_limite is not null then
    -- Los CANCELADOS no cuentan: cancelar devuelve créditos y stock, así que
    -- tiene que devolver también el derecho a volver a canjearla. Si contaran,
    -- una cancelación del estudio castigaría a la socia.
    select count(*) into v_usadas
    from reward_redemptions
    where studio_id = p_studio_id
      and socio_id = p_socio_id
      and catalog_item_id = p_item_id
      and estado is distinct from 'CANCELADO';

    if v_usadas >= v_limite then
      raise exception 'LIMITE_ALCANZADO';
    end if;
  end if;

  -- Stock NULL = ilimitado; no se toca nada.
  if v_stock is not null then
    if v_stock <= 0 then
      raise exception 'SIN_STOCK';
    end if;
    update reward_catalog set stock = stock - 1
      where id = p_item_id and studio_id = p_studio_id;
  end if;
end;
$function$;

-- Gotcha de grants documentado en este repo (van 4+ veces): al crear una
-- función el privilegio por defecto es EXECUTE TO PUBLIC. Se retira siempre.
--
-- `authenticated` SÍ la necesita: el panel canjea desde el navegador por su
-- propio camino, y si esta RPC fuera solo de service role, el límite y la
-- vigencia protegerían el portal y no el mostrador. Quien no tiene rol de
-- gestión choca contra el guardián de dentro, no contra el grant.
revoke all on function public.reservar_recompensa(text, text, text) from public, anon;
grant execute on function public.reservar_recompensa(text, text, text) to authenticated, service_role;
