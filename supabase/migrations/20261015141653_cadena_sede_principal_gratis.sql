-- ═══════════════════════════════════════════════════════════════════════════
-- Una cadena que deja de pagar: su sede PRINCIPAL pasa a Founding Studio gratis
-- y las demás se quedan cerradas, sin borrar nada (decisión del fundador,
-- 15-oct-2026). Si vuelve a pagar Cadena, todo vuelve a ser como antes.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Quién pasa a gratis y cuándo lo decide la app (lib/billing/plan-gratis.ts,
-- `pasaAGratis`; lo escribe SOLO lib/billing/convertir-a-gratis.ts). Esta
-- migración solo hace que la base de datos no lo deshaga ni lo castigue:
--
-- 1) `propagar_plan_cadena` (migr 0066/0067) copiaba plan, estado y fin de
--    periodo de la cadena a TODAS sus sedes en cada UPDATE de esas columnas,
--    aunque no cambiaran. Habría pisado el 'gratis' de la principal con el
--    'canceled' de la cadena en cualquier evento, y con un Checkout de Cadena a
--    medias ('incomplete' → 'incomplete_expired') la reconvertía a gratis: un
--    'gratis_cerrado' se reabría solo. Ahora:
--      · si la cadena PAGA (active, trialing, past_due), manda en todas sus
--        sedes, también en la que estaba en el gratis: «vuelve a pagar Cadena y
--        todo es como antes, sin trabajo a mano»;
--      · si no paga, solo en las sedes que la SIGUEN (sin estado, con uno
--        terminado o con el que tenía la cadena). Una sede con plan propio —la
--        principal en el gratis, o una que paga su plan suelto— se queda con el
--        suyo.
--
-- 2) `fijar_contrato_terminado` (migr 20261003102645) miraba siempre el estado
--    de la cadena en una sede. La principal en el gratis tenía el contrato por
--    terminado (su cadena está 'canceled'): avisos de «descarga tus datos» y,
--    con PURGA_ESTUDIOS_VENCIDOS=activa, la purga a los 30 días de un estudio
--    que sigue usando Tentare. Ahora:
--      · una sede con plan PROPIO vivo (ni NULL ni terminado) se rige por el
--        suyo, como un estudio suelto; si no, por su cadena, como antes;
--      · con la cadena terminada, si OTRA sede de la cadena lleva plan propio,
--        la dueña sigue siendo clienta: esta sede no ha terminado contrato
--        (cerrada, pero «no se borra nada»). Salvo que ESTA sede ya haya pedido
--        el borrado: esa petición se respeta (la fecha que se mira es la de OLD,
--        nunca la que llega en NEW, que podría traerla el cliente).
--
-- 3) Lo segundo hace depender una sede de sus hermanas. Un BEFORE de fila SÍ ve
--    las filas que la misma sentencia ya ha procesado, pero en un orden que
--    Postgres no garantiza: cuando `propagar_plan_cadena` actualiza N sedes de
--    golpe, lo que cada una ve de sus hermanas depende de ese orden. El valor
--    correcto lo pone la pasada AFTER: `trg_studios_contrato_sedes_hermanas`
--    (AFTER UPDATE OF subscription_status, solo con la cadena terminada) vuelve a
--    pasar por `fijar_contrato_terminado` las hermanas que siguen a la cadena,
--    cuando la sentencia ya ha terminado. ⚠️ No estreches su WHEN ni quites el
--    AFTER: sin él, el contrato de las hermanas depende del orden de la
--    sentencia. No se llama a sí mismo: su UPDATE no lleva `subscription_status`
--    en el SET.
--
-- `heredar_plan_de_cadena` no cambia: solo actúa al CREAR una sede.
-- ═══════════════════════════════════════════════════════════════════════════

-- Toca `studios` (candado al crear el trigger): mejor fallar que hacer cola
-- detrás del tráfico del panel.
set local lock_timeout = '5s';

-- Guarda: las dos funciones que se reescriben tienen que ser las vigentes sobre
-- las que se hizo esta copia (huella del cuerpo sin comentarios ni espacios,
-- comprobada en producción el 15-oct e igual a la de 0067 y 20261003102645).
do $$
declare
  v record;
  v_huella text;
begin
  for v in
    select * from (values
      ('public.propagar_plan_cadena()', '1a688033990717aa1b362cde95844d78'),
      ('public.fijar_contrato_terminado()', '0b7f9b9d5c5389b0f52192dc24ff4474')
    ) as t(firma, huella)
  loop
    select md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g'))
      into v_huella from pg_proc p where p.oid = to_regprocedure(v.firma);
    if v_huella is distinct from v.huella then
      raise exception '% ha cambiado (huella %): rehaz esta migración sobre la vigente', v.firma, v_huella;
    end if;
  end loop;
end $$;

-- ── 1) propagar_plan_cadena ─────────────────────────────────────────────────
create or replace function public.propagar_plan_cadena() returns trigger
  language plpgsql security definer
  set search_path = public
  as $$
begin
  update public.studios s
     set plan = new.plan, subscription_status = new.subscription_status, current_period_end = new.current_period_end
   where s.cadena_id = new.id
     and (
       -- La cadena paga: manda en todas sus sedes.
       new.subscription_status in ('active', 'trialing', 'past_due')
       -- No paga: solo en las que la siguen. Las de plan propio (el gratis de la
       -- sede principal, un plan suelto) se quedan con el suyo.
       or s.subscription_status is null
       or s.subscription_status in ('canceled', 'incomplete_expired')
       or s.subscription_status is not distinct from old.subscription_status
     );
  return new;
end;
$$;

-- Función de trigger: el permiso se comprueba al crear el trigger, no al dispararse.
revoke execute on function public.propagar_plan_cadena() from public, anon, authenticated;
grant execute on function public.propagar_plan_cadena() to service_role;

-- ── 2) fijar_contrato_terminado ─────────────────────────────────────────────
-- Copia de la vigente (migr 20261003102645) salvo el bloque de la cadena.
create or replace function public.fijar_contrato_terminado()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_estado text := new.subscription_status;
  -- La petición de borrado que YA tenía la sede (nunca la de NEW: la trae el cliente).
  v_pedida timestamptz;
begin
  if tg_op = 'UPDATE' then
    v_pedida := old.supresion_pedida_en;
  end if;
  -- Una sede se rige por su cadena, salvo que lleve un plan PROPIO vivo (la
  -- principal en el plan gratis, o una sede pagando su plan suelto).
  if new.cadena_id is not null and (v_estado is null or v_estado in ('canceled', 'incomplete_expired')) then
    -- Sin cadena encontrada, NULL: no es baja (ante la duda, no se purga).
    select c.subscription_status into v_estado from public.cadenas c where c.id = new.cadena_id;
    -- La cadena dejó de pagar, pero su dueña sigue siendo clienta mientras otra
    -- sede de la cadena lleve plan propio: esta se queda cerrada, sin borrar
    -- nada. Salvo que esta sede ya haya pedido el borrado.
    if v_estado in ('canceled', 'incomplete_expired') and v_pedida is null and exists (
      select 1 from public.studios s
       where s.cadena_id = new.cadena_id and s.id <> new.id
         and s.subscription_status is not null
         and s.subscription_status not in ('canceled', 'incomplete_expired')
    ) then
      v_estado := null;
    end if;
  end if;
  -- Lo que mande el cliente en esta columna se ignora siempre: la fecha la pone
  -- este trigger, o una fecha falsa adelantaría el borrado.
  if v_estado in ('canceled', 'incomplete_expired') then
    new.contrato_terminado_en := case when tg_op = 'UPDATE' then coalesce(old.contrato_terminado_en, now()) else now() end;
    -- La petición de borrado anticipado solo la escribe el servidor.
    if tg_op = 'INSERT' then
      new.supresion_pedida_en := null;
    elsif new.supresion_pedida_en is distinct from old.supresion_pedida_en and not public.es_llamada_servicio() then
      new.supresion_pedida_en := old.supresion_pedida_en;
    end if;
  else
    -- Con contrato no hay nada que borrar, y reactivar anula una petición anterior.
    new.contrato_terminado_en := null;
    new.supresion_pedida_en := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.fijar_contrato_terminado() from public, anon, authenticated;
grant execute on function public.fijar_contrato_terminado() to service_role;

-- ── 3) Las hermanas, cuando una sede cambia de estado ───────────────────────
create or replace function public.recalcular_contrato_sedes_hermanas()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Con la cadena pagando (o a medio pagar), cada sede se resuelve con su
  -- propia fila: no hay nada que recalcular en las demás.
  if exists (select 1 from public.cadenas c
              where c.id = new.cadena_id and c.subscription_status in ('canceled', 'incomplete_expired')) then
    -- El valor da igual: `fijar_contrato_terminado` lo recalcula (ignora lo que llega).
    update public.studios s
       set contrato_terminado_en = s.contrato_terminado_en
     where s.cadena_id = new.cadena_id and s.id <> new.id
       and (s.subscription_status is null or s.subscription_status in ('canceled', 'incomplete_expired'));
  end if;
  return null;
end;
$$;

revoke execute on function public.recalcular_contrato_sedes_hermanas() from public, anon, authenticated;
grant execute on function public.recalcular_contrato_sedes_hermanas() to service_role;

drop trigger if exists trg_studios_contrato_sedes_hermanas on public.studios;
create trigger trg_studios_contrato_sedes_hermanas
  after update of subscription_status on public.studios
  for each row
  when (new.cadena_id is not null and old.subscription_status is distinct from new.subscription_status)
  execute function public.recalcular_contrato_sedes_hermanas();

-- ── Poner al día las sedes que ya existen ───────────────────────────────────
-- Vuelve a pasar cada sede por la regla nueva (en producción, el 15-oct, no
-- cambia ninguna: ninguna cadena ha dejado de pagar).
update public.studios set contrato_terminado_en = contrato_terminado_en where cadena_id is not null;

-- ── Verificación: las tres, solo para el servidor ───────────────────────────
do $$
declare
  f text;
begin
  foreach f in array array['public.propagar_plan_cadena()', 'public.fijar_contrato_terminado()',
                           'public.recalcular_contrato_sedes_hermanas()'] loop
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE')
       or not has_function_privilege('service_role', f, 'EXECUTE') then
      raise exception '% tiene que ser solo de service_role (anon %, authenticated %, service_role %)', f,
        has_function_privilege('anon', f, 'EXECUTE'), has_function_privilege('authenticated', f, 'EXECUTE'),
        has_function_privilege('service_role', f, 'EXECUTE');
    end if;
  end loop;
end $$;
