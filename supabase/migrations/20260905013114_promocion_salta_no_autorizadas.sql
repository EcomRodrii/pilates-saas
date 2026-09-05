-- La promoción desde lista de espera tiene que SALTARSE a quien ya no está
-- autorizada, no chocar con ella.
--
-- Con el disparador `trg_exigir_autorizacion_tipo_clase` puesto, el caso malo
-- es este: una socia se apunta a la lista cuando SÍ estaba autorizada, el
-- estudio le retira la autorización después (una lesión, una evaluación que no
-- pasa), y entonces otra persona cancela. La promoción la elegiría por ser la
-- primera de la cola, el disparador la rechazaría, y como todo va en la misma
-- transacción, **la cancelación de esa otra persona fallaría entera**. Alguien
-- sin nada que ver se quedaría sin poder cancelar su clase.
--
-- Así que el filtro va en la elección de candidata: se coge a la primera de la
-- cola QUE PUEDA ocupar la plaza. Las que no, se quedan en LISTA_ESPERA — ni se
-- las cancela ni se las promociona: si el estudio les devuelve la autorización
-- antes de la clase, vuelven a entrar en la cola por su orden de siempre.

create or replace function public.promocionar_siguiente_espera(p_studio_id text, p_sesion_id text, p_plazo_minutos integer)
 RETURNS TABLE(promovida_socio_id text, oferta_socio_id text, oferta_expira_en timestamp with time zone)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id text; v_socio text; v_expira timestamptz;
  v_aforo int; v_ocupadas int;
  v_tipo text; v_requiere boolean;
begin
  if not exists (
    select 1 from public.sesiones s
     where s.id = p_sesion_id
       and s.studio_id = p_studio_id
       and coalesce(s.cancelada, false) = false
       and s.inicio > now()
  ) then
    return query select null::text, null::text, null::timestamptz;
    return;
  end if;

  select s.tipo_clase_id into v_tipo from public.sesiones s where s.id = p_sesion_id;
  select tc.requiere_autorizacion into v_requiere
    from public.tipos_clase tc where tc.id = v_tipo;

  select r.id, r.socio_id into v_id, v_socio from reservas as r
   where r.sesion_id = p_sesion_id and r.estado = 'LISTA_ESPERA' and r.oferta_expira_en is null
     -- Si la clase pide autorización, solo entran las que la tengan AHORA.
     and (
       not coalesce(v_requiere, false)
       or exists (
         select 1 from socio_tipos_clase_autorizados a
          where a.studio_id = p_studio_id
            and a.socio_id = r.socio_id
            and a.tipo_clase_id = v_tipo
       )
     )
   order by r.creado_en asc, r.id asc limit 1 for update;
  if not found then return query select null::text, null::text, null::timestamptz; return; end if;

  if coalesce(p_plazo_minutos,0) <= 0 then
    v_aforo := aforo_efectivo(p_sesion_id);
    select count(*) into v_ocupadas from reservas as r
     where r.sesion_id = p_sesion_id and r.estado in ('CONFIRMADA', 'ASISTIDA');
    if v_aforo is not null and v_ocupadas >= v_aforo then
      return query select null::text, null::text, null::timestamptz;
      return;
    end if;
    update reservas set estado='CONFIRMADA', posicion_espera=null, oferta_expira_en=null where id=v_id;
    return query select v_socio, null::text, null::timestamptz;
  else
    v_expira := now() + make_interval(mins => p_plazo_minutos);
    update reservas set oferta_expira_en = v_expira where id=v_id;
    return query select null::text, v_socio, v_expira;
  end if;
end; $function$;
