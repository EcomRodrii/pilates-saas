-- Registrar en lote el consentimiento de marketing de varias clientas.
--
-- El caso real: un estudio con 31 socias y CERO consentimientos registrados.
-- La propietaria los tiene recogidos —de palabra en mostrador, en la hoja de
-- alta en papel— pero la única vía era abrir las 31 fichas de una en una, así
-- que no lo hacía nadie y todo el marketing del producto se quedaba sin
-- destinatarias.
--
-- ⚠️ ESTO NO CREA CONSENTIMIENTO, LO ANOTA. El art. 7 del RGPD exige que lo dé
-- la interesada; lo que se graba aquí es la afirmación del estudio de que ya
-- lo obtuvo, igual que hace hoy la tarjeta «Marketing» de la ficha con
-- `registrado_por = 'MOSTRADOR'`. La pantalla que llama a esto lo dice y pide
-- una confirmación explícita — no es un detalle de UI, es la diferencia entre
-- volcar permisos que existen y fabricar 31 que nadie dio.
--
-- Va como RPC y no como N updates desde el navegador por tres motivos:
--  · Es UNA transacción. 31 socias a medio registrar es un registro legal a
--    medias, que es peor que no haber empezado.
--  · El texto tiene que ser IDÉNTICO en todas. El guard de vigencia compara
--    el texto completo carácter a carácter
--    (`tieneConsentimientoMarketingVigente`), así que dos escrituras con
--    textos que difieran en un espacio dan dos grupos de socias distintos sin
--    que nada avise.
--  · Hoy no existe NINGUNA escritura en lote sobre `socios` en el repo. Este
--    es el patrón que ya usa `ampliar_caducidades` (migr 20260904182127) para
--    lo mismo, y se sigue tal cual en vez de inventar otro.
--
-- QUÉ NO TOCA: a quien YA tiene el texto vigente no se le escribe nada. La
-- fecha `consentimiento_marketing_en` es el registro de CUÁNDO lo dio, y
-- volver a sellarla hoy la falsearía. Se devuelve aparte como `ya_vigentes`.
-- A quien tiene un texto ANTIGUO (el estudio se renombró, y por eso su
-- consentimiento ya no cuenta) sí se le reescribe: no era utilizable, y el
-- estudio está afirmando el permiso de ahora.
--
-- Guards: mismo patrón que `ampliar_caducidades` — STUDIO_MISMATCH + rol,
-- ambos solo cuando hay `auth.uid()` para no romper a los llamadores
-- service-role. La cerradura es `puede_gestionar_clientas()`
-- (PROPIETARIO/RECEPCION/MANAGER), la MISMA que ya protege la escritura de la
-- ficha (`socios_escritura_update`, migr 0118): esto no es una puerta nueva a
-- un dato nuevo, es la puerta de siempre abierta a N filas a la vez.

create or replace function public.registrar_consentimiento_marketing(
  p_studio_id text,
  p_socio_ids text[],
  p_texto text
)
returns table (registradas integer, ya_vigentes integer, no_encontradas integer)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_registradas int := 0;
  v_ya int := 0;
  v_encontradas int := 0;
  v_pedidas int := 0;
begin
  if auth.uid() is not null and p_studio_id is distinct from public.current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;

  if auth.uid() is not null and not public.puede_gestionar_clientas() then
    raise exception 'NO_AUTORIZADO';
  end if;

  -- Un texto vacío escribiría un consentimiento que JAMÁS puede coincidir con
  -- el texto vigente: la socia figuraría como consentida en la ficha y el
  -- guard de envío la descartaría siempre, sin que nada explique por qué.
  if p_texto is null or btrim(p_texto) = '' then
    raise exception 'TEXTO_INVALIDO';
  end if;

  if p_socio_ids is null or array_length(p_socio_ids, 1) is null then
    return query select 0, 0, 0;
    return;
  end if;

  v_pedidas := array_length(p_socio_ids, 1);

  -- Todo en UNA sentencia, con CTEs y sin tabla temporal a propósito: una temp
  -- `on commit drop` revienta («relation already exists») si alguien llama a
  -- esta función dos veces dentro de la misma transacción. Hoy no pasaría
  -- —PostgREST abre una transacción por RPC— pero es una trampa puesta a mano
  -- para el primer caller que haga otra cosa.
  --
  -- `objetivo` son las socias que de verdad existen en ESTE estudio y no están
  -- borradas. Lo que se pida y no salga ahí se cuenta como `no_encontradas` en
  -- vez de desaparecer en silencio: una selección con ids de otro estudio o de
  -- fichas borradas tiene que verse, no dar «hecho» sobre nada.
  --
  -- ⚠️ `objetivo` se evalúa contra el estado ANTERIOR a la sentencia (una CTE
  -- que escribe no se ve a sí misma), que es justo lo que hace falta para que
  -- `ya_vigentes` cuente lo que había antes y no lo que acaba de escribirse.
  with objetivo as (
    select s.id, s.consentimiento_marketing_texto as texto
      from public.socios as s
     where s.studio_id = p_studio_id
       and s.borrado_en is null
       and s.id = any(p_socio_ids)
  ),
  tocadas as (
    update public.socios as s
       set consentimiento_marketing_en = now(),
           consentimiento_marketing_texto = p_texto,
           consentimiento_marketing_por = 'MOSTRADOR'
     where s.id in (select o.id from objetivo as o where o.texto is distinct from p_texto)
    returning s.id
  )
  select (select count(*) from tocadas)::int,
         (select count(*) from objetivo as o where o.texto = p_texto)::int,
         (select count(*) from objetivo)::int
    into v_registradas, v_ya, v_encontradas;

  return query select v_registradas, v_ya, (v_pedidas - v_encontradas)::int;
end;
$$;

comment on function public.registrar_consentimiento_marketing(text, text[], text) is
  'Anota (no crea) el consentimiento de marketing ya obtenido para varias socias del estudio, con el texto legal vigente y registrado_por = MOSTRADOR. No reescribe a quien ya tiene ese mismo texto, para no falsear la fecha en que lo dio. Solo PROPIETARIO/RECEPCION/MANAGER.';

-- Grants: función NUEVA, así que nace con EXECUTE para PUBLIC y —por el
-- `pg_default_acl` de este proyecto— también DIRECTO para anon/authenticated.
-- Revocar PUBLIC no le quita nada a `anon`, que lo tiene por su cuenta: hay
-- que revocárselo explícitamente (ver la nota de grants en tentare-os.md).
revoke execute on function public.registrar_consentimiento_marketing(text, text[], text) from public;
revoke execute on function public.registrar_consentimiento_marketing(text, text[], text) from anon;
grant execute on function public.registrar_consentimiento_marketing(text, text[], text) to authenticated, service_role;
