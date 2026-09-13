-- ─────────────────────────────────────────────────────────────────────────────
-- Pruebas de ESCRITURA de las migraciones 20260913160000 y 20260913160100.
--
-- ⚠️ SOLO staging o una rama de Supabase. NUNCA producción: escribe (aunque todo
-- termina en ROLLBACK) y la política del repo es que en producción solo se lee.
--
-- No está en supabase/tests a propósito: `supabase test db` ejecutaría ahí
-- cualquier .sql como pgTAP.
--
-- Uso:
--   psql "$STAGING_URL" -v ON_ERROR_STOP=1 \
--        -v propietaria="'<uid de una DUEÑA con estudio>'" \
--        -v otra="'<uid de cualquier otra cuenta>'" \
--        -f supabase/verificacion/rgpd-f2-escritura-staging.sql
--
-- Sin psql (p.ej. desde el editor SQL de la rama): sustituye a mano
-- :propietaria y :otra por los uuid entre comillas simples.
--
-- Resultado esperado: solo NOTICEs «OK …». Un «FALLO …» aborta con excepción.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

select set_config('rgpd.propietaria', :propietaria, true),
       set_config('rgpd.otra', :otra, true);

do $$
declare
  v_prop    uuid := current_setting('rgpd.propietaria')::uuid;
  v_otra    uuid := current_setting('rgpd.otra')::uuid;
  v_studio  text;
  v_socia   text;
  v_nuevo   text := 'rgpd-f2-estudio-' || substr(md5(random()::text), 1, 8);
  v_fila    record;
begin
  if v_prop = v_otra then
    raise exception 'PREPARACIÓN: propietaria y otra deben ser cuentas distintas';
  end if;

  -- ── Como la propietaria (petición de usuario) ─────────────────────────────
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_prop, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_studio := public.current_studio_id();
  if v_studio is null then
    raise exception 'PREPARACIÓN: la cuenta propietaria no resuelve ningún estudio';
  end if;

  -- H1.a — ficha de equipo con la cuenta de OTRA persona → 42501
  begin
    insert into public.instructores (id, studio_id, auth_user_id, rol, activo, nombre)
    values ('rgpd-f2-h1a', v_studio, v_otra, 'INSTRUCTOR', true, 'Prueba RGPD');
    raise exception 'FALLO H1.a: INSERT de instructores con auth_user_id ajeno aceptado';
  exception when insufficient_privilege then
    raise notice 'OK H1.a (uid ajeno en INSERT rechazado): %', sqlerrm;
  end;

  -- H1.b — su propia ficha (dbInsertInstructoraPropia) → sigue funcionando
  begin
    insert into public.instructores (id, studio_id, auth_user_id, rol, activo, nombre)
    values ('rgpd-f2-h1b', v_studio, v_prop, 'PROPIETARIO', true, 'Prueba RGPD');
    raise notice 'OK H1.b (uid propio en INSERT aceptado)';
  exception when unique_violation then
    raise notice 'OK H1.b (ya tenía ficha en este estudio: 23505, no lo bloqueó el trigger)';
  end;

  -- H1.c — ficha sin cuenta a la que se le pone la de otra persona → 42501
  begin
    insert into public.instructores (id, studio_id, auth_user_id, rol, activo, nombre)
    values ('rgpd-f2-h1c', v_studio, null, 'INSTRUCTOR', true, 'Prueba RGPD');
    update public.instructores set auth_user_id = v_otra where id = 'rgpd-f2-h1c';
    raise exception 'FALLO H1.c: UPDATE de instructores hacia auth_user_id ajeno aceptado';
  exception when insufficient_privilege then
    raise notice 'OK H1.c (uid ajeno en UPDATE rechazado): %', sqlerrm;
  end;

  -- H1.d — editar una ficha reenviando su auth_user_id sin cambiarlo, y
  --        desvincularla (NULL) → siguen funcionando
  begin
    insert into public.instructores (id, studio_id, auth_user_id, rol, activo, nombre)
    values ('rgpd-f2-h1d', v_studio, null, 'INSTRUCTOR', true, 'Prueba RGPD');
    update public.instructores set nombre = 'Prueba RGPD 2', auth_user_id = null where id = 'rgpd-f2-h1d';
    raise notice 'OK H1.d (edición normal y desvinculación aceptadas)';
  end;

  -- S.a / S.b — socias: el panel no puede vincular una cuenta, ni la propia;
  --             sí desvincular
  select id into v_socia from public.socios where studio_id = v_studio limit 1;
  if v_socia is null then
    raise notice 'SIN DATOS S.a/S.b: el estudio no tiene socias visibles';
  else
    begin
      update public.socios set auth_user_id = v_prop where id = v_socia;
      raise exception 'FALLO S.a: UPDATE de socios.auth_user_id desde el cliente aceptado';
    exception when insufficient_privilege then
      raise notice 'OK S.a (vincular socia desde el cliente rechazado): %', sqlerrm;
    end;
    begin
      update public.socios set auth_user_id = null where id = v_socia;
      raise notice 'OK S.b (desvincular socia desde el cliente aceptado)';
    end;
  end if;

  -- H2.a — cambiar la cuenta de Stripe desde el cliente → 42501
  begin
    update public.studios set stripe_account_id = 'acct_rgpdf2prueba' where id = v_studio;
    raise exception 'FALLO H2.a: UPDATE de studios.stripe_account_id desde el cliente aceptado';
  exception when insufficient_privilege then
    raise notice 'OK H2.a (stripe_account_id): %', sqlerrm;
  end;

  -- H2.b — cambiar el IBAN de la remesa desde el cliente → 42501
  begin
    update public.studios set sepa_iban = 'ES7921000813610123456789' where id = v_studio;
    raise exception 'FALLO H2.b: UPDATE de studios.sepa_iban desde el cliente aceptado';
  exception when insufficient_privilege then
    raise notice 'OK H2.b (sepa_iban): %', sqlerrm;
  end;

  -- H2.c — el resto de la lista blanca del panel sigue escribible
  begin
    update public.studios set nombre = nombre where id = v_studio;
    raise notice 'OK H2.c (columnas normales del panel siguen escribibles)';
  end;

  -- H2.d — alta de estudio mandando cuenta de cobro: se guarda sin ella.
  --        Sin RETURNING: la fila nueva no es el estudio activo y la política de
  --        lectura no la deja devolver.
  insert into public.studios (id, nombre, slug, owner_auth_user_id, stripe_account_id, sepa_iban, stripe_customer_id)
  values (v_nuevo, 'Prueba RGPD', v_nuevo, v_prop, 'acct_rgpdf2prueba', 'ES7921000813610123456789', 'cus_rgpdf2prueba');

  reset role;
  select stripe_account_id, sepa_iban, stripe_customer_id into v_fila from public.studios where id = v_nuevo;
  if v_fila.stripe_account_id is not null or v_fila.sepa_iban is not null or v_fila.stripe_customer_id is not null then
    raise exception 'FALLO H2.d: el INSERT de cliente guardó columnas de cuenta de cobro';
  end if;
  raise notice 'OK H2.d (INSERT de cliente ignora la cuenta de cobro)';

  -- ── Como service-role (sin sub en el JWT) ──────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  set local role service_role;

  begin
    insert into public.instructores (id, studio_id, auth_user_id, rol, activo, nombre)
    values ('rgpd-f2-sr1', v_studio, v_otra, 'INSTRUCTOR', true, 'Prueba RGPD');
    raise notice 'OK SR.1 (service-role vincula otra cuenta: alta de equipo/invitación)';
  exception when unique_violation then
    raise notice 'OK SR.1 (la otra cuenta ya tenía ficha en el estudio: 23505, no lo bloqueó el trigger)';
  end;

  if v_socia is not null then
    update public.socios set auth_user_id = v_otra where id = v_socia;
    raise notice 'OK SR.2 (service-role vincula socia: claim por email verificado)';
  end if;

  update public.studios
     set stripe_account_id = 'acct_rgpdf2prueba', sepa_iban = 'ES7921000813610123456789'
   where id = v_studio;
  raise notice 'OK SR.3 (service-role escribe la cuenta de cobro: callback de Connect / ruta SEPA)';

  reset role;
end
$$;

rollback;
