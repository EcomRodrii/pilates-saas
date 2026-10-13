-- ─────────────────────────────────────────────────────────────────────────────
-- Clases fijas del estudio (Fase 2): tope duro, aprobación automática, ampliar.
--
--  · **Tope duro.** Hoy `darPlazasDeClaseFija` hace un `insert` directo desde TS:
--    dos aprobaciones a la vez de la MISMA oferta (o una manual y otra automática)
--    pueden pasarse del tope de plazas que puso el estudio, porque el recuento
--    de ocupación se lee sin lock entre leer y escribir. `dar_plazas_clase_fija`
--    cierra esa carrera: bajo un `pg_advisory_xact_lock` por oferta, recuenta la
--    ocupación real de cada franja y solo inserta si TODAS caben, o no inserta
--    nada. La validación de fondo (cuota, autorización, duplicada, sitio) sigue
--    en TS —`comprobarClaseFija`, una sola copia—: esta función no la repite,
--    solo hace atómico lo que antes era leer-y-escribir.
--  · **Aprobación automática.** `clases_fijas.aprobacion_automatica`: con ella
--    activa, pedirla la resuelve al momento (mismo camino que aprobarla a mano);
--    si no cabe o pasaría del límite semanal de su cuota, la petición se queda
--    pendiente en la bandeja, igual que si estuviera apagada — nunca un error
--    nuevo para la alumna.
--  · **Ampliar.** `AMPLIAR_CLASE_FIJA`, hermano de `CREAR_CLASE_FIJA` en
--    `solicitudes_plaza_fija`: para cuando ya la tiene y quiere más tiempo antes
--    de que venza. No compite por plaza (no crea franjas nuevas), así que no pasa
--    por el tope duro.
--  · **Procedencia.** `plazas_fijas.clase_fija_id` — sin esto ni el aviso de
--    «termina pronto» puede agrupar las franjas de una oferta en un solo push, ni
--    «ampliar» puede saber con certeza qué filas tocar. Es DISTINTO del
--    `clases_fijas_franjas.serie_id` sin FK de Fase 1: aquella es la DEFINICIÓN
--    viva de la oferta (debe poder apuntar a una serie que luego desaparece, sin
--    romper nada); esta es la procedencia de algo YA CONCEDIDO. `on delete set
--    null`, no `cascade`: hoy no hay ni endpoint para borrar una oferta, y si lo
--    hubiera, no debe borrar plazas que ya están reservando clases reales.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.clases_fijas
  add column if not exists aprobacion_automatica boolean not null default false;

alter table public.plazas_fijas
  add column if not exists clase_fija_id text references public.clases_fijas(id) on delete set null;

create index if not exists plazas_fijas_clase_fija on public.plazas_fijas (clase_fija_id) where clase_fija_id is not null;

alter table public.solicitudes_plaza_fija drop constraint if exists solicitudes_plaza_fija_tipo_check;
alter table public.solicitudes_plaza_fija add constraint solicitudes_plaza_fija_tipo_check
  check (tipo in ('CREAR', 'PAUSAR', 'REANUDAR', 'CREAR_CLASE_FIJA', 'AMPLIAR_CLASE_FIJA'));

alter table public.solicitudes_plaza_fija drop constraint if exists solicitudes_plaza_fija_con_plaza;
alter table public.solicitudes_plaza_fija add constraint solicitudes_plaza_fija_con_plaza
  check (tipo in ('CREAR', 'CREAR_CLASE_FIJA', 'AMPLIAR_CLASE_FIJA') or plaza_id is not null);

alter table public.solicitudes_plaza_fija drop constraint if exists solicitudes_plaza_fija_clase_fija_completa;
alter table public.solicitudes_plaza_fija add constraint solicitudes_plaza_fija_clase_fija_completa
  check (tipo not in ('CREAR_CLASE_FIJA', 'AMPLIAR_CLASE_FIJA') or (
    clase_fija_id is not null and duracion_meses is not null and vigencia_hasta_propuesta is not null and plaza_id is null
  ));

-- Doble toque en «Ampliar» = la misma petición (mismo criterio que crearla).
create unique index if not exists spf_una_pendiente_ampliar_clase_fija
  on public.solicitudes_plaza_fija (socio_id, clase_fija_id)
  where estado = 'PENDIENTE' and tipo = 'AMPLIAR_CLASE_FIJA';

-- ── El tope duro ──────────────────────────────────────────────────────────────
--
-- Recibe filas YA validadas por `comprobarClaseFija` (cuota, autorización,
-- duplicada, sitio: eso sigue en TS). `p_filas` trae, por cada franja nueva de
-- ESTA aprobación, el `cupo` ya resuelto en TS con la misma `cupoDeFranja` de
-- siempre (`min(tope, aforo)`, o el aforo si no hay tope) — esta función no
-- vuelve a mirar `sesiones.aforo_maximo`: ese cálculo ya vive, correcto, en
-- `lib/clases-fijas-reglas.ts`, y repetirlo en SQL sería una segunda copia.
--
-- `returns jsonb`, no `RETURNS TABLE`: con TABLE, sus columnas de salida se
-- exponen como variables dentro del cuerpo y colisionan con columnas reales del
-- mismo nombre (el gotcha de "column reference is ambiguous", ya pasado tres
-- veces en este repo con Fase 2b de plazas fijas y con POS).
create or replace function public.dar_plazas_clase_fija(
  p_studio_id     text,
  p_clase_fija_id text,
  p_filas         jsonb
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_fila record;
  v_ocupadas int;
begin
  -- Una fila por oferta: dos aprobaciones de la MISMA clase fija a la vez (una
  -- manual y una automática, o dos peticiones distintas) se serializan aquí.
  -- Ofertas distintas no se bloquean entre sí.
  perform pg_advisory_xact_lock(hashtext(p_studio_id || ':clase_fija:' || p_clase_fija_id));

  for v_fila in
    select * from jsonb_to_recordset(p_filas) as x(
      dia_semana smallint, hora_inicio time, sala_id text, tipo_clase_id text, cupo integer
    )
  loop
    -- Mismo criterio de «quién ocupa el hueco» que `construirHorario`
    -- (lib/horario-fijo.ts): ACTIVA o PAUSADA, vigente hoy; un tipo_clase_id
    -- NULL en la plaza cuenta para cualquier tipo de esa franja.
    select count(*) into v_ocupadas
    from plazas_fijas pf
    where pf.studio_id = p_studio_id
      and pf.estado in ('ACTIVA', 'PAUSADA')
      and (pf.vigencia_hasta is null or pf.vigencia_hasta >= (now() at time zone 'Europe/Madrid')::date)
      and pf.sala_id = v_fila.sala_id
      and pf.dia_semana = v_fila.dia_semana
      and pf.hora_inicio = v_fila.hora_inicio
      and (pf.tipo_clase_id is null or pf.tipo_clase_id = v_fila.tipo_clase_id);

    if v_ocupadas >= v_fila.cupo then
      return jsonb_build_object('ok', false, 'diaSemana', v_fila.dia_semana, 'horaInicio', v_fila.hora_inicio);
    end if;
  end loop;

  insert into plazas_fijas (id, studio_id, socio_id, dia_semana, hora_inicio, sala_id, tipo_clase_id, spot_id, vigencia_desde, vigencia_hasta, estado, clase_fija_id)
  select (x ->> 'id'), p_studio_id, (x ->> 'socio_id'), (x ->> 'dia_semana')::smallint, (x ->> 'hora_inicio')::time,
         (x ->> 'sala_id'), nullif(x ->> 'tipo_clase_id', ''), null, (x ->> 'vigencia_desde')::date, (x ->> 'vigencia_hasta')::date,
         'ACTIVA', p_clase_fija_id
  from jsonb_array_elements(p_filas) as x;

  return jsonb_build_object('ok', true);
end;
$function$;

revoke all on function public.dar_plazas_clase_fija(text, text, jsonb) from public;
revoke all on function public.dar_plazas_clase_fija(text, text, jsonb) from anon;
revoke all on function public.dar_plazas_clase_fija(text, text, jsonb) from authenticated;
grant execute on function public.dar_plazas_clase_fija(text, text, jsonb) to service_role;
