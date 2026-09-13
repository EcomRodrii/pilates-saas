-- ─────────────────────────────────────────────────────────────────────────────
-- `restaurar_backup` v2: una copia antigua ya no destruye lo fiscal, no arrastra
-- en cascada lo que no guarda y no resucita a socias suprimidas.
--
-- La v1 hacía DELETE de las 44 tablas de `BACKUP_TABLES` y reinsertaba la copia:
--   (a) una socia suprimida después de la copia volvía con todo su PII;
--   (b) las facturas emitidas después se borraban y la cadena Veri*Factu quedaba
--       rota frente a lo ya remitido;
--   (c) `DELETE FROM socios` arrastraba en cascada salud, documentos, mensajes…
--       que la copia no guarda: perdidos para siempre;
--   (d) una sola FK NO ACTION desde una tabla no respaldada tumbaba la
--       restauración entera.
-- La restauración está DESACTIVADA en el panel (lib/backups/restauracion.ts) y
-- esta migración NO la reactiva.
--
-- Tres modos por tabla (espejo en TS: `planModosRestauracion`,
-- lib/engines/backup-engine.ts, con su test):
--   · reemplazar          DELETE del estudio + INSERT de la copia. Solo si NINGUNA
--                         tabla fuera del conjunto «reemplazar» la referencia por
--                         FK (con cualquier ON DELETE): se calcula en el catálogo
--                         en cada ejecución, hasta punto fijo, así una FK nueva
--                         mañana no vuelve a abrir (c)/(d).
--   · insertar_faltantes  INSERT … ON CONFLICT DO NOTHING, sin DELETE. Solo vuelve
--                         lo que ya no está; lo modificado después se queda como
--                         está. Es el modo de:
--                           - lo FISCAL (recibos, facturas, ventas_pos): nunca se
--                             revierte ni se borra. (ventas_pos_lineas, devoluciones
--                             y pagos_historicos no están en la copia: no se tocan);
--                           - toda tabla que no se puede borrar sin arrastrar datos
--                             no respaldados. Revertir sus filas tampoco sería
--                             coherente, porque sus dependientes no vuelven atrás, y
--                             en varias revertir mueve dinero o acceso: una
--                             suscripción CANCELADA que vuelve a ACTIVA se renueva y
--                             cobra; una instructora dada de baja que vuelve a activa
--                             recupera el acceso; una reserva que vuelve a NO_ASISTIO
--                             dispara `trg_penalizacion_no_show` (AFTER UPDATE).
--                             Con INSERT no salta ningún trigger de UPDATE.
--   · actualizar          Solo `socios`: upsert por PK sin DELETE (sin cascadas).
--                         NO vuelven atrás las columnas que prueban un
--                         consentimiento o conectan con dinero o con la cuenta
--                         (email, usuario, auth_user_id, stripe_*, sepa_*,
--                         tarjeta_*, aceptacion_*, consentimiento_*, borrado_en):
--                         restaurarlas reactivaría un marketing revocado, un
--                         método de pago retirado o el acceso de otra persona.
--   · ausente             La tabla no viene en la copia (copia anterior a que se
--                         añadiera a BACKUP_TABLES): ni se borra ni se inserta. La
--                         v1 la vaciaba.
--
-- Solo se insertan filas con `studio_id` = el estudio, y solo las columnas que
-- trae la copia (una columna añadida después toma su DEFAULT, no NULL).
--
-- Al final se reaplica `anonimizar_socio` a cada socia del estudio que esté en
-- `supresiones`, que estuviera borrada antes de restaurar o que siga con
-- `borrado_en` (el upsert de `socios` nunca pisa `borrado_en`).
--
-- Firma: mismos argumentos, pero devuelve jsonb (resumen) en vez de void → hay
-- que DROP + CREATE, que crea un objeto función NUEVO con los EXECUTE por
-- defecto de `pg_default_acl` (anon/authenticated). Por eso los tres pasos de
-- grants y la comprobación con has_function_privilege al final.
--
-- VERIFICACIÓN tras aplicar (en una RAMA de Supabase, nunca en prod), dentro de
-- BEGIN … ROLLBACK:
--   1. Elegir un estudio con facturas, una socia suprimida y fichas de salud.
--      Guardar: count(facturas), count(recibos), count(socios where borrado_en
--      is not null), count(condiciones_salud), count(documentos_socio),
--      count(mensajes) de ese estudio.
--   2. Construir el snapshot como lo hace crearSnapshot (select * por tabla) de
--      un momento ANTERIOR a la supresión (o un backup real de R2 de la rama).
--   3. select public.restaurar_backup('<studio>', '<snapshot>'::jsonb);
--      → 'modos' debe dar: recibos/facturas/ventas_pos = insertar_faltantes,
--        socios = actualizar, instructores/sesiones/reservas/suscripciones/
--        planes_tarifa/tipos_clase/salas/spots/productos_pos/codigos_descuento/
--        posts_comunidad = insertar_faltantes.
--   4. Los recuentos de (1) no bajan; la socia suprimida sigue con nombre
--      'Socia', email 'borrado+…@anon.invalid' y sin notas/créditos/logs con nombre.
--   5. select has_function_privilege(r, 'public.restaurar_backup(text,jsonb)',
--      'EXECUTE') para anon/authenticated (false) y service_role (true).
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.restaurar_backup(text, jsonb);

create function public.restaurar_backup(p_studio_id text, p_snapshot jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- Mismo orden que BACKUP_TABLES (lib/engines/backup-engine.ts): dependencias
  -- primero. El test compara las dos listas.
  c_tablas constant text[] := array[
    'socios', 'planes_tarifa', 'suscripciones', 'salas', 'spots', 'tipos_clase',
    'instructores', 'sesiones', 'reservas', 'recibos', 'facturas', 'citas',
    'productos_pos', 'ventas_pos', 'campanas', 'automatizaciones', 'automation_rules',
    'automation_logs', 'codigos_descuento', 'actividad_reciente', 'mensajes_equipo',
    'notificaciones', 'videos_on_demand', 'posts_comunidad', 'notas_internas',
    'notas_progreso', 'integraciones', 'preferencias_socio',
    'reward_rules', 'reward_actions', 'reward_history', 'credit_transactions',
    'member_credits', 'reward_catalog', 'reward_redemptions',
    'achievement_definitions', 'achievement_progress', 'achievement_history',
    'level_definitions', 'challenge_definitions', 'challenge_progress', 'challenge_history',
    'dashboard_charts', 'soporte_solicitudes'
  ];
  c_fiscales constant text[] := array['recibos', 'facturas', 'ventas_pos'];
  c_actualizar constant text[] := array['socios'];
  c_socios_no_vuelven_atras constant text[] := array[
    'id', 'studio_id', 'email', 'usuario', 'auth_user_id', 'borrado_en',
    'stripe_customer_id', 'stripe_payment_method_id', 'sepa_mandate_id', 'sepa_payment_method_id',
    'tarjeta_marca', 'tarjeta_ultimos4', 'tarjeta_exp_mes', 'tarjeta_exp_anio', 'metodo_pago_preferido',
    'aceptacion_fecha', 'aceptacion_firma', 'aceptacion_version', 'aceptacion_origen', 'aceptacion_por',
    'consentimiento_salud_fecha', 'consentimiento_salud_registrado_por',
    'consentimiento_salud_revocado_en', 'consentimiento_salud_texto',
    'consentimiento_marketing_en', 'consentimiento_marketing_texto', 'consentimiento_marketing_por'
  ];
  v_reemplazar text[];
  v_cambio boolean;
  v_tabla text;
  v_modo text;
  v_cols text;
  v_set text;
  v_pk text;
  v_modos jsonb := '{}'::jsonb;
  v_borradas_antes text[];
  v_socio text;
  v_reanonimizadas integer := 0;
begin
  if p_studio_id is null then
    raise exception 'restaurar_backup: falta el estudio' using errcode = '22023';
  end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'restaurar_backup: la copia no es un objeto JSON' using errcode = '22023';
  end if;

  -- Dos restauraciones del mismo estudio a la vez se pisarían el plan.
  perform pg_advisory_xact_lock(hashtext('restaurar_backup:' || p_studio_id));

  select coalesce(array_agg(s.id), '{}') into v_borradas_antes
    from public.socios s
   where s.studio_id = p_studio_id and s.borrado_en is not null;

  -- ── Plan ───────────────────────────────────────────────────────────────────
  v_reemplazar := array(
    select u.t from unnest(c_tablas) as u(t)
     where u.t <> all(c_fiscales)
       and u.t <> all(c_actualizar)
       and p_snapshot ? u.t
  );
  loop
    v_cambio := false;
    foreach v_tabla in array v_reemplazar loop
      if exists (
        select 1
          from pg_constraint con
          join pg_class rc on rc.oid = con.conrelid
          join pg_namespace rn on rn.oid = rc.relnamespace
         where con.contype = 'f'
           and con.confrelid = format('public.%I', v_tabla)::regclass
           and con.conrelid <> con.confrelid
           and not (rn.nspname = 'public' and rc.relname = any(v_reemplazar))
      ) then
        v_reemplazar := array_remove(v_reemplazar, v_tabla);
        v_cambio := true;
      end if;
    end loop;
    exit when not v_cambio;
  end loop;

  foreach v_tabla in array c_tablas loop
    v_modo := case
      when not (p_snapshot ? v_tabla) then 'ausente'
      when v_tabla = any(c_actualizar) then 'actualizar'
      when v_tabla = any(v_reemplazar) then 'reemplazar'
      else 'insertar_faltantes'
    end;
    v_modos := v_modos || jsonb_build_object(v_tabla, v_modo);
  end loop;

  -- ── Borrado (orden inverso) ────────────────────────────────────────────────
  for i in reverse array_length(c_tablas, 1) .. 1 loop
    if v_modos ->> c_tablas[i] = 'reemplazar' then
      execute format('delete from public.%I where studio_id = $1', c_tablas[i]) using p_studio_id;
    end if;
  end loop;

  -- ── Inserción (orden directo) ──────────────────────────────────────────────
  foreach v_tabla in array c_tablas loop
    v_modo := v_modos ->> v_tabla;
    continue when v_modo = 'ausente';
    -- CASE y no OR: SQL no garantiza cortocircuito, y jsonb_array_length sobre
    -- algo que no es un array lanza error.
    continue when case when jsonb_typeof(p_snapshot -> v_tabla) = 'array'
                       then jsonb_array_length(p_snapshot -> v_tabla) else 0 end = 0;

    select string_agg(quote_ident(a.attname), ', ' order by a.attnum)
      into v_cols
      from pg_attribute a
     where a.attrelid = format('public.%I', v_tabla)::regclass
       and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
       and (p_snapshot -> v_tabla -> 0) ? a.attname::text;
    continue when v_cols is null;

    if v_modo = 'actualizar' then
      select con.conname into v_pk
        from pg_constraint con
       where con.conrelid = format('public.%I', v_tabla)::regclass and con.contype = 'p';

      select string_agg(format('%I = excluded.%I', a.attname, a.attname), ', ' order by a.attnum)
        into v_set
        from pg_attribute a
       where a.attrelid = format('public.%I', v_tabla)::regclass
         and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
         and (p_snapshot -> v_tabla -> 0) ? a.attname::text
         and a.attname::text <> all(c_socios_no_vuelven_atras);

      execute format(
        'insert into public.%1$I as destino (%2$s) '
        || 'select %2$s from jsonb_populate_recordset(null::public.%1$I, $1) as r where r.studio_id = $2 '
        || case when v_set is null then 'on conflict do nothing'
                else 'on conflict on constraint %3$I do update set %4$s where destino.studio_id = $2' end,
        v_tabla, v_cols, v_pk, v_set)
      using p_snapshot -> v_tabla, p_studio_id;
    else
      execute format(
        'insert into public.%1$I (%2$s) '
        || 'select %2$s from jsonb_populate_recordset(null::public.%1$I, $1) as r where r.studio_id = $2 %3$s',
        v_tabla, v_cols, case when v_modo = 'insertar_faltantes' then 'on conflict do nothing' else '' end)
      using p_snapshot -> v_tabla, p_studio_id;
    end if;
  end loop;

  -- ── Supresiones: una copia vieja no resucita a nadie ───────────────────────
  for v_socio in
    select s.id
      from public.socios s
     where s.studio_id = p_studio_id
       and (s.borrado_en is not null
            or s.id = any(v_borradas_antes)
            or exists (select 1 from public.supresiones sp
                        where sp.studio_id = p_studio_id and sp.socio_id = s.id))
  loop
    perform public.anonimizar_socio(p_studio_id, v_socio, null, 'restauracion');
    v_reanonimizadas := v_reanonimizadas + 1;
  end loop;

  return jsonb_build_object('modos', v_modos, 'reanonimizadas', v_reanonimizadas);
end;
$$;

comment on function public.restaurar_backup(text, jsonb) is
  'Restaura una copia sin tocar lo fiscal ni arrastrar cascadas, y reaplica supresiones. Solo service_role. Modos: lib/engines/backup-engine.ts.';

revoke all on function public.restaurar_backup(text, jsonb) from public;
revoke all on function public.restaurar_backup(text, jsonb) from anon;
revoke all on function public.restaurar_backup(text, jsonb) from authenticated;
grant execute on function public.restaurar_backup(text, jsonb) to service_role;

do $$
begin
  if has_function_privilege('anon', 'public.restaurar_backup(text, jsonb)', 'EXECUTE') then
    raise exception 'anon puede ejecutar restaurar_backup';
  end if;
  if has_function_privilege('authenticated', 'public.restaurar_backup(text, jsonb)', 'EXECUTE') then
    raise exception 'authenticated puede ejecutar restaurar_backup: cualquier sesión reescribiría un estudio';
  end if;
  if not has_function_privilege('service_role', 'public.restaurar_backup(text, jsonb)', 'EXECUTE') then
    raise exception 'service_role no puede ejecutar restaurar_backup';
  end if;
end
$$;
