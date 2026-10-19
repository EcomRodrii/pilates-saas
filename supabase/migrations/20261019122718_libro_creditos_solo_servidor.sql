-- El libro de créditos y canjes solo lo escribe el servidor.
--
-- Hasta hoy, quien tenía `puede_gestionar_clientas()` (PROPIETARIO, MANAGER, RECEPCION) podía
-- escribir a pelo, con su propia sesión, en `reward_redemptions`, `credit_transactions` y
-- `reward_history`: la tabla da INSERT/UPDATE/DELETE a `authenticated` y las políticas lo
-- permitían. Eso se salta las reglas de las RPC (la ganancia de saldo solo la concede el
-- servidor) y deja reescribir o borrar el libro. Ningún código del producto escribe ahí con la
-- sesión del navegador: todo movimiento pasa por RPC SECURITY DEFINER (`canjear_recompensa`,
-- `cancelar_canje`, `entregar_canje`, `otorgar_credito_disparador`...) o por service-role, y
-- esas no necesitan el privilegio de tabla de `authenticated`.
--
-- Patrón del repo: REVOKE de tabla (un REVOKE de columna no resta de un grant de tabla). Aquí no
-- queda ninguna columna escribible porque nada legítimo la necesita. Las políticas de escritura
-- se borran además, para que un GRANT futuro por descuido no las reabra.
--
-- Fuera a propósito (decisión del fundador, no se toca aquí): `achievement_progress`,
-- `challenge_progress`, `achievement_history` y `challenge_history`, que el panel escribe hoy
-- desde el navegador (logros y retos). Ahí sigue pudiendo marcarse `completado` desde mostrador.
-- La RPC `otorgar_credito_disparador` mantiene su regla de rol.
--
-- Aditiva y reversible: ver «Cómo revertir» en el PR. Sin datos que migrar.

-- 1) Escritura directa fuera para el navegador ────────────────────────────────────────────────
revoke insert, update, delete on table public.reward_redemptions from authenticated;
revoke insert, update, delete on table public.credit_transactions from authenticated;
revoke insert, update, delete on table public.reward_history from authenticated;
revoke insert, update, delete on table public.reward_actions from authenticated;
revoke insert, update, delete on table public.member_credits from authenticated;

drop policy if exists reward_redemptions_insert on public.reward_redemptions;
drop policy if exists reward_redemptions_update on public.reward_redemptions;
drop policy if exists reward_redemptions_delete on public.reward_redemptions;
drop policy if exists credit_transactions_insert on public.credit_transactions;
drop policy if exists credit_transactions_update on public.credit_transactions;
drop policy if exists credit_transactions_delete on public.credit_transactions;
drop policy if exists reward_history_insert on public.reward_history;
drop policy if exists reward_history_update on public.reward_history;
drop policy if exists reward_history_delete on public.reward_history;

-- 2) INSTRUCTOR no lee `reward_actions` ───────────────────────────────────────────────────────
-- Era la única tabla del libro que se quedó fuera de la migración 20260921221053. Cada fila trae
-- socia, disparador y referencia (reserva, recibo, socia invitada) de todo el estudio.
alter policy staff_lee_reward_actions on public.reward_actions
  using (studio_id = public.current_studio_id() and (select public.current_rol()) is distinct from 'INSTRUCTOR');

-- 3) `ajustar_creditos` y `ajustar_stock`: solo servidor ──────────────────────────────────────
-- Ninguna pantalla las llama (los llamadores muertos de lib/supabase-data.ts se borran en este
-- mismo PR). `ajustar_creditos` dejaba a mostrador restar saldo sin apunte y desfasar
-- `total_ganado`/`total_canjeado`; `ajustar_stock` le dejaba subir el stock de un catálogo que
-- solo configura la propietaria. Las RPC de canje las siguen llamando por dentro (SECURITY
-- DEFINER: corren con los privilegios de su dueño, no con los de quien llama).
-- Firmas idénticas: no se redefine nada, así que no se reabre ningún grant por defecto.
revoke execute on function public.ajustar_creditos(text, text, integer, integer, integer) from public;
revoke execute on function public.ajustar_creditos(text, text, integer, integer, integer) from anon;
revoke execute on function public.ajustar_creditos(text, text, integer, integer, integer) from authenticated;
grant execute on function public.ajustar_creditos(text, text, integer, integer, integer) to service_role;

revoke execute on function public.ajustar_stock(text, text, integer) from public;
revoke execute on function public.ajustar_stock(text, text, integer) from anon;
revoke execute on function public.ajustar_stock(text, text, integer) from authenticated;
grant execute on function public.ajustar_stock(text, text, integer) to service_role;

-- 4) search_path con pg_temp en las tres RPC de canje que no lo tenían ────────────────────────
-- ALTER FUNCTION conserva los grants. Es lo único que cambia de ellas.
alter function public.canjear_recompensa(text, text, text, text) set search_path = public, pg_temp;
alter function public.entregar_canje(text, text, text) set search_path = public, pg_temp;
alter function public.generar_codigo_canje(text) set search_path = public, pg_temp;

-- 5) Verificación: si algo de lo anterior no ha quedado como se espera, la migración se aborta ─
do $verif$
declare
  t text;
  p text;
  f text;
  n int;
begin
  -- Ni authenticated ni anon escriben en el libro.
  foreach t in array array['reward_redemptions','credit_transactions','reward_history','reward_actions','member_credits'] loop
    foreach p in array array['INSERT','UPDATE','DELETE'] loop
      if has_table_privilege('authenticated', 'public.' || t, p) or has_table_privilege('anon', 'public.' || t, p) then
        raise exception 'LIBRO_ABIERTO: % sigue con % para authenticated/anon', t, p;
      end if;
    end loop;
    if not has_table_privilege('authenticated', 'public.' || t, 'SELECT') then
      raise exception 'LIBRO_ILEGIBLE: authenticated perdió SELECT sobre %', t;
    end if;
    if not has_table_privilege('service_role', 'public.' || t, 'INSERT') then
      raise exception 'SERVICIO_SIN_ESCRITURA: service_role no puede escribir en %', t;
    end if;
    -- Ninguna política permisiva de escritura que reabra el libro si algún día vuelve el GRANT.
    select count(*) into n from pg_policies
     where schemaname = 'public' and tablename = t
       and cmd in ('INSERT','UPDATE','DELETE') and permissive = 'PERMISSIVE';
    if n > 0 then
      raise exception 'POLITICA_ESCRITURA_VIVA: % tiene % políticas permisivas de escritura', t, n;
    end if;
  end loop;

  -- Las RPC solo-servidor: los tres roles, con has_function_privilege (no se fía del comentario).
  foreach f in array array[
    'public.ajustar_creditos(text, text, integer, integer, integer)',
    'public.ajustar_stock(text, text, integer)'
  ] loop
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception 'RPC_ABIERTA: % ejecutable por anon/authenticated', f;
    end if;
    if not has_function_privilege('service_role', f, 'EXECUTE') then
      raise exception 'RPC_SIN_SERVICIO: % no ejecutable por service_role', f;
    end if;
  end loop;

  -- Las RPC del canje que llama el panel y la app siguen abiertas a authenticated (y cerradas a anon).
  foreach f in array array[
    'public.canjear_recompensa(text, text, text, text)',
    'public.cancelar_canje(text, text)',
    'public.entregar_canje(text, text, text)',
    'public.otorgar_credito_disparador(text, text, text, text, text)'
  ] loop
    if has_function_privilege('anon', f, 'EXECUTE') or not has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception 'RPC_DE_CANJE_ALTERADA: % cambió de grants', f;
    end if;
  end loop;

  -- search_path con pg_temp al final.
  foreach f in array array[
    'public.canjear_recompensa(text, text, text, text)',
    'public.entregar_canje(text, text, text)',
    'public.generar_codigo_canje(text)'
  ] loop
    if not exists (
      select 1 from pg_proc where oid = f::regprocedure
        and proconfig @> array['search_path=public, pg_temp']
    ) then
      raise exception 'SEARCH_PATH: % sin pg_temp', f;
    end if;
  end loop;

  -- INSTRUCTOR fuera de la lectura de reward_actions.
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'reward_actions' and policyname = 'staff_lee_reward_actions'
       and qual ilike '%INSTRUCTOR%'
  ) then
    raise exception 'POLITICA_LECTURA: staff_lee_reward_actions no excluye a INSTRUCTOR';
  end if;
end
$verif$;
