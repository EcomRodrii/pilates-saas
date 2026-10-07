-- ClassPass en modo manual: las plazas que el estudio publica allí se APARTAN
-- (decisión del fundador, 7-oct-2026). Deroga, solo para las plataformas que
-- venden a mano, el «techo compartido, no plazas apartadas» de 20261001115955.
--
-- Por qué: ClassPass no tiene API abierta. El estudio publica N plazas por clase
-- en su panel, ClassPass le avisa por correo de cada venta y recepción la apunta.
-- Con el techo compartido, si las alumnas llenaban la clase por la app, ClassPass
-- seguía vendiendo esas N plazas: sobreventa.
--
-- La regla, en un solo sitio (`plazas_apartadas`):
--   apartadas = Σ por plataforma que aparta (hoy solo CLASSPASS, encendida) y que
--   no es quien reserva: max(0, cupo − vendidas), mientras now() < inicio − X h.
--   Después, 0: lo que ClassPass no vendió se libera para todos.
--   · cupo: `cupo_plataforma` (sesión → tipo); NULL no aparta nada.
--   · vendidas: sus reservas CONFIRMADA/ASISTIDA (sus ventas gastan SUS plazas).
--   · X: `plataforma_ajustes.liberar_horas_antes` (0..72); sin fila, 0 = apartadas
--     hasta que empieza (nunca sobreventa). Se pregunta al encender ClassPass.
--   · Sesión cancelada o tipo que exige autorización (ClassPass no puede venderlo): 0.
-- Se calcula AL LEER: ningún cron «libera». Lo único periódico es dar la plaza
-- liberada a la lista de espera, y va en el job que ya existe
-- (`lista-espera-ofertas-expirar`, cada 5 min), con su predicado ampliado.
--
-- Las cinco funciones que deciden plaza suman las apartadas a las ocupadas justo
-- antes de comparar con el aforo, y nada más cambia en ellas (mismas firmas,
-- mismos permisos, cada una con su guarda sobre la versión vigente):
--   · evaluar_reserva (y por ella reservar_plaza): app, /reservar, widget, API,
--     mostrador → completa o lista de espera;
--   · promocionar_siguiente_espera: una plaza de ClassPass que se libera vuelve a
--     ClassPass, no sube a nadie;
--   · resolver_reserva_pendiente y aceptar_oferta_lista_espera;
--   · reservar_plaza_externa: ClassPass usa sus apartadas; USC/Wellhub no
--     (`AFORO_LLENO_APARTADAS`).
-- Las clases fijas (`materializar_plazas_fijas_interno`) NO se tocan: son un
-- derecho preaprobado y se reservan al crear la sesión, antes que cualquier venta.
--
-- Vuelta atrás en una sentencia: `create or replace function
-- public.plazas_apartadas(text, text) ... select 0` devuelve todo al techo compartido.

-- ── 1) Dónde vive X ───────────────────────────────────────────────────────────
-- Tabla propia y no `integraciones.config`: el interruptor de Conexiones reescribe
-- la config entera (y esa tabla solo la lee la propietaria). Hermana de
-- `plataforma_cupos`: la lee el personal menos la instructora, la escribe quien
-- gestiona la sede.
create table if not exists public.plataforma_ajustes (
  studio_id text not null references public.studios(id) on delete cascade,
  plataforma text not null check (plataforma in ('CLASSPASS', 'URBAN_SPORTS_CLUB', 'WELLHUB')),
  -- Cuántas horas antes de la clase se liberan las plazas apartadas que la
  -- plataforma no ha vendido. 0 = apartadas hasta que empieza.
  liberar_horas_antes smallint not null check (liberar_horas_antes between 0 and 72),
  actualizado_en timestamptz not null default now(),
  primary key (studio_id, plataforma)
);

alter table public.plataforma_ajustes enable row level security;

create policy plataforma_ajustes_lectura on public.plataforma_ajustes
  for select to authenticated
  using (studio_id = (select public.current_studio_id()) and (select public.current_rol()) is distinct from 'INSTRUCTOR');

create policy plataforma_ajustes_escritura on public.plataforma_ajustes
  for all to authenticated
  using (studio_id = (select public.current_studio_id()) and (select public.puede_gestionar_sede()))
  with check (studio_id = (select public.current_studio_id()) and (select public.puede_gestionar_sede()));

-- La restrictiva de 20261003102845 en toda tabla con RLS (supabase/tests/rls-doble-factor.test.ts).
create policy exige_doble_factor on public.plataforma_ajustes as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()));

revoke all on public.plataforma_ajustes from anon;
grant select, insert, update, delete on public.plataforma_ajustes to authenticated;
grant all on public.plataforma_ajustes to service_role;

-- ── 2) La regla ───────────────────────────────────────────────────────────────
-- Las plataformas que apartan, en un solo sitio (su gemela en TS:
-- `PLATAFORMAS_QUE_APARTAN`, lib/plataformas/apartadas.ts; lo cruza un test).
-- Wellhub y USC van por API: ven nuestra ocupación al momento y no hace falta.
create or replace function public.plataformas_que_apartan()
 returns text[]
 language sql
 immutable
 set search_path to 'public', 'pg_temp'
as $function$
  select array['CLASSPASS']::text[];
$function$;

-- Quién aparta en una sesión y cuánto. Columnas con alias siempre: es una
-- función RETURNS TABLE (gotcha 42702).
create or replace function public.apartados_de_sesion(p_sesion_id text)
 returns table(plataforma text, cupo integer, vendidas integer, liberan_en timestamp with time zone)
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  select i.tipo,
         public.cupo_plataforma(s.id, i.tipo),
         (select count(*)::int from public.reservas as r
           where r.sesion_id = s.id and r.origen = i.tipo and r.estado in ('CONFIRMADA', 'ASISTIDA')),
         s.inicio - make_interval(hours => coalesce(a.liberar_horas_antes, 0)::int)
    from public.sesiones as s
    join public.integraciones as i
      on i.studio_id = s.studio_id and i.activo and i.tipo = any (public.plataformas_que_apartan())
    left join public.plataforma_ajustes as a
      on a.studio_id = s.studio_id and a.plataforma = i.tipo
   where s.id = p_sesion_id
     and not coalesce(s.cancelada, false)
     and not exists (
       select 1 from public.tipos_clase as tc
        where tc.id = s.tipo_clase_id and coalesce(tc.requiere_autorizacion, false)
     );
$function$;

-- Cuántas plazas de la sesión NO puede coger `p_para_origen` (TENTARE = los
-- canales del estudio) porque están apartadas para OTRA plataforma.
create or replace function public.plazas_apartadas(p_sesion_id text, p_para_origen text default 'TENTARE')
 returns integer
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(sum(greatest(0, a.cupo - a.vendidas)), 0)::int
    from public.apartados_de_sesion(p_sesion_id) as a
   where a.cupo is not null
     and a.plataforma <> p_para_origen
     and now() < a.liberan_en;
$function$;

-- En lote, para lo que enseña plazas (app, /reservar, widget, panel): solo las
-- sesiones con algo apartado, y hasta cuándo.
create or replace function public.plazas_apartadas_de(p_studio_id text, p_sesion_ids text[], p_para_origen text default 'TENTARE')
 returns table(sesion_id text, plazas integer, liberan_en timestamp with time zone)
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  select x.sesion_id, x.plazas, x.liberan_en
    from (
      select s.id as sesion_id,
             public.plazas_apartadas(s.id, p_para_origen) as plazas,
             (select min(a.liberan_en) from public.apartados_de_sesion(s.id) as a
               where a.cupo is not null and a.cupo > a.vendidas
                 and a.plataforma <> p_para_origen and now() < a.liberan_en) as liberan_en
        from public.sesiones as s
       where s.studio_id = p_studio_id
         and s.id = any (p_sesion_ids)
         and exists (
           select 1 from public.integraciones as i
            where i.studio_id = p_studio_id and i.activo and i.tipo = any (public.plataformas_que_apartan())
         )
    ) as x
   where x.plazas > 0;
$function$;

-- Sesiones cuya liberación acaba de pasar (en la ventana) y tienen cola sin
-- oferta y hueco: el barrido les da la plaza a la lista de espera.
-- ⚠️ El job de pg_cron la usa en su predicado y la ruta en su consulta: tienen
-- que pedir lo mismo (20261005221020).
create or replace function public.sesiones_con_plazas_liberadas(p_ventana interval)
 returns table(studio_id text, sesion_id text, huecos integer)
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  select x.studio_id, x.sesion_id, x.huecos
    from (
      select s.studio_id as studio_id, s.id as sesion_id,
             (public.aforo_efectivo(s.id)
               - (select count(*)::int from public.reservas as r
                   where r.sesion_id = s.id and r.estado in ('CONFIRMADA', 'ASISTIDA'))
               - (select count(*)::int from public.reservas as r
                   where r.sesion_id = s.id and r.estado = 'LISTA_ESPERA'
                     and r.oferta_expira_en is not null and r.oferta_expira_en > now())
               - public.plazas_apartadas(s.id))::int as huecos
        from public.sesiones as s
        join public.integraciones as i
          on i.studio_id = s.studio_id and i.activo and i.tipo = any (public.plataformas_que_apartan())
        left join public.plataforma_ajustes as a
          on a.studio_id = s.studio_id and a.plataforma = i.tipo
       -- 72 h = el X más alto: deja usar el índice de `inicio`.
       where s.inicio > now() and s.inicio <= now() + interval '72 hours'
         and not coalesce(s.cancelada, false)
         and s.inicio - make_interval(hours => coalesce(a.liberar_horas_antes, 0)::int) between now() - p_ventana and now()
         and public.aforo_efectivo(s.id) is not null
         and exists (
           select 1 from public.reservas as r
            where r.sesion_id = s.id and r.estado = 'LISTA_ESPERA'
              and (r.oferta_expira_en is null or r.oferta_expira_en <= now())
         )
    ) as x
   where x.huecos > 0;
$function$;

-- Solo el servidor (y las funciones del motor, que corren como su dueño). Los
-- tres pasos y la comprobación: una función nueva nace con EXECUTE para anon y
-- authenticated (pg_default_acl).
do $$
declare
  v_firma text;
begin
  foreach v_firma in array array[
    'public.plataformas_que_apartan()',
    'public.apartados_de_sesion(text)',
    'public.plazas_apartadas(text, text)',
    'public.plazas_apartadas_de(text, text[], text)',
    'public.sesiones_con_plazas_liberadas(interval)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', v_firma);
    execute format('grant execute on function %s to service_role', v_firma);
    if has_function_privilege('anon', v_firma, 'execute')
       or has_function_privilege('authenticated', v_firma, 'execute')
       or not has_function_privilege('service_role', v_firma, 'execute') then
      raise exception '%: permisos distintos de lo previsto', v_firma;
    end if;
  end loop;
end $$;

-- ── 3) Las cinco que deciden plaza ────────────────────────────────────────────
-- Guarda: cada una tiene que ser la vigente sobre la que se hizo esta copia
-- (huella del cuerpo sin comentarios ni espacios: producción guarda algunos
-- cuerpos sin sus comentarios). Si alguien la cambió, se para.
do $$
declare
  v record;
  v_huella text;
begin
  for v in
    select * from (values
      ('public.evaluar_reserva(text,text,text,jsonb)', 'f2bd75aaaa7ad368ce37944283c7a3b4'),
      ('public.promocionar_siguiente_espera(text,text,integer)', '1c3d19c78f1d09662729c04d97ea05f3'),
      ('public.resolver_reserva_pendiente(text,text,boolean)', '424fd6b40798a5e96741a0906fc70559'),
      ('public.aceptar_oferta_lista_espera(text,text,text)', 'c45a424545f99e587afb035d89173fab'),
      ('public.reservar_plaza_externa(text,text,text,text,text,text,text,boolean)', '29199a0edae2ccce97c67ef400f8ce5f')
    ) as t(firma, huella)
  loop
    select md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g'))
      into v_huella from pg_proc p where p.oid = to_regprocedure(v.firma);
    if v_huella is distinct from v.huella then
      raise exception '% ha cambiado (huella %): rehaz esta migración sobre la vigente', v.firma, v_huella;
    end if;
  end loop;
end $$;

create or replace function public.evaluar_reserva(p_studio_id text, p_sesion_id text, p_socio_id text, p_opciones jsonb default '{}'::jsonb)
 returns jsonb
 language plpgsql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_permite_espera boolean := coalesce((p_opciones ->> 'permite_lista_espera')::boolean, true);
  v_requiere_aprobacion boolean := coalesce((p_opciones ->> 'requiere_aprobacion')::boolean, false);
  v_spot_id text := nullif(p_opciones ->> 'spot_id', '');
  v_saltar_impago boolean := coalesce((p_opciones ->> 'saltar_gate_impago')::boolean, false);
  v_exigir_entitlement boolean := coalesce((p_opciones ->> 'exigir_entitlement')::boolean, true);
  v_inicio timestamptz;
  v_fin timestamptz;
  v_sala_id text;
  v_instructor_id text;
  v_tipo_clase_id text;
  v_requiere_autorizacion boolean;
  v_bloquea_impago boolean;
  v_ofertas_reservan boolean;
  v_aforo int;
  v_ocupadas int;
  v_espera int;
  v_estado text;
  v_pos int;
  v_spot_sala_id text;
  v_spot_activo boolean;
  v_spot_existe boolean;
  v_spot_ocupado text;
  v_excede_total boolean := false;
  v_excede_tipo boolean := false;
  v_recuperacion text;
  v_bono text;
  v_cuota text;
  v_pagador jsonb := jsonb_build_object('origen', 'ninguno');
begin
  if not public.es_llamada_servicio() and p_studio_id is distinct from public.current_studio_id() then
    return jsonb_build_object('puede', false, 'codigo', 'no-autorizado', 'detalle', 'NO_AUTORIZADO');
  end if;
  if not exists (select 1 from public.socios as so where so.id = p_socio_id and so.studio_id = p_studio_id) then
    return jsonb_build_object('puede', false, 'codigo', 'no-autorizado', 'detalle', 'NO_AUTORIZADO');
  end if;

  select ss.inicio, ss.fin, ss.instructor_id, ss.sala_id, ss.tipo_clase_id
    into v_inicio, v_fin, v_instructor_id, v_sala_id, v_tipo_clase_id
    from public.sesiones as ss
   where ss.id = p_sesion_id and ss.studio_id = p_studio_id;
  if not found then
    return jsonb_build_object('puede', false, 'codigo', 'sesion-no-encontrada', 'detalle', 'SESION_NO_ENCONTRADA');
  end if;

  if public.fecha_en_cierre(p_studio_id, (v_inicio at time zone 'Europe/Madrid')::date) then
    return jsonb_build_object('puede', false, 'codigo', 'estudio-cerrado', 'detalle', 'ESTUDIO_CERRADO');
  end if;

  if not v_saltar_impago and public.current_rol() is null then
    select coalesce(st.bloquear_reserva_impago, false) into v_bloquea_impago
      from public.studios as st where st.id = p_studio_id;
    if v_bloquea_impago and public.socio_tiene_impago(p_studio_id, p_socio_id) then
      return jsonb_build_object('puede', false, 'codigo', 'impago', 'detalle', 'RESERVA_BLOQUEADA_IMPAGO');
    end if;
  end if;

  if public.current_rol() = 'INSTRUCTOR' and v_instructor_id is distinct from public.current_instructor_id() then
    return jsonb_build_object('puede', false, 'codigo', 'no-autorizado', 'detalle', 'NO_AUTORIZADO');
  end if;

  if v_tipo_clase_id is not null then
    select tc.requiere_autorizacion into v_requiere_autorizacion
      from public.tipos_clase as tc
     where tc.id = v_tipo_clase_id and tc.studio_id = p_studio_id;
    if coalesce(v_requiere_autorizacion, false) and not exists (
      select 1 from public.socio_tipos_clase_autorizados as a
       where a.socio_id = p_socio_id and a.tipo_clase_id = v_tipo_clase_id and a.studio_id = p_studio_id
    ) then
      return jsonb_build_object('puede', false, 'codigo', 'necesita-autorizacion', 'detalle', 'NECESITA_AUTORIZACION');
    end if;
  end if;

  if v_exigir_entitlement and v_tipo_clase_id is not null then
    if not public.socio_tiene_entitlement_activo(p_studio_id, p_socio_id, v_tipo_clase_id, current_date) then
      return jsonb_build_object('puede', false, 'codigo', 'sin-plan', 'detalle', 'SIN_ENTITLEMENT');
    end if;
  end if;

  if exists (
    select 1 from public.reservas as r
     where r.sesion_id = p_sesion_id and r.socio_id = p_socio_id
       and r.estado in ('CONFIRMADA', 'LISTA_ESPERA', 'ASISTIDA', 'PENDIENTE_APROBACION')
  ) then
    return jsonb_build_object('puede', false, 'codigo', 'ya-reservada', 'detalle', 'YA_RESERVADA');
  end if;

  if v_spot_id is not null then
    select true, sp.sala_id, coalesce(sp.activo, true) into v_spot_existe, v_spot_sala_id, v_spot_activo
      from public.spots as sp
     where sp.id = v_spot_id and sp.studio_id = p_studio_id;
    if v_spot_existe is not true or v_spot_sala_id is distinct from v_sala_id then
      return jsonb_build_object('puede', false, 'codigo', 'spot-no-disponible', 'detalle', 'SPOT_NO_PERTENECE_A_LA_SALA');
    end if;
    if not v_spot_activo then
      return jsonb_build_object('puede', false, 'codigo', 'spot-no-disponible', 'detalle', 'SPOT_NO_DISPONIBLE');
    end if;
    select r.id into v_spot_ocupado
      from public.reservas as r
     where r.sesion_id = p_sesion_id and r.spot_id = v_spot_id and r.estado in ('CONFIRMADA', 'ASISTIDA')
     limit 1;
    if v_spot_ocupado is not null then
      return jsonb_build_object('puede', false, 'codigo', 'spot-ocupado', 'detalle', 'SPOT_OCUPADO');
    end if;
  end if;

  if v_requiere_aprobacion then
    v_estado := 'PENDIENTE_APROBACION';
    v_pos := null;
  else
    v_aforo := public.aforo_efectivo(p_sesion_id);
    select count(*) into v_ocupadas
      from public.reservas as r
     where r.sesion_id = p_sesion_id and r.estado in ('CONFIRMADA', 'ASISTIDA');

    -- Elección del estudio (`lista_espera_reserva_plaza_ofrecida`, de serie NO: como siempre).
    -- Con ella, una plaza que se le ha OFRECIDO a alguien de la lista de espera y sigue dentro
    -- de su plazo cuenta como ocupada para quien llega ahora: no se la lleva quien reserva en
    -- ese momento, y la oferta se puede aceptar. Sin ella, la ofrecida está libre y la primera
    -- persona que reserve la toma.
    select coalesce(st.lista_espera_reserva_plaza_ofrecida, false) into v_ofertas_reservan
      from public.studios as st where st.id = p_studio_id;
    if v_ofertas_reservan then
      v_ocupadas := v_ocupadas + (
        select count(*) from public.reservas as r
         where r.sesion_id = p_sesion_id and r.estado = 'LISTA_ESPERA'
           and r.oferta_expira_en is not null and r.oferta_expira_en > now()
      );
    end if;

    -- Las plazas APARTADAS para una plataforma que vende a mano (ClassPass) no son
    -- de los canales de Tentare hasta que se liberan (`plazas_apartadas`, decisión
    -- del fundador del 7-oct-2026): la clase sale completa o a lista de espera.
    if v_aforo is not null then
      v_ocupadas := v_ocupadas + public.plazas_apartadas(p_sesion_id);
    end if;

    if v_aforo is null or v_ocupadas < v_aforo then
      v_estado := 'CONFIRMADA';
      v_pos := null;
    else
      if not v_permite_espera then
        return jsonb_build_object('puede', false, 'codigo', 'aforo-lleno', 'detalle', 'AFORO_LLENO_SIN_ESPERA');
      end if;
      select count(*) into v_espera
        from public.reservas as r
       where r.sesion_id = p_sesion_id and r.estado = 'LISTA_ESPERA';
      v_estado := 'LISTA_ESPERA';
      v_pos := v_espera + 1;
    end if;
  end if;

  if v_estado in ('CONFIRMADA', 'PENDIENTE_APROBACION') and v_inicio is not null and v_fin is not null then
    if public.socio_tiene_conflicto_horario(p_studio_id, p_socio_id, p_sesion_id, v_inicio, v_fin) then
      return jsonb_build_object('puede', false, 'codigo', 'conflicto-horario', 'detalle', 'CONFLICTO_HORARIO');
    end if;
  end if;

  if v_estado = 'CONFIRMADA' then
    select ce.excede_total, ce.excede_tipo into v_excede_total, v_excede_tipo
      from public.calcular_excede_limite_semanal(p_studio_id, p_socio_id, v_tipo_clase_id, v_inicio) as ce;

    if v_excede_total or v_excede_tipo then
      -- Mismo criterio que `intentar_consumir_recuperacion_semanal`: la que caduca antes, y no caducada.
      select rc.id into v_recuperacion
        from public.recuperaciones as rc
       where rc.socio_id = p_socio_id and rc.studio_id = p_studio_id
         and rc.estado = 'DISPONIBLE' and rc.caduca_el >= current_date
       order by rc.caduca_el asc
       limit 1;
      if v_recuperacion is null then
        return jsonb_build_object(
          'puede', false,
          'codigo', case when v_excede_tipo then 'limite-semanal-actividad' else 'limite-semanal' end,
          'detalle', case when v_excede_tipo then 'LIMITE_SEMANAL_ACTIVIDAD' else 'LIMITE_SEMANAL' end,
          'tope', jsonb_build_object('excede_total', v_excede_total, 'excede_tipo', v_excede_tipo)
        );
      end if;
      v_pagador := jsonb_build_object('origen', 'recuperacion', 'recuperacion_id', v_recuperacion);
    else
      v_bono := public.elegir_bono_consumible(p_studio_id, p_socio_id, v_tipo_clase_id);
      if v_bono is not null then
        v_pagador := jsonb_build_object('origen', 'bono', 'suscripcion_id', v_bono);
      else
        select s.id into v_cuota
          from public.suscripciones as s
          join public.planes_tarifa as p on p.id = s.plan_id and p.studio_id = s.studio_id
         where s.studio_id = p_studio_id and s.socio_id = p_socio_id and s.estado = 'ACTIVA'
           and p.tipo = 'MENSUAL'
           and (s.fecha_fin is null or s.fecha_fin >= current_date)
           and v_tipo_clase_id is not null
           and public.plan_cubre_tipo_clase(p.id, v_tipo_clase_id)
         order by s.id collate "C"
         limit 1;
        if v_cuota is not null then
          v_pagador := jsonb_build_object('origen', 'cuota', 'suscripcion_id', v_cuota);
        end if;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'puede', true,
    'codigo', null,
    'estado', v_estado,
    'posicion_espera', v_pos,
    'pagador', v_pagador,
    'tope', jsonb_build_object('excede_total', v_excede_total, 'excede_tipo', v_excede_tipo)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.promocionar_siguiente_espera(p_studio_id text, p_sesion_id text, p_plazo_minutos integer)
 RETURNS TABLE(promovida_socio_id text, oferta_socio_id text, oferta_expira_en timestamp with time zone)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_expira timestamptz;
  v_aforo int; v_ocupadas int;
  v_tipo text; v_requiere boolean;
  v_inicio timestamptz; v_fin timestamptz;
  v_excede_total boolean; v_excede_tipo boolean;
  v_conflicto boolean;
  v_exige_plan boolean;
  v_cand record;
begin
  if not exists (
    select 1 from public.sesiones s
     where s.id = p_sesion_id
       and s.studio_id = p_studio_id
       and coalesce(s.cancelada, false) = false
       and s.inicio > now()
       and not public.fecha_en_cierre(s.studio_id, (s.inicio at time zone 'Europe/Madrid')::date)
  ) then
    return query select null::text, null::text, null::timestamptz;
    return;
  end if;

  -- D-4: candado de la sesión AQUÍ, antes de leer aforo/ocupadas — para que
  -- cualquier llamante (los ya existentes y los que vengan) quede
  -- serializado contra `reservar_plaza` sobre la MISMA sesión.
  select s.tipo_clase_id, s.inicio, s.fin into v_tipo, v_inicio, v_fin
    from public.sesiones s where s.id = p_sesion_id
    for update;
  select tc.requiere_autorizacion into v_requiere
    from public.tipos_clase tc where tc.id = v_tipo;

  -- D-2, solo si el estudio exige plan a esta clase Y vende algo. Una vez por
  -- llamada: no depende de la candidata.
  v_exige_plan := v_tipo is not null and public.reserva_exige_plan(p_studio_id, v_tipo);

  v_aforo := aforo_efectivo(p_sesion_id);
  select count(*) into v_ocupadas from reservas as r
   where r.sesion_id = p_sesion_id and r.estado in ('CONFIRMADA', 'ASISTIDA');
  -- Una plaza apartada para ClassPass no se da a la lista de espera: si la que se
  -- libera es de ClassPass, vuelve a ClassPass (`plazas_apartadas`).
  if v_aforo is not null then
    v_ocupadas := v_ocupadas + public.plazas_apartadas(p_sesion_id);
  end if;
  if v_aforo is not null and v_ocupadas >= v_aforo then
    return query select null::text, null::text, null::timestamptz;
    return;
  end if;

  -- PR-13: el mismo orden que `renumerar_lista_espera` (quien pagó y se quedó sin
  -- plaza, primero; el resto por `creado_en`).
  for v_cand in
    select r.id, r.socio_id from reservas as r
     where r.sesion_id = p_sesion_id and r.estado = 'LISTA_ESPERA' and r.oferta_expira_en is null
       and (
         not coalesce(v_requiere, false)
         or exists (
           select 1 from socio_tipos_clase_autorizados a
            where a.studio_id = p_studio_id
              and a.socio_id = r.socio_id
              and a.tipo_clase_id = v_tipo
         )
       )
     order by (select min(pc.prioridad_espera_desde) from public.pagos_clase as pc
                where pc.reserva_id = r.id and pc.estado = 'COMPENSADA'
                  and pc.prioridad_espera_desde is not null) asc nulls last,
              r.creado_en asc, r.id asc
     for update
  loop
    -- Descuento en la transacción: en la promoción directa, el candado de la
    -- candidata ANTES de sus comprobaciones (solape, plan, límite), como
    -- `reservar_plaza`. La oferta con plazo no confirma nada: no lo necesita.
    if coalesce(p_plazo_minutos, 0) <= 0 then
      perform pg_advisory_xact_lock(hashtext(p_studio_id || ':' || v_cand.socio_id));
    end if;

    v_conflicto := public.socio_tiene_conflicto_horario(p_studio_id, v_cand.socio_id, p_sesion_id, v_inicio, v_fin);
    if v_conflicto then
      continue;
    end if;

    if v_exige_plan
       and not public.socio_tiene_entitlement_activo(p_studio_id, v_cand.socio_id, v_tipo, current_date) then
      continue;
    end if;

    if coalesce(p_plazo_minutos, 0) <= 0 then
      select ce.excede_total, ce.excede_tipo into v_excede_total, v_excede_tipo
        from public.calcular_excede_limite_semanal(p_studio_id, v_cand.socio_id, v_tipo, v_inicio) ce;
      if (v_excede_total or v_excede_tipo)
         and not public.intentar_consumir_recuperacion_semanal(p_studio_id, v_cand.socio_id, v_cand.id) then
        continue;
      end if;
      update reservas set estado='CONFIRMADA', posicion_espera=null, oferta_expira_en=null where id = v_cand.id;

      -- Descuento en la transacción, como `reservar_plaza`.
      begin
        perform public.consumir_bono_interno(
          v_cand.id, public.elegir_bono_consumible(p_studio_id, v_cand.socio_id, v_tipo), p_studio_id);
      exception when raise_exception then
        null;
      end;

      return query select v_cand.socio_id, null::text, null::timestamptz;
      return;
    else
      v_expira := now() + make_interval(mins => p_plazo_minutos);
      update reservas set oferta_expira_en = v_expira where id = v_cand.id;
      return query select null::text, v_cand.socio_id, v_expira;
      return;
    end if;
  end loop;

  return query select null::text, null::text, null::timestamptz;
end; $function$;

create or replace function public.resolver_reserva_pendiente(p_studio_id text, p_reserva_id text, p_aprobar boolean)
 returns table(estado text, posicion_espera integer)
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
#variable_conflict use_column
declare
  v_sesion_id text;
  v_socio_id text;
  v_inicio timestamptz;
  v_fin timestamptz;
  v_tipo_clase_id text;
  v_aforo int;
  v_ocupadas int;
  v_espera int;
  v_estado text;
  v_pos int;
  v_excede_total boolean := false;
  v_excede_tipo boolean := false;
begin
  perform public.validar_studio_mismatch(p_studio_id);

  if not public.es_llamada_servicio() and not public.puede_gestionar_calendario() then
    raise exception 'NO_AUTORIZADO';
  end if;

  -- Descuento en la transacción: el candado de la socia ANTES de las filas,
  -- como `reservar_plaza`. Se lee su id sin candado; el orden reserva → sesión
  -- de abajo no cambia (al revés chocaría con cancelar esta misma pendiente).
  select r.socio_id into v_socio_id
    from reservas as r
   where r.id = p_reserva_id and r.studio_id = p_studio_id and r.estado = 'PENDIENTE_APROBACION';
  if found and v_socio_id is not null then
    perform pg_advisory_xact_lock(hashtext(p_studio_id || ':' || v_socio_id));
  end if;

  select sesion_id, socio_id into v_sesion_id, v_socio_id
    from reservas
   where id = p_reserva_id and studio_id = p_studio_id and estado = 'PENDIENTE_APROBACION'
   for update;
  if not found then
    raise exception 'NO_ENCONTRADA_O_YA_RESUELTA';
  end if;

  -- R-8: defensa en profundidad — v_sesion_id ya viene de una reserva acotada
  -- a p_studio_id, pero la propia sesión también se filtra ahora por escrito.
  select inicio, fin, tipo_clase_id into v_inicio, v_fin, v_tipo_clase_id
    from sesiones where id = v_sesion_id and studio_id = p_studio_id for update;

  if public.fecha_en_cierre(p_studio_id, (v_inicio at time zone 'Europe/Madrid')::date) then
    raise exception 'ESTUDIO_CERRADO';
  end if;

  if v_inicio is null or v_inicio <= now() then
    update reservas set estado = 'CANCELADA' where id = p_reserva_id;
    return query select 'CANCELADA'::text, null::int;
    return;
  end if;

  if not p_aprobar then
    update reservas set estado = 'CANCELADA' where id = p_reserva_id;
    return query select 'CANCELADA'::text, null::int;
    return;
  end if;

  v_aforo := aforo_efectivo(v_sesion_id);
  select count(*) into v_ocupadas
    from reservas where sesion_id = v_sesion_id and estado in ('CONFIRMADA', 'ASISTIDA');
  -- Aprobarla no le da una plaza apartada para ClassPass (`plazas_apartadas`).
  if v_aforo is not null then
    v_ocupadas := v_ocupadas + public.plazas_apartadas(v_sesion_id);
  end if;

  if v_aforo is null or v_ocupadas < v_aforo then
    v_estado := 'CONFIRMADA';
    v_pos := null;
  else
    select count(*) into v_espera
      from reservas where sesion_id = v_sesion_id and estado = 'LISTA_ESPERA';
    v_estado := 'LISTA_ESPERA';
    v_pos := v_espera + 1;
  end if;

  if v_estado = 'CONFIRMADA' then
    -- D-2, solo si el estudio exige plan a esta clase Y vende algo
    -- (`reserva_exige_plan`): la misma regla con la que `reservar_plaza` dejó
    -- entrar la reserva.
    if v_tipo_clase_id is not null
       and public.reserva_exige_plan(p_studio_id, v_tipo_clase_id)
       and not public.socio_tiene_entitlement_activo(p_studio_id, v_socio_id, v_tipo_clase_id, current_date) then
      raise exception 'SIN_ENTITLEMENT';
    end if;

    if public.socio_tiene_conflicto_horario(p_studio_id, v_socio_id, v_sesion_id, v_inicio, v_fin) then
      raise exception 'CONFLICTO_HORARIO';
    end if;

    select ce.excede_total, ce.excede_tipo into v_excede_total, v_excede_tipo
      from public.calcular_excede_limite_semanal(p_studio_id, v_socio_id, v_tipo_clase_id, v_inicio) ce;

    if v_excede_total or v_excede_tipo then
      if not public.intentar_consumir_recuperacion_semanal(p_studio_id, v_socio_id, p_reserva_id) then
        if v_excede_tipo then
          raise exception 'LIMITE_SEMANAL_ACTIVIDAD';
        else
          raise exception 'LIMITE_SEMANAL';
        end if;
      end if;
    end if;
  end if;

  update reservas set estado = v_estado, posicion_espera = v_pos where id = p_reserva_id;

  -- Descuento en la transacción, como `reservar_plaza`: los rechazos defensivos
  -- de `consumir_bono_interno` no tumban una plaza ya válida.
  if v_estado = 'CONFIRMADA' then
    begin
      perform public.consumir_bono_interno(
        p_reserva_id, public.elegir_bono_consumible(p_studio_id, v_socio_id, v_tipo_clase_id), p_studio_id);
    exception when raise_exception then
      null;
    end;
  end if;

  return query select v_estado, v_pos;
end;
$function$;

create or replace function public.aceptar_oferta_lista_espera(p_studio_id text, p_reserva_id text, p_socio_id text)
 returns table(estado text)
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_sesion_id text; v_res_socio text; v_expira timestamptz;
  v_inicio timestamptz; v_fin timestamptz; v_tipo_clase_id text;
  v_cancelada boolean; v_aforo int; v_ocupadas int;
  v_excede_total boolean; v_excede_tipo boolean;
begin
  perform public.validar_studio_mismatch(p_studio_id);
  -- Descuento en la transacción: el candado de la socia ANTES de las filas,
  -- como `reservar_plaza`.
  perform pg_advisory_xact_lock(hashtext(p_studio_id || ':' || p_socio_id));
  select r.sesion_id into v_sesion_id from reservas as r
   where r.id = p_reserva_id and r.studio_id = p_studio_id and r.estado = 'LISTA_ESPERA';
  if not found then raise exception 'OFERTA_NO_ENCONTRADA'; end if;
  select s.inicio, s.fin, s.tipo_clase_id, coalesce(s.cancelada, false)
    into v_inicio, v_fin, v_tipo_clase_id, v_cancelada
    from sesiones as s
   where s.id = v_sesion_id and s.studio_id = p_studio_id for update;
  if not found then raise exception 'SESION_NO_ENCONTRADA'; end if;
  select r.socio_id, r.oferta_expira_en into v_res_socio, v_expira from reservas as r
   where r.id = p_reserva_id and r.studio_id = p_studio_id and r.estado = 'LISTA_ESPERA' for update;
  if not found then raise exception 'OFERTA_NO_ENCONTRADA'; end if;
  if v_res_socio is distinct from p_socio_id then raise exception 'NO_AUTORIZADO'; end if;
  if v_expira is null then raise exception 'SIN_OFERTA_ACTIVA'; end if;
  if now() > v_expira then raise exception 'OFERTA_CADUCADA'; end if;

  if v_cancelada then
    update reservas set estado='CANCELADA', posicion_espera=null, oferta_expira_en=null where id = p_reserva_id;
    perform public.renumerar_lista_espera(v_sesion_id);
    return query select 'CLASE_CANCELADA'::text;
    return;
  end if;
  if v_inicio <= now() then
    update reservas set estado='CANCELADA', posicion_espera=null, oferta_expira_en=null where id = p_reserva_id;
    perform public.renumerar_lista_espera(v_sesion_id);
    return query select 'CLASE_YA_EMPEZADA'::text;
    return;
  end if;

  v_aforo := aforo_efectivo(v_sesion_id);
  select count(*) into v_ocupadas from reservas as r
   where r.sesion_id = v_sesion_id and r.estado in ('CONFIRMADA','ASISTIDA');
  -- Las apartadas para ClassPass cuentan igual que al ofrecerla (`plazas_apartadas`).
  if v_aforo is not null then
    v_ocupadas := v_ocupadas + public.plazas_apartadas(v_sesion_id);
  end if;
  if v_aforo is not null and v_ocupadas >= v_aforo then
    update reservas set estado='CANCELADA', posicion_espera=null, oferta_expira_en=null where id = p_reserva_id;
    perform public.renumerar_lista_espera(v_sesion_id);
    return query select 'AFORO_LLENO'::text;
    return;
  end if;

  -- RES-1: recomprobación en el momento REAL de confirmar (no solo al abrir
  -- la oferta) — puede haber reservado otra cosa o agotado su cuota mientras
  -- la oferta estaba abierta. Conflicto primero porque no muta nada; el
  -- límite semanal después, porque sí puede consumir una recuperación.
  if public.socio_tiene_conflicto_horario(p_studio_id, p_socio_id, v_sesion_id, v_inicio, v_fin) then
    update reservas set estado='CANCELADA', posicion_espera=null, oferta_expira_en=null where id = p_reserva_id;
    perform public.renumerar_lista_espera(v_sesion_id);
    return query select 'CONFLICTO_HORARIO'::text;
    return;
  end if;

  -- D-2: mismo motivo que el conflicto de arriba — el bono/plan pudo dejar de
  -- cubrir la clase mientras la oferta estaba abierta. Solo si el estudio exige
  -- plan a esta clase Y vende algo (`reserva_exige_plan`).
  if v_tipo_clase_id is not null
     and public.reserva_exige_plan(p_studio_id, v_tipo_clase_id)
     and not public.socio_tiene_entitlement_activo(p_studio_id, p_socio_id, v_tipo_clase_id, current_date) then
    update reservas set estado='CANCELADA', posicion_espera=null, oferta_expira_en=null where id = p_reserva_id;
    perform public.renumerar_lista_espera(v_sesion_id);
    return query select 'SIN_ENTITLEMENT'::text;
    return;
  end if;

  select ce.excede_total, ce.excede_tipo into v_excede_total, v_excede_tipo
    from public.calcular_excede_limite_semanal(p_studio_id, p_socio_id, v_tipo_clase_id, v_inicio) ce;
  if (v_excede_total or v_excede_tipo)
     and not public.intentar_consumir_recuperacion_semanal(p_studio_id, p_socio_id, p_reserva_id) then
    update reservas set estado='CANCELADA', posicion_espera=null, oferta_expira_en=null where id = p_reserva_id;
    perform public.renumerar_lista_espera(v_sesion_id);
    if v_excede_tipo then
      return query select 'LIMITE_SEMANAL_ACTIVIDAD'::text;
    else
      return query select 'LIMITE_SEMANAL'::text;
    end if;
    return;
  end if;

  update reservas set estado='CONFIRMADA', posicion_espera=null, oferta_expira_en=null where id = p_reserva_id;
  perform public.renumerar_lista_espera(v_sesion_id);

  -- Descuento en la transacción, como `reservar_plaza`.
  begin
    perform public.consumir_bono_interno(
      p_reserva_id, public.elegir_bono_consumible(p_studio_id, p_socio_id, v_tipo_clase_id), p_studio_id);
  exception when raise_exception then
    null;
  end;

  return query select 'CONFIRMADA'::text;
end; $function$;

create or replace function public.reservar_plaza_externa(
  p_studio_id text,
  p_sesion_id text,
  p_reserva_id text,
  p_origen text,
  p_nombre text,
  p_id_reserva_externa text default null,
  p_id_cliente_externo text default null,
  p_exigir_cupo boolean default false
)
 returns table(reserva_id text, estado text, repetida boolean, plazas_libres integer, cupo integer, cupo_usado integer)
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
#variable_conflict use_column
declare
  v_existente text;
  v_existente_estado text;
  v_inicio timestamptz;
  v_fin timestamptz;
  v_cancelada boolean;
  v_tipo_clase_id text;
  v_requiere_autorizacion boolean;
  v_aforo int;
  v_ocupadas int;
  v_cupo int;
  v_cupo_usado int;
  v_nombre text := btrim(coalesce(p_nombre, ''));
begin
  perform public.validar_studio_mismatch(p_studio_id);

  if p_origen not in ('CLASSPASS', 'URBAN_SPORTS_CLUB', 'WELLHUB') then
    raise exception 'ORIGEN_NO_VALIDO';
  end if;
  if length(v_nombre) = 0 then
    raise exception 'NOMBRE_REQUERIDO';
  end if;
  v_nombre := left(v_nombre, 200);

  -- El candado de la sesión, ANTES de mirar nada más: el mismo que toma
  -- `reservar_plaza`. También serializa dos llamadas con el mismo id externo,
  -- así que la comprobación de idempotencia de abajo no tiene carrera.
  select s.inicio, s.fin, s.tipo_clase_id, s.cancelada
    into v_inicio, v_fin, v_tipo_clase_id, v_cancelada
    from sesiones s where s.id = p_sesion_id and s.studio_id = p_studio_id
    for update;
  if not found then
    raise exception 'SESION_NO_ENCONTRADA';
  end if;

  if p_id_reserva_externa is not null then
    select r.id, r.estado into v_existente, v_existente_estado
      from reservas r
     where r.studio_id = p_studio_id and r.origen = p_origen
       and r.id_reserva_externa = p_id_reserva_externa;
    if v_existente is not null then
      return query
        select v_existente, v_existente_estado, true,
               greatest(0, coalesce(aforo_efectivo(p_sesion_id), 0) - (
                 select count(*)::int from reservas x
                  where x.sesion_id = p_sesion_id and x.estado in ('CONFIRMADA', 'ASISTIDA'))),
               public.cupo_plataforma(p_sesion_id, p_origen),
               (select count(*)::int from reservas x
                 where x.sesion_id = p_sesion_id and x.origen = p_origen
                   and x.estado in ('CONFIRMADA', 'ASISTIDA'));
      return;
    end if;
  end if;

  if coalesce(v_cancelada, false) then
    raise exception 'SESION_CANCELADA';
  end if;
  -- Se admite mientras la clase no haya terminado: el mismo corte que la
  -- reserva de mostrador (alguien que llega con la clase empezada).
  if v_fin is not null and v_fin <= now() then
    raise exception 'SESION_TERMINADA';
  end if;
  if public.fecha_en_cierre(p_studio_id, (v_inicio at time zone 'Europe/Madrid')::date) then
    raise exception 'ESTUDIO_CERRADO';
  end if;

  -- Las clases que exigen autorización previa (p. ej. reformer para quien ya
  -- ha hecho la iniciación) no se venden fuera: la persona externa no tiene
  -- ficha donde constar esa autorización. Sin esto, el trigger
  -- `exigir_autorizacion_tipo_clase` lo rechazaría con un error confuso.
  if v_tipo_clase_id is not null then
    select tc.requiere_autorizacion into v_requiere_autorizacion
      from tipos_clase tc where tc.id = v_tipo_clase_id and tc.studio_id = p_studio_id;
    if coalesce(v_requiere_autorizacion, false) then
      raise exception 'TIPO_REQUIERE_AUTORIZACION';
    end if;
  end if;

  if p_id_cliente_externo is not null and exists (
    select 1 from reservas r
     where r.sesion_id = p_sesion_id and r.origen = p_origen
       and r.id_cliente_externo = p_id_cliente_externo
       and r.estado in ('CONFIRMADA', 'ASISTIDA')
  ) then
    raise exception 'YA_RESERVADA';
  end if;

  v_aforo := aforo_efectivo(p_sesion_id);
  select count(*) into v_ocupadas
    from reservas where sesion_id = p_sesion_id and estado in ('CONFIRMADA', 'ASISTIDA');
  if v_aforo is not null and v_ocupadas >= v_aforo then
    raise exception 'AFORO_LLENO';
  end if;
  -- Las apartadas para OTRA plataforma que vende a mano (ClassPass) tampoco son
  -- suyas; las suyas, sí (`plazas_apartadas` excluye a quien reserva). Contiene
  -- AFORO_LLENO a propósito: quien no lo distinga lo lee como «completa».
  if v_aforo is not null and v_ocupadas + public.plazas_apartadas(p_sesion_id, p_origen) >= v_aforo then
    raise exception 'AFORO_LLENO_APARTADAS';
  end if;

  v_cupo := public.cupo_plataforma(p_sesion_id, p_origen);
  select count(*) into v_cupo_usado
    from reservas
   where sesion_id = p_sesion_id and origen = p_origen and estado in ('CONFIRMADA', 'ASISTIDA');
  if p_exigir_cupo and v_cupo is not null and v_cupo_usado >= v_cupo then
    raise exception 'CUPO_PLATAFORMA_AGOTADO';
  end if;

  -- Sin bono, sin cobro, sin recuperación: `bono_consumo_rastreado = false`
  -- escrito de forma explícita (el default de la columna es `true`, y el CHECK
  -- `reservas_origen_coherente` rechazaría la fila si no).
  insert into reservas (id, studio_id, sesion_id, socio_id, estado, spot_id, posicion_espera,
                        check_in_en, creado_en, bono_consumo_rastreado,
                        origen, nombre_externo, id_reserva_externa, id_cliente_externo)
    values (p_reserva_id, p_studio_id, p_sesion_id, null, 'CONFIRMADA', null, null,
            null, now(), false,
            p_origen, v_nombre, p_id_reserva_externa, p_id_cliente_externo);

  return query select p_reserva_id, 'CONFIRMADA'::text, false,
                      case when v_aforo is null then null else greatest(0, v_aforo - v_ocupadas - 1) end,
                      v_cupo, v_cupo_usado + 1;
end;
$function$;

-- Mismas firmas: conservan sus permisos, pero se dicen por escrito y se comprueban
-- (las cinco, solo el servidor).
revoke execute on function public.evaluar_reserva(text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.promocionar_siguiente_espera(text, text, integer) from public, anon, authenticated;
revoke execute on function public.resolver_reserva_pendiente(text, text, boolean) from public, anon, authenticated;
revoke execute on function public.aceptar_oferta_lista_espera(text, text, text) from public, anon, authenticated;
revoke execute on function public.reservar_plaza_externa(text, text, text, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.evaluar_reserva(text, text, text, jsonb) to service_role;
grant execute on function public.promocionar_siguiente_espera(text, text, integer) to service_role;
grant execute on function public.resolver_reserva_pendiente(text, text, boolean) to service_role;
grant execute on function public.aceptar_oferta_lista_espera(text, text, text) to service_role;
grant execute on function public.reservar_plaza_externa(text, text, text, text, text, text, text, boolean) to service_role;
do $$
declare
  v_firma text;
begin
  foreach v_firma in array array[
    'public.evaluar_reserva(text, text, text, jsonb)',
    'public.promocionar_siguiente_espera(text, text, integer)',
    'public.resolver_reserva_pendiente(text, text, boolean)',
    'public.aceptar_oferta_lista_espera(text, text, text)',
    'public.reservar_plaza_externa(text, text, text, text, text, text, text, boolean)'
  ] loop
    if has_function_privilege('anon', v_firma, 'execute')
       or has_function_privilege('authenticated', v_firma, 'execute')
       or not has_function_privilege('service_role', v_firma, 'execute') then
      raise exception '%: permisos distintos de lo previsto', v_firma;
    end if;
  end loop;
end $$;

-- ── 4) «La he cerrado en ClassPass: liberar 1» ───────────────────────────────
-- Recepción no usa una plaza apartada directamente (decisión del fundador,
-- 7-oct-2026): primero la cierra en ClassPass y luego la libera aquí. Esto baja
-- en 1 el cupo de ESA sesión (la excepción por sesión de `plataforma_cupos`),
-- con el candado de la sesión, y solo si AHORA hay alguna apartada (encendida,
-- antes de su hora, nunca por debajo de lo ya vendido): si no, no queda rastro
-- de una liberación que no liberó nada. Devuelve las plazas que siguen
-- apartadas. Solo el servidor: la ruta comprueba el rol y deja el rastro en
-- Actividad.
create or replace function public.liberar_plaza_apartada(p_studio_id text, p_sesion_id text, p_plataforma text)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_cupo int;
begin
  if not (p_plataforma = any (public.plataformas_que_apartan())) then
    raise exception 'PLATAFORMA_NO_APARTA';
  end if;
  perform 1 from sesiones as s where s.id = p_sesion_id and s.studio_id = p_studio_id for update;
  if not found then
    raise exception 'SESION_NO_ENCONTRADA';
  end if;
  select a.cupo into v_cupo
    from public.apartados_de_sesion(p_sesion_id) as a
   where a.plataforma = p_plataforma and a.cupo is not null and a.cupo > a.vendidas and now() < a.liberan_en;
  if v_cupo is null then
    raise exception 'NADA_APARTADO';
  end if;
  insert into plataforma_cupos (studio_id, plataforma, sesion_id, plazas)
    values (p_studio_id, p_plataforma, p_sesion_id, v_cupo - 1)
  on conflict (plataforma, sesion_id) where sesion_id is not null
    do update set plazas = excluded.plazas, actualizado_en = now();
  return public.plazas_apartadas(p_sesion_id);
end;
$function$;

revoke execute on function public.liberar_plaza_apartada(text, text, text) from public, anon, authenticated;
grant execute on function public.liberar_plaza_apartada(text, text, text) to service_role;
do $$
begin
  if has_function_privilege('anon', 'public.liberar_plaza_apartada(text, text, text)', 'execute')
     or has_function_privilege('authenticated', 'public.liberar_plaza_apartada(text, text, text)', 'execute')
     or not has_function_privilege('service_role', 'public.liberar_plaza_apartada(text, text, text)', 'execute') then
    raise exception 'liberar_plaza_apartada: permisos distintos de lo previsto';
  end if;
end $$;

-- ── 5) La cola, cuando se liberan ─────────────────────────────────────────────
-- El mismo job (y la misma ruta), con el predicado ampliado: también hay trabajo
-- si una sesión acaba de liberar sus apartadas y tiene cola. ⚠️ Igual o más
-- amplio que lo que pide la ruta (lib/lista-espera/plazas-liberadas.ts): la
-- misma función y la misma ventana.
do $$
begin
  if (select md5(j.command) from cron.job j where j.jobname = 'lista-espera-ofertas-expirar')
     is distinct from '41a92c5ee4dccfd4c5651d4cff4ef638' then
    raise exception 'el job lista-espera-ofertas-expirar ha cambiado: rehaz esta migración sobre el vigente';
  end if;
end $$;

select cron.unschedule('lista-espera-ofertas-expirar')
 where exists (select 1 from cron.job where jobname = 'lista-espera-ofertas-expirar');
select cron.schedule(
  'lista-espera-ofertas-expirar',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://www.tentare.app/api/cron/lista-espera-ofertas-expirar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  )
  where exists (
    select 1 from public.reservas r
    where r.estado = 'LISTA_ESPERA'
      and r.oferta_expira_en is not null
      and r.oferta_expira_en <= now()
  )
  or exists (
    select 1 from public.sesiones_con_plazas_liberadas(interval '15 minutes') x
  );
  $$
);
