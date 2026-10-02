-- Motor de derechos, FASE 3a: dos reglas de elegibilidad ya decididas con el fundador.
--
--  1. El no-show CUENTA COMO USO para el tope semanal. Quien reserva y no viene ha usado esa
--     clase: antes `calcular_excede_limite_semanal` solo contaba CONFIRMADA y ASISTIDA, así que
--     una socia con tope de 2 a la semana podía faltar a una sin avisar y reservar otra de más.
--     (El tope de clases al día ya contaba todo lo que no estuviera cancelado.)
--  2. Con varios bonos que cubren la misma clase manda la ESPECIFICIDAD: el bono acotado a ciertos
--     tipos de clase se gasta antes que el de «todas las clases», y a igualdad, el que caduca
--     antes, y a igualdad, el id. Antes solo se miraba la caducidad: con un «Bono Reformer» y un
--     «Bono todo» se gastaba el que caducara antes, aunque fuera el general, y el específico se
--     quedaba sin poder usarse en lo único que sirve.
--
-- Solo cambia el CUERPO de dos funciones existentes, con la misma firma: se conservan sus permisos
-- (solo service_role) y su volatilidad. Medido en producción antes de escribirlo: ninguna socia con
-- tope semanal tiene un no-show esta semana y ninguna tiene varios bonos con sesiones, así que hoy
-- no cambia el resultado para nadie; fija la regla para cuando ocurra.
--
-- Sus gemelas en TypeScript, que tienen que decir lo mismo: `bonoConsumible`/`elegirBono`
-- (lib/bono-logic.ts) y el barrido de recuperaciones semanales
-- (lib/recuperaciones/otorgar-semanales.ts).

create or replace function public.calcular_excede_limite_semanal(p_studio_id text, p_socio_id text, p_tipo_clase_id text, p_inicio timestamp with time zone)
returns table(excede_total boolean, excede_tipo boolean)
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_limite int;
  v_plan_limite text;
  v_semana int;
  v_semana_ini timestamptz;
  v_limite_tipo int;
  v_semana_tipo int;
  v_excede_total boolean := false;
  v_excede_tipo boolean := false;
begin
  v_semana_ini := date_trunc('week', p_inicio at time zone 'Europe/Madrid') at time zone 'Europe/Madrid';

  select p.id, p.limite_semanal into v_plan_limite, v_limite
    from suscripciones s
    join planes_tarifa p on p.id = s.plan_id
   where s.studio_id = p_studio_id and s.socio_id = p_socio_id and s.estado = 'ACTIVA'
     and p.limite_semanal is not null
     and (s.fecha_fin is null or s.fecha_fin >= current_date)
     and public.plan_cubre_tipo_clase(p.id, p_tipo_clase_id)
   order by p.limite_semanal asc
   limit 1;
  if v_limite is not null then
    select count(*) into v_semana
      from reservas r
      join sesiones ss on ss.id = r.sesion_id
     where r.socio_id = p_socio_id and r.studio_id = p_studio_id
       and r.estado in ('CONFIRMADA', 'ASISTIDA', 'NO_ASISTIO')
       and coalesce(ss.cancelada, false) = false
       and ss.inicio >= v_semana_ini
       and ss.inicio <  v_semana_ini + interval '7 days'
       and public.plan_cubre_tipo_clase(v_plan_limite, ss.tipo_clase_id);
    if v_semana >= v_limite then
      v_excede_total := true;
    end if;
  end if;

  if p_tipo_clase_id is not null then
    select pt.limite_semanal into v_limite_tipo
      from suscripciones s
      join plan_tipos_clase pt
        on pt.plan_id = s.plan_id and pt.studio_id = s.studio_id
     where s.studio_id = p_studio_id and s.socio_id = p_socio_id and s.estado = 'ACTIVA'
       and pt.tipo_clase_id = p_tipo_clase_id
       and pt.limite_semanal is not null
       and (s.fecha_fin is null or s.fecha_fin >= current_date)
     order by pt.limite_semanal asc
     limit 1;

    if v_limite_tipo is not null then
      select count(*) into v_semana_tipo
        from reservas r
        join sesiones ss on ss.id = r.sesion_id
       where r.socio_id = p_socio_id and r.studio_id = p_studio_id
         and r.estado in ('CONFIRMADA', 'ASISTIDA', 'NO_ASISTIO')
         and coalesce(ss.cancelada, false) = false
         and ss.tipo_clase_id = p_tipo_clase_id
         and ss.inicio >= v_semana_ini
         and ss.inicio <  v_semana_ini + interval '7 days';
      if v_semana_tipo >= v_limite_tipo then
        v_excede_tipo := true;
      end if;
    end if;
  end if;

  return query select v_excede_total, v_excede_tipo;
end;
$function$;

create or replace function public.elegir_bono_consumible(p_studio_id text, p_socio_id text, p_tipo_clase_id text, p_hoy date default current_date)
returns text
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select case
    -- La mensual gana, y solo ante una clase concreta: sin saber de qué clase
    -- se habla no se afirma que la cuota la cubra (sería regalar la clase).
    when p_tipo_clase_id is not null and exists (
      select 1
        from public.suscripciones as s
        join public.planes_tarifa as p on p.id = s.plan_id and p.studio_id = s.studio_id
       where s.studio_id = p_studio_id and s.socio_id = p_socio_id and s.estado = 'ACTIVA'
         and p.tipo = 'MENSUAL'
         and (s.fecha_fin is null or s.fecha_fin >= p_hoy)
         and public.plan_cubre_tipo_clase(p.id, p_tipo_clase_id)
    ) then null
    else (
      select s.id
        from public.suscripciones as s
        join public.planes_tarifa as p on p.id = s.plan_id and p.studio_id = s.studio_id
       where s.studio_id = p_studio_id and s.socio_id = p_socio_id and s.estado = 'ACTIVA'
         and s.sesiones_restantes is not null and s.sesiones_restantes > 0
         and p.tipo in ('BONO', 'PUNTUAL')
         and public.plan_cubre_tipo_clase(p.id, p_tipo_clase_id)
         and (s.fecha_fin is null or s.fecha_fin >= p_hoy)
       -- Primero el bono ACOTADO a tipos de clase (el más específico), después el general; a
       -- igualdad, el que caduca antes; a igualdad, el id (determinista).
       order by case when exists (
                  select 1 from public.plan_tipos_clase as ptc
                   where ptc.plan_id = p.id and ptc.studio_id = s.studio_id
                ) then 0 else 1 end,
                coalesce(s.fecha_fin, '9999-12-31'::date),
                s.id collate "C"
       limit 1
    )
  end;
$function$;

-- Permisos EXPLÍCITOS: solo el servidor. En producción ya eran así (este bloque no cambia nada allí), pero en una base
-- de datos creada desde cero con las migraciones estas dos funciones nacían con los permisos por defecto —un `DROP` +
-- `CREATE` anterior, sin su `REVOKE`— y la verificación de abajo lo habría tomado por un cambio. Las dos solo las
-- llaman funciones del servidor (`reservar_plaza`, `resolver_reserva_pendiente`… con `SECURITY DEFINER`) y el servidor.
revoke all on function public.calcular_excede_limite_semanal(text, text, text, timestamp with time zone) from public, anon, authenticated;
grant execute on function public.calcular_excede_limite_semanal(text, text, text, timestamp with time zone) to service_role;
revoke all on function public.elegir_bono_consumible(text, text, text, date) from public, anon, authenticated;
grant execute on function public.elegir_bono_consumible(text, text, text, date) to service_role;

-- Verificación: el estado FINAL. Solo el servidor las ejecuta y las dos reglas están puestas.
do $$
begin
  if has_function_privilege('anon', 'public.calcular_excede_limite_semanal(text,text,text,timestamptz)'::regprocedure, 'EXECUTE')
     or has_function_privilege('authenticated', 'public.calcular_excede_limite_semanal(text,text,text,timestamptz)'::regprocedure, 'EXECUTE')
     or not has_function_privilege('service_role', 'public.calcular_excede_limite_semanal(text,text,text,timestamptz)'::regprocedure, 'EXECUTE') then
    raise exception 'calcular_excede_limite_semanal no es solo del servidor';
  end if;
  if has_function_privilege('anon', 'public.elegir_bono_consumible(text,text,text,date)'::regprocedure, 'EXECUTE')
     or has_function_privilege('authenticated', 'public.elegir_bono_consumible(text,text,text,date)'::regprocedure, 'EXECUTE')
     or not has_function_privilege('service_role', 'public.elegir_bono_consumible(text,text,text,date)'::regprocedure, 'EXECUTE') then
    raise exception 'elegir_bono_consumible no es solo del servidor';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'calcular_excede_limite_semanal'
         and position('NO_ASISTIO' in p.prosrc) > 0) <> 1 then
    raise exception 'calcular_excede_limite_semanal no cuenta el no-show';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'elegir_bono_consumible'
         and position('plan_tipos_clase' in p.prosrc) > 0) <> 1 then
    raise exception 'elegir_bono_consumible no ordena por especificidad';
  end if;
end $$;
