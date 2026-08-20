-- La promoción de lista de espera no vuelve a elegir a quien ya tiene oferta viva.
--
-- EL FALLO (I-8). `promocionar_siguiente_espera` cogía la primera de la cola con
-- `order by creado_en asc, id asc limit 1` sobre `estado = 'LISTA_ESPERA'`, sin
-- mirar si esa persona YA tenía una oferta abierta (`oferta_expira_en`). Una
-- oferta viva no saca a nadie de `LISTA_ESPERA` — es metadata sobre la misma
-- reserva, decisión de la Fase 2b — así que seguía siendo la primera.
--
-- Con dos huecos liberados seguidos: el primero abre oferta a A; el segundo
-- vuelve a elegir a A y le PISA `oferta_expira_en` con un plazo nuevo. Resultado:
-- dos plazas libres, una sola persona avisada, y el plazo de A alargado sin que
-- nadie lo haya decidido. La segunda de la cola no se entera de nada.
--
-- Basta con saltar a quien ya tiene oferta abierta: el segundo hueco va a la
-- siguiente sin oferta, y el plazo de A se queda como estaba.
--
-- ⚠️ LÍMITE CONOCIDO, no resuelto aquí a propósito. Si no hay nadie más en la
-- cola sin oferta, el segundo hueco se queda sin ofrecer hasta que algo vuelva a
-- disparar una promoción (que hoy solo pasa al liberarse otra plaza o al caducar
-- una oferta, `expirar_oferta_lista_espera`). Cubrirlo del todo pide un barrido
-- de "clases con hueco y gente esperando", que es un cron nuevo y una decisión
-- aparte — y esto ya deja el caso estrictamente mejor que antes, donde el
-- segundo hueco tampoco se ofrecía Y encima se pisaba el plazo de A.
--
-- Firma idéntica (text, text, integer): CREATE OR REPLACE sin cambio de firma
-- conserva los grants. Se verifican igual después.
create or replace function public.promocionar_siguiente_espera(
  p_studio_id text, p_sesion_id text, p_plazo_minutos integer
)
returns table(promovida_socio_id text, oferta_socio_id text, oferta_expira_en timestamptz)
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id text;
  v_socio text;
  v_expira timestamptz;
begin
  select r.id, r.socio_id into v_id, v_socio
    from reservas as r
   where r.sesion_id = p_sesion_id
     and r.estado = 'LISTA_ESPERA'
     -- I-8: quien ya tiene una oferta abierta no vuelve a ser elegida. Se
     -- califica con alias porque `oferta_expira_en` es también una columna de
     -- RETURNS TABLE de esta función, y sin el alias Postgres lo rechaza como
     -- ambiguo (42702) — el mismo gotcha que ya mordió tres veces en la Fase 2b.
     and r.oferta_expira_en is null
   order by r.creado_en asc, r.id asc
   limit 1 for update;

  if not found then
    return query select null::text, null::text, null::timestamptz;
    return;
  end if;

  if coalesce(p_plazo_minutos, 0) <= 0 then
    update reservas set estado = 'CONFIRMADA', posicion_espera = null, oferta_expira_en = null
      where id = v_id;
    return query select v_socio, null::text, null::timestamptz;
  else
    v_expira := now() + make_interval(mins => p_plazo_minutos);
    update reservas set oferta_expira_en = v_expira where id = v_id;
    return query select null::text, v_socio, v_expira;
  end if;
end;
$function$;
