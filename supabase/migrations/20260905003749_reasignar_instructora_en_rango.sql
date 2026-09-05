-- Pasar las clases de una instructora a otra en un rango de fechas, de una vez.
--
-- El caso real: «Julia se va tres semanas, pásale todo a Meri». Hoy hay que
-- abrir clase por clase. Y no vale con `editar_serie_desde`, que exige serie y
-- solo llega hasta el final de ESA serie: una baja cruza series distintas,
-- clases sueltas y varios días de la semana.
--
-- ⚠️ Esto NO reabre la decisión de #558 (confirmar una ausencia no dispara
-- ninguna sustitución automática sobre las clases ya programadas). Aquí no hay
-- nada automático: lo dispara una persona, eligiendo destino y fechas.
--
-- Cerradura: `puede_gestionar_calendario()` — su propio comentario dice
-- «reasignar/cancelar la de CUALQUIER instructora», y deja fuera a INSTRUCTOR,
-- que solo puede tocar las suyas.
--
-- Devuelve una fila POR CLASE con lo que pasó, no un contador: quien llama
-- necesita saber cuáles se movieron (para poder avisar a esas alumnas) y
-- cuáles chocaron (para decir con nombre y hora por qué no).

create or replace function public.reasignar_instructora(
  p_studio_id text,
  p_instructor_origen text,
  p_instructor_destino text,
  p_desde date,
  p_hasta date,
  p_omitir_conflictos boolean default false
)
returns table (id_sesion text, resultado text)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_ses record;
  v_destino_activo boolean;
begin
  if auth.uid() is not null and p_studio_id is distinct from public.current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;

  if auth.uid() is not null and not public.puede_gestionar_calendario() then
    raise exception 'NO_AUTORIZADO';
  end if;

  if p_instructor_origen is null or p_instructor_destino is null then
    raise exception 'FALTAN_INSTRUCTORAS';
  end if;

  if p_instructor_origen = p_instructor_destino then
    raise exception 'MISMA_INSTRUCTORA';
  end if;

  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'RANGO_INVALIDO';
  end if;

  -- Un año de tope. No es una regla de negocio, es un cortafuegos: una errata
  -- en el año movería la agenda entera de un estudio sin querer.
  if p_hasta - p_desde > 366 then
    raise exception 'RANGO_DEMASIADO_LARGO';
  end if;

  -- Las dos tienen que ser de ESTE estudio, y la que recibe, estar activa:
  -- repartirle clases a alguien dado de baja las deja sin quien las dé.
  if not exists (
    select 1 from public.instructores i
     where i.id = p_instructor_origen and i.studio_id = p_studio_id
  ) then
    raise exception 'ORIGEN_NO_ES_DEL_ESTUDIO';
  end if;

  select i.activo <> false into v_destino_activo
    from public.instructores i
   where i.id = p_instructor_destino and i.studio_id = p_studio_id;

  if v_destino_activo is null then
    raise exception 'DESTINO_NO_ES_DEL_ESTUDIO';
  end if;
  if not v_destino_activo then
    raise exception 'DESTINO_INACTIVA';
  end if;

  -- Fechas en hora LOCAL del estudio: «del 1 al 15» es lo que se ve en el
  -- calendario, no lo que diga UTC (mismo criterio que editar_serie_desde).
  for v_ses in
    select s.id
      from public.sesiones s
     where s.studio_id = p_studio_id
       and s.instructor_id = p_instructor_origen
       and s.cancelada = false
       and (s.inicio at time zone 'Europe/Madrid')::date between p_desde and p_hasta
     order by s.inicio
  loop
    begin
      update public.sesiones s
         set instructor_id = p_instructor_destino
       where s.id = v_ses.id;
      id_sesion := v_ses.id;
      resultado := 'REASIGNADA';
      return next;
    exception when exclusion_violation then
      -- La que recibe ya tiene otra clase a esa hora
      -- (sesiones_instructor_sin_solape, migr 0048).
      if not p_omitir_conflictos then
        raise;
      end if;
      id_sesion := v_ses.id;
      resultado := 'CONFLICTO';
      return next;
    end;
  end loop;

  return;
end;
$$;

comment on function public.reasignar_instructora(text, text, text, date, date, boolean) is
  'Pasa las clases NO canceladas de una instructora a otra entre dos fechas (hora local del estudio). Devuelve una fila por clase: REASIGNADA o CONFLICTO (la destino ya tenía clase a esa hora). Solo PROPIETARIO/MANAGER/RECEPCION.';

-- Función NUEVA: nace con EXECUTE para PUBLIC y, por el pg_default_acl de este
-- proyecto, directo para anon. Revocar PUBLIC no le quita nada a anon.
revoke execute on function public.reasignar_instructora(text, text, text, date, date, boolean) from public;
revoke execute on function public.reasignar_instructora(text, text, text, date, date, boolean) from anon;
grant execute on function public.reasignar_instructora(text, text, text, date, date, boolean) to authenticated, service_role;
