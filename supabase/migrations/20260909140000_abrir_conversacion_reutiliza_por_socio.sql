-- ─────────────────────────────────────────────────────────────────────────────
-- `abrir_conversacion` reutilizaba una conversación que quien la pide NO puede
-- abrir.
--
-- ── El fallo, reproducido en producción ──────────────────────────────────────
-- La alumna entra en Mensajes: la lista sale VACÍA. Pulsa «Escribir al
-- estudio» y aterriza en «Algo no ha salido como esperábamos».
--
-- Pasaba porque la relación socia↔conversación se estaba leyendo con DOS
-- claves distintas:
--
--   · Esta función buscaba conversación existente por `auth_user_id`.
--   · Las rutas (`/mensajes` GET y POST, `/leido` PATCH) autorizan por
--     `socio_id`, y la lista de conversaciones también filtra por `socio_id`.
--
-- Mientras la misma persona tiene una sola ficha por estudio, las dos claves
-- coinciden y no se nota. Deja de coincidir en cuanto la ficha se BORRA y la
-- persona vuelve a darse de alta: el borrado anonimiza `socios` (email a
-- `borrado+…@anon.invalid`, `auth_user_id` a NULL) pero NO toca
-- `conversacion_participantes`, que sigue apuntando al `socio_id` viejo con el
-- `auth_user_id` de la persona.
--
-- A partir de ahí, para su ficha nueva:
--   1. La lista no le enseña la conversación (filtra por su `socio_id` nuevo).
--   2. Esta función SÍ se la devuelve (encuentra por su `auth_user_id`).
--   3. La ruta de mensajes le responde 403 (su `socio_id` no participa).
--   4. El cliente convierte cualquier fallo en un error genérico.
--
-- Caso real: `soc-1783527760312-1pnly` (borrada el 7-sep-2026) y su ficha nueva
-- `078bc212-…`, las dos de `studio-1` y del mismo `auth_user_id`.
--
-- ── El arreglo ───────────────────────────────────────────────────────────────
-- La búsqueda pasa a usar `socio_id`, que es la clave con la que TODAS las
-- rutas autorizan. Efecto: una ficha nueva abre conversación nueva, y el hilo
-- de la ficha borrada se queda donde estaba —visible para el mostrador, que
-- sigue viéndolo por RLS— en vez de reaparecerle a alguien cuyo registro
-- anterior se anonimizó a propósito. Deshacer un borrado por un efecto lateral
-- sería lo contrario de lo que ese borrado pedía.
--
-- El lado STAFF de ALUMNA_INSTRUCTORA sigue buscándose por `auth_user_id`: esa
-- fila se inserta con `socio_id` NULL, así que ahí no hay otra clave.
--
-- ⚠️ Firma IDÉNTICA a propósito (`CREATE OR REPLACE`, mismos 6 argumentos): en
-- este repo cambiarla crea un objeto función nuevo con `EXECUTE TO PUBLIC` por
-- defecto y hay que rehacer los grants. Verificado con `has_function_privilege`
-- después de aplicar. Los `default null` de los cuatro últimos parámetros
-- también van tal cual: quitarlos hace que Postgres rechace el REPLACE
-- («cannot remove parameter defaults from existing function»).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.abrir_conversacion(
  p_studio_id text,
  p_tipo text,
  p_socio_id text default null,
  p_instructor_id text default null,
  p_ancla_sesion_id text default null,
  p_ancla_reserva_id text default null
) returns table (id text, creada boolean)
language plpgsql
security definer
set search_path = public
as $function$
#variable_conflict use_column
declare
  v_socio_auth uuid;
  v_instructor_auth uuid;
  v_id text;
begin
  perform public.validar_studio_mismatch(p_studio_id);

  if p_tipo not in ('ALUMNA_INSTRUCTORA', 'ALUMNA_MOSTRADOR', 'EQUIPO') then
    raise exception 'TIPO_INVALIDO';
  end if;

  if p_tipo = 'ALUMNA_INSTRUCTORA' then
    if p_socio_id is null or p_instructor_id is null then
      raise exception 'PARAMETROS_INCOMPLETOS';
    end if;

    perform public.validar_socio_del_studio(p_socio_id, p_studio_id);

    if not exists (
      select 1 from reservas r
      join sesiones s on s.id = r.sesion_id
     where r.socio_id = p_socio_id
       and s.instructor_id = p_instructor_id
       and r.studio_id = p_studio_id
       and r.estado in ('CONFIRMADA', 'ASISTIDA', 'NO_ASISTIO')
    ) then
      raise exception 'SIN_RELACION_VALIDA';
    end if;

    select auth_user_id into v_socio_auth from socios where id = p_socio_id;
    select auth_user_id into v_instructor_auth from instructores where id = p_instructor_id and studio_id = p_studio_id;

    if v_socio_auth is null or v_instructor_auth is null then
      raise exception 'PARTICIPANTE_SIN_CUENTA';
    end if;

    if auth.uid() is not null and auth.uid() not in (v_socio_auth, v_instructor_auth) then
      raise exception 'NO_AUTORIZADO';
    end if;

    -- La socia por `socio_id` (la clave con la que autorizan las rutas); la
    -- instructora sigue por `auth_user_id` porque su fila lleva `socio_id` NULL.
    select c.id into v_id
      from conversaciones c
     where c.studio_id = p_studio_id
       and c.tipo = 'ALUMNA_INSTRUCTORA'
       and exists (select 1 from conversacion_participantes cp where cp.conversacion_id = c.id and cp.socio_id = p_socio_id)
       and exists (select 1 from conversacion_participantes cp where cp.conversacion_id = c.id and cp.auth_user_id = v_instructor_auth)
     limit 1;

    if v_id is not null then
      return query select v_id, false;
      return;
    end if;

    v_id := 'conv-' || gen_random_uuid()::text;
    insert into conversaciones (id, studio_id, tipo, ancla_sesion_id, ancla_reserva_id)
      values (v_id, p_studio_id, p_tipo, p_ancla_sesion_id, p_ancla_reserva_id);
    insert into conversacion_participantes (conversacion_id, auth_user_id, rol_en_conversacion, socio_id)
      values (v_id, v_socio_auth, 'SOCIO', p_socio_id),
             (v_id, v_instructor_auth, 'STAFF', null);

    return query select v_id, true;
    return;

  elsif p_tipo = 'ALUMNA_MOSTRADOR' then
    if p_socio_id is null then
      raise exception 'PARAMETROS_INCOMPLETOS';
    end if;

    perform public.validar_socio_del_studio(p_socio_id, p_studio_id);

    select auth_user_id into v_socio_auth from socios where id = p_socio_id;
    if v_socio_auth is null then
      raise exception 'PARTICIPANTE_SIN_CUENTA';
    end if;

    if auth.uid() is not null
       and auth.uid() is distinct from v_socio_auth
       and not public.puede_gestionar_calendario() then
      raise exception 'NO_AUTORIZADO';
    end if;

    -- Por `socio_id`, no por `auth_user_id`: ver la cabecera. Devolver una
    -- conversación cuyo participante es OTRA ficha —aunque sea de la misma
    -- persona— manda a la alumna a un 403 que la app pinta como error genérico.
    select c.id into v_id
      from conversaciones c
     where c.studio_id = p_studio_id
       and c.tipo = 'ALUMNA_MOSTRADOR'
       and exists (select 1 from conversacion_participantes cp where cp.conversacion_id = c.id and cp.socio_id = p_socio_id)
     limit 1;

    if v_id is not null then
      return query select v_id, false;
      return;
    end if;

    v_id := 'conv-' || gen_random_uuid()::text;
    insert into conversaciones (id, studio_id, tipo, ancla_sesion_id, ancla_reserva_id)
      values (v_id, p_studio_id, p_tipo, p_ancla_sesion_id, p_ancla_reserva_id);
    insert into conversacion_participantes (conversacion_id, auth_user_id, rol_en_conversacion, socio_id)
      values (v_id, v_socio_auth, 'SOCIO', p_socio_id);

    -- El mostrador se resuelve DINÁMICAMENTE, igual que EQUIPO: no se
    -- inserta ninguna fila STAFF aquí. Quien tenga
    -- `puede_gestionar_calendario()` (PROPIETARIO/MANAGER/RECEPCION) en este
    -- studio ve y escribe en CUALQUIER conversación ALUMNA_MOSTRADOR en todo
    -- momento (RLS, migración 2/4) — incluida la contratada después de
    -- abrirse el hilo, sin depender de una foto fija tomada al crearlo.
    -- Cambio de diseño explícito del usuario tras el primer borrador de esta
    -- migración, que sí guardaba un snapshot de STAFF.

    return query select v_id, true;
    return;

  else -- EQUIPO
    if auth.uid() is not null and p_studio_id is distinct from public.current_studio_id() then
      raise exception 'NO_AUTORIZADO';
    end if;

    select c.id into v_id
      from conversaciones c
     where c.studio_id = p_studio_id
       and c.tipo = 'EQUIPO'
     limit 1;

    if v_id is not null then
      return query select v_id, false;
      return;
    end if;

    v_id := 'conv-' || gen_random_uuid()::text;
    insert into conversaciones (id, studio_id, tipo)
      values (v_id, p_studio_id, p_tipo);
    -- Sin participantes: EQUIPO es studio-wide, la RLS ya lo trata así.

    return query select v_id, true;
    return;
  end if;
end;
$function$;

comment on function public.abrir_conversacion(text, text, text, text, text, text) is
  'Abre o reutiliza una conversación. La reutilización de las de alumna busca por `socio_id` — la MISMA clave con la que autorizan las rutas públicas y con la que filtra la lista. Buscar por `auth_user_id` devolvía la conversación de una ficha ya borrada a la ficha nueva de la misma persona, y esa conversación le respondía 403.';
