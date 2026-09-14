-- Menores de 14: la alumna no registra por sí misma su consentimiento de salud.
--
-- Auditoría RGPD 2026-09-13 (anexo 10, §6): no había control de edad en ningún
-- canal. Decisión del usuario: con menos de 14 años (LOPDGDD art. 7) el
-- consentimiento de datos de salud (art. 9 RGPD) NO lo da la alumna desde su
-- app; lo recoge el estudio en mostrador, firmado por su padre, madre o tutor
-- legal (origen PANEL, exigido en `/api/socios/[id]/consentimiento-salud`).
--
-- La ruta de la alumna (`/api/public/valoracion`) ya lo comprueba; esto es la
-- defensa en profundidad dentro de la ÚNICA vía de escritura. Solo cambia el
-- camino PORTAL + OTORGADO:
--   · sin fecha de nacimiento (o imposible) → 'FALTA_FECHA_NACIMIENTO'
--     (criterio conservador: sin saber la edad no se deja consentir; la app se
--     la pide antes),
--   · menor de 14 en el día de Madrid → 'MENOR_14'.
-- Revocar sigue abierto a todo el mundo, y PANEL no cambia.
--
-- ⚠️ REVISIÓN LEGAL NECESARIA: el 14 está repetido en
-- `lib/datos-salud/edad.ts` (EDAD_MINIMA_CONSENTIMIENTO_SALUD). Si cambia, cambia
-- en los dos sitios.
--
-- Misma firma que en 20260913214142: CREATE OR REPLACE conserva los grants
-- (solo service_role). Se re-afirman igualmente y se verifica con
-- has_function_privilege al aplicar.

create or replace function public.consentimiento_salud_cambiar(
  p_studio_id text,
  p_socio_id text,
  p_tipo text,
  p_origen text,
  p_texto text,
  p_firma text,
  p_actor_uid uuid,
  p_actor_rol text
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_fecha timestamptz;
  v_revocado timestamptz;
  v_nacimiento date;
  v_hoy date := (now() at time zone 'Europe/Madrid')::date;
begin
  if p_tipo is null or p_tipo not in ('OTORGADO', 'REVOCADO') then
    raise exception 'TIPO_NO_VALIDO';
  end if;
  if p_origen is null or p_origen not in ('PANEL', 'PORTAL') then
    raise exception 'ORIGEN_NO_VALIDO';
  end if;

  select s.consentimiento_salud_fecha, s.consentimiento_salud_revocado_en, s.fecha_nacimiento
    into v_fecha, v_revocado, v_nacimiento
  from public.socios s
  where s.id = p_socio_id
    and s.studio_id = p_studio_id
    and s.borrado_en is null
  for update;

  if not found then
    return 'SOCIA_NO_ENCONTRADA';
  end if;

  if p_tipo = 'OTORGADO' then
    -- Ya vigente: no se sobrescribe la prueba que hay.
    if v_fecha is not null and v_revocado is null then
      return 'YA_CONSTABA';
    end if;

    if p_origen = 'PORTAL' then
      -- Sin fecha, futura o de más de 120 años: no se sabe su edad.
      if v_nacimiento is null
         or v_nacimiento > v_hoy
         or v_nacimiento <= (v_hoy - interval '121 years')::date then
        return 'FALTA_FECHA_NACIMIENTO';
      end if;
      -- Menos de 14 años cumplidos hoy (quien nació un 29-F los cumple el 1-M
      -- en año no bisiesto, igual que `edadEnFecha`).
      if v_nacimiento > (v_hoy - interval '14 years')::date then
        return 'MENOR_14';
      end if;
    end if;

    if coalesce(btrim(p_texto), '') = '' or coalesce(btrim(p_firma), '') = '' then
      raise exception 'FALTA_TEXTO_O_FIRMA';
    end if;
    update public.socios
       set consentimiento_salud_fecha = now(),
           consentimiento_salud_registrado_por = p_firma,
           consentimiento_salud_registrado_por_uid = p_actor_uid,
           consentimiento_salud_texto = p_texto,
           consentimiento_salud_revocado_en = null
     where id = p_socio_id;
  else
    if v_fecha is null or v_revocado is not null then
      return 'NO_CONSTABA';
    end if;
    -- Se sella la revocación SIN borrar fecha, firma ni texto: son la prueba
    -- de lo que hubo mientras estuvo vigente.
    update public.socios
       set consentimiento_salud_revocado_en = now()
     where id = p_socio_id;
  end if;

  insert into public.consentimientos_salud_eventos
    (studio_id, socio_id, tipo, origen, texto, firma, actor_uid, actor_rol)
  values
    (p_studio_id, p_socio_id, p_tipo, p_origen,
     case when p_tipo = 'OTORGADO' then p_texto end,
     p_firma, p_actor_uid, p_actor_rol);

  return 'OK';
end;
$function$;

revoke all on function public.consentimiento_salud_cambiar(text, text, text, text, text, text, uuid, text) from public;
revoke all on function public.consentimiento_salud_cambiar(text, text, text, text, text, text, uuid, text) from anon;
revoke all on function public.consentimiento_salud_cambiar(text, text, text, text, text, text, uuid, text) from authenticated;
grant execute on function public.consentimiento_salud_cambiar(text, text, text, text, text, text, uuid, text) to service_role;
