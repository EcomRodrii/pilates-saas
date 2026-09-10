-- 20260910140000 · TENTARE — segunda tanda de la 49ª pasada: los tres defectos
-- que la revisión independiente encontró en mi PROPIO arreglo de hace un rato
-- (20260910120000). Se documentan aquí en vez de reescribir aquella migración
-- porque aquella YA está aplicada a producción.
--
-- Los tres salen de la misma autocrítica: cerré la puerta del ref_id y di por
-- cerrada la casa sin mirar las otras dos.

-- ---------------------------------------------------------------------------
-- D-1 (🔴 lo rompí yo) — SEMANA_COMPLETA rechazaba TODAS las concesiones reales
-- ---------------------------------------------------------------------------
-- La migración anterior exige `extract(isodow from v_lunes) = 1` apoyándose en
-- un comentario mío que decía que claveSemana() «es el lunes en ISO». Es falso:
-- lib/engines/streak-engine.ts:24-33 calcula el lunes a MEDIANOCHE LOCAL
-- (getDay/setHours) y lo serializa con toISOString(), que pasa a UTC. En
-- España (UTC+1/+2) la medianoche del lunes local cae el DOMINGO en UTC, así
-- que el panel manda '2026-09-06' donde yo exigía '2026-09-07'.
--
-- Resultado: entre las 12:00 y las 14:00 de hoy, el crédito de racha quedó
-- rechazado con REF_ID_NO_DERIVADO para todos los estudios españoles, y encima
-- ruidosamente: supabase-data.ts:3331 solo silencia CONDICION_NO_CUMPLIDA y
-- SIN_REGLA_ACTIVA, así que cada intento iba a Sentry. Mi propia migración
-- documentaba la causa (el margen ±1 día de la ventana de asistencia) y aun
-- así el isodow cortaba antes de llegar a usarla.
--
-- Arreglo: aceptar lunes Y domingo. Es la lista completa: la medianoche local
-- del lunes solo puede caer, en UTC, en ese lunes (husos <= UTC) o en el
-- domingo anterior (husos > UTC, hasta +14). Y la ventana pasa a [clave,
-- clave+8) —ya no hace falta el margen hacia atrás, porque la clave-domingo ES
-- el desplazamiento que el margen intentaba compensar.
--
-- ⚠️ Residual aceptado (D-4): con la clave-domingo, una clase del domingo puede
-- caer dentro de la ventana de dos claves consecutivas, así que quien SOLO
-- entrena en domingo puede cobrar la racha dos veces. Está acotado (exige
-- asistencia real y el UNIQUE sigue actuando por clave) y es preferible a la
-- alternativa —estrechar la ventana— que volvería a costarle el crédito a una
-- socia real. La cura de verdad es que claveSemana() deje de pasar por UTC;
-- eso cambia los ref_id ya emitidos y no se hace dentro de una auditoría.

-- ---------------------------------------------------------------------------
-- D-3 (🟠) — OBJETIVO_MENSUAL: acotado hacia el futuro y abierto hacia el pasado
-- ---------------------------------------------------------------------------
-- Solo bloqueaba meses futuros, así que quedaban ~24.000 claves válidas por
-- socia ('<socio>:1500-06' pasaba la derivación) sin ninguna condición que
-- comprobar. Escribí «queda acotado» y no lo estaba.
--
-- No hay UN SOLO llamante de este disparador en todo el árbol (verificado con
-- grep sobre app/, lib/, components/, e2e/ y scripts/): la UI lo ofrece y lo
-- tarifa a 50 créditos (components/configuracion/tab-recompensas.tsx:22) y
-- ningún proceso lo concede jamás. Como no hay camino legítimo que preservar,
-- la rama pasa a rechazar siempre. Eso no quita funcionalidad —no la había—,
-- pero deja de ser una vía de acuñación. Que la pantalla prometa una
-- recompensa que nadie otorga se reporta aparte: es producto, no seguridad.

CREATE OR REPLACE FUNCTION public.otorgar_credito_disparador(
  p_studio_id text, p_socio_id text, p_trigger text, p_ref_id text,
  p_config_id text DEFAULT NULL::text
)
 RETURNS TABLE(saldo integer, otorgado boolean, accion_id text, creditos integer, descripcion text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_creditos int;
  v_desc text;
  v_regla_id text;
  v_saldo int;
  v_id text;
  v_sufijo text;
  v_lunes date;
begin
  perform public.validar_studio_mismatch(p_studio_id);
  perform public.validar_socio_del_studio(p_socio_id, p_studio_id);
  if p_ref_id is null or length(trim(p_ref_id)) = 0 then
    raise exception 'REF_ID_REQUERIDO';
  end if;

  if p_trigger = 'ASISTENCIA_CLASE' then
    if not exists (
      select 1 from reservas
      where id = p_ref_id and socio_id = p_socio_id and studio_id = p_studio_id and estado = 'ASISTIDA'
    ) then
      raise exception 'CONDICION_NO_CUMPLIDA';
    end if;
    select r.creditos, r.nombre, r.id into v_creditos, v_desc, v_regla_id from reward_rules r
      where r.studio_id = p_studio_id and r.trigger = 'ASISTENCIA_CLASE' and r.activa limit 1;

  elsif p_trigger = 'REFERIDO_AMIGO' then
    if not exists (
      select 1 from socios s
      where s.id = p_ref_id and s.studio_id = p_studio_id and s.referido_por = p_socio_id
        and exists (select 1 from reservas r where r.socio_id = s.id and r.studio_id = p_studio_id and r.estado = 'ASISTIDA')
    ) then
      raise exception 'CONDICION_NO_CUMPLIDA';
    end if;
    select r.creditos, r.nombre, r.id into v_creditos, v_desc, v_regla_id from reward_rules r
      where r.studio_id = p_studio_id and r.trigger = 'REFERIDO_AMIGO' and r.activa limit 1;

  elsif p_trigger = 'RENOVACION_PLAN' then
    if not exists (
      select 1 from recibos rc
      where rc.id = p_ref_id and rc.socio_id = p_socio_id and rc.studio_id = p_studio_id
        and (coalesce(rc.es_renovacion, false) or rc.concepto like 'Renovación%')
    ) then
      raise exception 'CONDICION_NO_CUMPLIDA';
    end if;
    select r.creditos, r.nombre, r.id into v_creditos, v_desc, v_regla_id from reward_rules r
      where r.studio_id = p_studio_id and r.trigger = 'RENOVACION_PLAN' and r.activa limit 1;

  elsif p_trigger = 'PRIMERA_RESERVA' then
    if p_ref_id is distinct from p_socio_id then
      raise exception 'REF_ID_NO_DERIVADO';
    end if;
    if not exists (select 1 from reservas r where r.socio_id = p_socio_id and r.studio_id = p_studio_id) then
      raise exception 'CONDICION_NO_CUMPLIDA';
    end if;
    select r.creditos, r.nombre, r.id into v_creditos, v_desc, v_regla_id from reward_rules r
      where r.studio_id = p_studio_id and r.trigger = 'PRIMERA_RESERVA' and r.activa limit 1;

  elsif p_trigger = 'SEMANA_COMPLETA' then
    -- ref_id = '<socio_id>:<clave de semana>'. La clave la produce
    -- claveSemana(lunesDe(...)) en lib/engines/streak-engine.ts: es el lunes a
    -- medianoche LOCAL pasado a UTC, así que en la práctica es un lunes (husos
    -- <= UTC) o el domingo anterior (husos > UTC, el caso de España).
    if left(p_ref_id, length(p_socio_id) + 1) is distinct from p_socio_id || ':' then
      raise exception 'REF_ID_NO_DERIVADO';
    end if;
    v_sufijo := substr(p_ref_id, length(p_socio_id) + 2);
    begin
      v_lunes := v_sufijo::date;
    exception when others then
      raise exception 'REF_ID_NO_DERIVADO';
    end;
    if extract(isodow from v_lunes) not in (1, 7) or v_lunes > current_date then
      raise exception 'REF_ID_NO_DERIVADO';
    end if;
    -- Condición real del motor de racha: al menos una clase ASISTIDA en la
    -- semana que abre esa clave. 8 días para cubrir el desfase de la
    -- clave-domingo sin dejar fuera el último día de la semana local.
    if not exists (
      select 1 from reservas r join sesiones s on s.id = r.sesion_id
      where r.socio_id = p_socio_id and r.studio_id = p_studio_id and r.estado = 'ASISTIDA'
        and s.inicio >= v_lunes::timestamptz
        and s.inicio <  (v_lunes + 8)::timestamptz
    ) then
      raise exception 'CONDICION_NO_CUMPLIDA';
    end if;
    select r.creditos, r.nombre, r.id into v_creditos, v_desc, v_regla_id from reward_rules r
      where r.studio_id = p_studio_id and r.trigger = 'SEMANA_COMPLETA' and r.activa limit 1;

  elsif p_trigger = 'OBJETIVO_MENSUAL' then
    -- Sin llamante en todo el árbol: no hay condición que comprobar porque no
    -- hay proceso que la detecte. Mientras no exista, no se concede.
    raise exception 'CONDICION_NO_CUMPLIDA';

  elsif p_trigger = 'LOGRO' then
    if p_config_id is null or p_ref_id is distinct from p_socio_id || ':' || p_config_id then
      raise exception 'REF_ID_NO_DERIVADO';
    end if;
    select a.creditos_recompensa, 'Logro desbloqueado: ' || a.nombre into v_creditos, v_desc
      from achievement_definitions a
      where a.id = p_config_id and a.studio_id = p_studio_id and a.activo;

  elsif p_trigger = 'RETO' then
    if p_config_id is null or p_ref_id is distinct from p_socio_id || ':' || p_config_id then
      raise exception 'REF_ID_NO_DERIVADO';
    end if;
    select c.creditos_recompensa, 'Reto completado: ' || c.nombre into v_creditos, v_desc
      from challenge_definitions c
      where c.id = p_config_id and c.studio_id = p_studio_id and c.activo;

  else
    raise exception 'TRIGGER_DESCONOCIDO';
  end if;

  if v_creditos is null or v_creditos <= 0 then
    raise exception 'SIN_REGLA_ACTIVA';
  end if;

  v_id := 'rwa-srv-' || substr(md5(p_studio_id || '|' || p_trigger || '|' || p_ref_id || '|' || clock_timestamp()::text || '|' || random()::text), 1, 20);

  begin
    insert into reward_actions (id, studio_id, socio_id, trigger, ref_id, creado_en)
      values (v_id, p_studio_id, p_socio_id, p_trigger, p_ref_id, now());
  exception when unique_violation then
    select mc.saldo into v_saldo from member_credits mc where mc.socio_id = p_socio_id and mc.studio_id = p_studio_id;
    return query select coalesce(v_saldo, 0), false, null::text, 0, null::text;
    return;
  end;

  insert into member_credits (socio_id, studio_id, saldo, total_ganado, total_canjeado, actualizado_en)
    values (p_socio_id, p_studio_id, v_creditos, v_creditos, 0, now())
  on conflict (socio_id) do update set
    saldo = member_credits.saldo + v_creditos,
    total_ganado = member_credits.total_ganado + v_creditos,
    actualizado_en = now()
  returning member_credits.saldo into v_saldo;

  insert into reward_history (id, studio_id, socio_id, rule_id, action_id, creditos, descripcion, creado_en)
    values (
      'rwh-srv-' || substr(md5(v_id || '|h|' || random()::text), 1, 18),
      p_studio_id, p_socio_id, v_regla_id, v_id, v_creditos, v_desc, now()
    );

  insert into credit_transactions (id, studio_id, socio_id, tipo, creditos, descripcion, ref_id, creado_en)
    values (
      'ctx-srv-' || substr(md5(v_id || '|t|' || random()::text), 1, 18),
      p_studio_id, p_socio_id, 'GANANCIA', v_creditos, v_desc, p_ref_id, now()
    );

  return query select v_saldo, true, v_id, v_creditos, v_desc;
end;
$function$;

-- ---------------------------------------------------------------------------
-- D-2 (🔴 seguía abierto) — el catálogo de gamificación lo escribía cualquiera
-- ---------------------------------------------------------------------------
-- Derivar el ref_id de LOGRO/RETO acota a «un logro, una vez por socia»… solo
-- si el catálogo de logros es fijo. No lo era: las cuatro tablas de
-- configuración de gamificación tenían una única policy `ALL` con
-- `studio_id = current_studio_id()` y ningún chequeo de rol, así que la misma
-- INSTRUCTORA se fabricaba los logros Y les ponía el precio.
--
-- Verificado en producción por la revisión independiente, revertido: la
-- INSTRUCTOR insertó dos achievement_definitions con creditos_recompensa=9999
-- y cobró 19.998 créditos. Es decir, el 🔴 que la migración de las 12:00 decía
-- cerrar seguía abierto, y mi frase «el importe lo pone la regla del estudio,
-- nunca quien llama» era falsa: lo ponía quien llamaba, dando un rodeo.
--
-- Arreglo: separar LECTURA de ESCRITURA. La lectura se queda como está (el
-- panel de cualquier rol pinta logros y retos en la ficha de la socia); la
-- escritura pasa a exigir PROPIETARIO, que es exactamente quien puede abrir
-- /configuracion — la pantalla desde la que se editan estas cuatro tablas.
-- BLOQUEADO_RECEPCION, BLOQUEADO_MANAGER y BLOQUEADO_INSTRUCTOR
-- (lib/permisos-reglas.ts:41-70) dejan /configuracion solo a la propietaria, y
-- los únicos escritores del árbol son los de esa pantalla
-- (lib/supabase-data.ts 3270/3285, 3621/3637/3642, 3694/3706, 3785/3800/3805),
-- todos con el cliente del navegador. service_role no pasa por RLS, así que
-- los caminos de servidor (seeds, importadores, Inngest) no se ven afectados.
--
-- NOTA de alcance: este «ALL + solo tenant» es el patrón por defecto de MUCHAS
-- tablas de configuración (salas, tipos_clase…). NO se tocan aquí: cambiarlas
-- en bloque es un cambio de alcance que esta auditoría no puede verificar. Se
-- limita a las cuatro que convierten configuración en DINERO (créditos
-- canjeables). El resto queda reportado.

create or replace function public.puede_configurar_negocio() returns boolean
  language sql stable security definer set search_path to 'public'
as $$
  select public.current_rol() = 'PROPIETARIO';
$$;

comment on function public.puede_configurar_negocio() is
  'Quién puede editar la configuración del negocio. Espeja el gate de /configuracion '
  'en lib/permisos-reglas.ts (bloqueada a RECEPCION, MANAGER e INSTRUCTOR).';

grant execute on function public.puede_configurar_negocio() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['achievement_definitions', 'challenge_definitions', 'reward_rules', 'reward_catalog']
  loop
    execute format('drop policy if exists %I on public.%I', 'admin_' || t, t);

    execute format($f$
      create policy %I on public.%I
        for select using (studio_id = public.current_studio_id())
    $f$, t || '_lectura', t);

    execute format($f$
      create policy %I on public.%I
        for insert with check (studio_id = public.current_studio_id() and public.puede_configurar_negocio())
    $f$, t || '_insert', t);

    execute format($f$
      create policy %I on public.%I
        for update using (studio_id = public.current_studio_id() and public.puede_configurar_negocio())
                  with check (studio_id = public.current_studio_id() and public.puede_configurar_negocio())
    $f$, t || '_update', t);

    execute format($f$
      create policy %I on public.%I
        for delete using (studio_id = public.current_studio_id() and public.puede_configurar_negocio())
    $f$, t || '_delete', t);
  end loop;
end $$;
