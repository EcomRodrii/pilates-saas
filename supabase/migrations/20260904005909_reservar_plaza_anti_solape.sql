-- Anti-solape de la ALUMNA en `reservar_plaza`.
--
-- Qué falta hoy: nada en el repositorio impide que una alumna se reserve dos
-- cosas a la misma hora. Lo verificado leyendo las tres puertas:
--   · `reservar_plaza` solo comprueba `YA_RESERVADA`, que es la MISMA sesión.
--   · `crearReservaPublica` (TS) tampoco lo mira.
--   · `reservar_cita` sí tiene anti-solape, pero protege la agenda de la
--     INSTRUCTORA (filtra por `instructor_id`), no la de la alumna.
-- Así que hoy se puede reservar Reformer de 10:00 y Yoga de 10:30, o una clase
-- de grupo y una cita 1:1 encima.
--
-- Por qué en SQL y no en React: la comprobación tiene que estar en la MISMA
-- transacción que decide la plaza, o dos peticiones simultáneas la pasan las
-- dos. Un `if` en el cliente no es una garantía, es una sugerencia.
--
-- ⚠️ CONCURRENCIA. El `for update` que ya existe bloquea la fila de la SESIÓN,
-- y eso no basta aquí: dos reservas solapadas son dos sesiones DISTINTAS, o
-- sea dos filas distintas, o sea cero contención. Hace falta serializar por
-- ALUMNA, y para eso se toma un candado de aviso sobre `studio:socio` antes de
-- tocar la sesión. Es el mismo idioma que ya usa `reservar_cita`
-- (`pg_advisory_xact_lock` sobre `studio:instructor`).
--
-- Orden de candados, para no meter un deadlock: SOCIA primero, y solo después
-- la fila de la sesión. `reservar_plaza` es el único sitio que toma el de socia,
-- así que no hay ningún camino que los pida al revés.
--
-- ⚠️ DÓNDE va la comprobación, que es la parte fina: DESPUÉS de decidir
-- `v_estado` y solo si va a ser una reserva de verdad ('CONFIRMADA' o
-- 'PENDIENTE_APROBACION'). Entrar en LISTA_ESPERA de una clase que se solapa
-- con otra reserva es legítimo —la alumna se apunta por si se libera, y si sale
-- cancelará la otra— y bloquearlo sería quitar una función que hoy funciona.
--
-- Contra qué se compara:
--   · sus otras `reservas` activas, unidas a su sesión, saltando las canceladas;
--   · sus `citas` 1:1 en PENDIENTE o CONFIRMADA.
-- Con `tstzrange(inicio, fin)` y el operador `&&`, que es medio abierto `[)`:
-- una clase que acaba a las 10:00 y otra que empieza a las 10:00 NO se solapan,
-- que es lo correcto y lo que ya hace `reservar_cita`.
--
-- Lo que este cambio NO hace, dicho a propósito: `reservar_cita` sigue sin
-- comprobar el solape de la ALUMNA. O sea, reservar una clase de grupo encima
-- de una cita queda bloqueado, pero reservar una cita encima de una clase de
-- grupo no. Es asimétrico y está pendiente. No se toca aquí porque `reservar_cita`
-- devuelve códigos por RETURN (no por excepción) y sus llamantes del panel
-- ramifican sobre 'CONFLICTO': añadir un valor nuevo sin revisarlos uno a uno es
-- justo el tipo de cambio silencioso que rompe el panel.

-- ⚠️ Y ANTES DE NADA: había DOS `reservar_plaza` vivas.
--
-- `20260827193314_reservar_plaza_spot_id.sql` añadió la de 7 argumentos (con
-- `p_spot_id`) y NO borró la de 6. Las dos han convivido desde entonces, y eso
-- no es cosmético: PostgREST resuelve por NOMBRE de argumento, y
-- `crearReservaPublica` (lib/db/supabase-data-admin.ts:1899) manda solo 6 — o
-- sea que **el camino self-service, el que usa la app de la alumna, entra por
-- la sobrecarga vieja**. El camino de PAGO (:2014) manda 7 y entra por la
-- nueva. Dos puertas con reglas distintas para la misma operación.
--
-- Consecuencia directa: sin este `drop`, el anti-solape de abajo protegería
-- solo las reservas que pasan por Stripe. Y el soporte transaccional de spot
-- que la de 7 argumentos ya tiene tampoco se estaba usando nunca.
--
-- El `drop` es seguro: la de 7 lleva `p_spot_id default null::text`, así que
-- cubre a cualquier llamante de 6 en cuanto la ambigua desaparece. Se comprobó
-- que en todo el repo solo hay dos llamantes, los dos citados arriba.
drop function if exists public.reservar_plaza(text, text, text, text, boolean, boolean);

create or replace function public.reservar_plaza(
  p_studio_id text, p_sesion_id text, p_socio_id text, p_reserva_id text,
  p_permite_lista_espera boolean default true, p_requiere_aprobacion boolean default false,
  p_spot_id text default null::text
)
returns table(estado text, posicion_espera integer)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
#variable_conflict use_column
declare
  v_inicio timestamptz;
  v_fin timestamptz;
  v_sala_id text;
  v_instructor_id text;
  v_aforo int;
  v_ocupadas int;
  v_espera int;
  v_estado text;
  v_pos int;
  v_limite int;
  v_semana int;
  v_recup text;
  v_semana_ini timestamptz;
  v_spot_sala_id text;
  v_spot_activo boolean;
  v_spot_ocupado text;
  v_solapa int;
begin
  perform public.validar_studio_mismatch(p_studio_id);
  perform public.validar_socio_del_studio(p_socio_id, p_studio_id);

  -- Candado por ALUMNA, ANTES del `for update` de la sesión. Ese orden es el
  -- que impide el deadlock, y este es el único candado de socia del esquema.
  -- Serializa solo las peticiones de UNA persona: la contención real es nula.
  --
  -- Sin él, el anti-solape de abajo no sería seguro: dos reservas que se pisan
  -- son dos sesiones DISTINTAS, o sea dos filas distintas, o sea que el
  -- `for update` de la sesión no serializa nada entre ellas.
  perform pg_advisory_xact_lock(hashtext(p_studio_id || ':' || p_socio_id));

  -- `fin` es nuevo: hace falta para el rango del anti-solape.
  select inicio, fin, instructor_id, sala_id into v_inicio, v_fin, v_instructor_id, v_sala_id
    from sesiones where id = p_sesion_id and studio_id = p_studio_id
    for update;
  if not found then
    raise exception 'SESION_NO_ENCONTRADA';
  end if;

  if auth.uid() is not null and public.current_rol() = 'INSTRUCTOR' then
    if v_instructor_id is distinct from public.current_instructor_id() then
      raise exception 'NO_AUTORIZADO';
    end if;
  end if;

  if exists (
    select 1 from reservas
    where sesion_id = p_sesion_id and socio_id = p_socio_id
      and estado in ('CONFIRMADA', 'LISTA_ESPERA', 'ASISTIDA', 'PENDIENTE_APROBACION')
  ) then
    raise exception 'YA_RESERVADA';
  end if;

  -- Candado del spot ANTES de decidir estado: mismo criterio que el FOR
  -- UPDATE de sesiones, evita que dos pagos simultáneos elijan el mismo
  -- sitio. Se hace igual si va a terminar en LISTA_ESPERA/PENDIENTE_APROBACION
  -- (el candado no hace daño ahí, solo no se usará luego).
  if p_spot_id is not null then
    select sp.sala_id, coalesce(sp.activo, true) into v_spot_sala_id, v_spot_activo
      from spots sp
      where sp.id = p_spot_id and sp.studio_id = p_studio_id
      for update;
    if not found or v_spot_sala_id is distinct from v_sala_id then
      raise exception 'SPOT_NO_PERTENECE_A_LA_SALA';
    end if;
    if not v_spot_activo then
      raise exception 'SPOT_NO_DISPONIBLE';
    end if;

    select r.id into v_spot_ocupado
      from reservas r
      where r.sesion_id = p_sesion_id and r.spot_id = p_spot_id
        and r.estado in ('CONFIRMADA', 'ASISTIDA')
      for update;
    if v_spot_ocupado is not null then
      raise exception 'SPOT_OCUPADO';
    end if;
  end if;

  if p_requiere_aprobacion then
    v_estado := 'PENDIENTE_APROBACION';
    v_pos := null;
  else
    v_aforo := aforo_efectivo(p_sesion_id);

    select count(*) into v_ocupadas
      from reservas
      where sesion_id = p_sesion_id and estado in ('CONFIRMADA', 'ASISTIDA');

    if v_aforo is null or v_ocupadas < v_aforo then
      v_estado := 'CONFIRMADA';
      v_pos := null;
    else
      if not p_permite_lista_espera then
        raise exception 'AFORO_LLENO_SIN_ESPERA';
      end if;
      select count(*) into v_espera
        from reservas where sesion_id = p_sesion_id and estado = 'LISTA_ESPERA';
      v_estado := 'LISTA_ESPERA';
      v_pos := v_espera + 1;
    end if;
  end if;

  -- ── Anti-solape de la ALUMNA ──────────────────────────────────────────────
  -- Aquí y no antes: solo se comprueba cuando esto va a ser una reserva de
  -- verdad. Entrar en LISTA_ESPERA de una clase que se solapa con otra reserva
  -- es legítimo —se apunta por si se libera y entonces cancelará la otra— y
  -- bloquearlo quitaría una función que hoy sirve.
  --
  -- `tstzrange` es medio abierto `[)`: una clase que acaba a las 10:00 y otra
  -- que empieza a las 10:00 NO se solapan. Mismo operador que ya usa
  -- `reservar_cita` para proteger la agenda de la instructora.
  if v_estado in ('CONFIRMADA', 'PENDIENTE_APROBACION') and v_inicio is not null and v_fin is not null then
    select count(*) into v_solapa
      from reservas r
      join sesiones ssol on ssol.id = r.sesion_id
     where r.socio_id = p_socio_id
       and r.studio_id = p_studio_id
       and r.estado in ('CONFIRMADA', 'ASISTIDA', 'PENDIENTE_APROBACION')
       and r.sesion_id is distinct from p_sesion_id
       and coalesce(ssol.cancelada, false) = false
       and ssol.inicio is not null and ssol.fin is not null
       and tstzrange(ssol.inicio, ssol.fin) && tstzrange(v_inicio, v_fin);
    if v_solapa > 0 then
      raise exception 'CONFLICTO_HORARIO';
    end if;

    -- Y contra sus citas 1:1, que viven en otra tabla y hoy se pisan sin más.
    select count(*) into v_solapa
      from citas c
     where c.socio_id = p_socio_id
       and c.studio_id = p_studio_id
       and c.estado in ('PENDIENTE', 'CONFIRMADA')
       and c.inicio is not null and c.fin is not null
       and tstzrange(c.inicio, c.fin) && tstzrange(v_inicio, v_fin);
    if v_solapa > 0 then
      raise exception 'CONFLICTO_HORARIO';
    end if;
  end if;

  if v_estado = 'CONFIRMADA' then
    select p.limite_semanal into v_limite
      from suscripciones s
      join planes_tarifa p on p.id = s.plan_id
     where s.studio_id = p_studio_id and s.socio_id = p_socio_id and s.estado = 'ACTIVA'
       and p.limite_semanal is not null
       and (s.fecha_fin is null or s.fecha_fin >= current_date)
     order by p.limite_semanal asc
     limit 1;
    if v_limite is not null then
      v_semana_ini := date_trunc('week', v_inicio at time zone 'Europe/Madrid') at time zone 'Europe/Madrid';
      select count(*) into v_semana
        from reservas r
        join sesiones ss on ss.id = r.sesion_id
       where r.socio_id = p_socio_id and r.studio_id = p_studio_id
         and r.estado in ('CONFIRMADA', 'ASISTIDA')
         and coalesce(ss.cancelada, false) = false
         and ss.inicio >= v_semana_ini
         and ss.inicio <  v_semana_ini + interval '7 days';
      if v_semana >= v_limite then
        select id into v_recup
          from recuperaciones
         where socio_id = p_socio_id and studio_id = p_studio_id
           and estado = 'DISPONIBLE' and caduca_el >= current_date
         order by caduca_el asc
         limit 1
         for update;
        if v_recup is null then
          raise exception 'LIMITE_SEMANAL';
        end if;
        update recuperaciones
           set estado = 'USADA', usada_en_reserva_id = p_reserva_id
         where id = v_recup;
      end if;
    end if;
  end if;

  insert into reservas (id, studio_id, sesion_id, socio_id, estado, spot_id, posicion_espera, check_in_en, creado_en)
    values (
      p_reserva_id, p_studio_id, p_sesion_id, p_socio_id, v_estado,
      case when v_estado = 'CONFIRMADA' then p_spot_id else null end,
      v_pos, null, now()
    );

  return query select v_estado, v_pos;
end;
$function$;

-- Los grants no se re-declaran: `create or replace function` los conserva
-- (authenticated / service_role / postgres, desde 20260827193314). Se dejan
-- nombrados aquí para que la próxima persona no tenga que ir a buscarlos.


-- El motivo nuevo tiene que caber en el CHECK, o la traza se pierde EN SILENCIO.
--
-- `registrarIntentoFallido` inserta sin `await` (`void admin.from(...)`), a
-- propósito: es telemetría y no debe retrasar la respuesta a la alumna. El
-- efecto secundario es que una violación del CHECK no la ve nadie — ni un
-- error, ni un log, ni la fila. Así que añadir 'CONFLICTO_HORARIO' al tipo de
-- TypeScript sin ampliar aquí habría dejado el motivo más nuevo sin registrar
-- y sin avisar.
--
-- Se recrea el CHECK con la lista completa en vez de añadir uno nuevo: dos
-- checks sobre la misma columna se cumplen los dos a la vez, así que un
-- segundo con solo el valor nuevo rechazaría todos los demás.
alter table public.intentos_reserva_fallidos
  drop constraint if exists intentos_reserva_fallidos_motivo_check;

alter table public.intentos_reserva_fallidos
  add constraint intentos_reserva_fallidos_motivo_check check (motivo in (
    'AFORO_LLENO_SIN_ESPERA', 'SIN_PLAN', 'PLAN_NO_INCLUYE_TIPO',
    'FUERA_VENTANA_MINIMA', 'FUERA_VENTANA_MAXIMA',
    'LIMITE_SEMANAL', 'MAX_SIMULTANEAS',
    'CONFLICTO_HORARIO'
  ));
