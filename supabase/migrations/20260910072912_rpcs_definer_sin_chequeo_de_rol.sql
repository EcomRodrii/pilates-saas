-- 20260910120000 · TENTARE — cinco RPCs SECURITY DEFINER que la RLS no protege
--
-- 49ª pasada de auditoría (2026-09-10). Misma familia que #1803
-- (confirmar_sustitucion) y que el H-1 de la 48ª pasada (crear_recuperacion):
-- una función SECURITY DEFINER con GRANT EXECUTE a `authenticated` corre con
-- los permisos de SU DUEÑO, así que la RLS de las tablas que toca NO se aplica.
-- Si la función no comprueba el rol por su cuenta, la política de la tabla es
-- decorativa: cualquier cuenta de personal (una INSTRUCTORA, que no puede
-- gestionar clientas ni mover dinero) la invoca por PostgREST
-- —rest/v1/rpc/<nombre>— con su propio JWT y la anon key, ambos ya presentes
-- en cualquier pestaña del panel. El gate de la UI no pinta nada ahí.
--
-- Las socias quedan fuera de las cinco: current_studio_id() solo resuelve para
-- propietarias e instructoras, así que validar_studio_mismatch() las corta.
-- El atacante es una cuenta de personal del propio estudio.
--
-- Las cinco están verificadas en producción (dwqvdycjcffqwfkzapvi) con una
-- INSTRUCTOR real, impersonada igual que lo hace PostgREST
-- (request.jwt.claims + SET ROLE authenticated), en bloques DO que terminan
-- en RAISE EXCEPTION: se demostró el efecto y se revirtió sin escribir nada.
--
-- Ninguna de las cinco tiene GRANT a PUBLIC (proacl comprobado): aquí el
-- REVOKE FROM PUBLIC es higiene, no herencia — al revés que en #1803.

-- ---------------------------------------------------------------------------
-- 1) otorgar_credito_disparador — créditos ILIMITADOS (🔴)
-- ---------------------------------------------------------------------------
-- El dedupe es UNIQUE(studio_id, trigger, ref_id) y el ref_id lo elige quien
-- llama. Solo 2 de los 7 disparadores comprueban que la condición exista de
-- verdad (ASISTENCIA_CLASE exige una reserva ASISTIDA; REFERIDO_AMIGO, una
-- referida con asistencia). Los otros 5 se limitaban a leer la regla activa y
-- conceder, así que bastaba con variar el ref_id para acuñar créditos sin fin.
--
-- Verificado en prod, revertido: una INSTRUCTOR llamó tres veces con
-- 'RENOVACION_PLAN' y los ref_id inventados 'PoC-inventado-1/2/3' →
-- saldo 95 → 215 (+40 cada una, otorgado=t las tres). Repetible sin límite.
--
-- Lo grave es que el panel se apoya EXPLÍCITAMENTE en lo contrario. En
-- lib/studio-context.tsx:4508 se quitó el filtro local con este argumento:
-- «La RPC ya revalida todo en servidor —regla activa, importe, condición real
-- (una reserva ASISTIDA de verdad) e idempotencia por UNIQUE(...)». Es cierto
-- para dos disparadores y falso para los otros cinco. Y en supabase-data.ts
-- :3313 se documenta que la RPC existe justamente para que «cualquier cuenta
-- de personal autenticada» no pueda «otorgarse créditos arbitrarios». Podía.
--
-- Arreglo: que el ref_id deje de ser un dato libre. Para cada disparador se
-- exige el MISMO ref_id que ya construyen los llamantes reales (verificados
-- uno a uno: studio-context.tsx 3326/3580/4016/4763/4884 y
-- supabase-data-admin.ts 4423/4493/4544/4592/4612) y, donde la condición es
-- comprobable en SQL, se comprueba. No cambia la firma ni el importe ni la
-- semántica de ningún camino legítimo: solo cierra los inventados.
--
-- NO se gatea por rol: el camino legítimo del crédito de asistencia lo dispara
-- quien pasa lista, y eso INCLUYE a la instructora de la clase (#1819/#1828).
-- Un `puede_gestionar_clientas()` aquí habría roto el pase de lista.
--
-- ⏳ Queda pendiente, y NO se arregla aquí: para LOGRO/RETO quien decide si la
-- socia se ha ganado el logro sigue siendo el navegador
-- (evaluarLogrosSocio/evaluarRetosSocio). El servidor solo puede comprobar que
-- la definición existe y está activa. Portar esa evaluación a SQL es un cambio
-- de arquitectura, no un parche; con este ref_id derivado el daño queda acotado
-- a «un logro, una vez por socia» en vez de «infinito».

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
    -- El llamante real pasa el id del recibo que acaba de marcarse cobrado, y
    -- solo cuando el concepto empieza por 'Renovación' (studio-context:4016).
    -- Se comprueba el recibo, no su estado: `otorgarCreditos` se dispara justo
    -- después de aplicarRenovacionSuscripcion y exigir estado='COBRADO' aquí
    -- dependería del orden de commit. Con el recibo real basta: hay como mucho
    -- una concesión por renovación de verdad, que es la semántica buscada.
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
    -- El llamante real pasa el propio socio_id (studio-context:3326), lo que
    -- ya acota a una vez por socia de por vida vía UNIQUE(studio,trigger,ref).
    if p_ref_id is distinct from p_socio_id then
      raise exception 'REF_ID_NO_DERIVADO';
    end if;
    if not exists (select 1 from reservas r where r.socio_id = p_socio_id and r.studio_id = p_studio_id) then
      raise exception 'CONDICION_NO_CUMPLIDA';
    end if;
    select r.creditos, r.nombre, r.id into v_creditos, v_desc, v_regla_id from reward_rules r
      where r.studio_id = p_studio_id and r.trigger = 'PRIMERA_RESERVA' and r.activa limit 1;

  elsif p_trigger = 'SEMANA_COMPLETA' then
    -- ref_id = '<socio_id>:<YYYY-MM-DD del lunes>' (claveSemana() en
    -- lib/engines/streak-engine.ts:32 es el lunes en ISO). Se exige el prefijo
    -- derivado, que el sufijo sea un lunes real no futuro, y la condición de
    -- verdad del motor de racha: al menos una clase ASISTIDA esa semana.
    if left(p_ref_id, length(p_socio_id) + 1) is distinct from p_socio_id || ':' then
      raise exception 'REF_ID_NO_DERIVADO';
    end if;
    v_sufijo := substr(p_ref_id, length(p_socio_id) + 2);
    begin
      v_lunes := v_sufijo::date;
    exception when others then
      raise exception 'REF_ID_NO_DERIVADO';
    end;
    if extract(isodow from v_lunes) <> 1 or v_lunes > current_date then
      raise exception 'REF_ID_NO_DERIVADO';
    end if;
    -- Ventana ensanchada un día por lado a propósito: el lunes lo calcula el
    -- navegador en HORA LOCAL y `sesiones.inicio` es timestamptz. Sin el
    -- margen, una clase de domingo noche o lunes muy temprano podría caer
    -- fuera y costarle a la socia un crédito que se ha ganado. El margen no
    -- abre nada: el ref_id sigue siendo uno por semana real con asistencia.
    if not exists (
      select 1 from reservas r join sesiones s on s.id = r.sesion_id
      where r.socio_id = p_socio_id and r.studio_id = p_studio_id and r.estado = 'ASISTIDA'
        and s.inicio >= (v_lunes - 1)::timestamptz
        and s.inicio <  (v_lunes + 8)::timestamptz
    ) then
      raise exception 'CONDICION_NO_CUMPLIDA';
    end if;
    select r.creditos, r.nombre, r.id into v_creditos, v_desc, v_regla_id from reward_rules r
      where r.studio_id = p_studio_id and r.trigger = 'SEMANA_COMPLETA' and r.activa limit 1;

  elsif p_trigger = 'OBJETIVO_MENSUAL' then
    -- ⚠️ Este disparador se puede activar y tarifar en la UI
    -- (components/configuracion/tab-recompensas.tsx:22, 50 créditos) y NINGÚN
    -- proceso lo concede: no hay un solo llamante en todo el árbol. Antes de
    -- esta migración el único modo de cobrarlo era fabricar la llamada a mano.
    -- Se le aplica la misma derivación que al resto —'<socio_id>:<YYYY-MM>' de
    -- un mes no futuro— para que quede acotado y para no cerrarle la puerta a
    -- la implementación que falta. Que la UI lo prometa y nadie lo conceda se
    -- reporta aparte; arreglarlo es producto, no seguridad.
    if left(p_ref_id, length(p_socio_id) + 1) is distinct from p_socio_id || ':' then
      raise exception 'REF_ID_NO_DERIVADO';
    end if;
    v_sufijo := substr(p_ref_id, length(p_socio_id) + 2);
    begin
      v_lunes := (v_sufijo || '-01')::date;
    exception when others then
      raise exception 'REF_ID_NO_DERIVADO';
    end;
    if v_lunes > date_trunc('month', current_date)::date then
      raise exception 'REF_ID_NO_DERIVADO';
    end if;
    select r.creditos, r.nombre, r.id into v_creditos, v_desc, v_regla_id from reward_rules r
      where r.studio_id = p_studio_id and r.trigger = 'OBJETIVO_MENSUAL' and r.activa limit 1;

  elsif p_trigger = 'LOGRO' then
    -- ref_id = '<socio_id>:<config_id>' en los dos llamantes reales
    -- (studio-context:4763 y supabase-data-admin:4423).
    if p_config_id is null or p_ref_id is distinct from p_socio_id || ':' || p_config_id then
      raise exception 'REF_ID_NO_DERIVADO';
    end if;
    select a.creditos_recompensa, 'Logro desbloqueado: ' || a.nombre into v_creditos, v_desc
      from achievement_definitions a
      where a.id = p_config_id and a.studio_id = p_studio_id and a.activo;

  elsif p_trigger = 'RETO' then
    -- ref_id = '<socio_id>:<config_id>' (studio-context:4884,
    -- supabase-data-admin:4493).
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
-- 2) congelar_suscripcion / descongelar_suscripcion — dinero (🔴)
-- ---------------------------------------------------------------------------
-- Ninguna de las dos comprueba rol; solo el tenant. La RLS de `suscripciones`
-- (suscripciones_escritura_update) sí exige puede_mover_dinero(), y la UI
-- esconde el botón tras `puedeCobrar` (clientas/[id]/page.tsx:211). O sea: la
-- puerta está cerrada en el cliente Y en la tabla, y abierta en la RPC.
--
-- Verificado en prod, revertido: una INSTRUCTOR de studio-1 pasó una
-- suscripción de ACTIVA a PAUSADA por la RPC; el mismo UPDATE por la vía
-- normal, en la misma sesión, afectó a 0 filas. Y descongelar le regaló días:
-- fecha_fin 2026-09-15 → 2026-09-25.
--
-- Impacto en dinero: lib/inngest/renovaciones.ts:143 emite los recibos de
-- renovación filtrando .eq('estado','ACTIVA'), así que una suscripción pausada
-- DEJA DE FACTURARSE en silencio y sin aviso, indefinidamente (no hay ningún
-- job en pg_cron que lo revierta), y lib/billing/stripe-cobros.ts:107 rechaza
-- con 409 los recibos ya emitidos. Congelar+descongelar en bucle empuja además
-- la caducidad del bono todo lo que se quiera.
--
-- Arreglo: el chequeo de rol dentro, NO un revoke — el camino legítimo lo
-- llama el navegador de la propietaria/recepción sin ruta de servidor que
-- medie (supabase-data.ts:2527). `puede_mover_dinero()` es exactamente el
-- predicado que ya usan la RLS de la tabla y el gate de la UI: cero roturas.
-- El `auth.uid() is not null` preserva service_role, igual que en
-- ampliar_caducidades y ajustar_creditos.

CREATE OR REPLACE FUNCTION public.congelar_suscripcion(p_id text, p_suscripcion_id text, p_studio_id text, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  perform public.validar_studio_mismatch(p_studio_id);

  if auth.uid() is not null and not public.puede_mover_dinero() then
    raise exception 'NO_AUTORIZADO';
  end if;

  begin
    insert into congelaciones (id, studio_id, suscripcion_id, desde, motivo)
      values (p_id, p_studio_id, p_suscripcion_id, current_date, p_motivo);
  exception when unique_violation then
    return;
  end;

  update suscripciones set estado = 'PAUSADA'
    where id = p_suscripcion_id and studio_id = p_studio_id and estado = 'ACTIVA';
end;
$function$;

CREATE OR REPLACE FUNCTION public.descongelar_suscripcion(p_suscripcion_id text, p_studio_id text)
 RETURNS date
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_dias int;
  v_fin  date;
begin
  -- El mismatch estaba escrito a mano aquí en vez de por el helper; se deja
  -- igual de estricto pero vía validar_studio_mismatch(), que es la fuente
  -- única del predicado en el resto de RPCs.
  perform public.validar_studio_mismatch(p_studio_id);

  if auth.uid() is not null and not public.puede_mover_dinero() then
    raise exception 'NO_AUTORIZADO';
  end if;

  update congelaciones
     set hasta = current_date, dias_aplicados = (current_date - desde)
   where suscripcion_id = p_suscripcion_id and studio_id = p_studio_id and hasta is null
   returning dias_aplicados into v_dias;

  update suscripciones
     set estado = 'ACTIVA',
         fecha_fin = case when fecha_fin is not null and v_dias is not null
                          then fecha_fin + v_dias else fecha_fin end
   where id = p_suscripcion_id and studio_id = p_studio_id
   returning fecha_fin into v_fin;

  return v_fin;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3) reservar_cita — citas a precio 0 (🔴)
-- ---------------------------------------------------------------------------
-- Valida estudio, socia e instructora, pero no el rol, y el PRECIO lo pone
-- quien llama. Verificado en prod, revertido: una INSTRUCTOR creó una cita
-- CONFIRMADA a 0,00 € (y con servicio_id NULL, que tampoco se valida); la RLS
-- citas_escritura_insert exige puede_gestionar_clientas(), así que por la vía
-- normal no habría podido.
--
-- Aquí SÍ toca revoke, no chequeo de rol: el único llamante de todo el árbol
-- es lib/db/supabase-data-admin.ts:3509 (crearCitaPublica) con service_role, y
-- el uso legítimo es la autorreserva de la SOCIA, que no tiene rol — un
-- puede_*() la habría bloqueado. Comprobado que ninguna función ni política
-- referencia reservar_cita, y que no hay Edge Functions.

REVOKE EXECUTE ON FUNCTION public.reservar_cita(text, text, text, text, text, text, timestamptz, timestamptz, numeric, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reservar_cita(text, text, text, text, text, text, timestamptz, timestamptz, numeric, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reservar_cita(text, text, text, text, text, text, timestamptz, timestamptz, numeric, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_cita(text, text, text, text, text, text, timestamptz, timestamptz, numeric, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 4) tiene_consentimiento_salud — fuga de 1 bit entre estudios (🟡)
-- ---------------------------------------------------------------------------
-- `select ... from socios where id = p_socio_id`, sin filtro de estudio y sin
-- mirar auth: cualquier authenticated (incluida una socia de otro estudio)
-- puede preguntar por un socio_id de OTRO tenant. Verificado en prod: la
-- INSTRUCTOR de studio-1 obtuvo t/f para socios de studio-1rzd713z2s4x5,
-- mientras el SELECT directo sobre `socios` devolvía 0 filas por RLS.
--
-- Impacto acotado y honesto: es 1 bit («dio consentimiento de salud»), exige
-- conocer el socio_id exacto (no enumerable), y no expone ningún dato de
-- salud — condiciones_salud, respuestas_sesion, respuestas_cuestionario_salud
-- y valoraciones_iniciales_salud siguen exigiendo studio_id en sus políticas.
--
-- Arreglo: filtro de tenant dentro. NO revoke: la función se usa DENTRO de 13
-- políticas RLS de las cuatro tablas de salud, y las expresiones de política
-- se evalúan con los privilegios de quien consulta — revocar dejaría toda la
-- sección de salud devolviendo 42501 desde el navegador (comprobado).
-- Cross-tenant pasa de true/false a NULL, que en el AND de una política no es
-- true: mismo efecto que hoy para las filas legítimas. La rama
-- `auth.uid() is null` preserva service_role.

CREATE OR REPLACE FUNCTION public.tiene_consentimiento_salud(p_socio_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select consentimiento_salud_fecha is not null and consentimiento_salud_revocado_en is null
  from public.socios
  where id = p_socio_id
    and (auth.uid() is null or studio_id = public.current_studio_id());
$function$;
