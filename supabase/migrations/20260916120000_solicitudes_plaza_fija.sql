-- Plaza fija desde la app de la alumna: SOLICITUDES que aprueba el estudio.
--
-- Decisión del fundador (16-sep-2026): el estudio controla las reglas y Tentare
-- automatiza su cumplimiento. Nada cambia hasta que la propietaria lo active:
--   · «Pueden pedir plaza fija desde su app»      (plaza_fija_solicitar_desde_app, por defecto no)
--   · «Pueden pedir una pausa desde su app»       (plaza_fija_pausa_desde_app, por defecto no)
--   · «Mientras dura una pausa, su sitio queda libre para otra alumna»
--                                                   (plaza_fija_pausa_libera_sitio, por defecto no:
--                                                    conserva su sitio, como hasta ahora). Vale
--                                                    para TODAS las pausas nuevas, también las del
--                                                    mostrador; las ya puestas no cambian.
--   · «Al terminar la pausa»: volver sola si su sitio sigue libre, o preguntar antes
--                                                   (plaza_fija_fin_pausa).
-- Hasta que el estudio aprueba una solicitud, la plaza real no cambia. Pasar del
-- límite semanal no bloquea la petición: decide el estudio. Rechazar la vuelta de
-- una pausa quita la plaza.
--
-- Si una pausa libera el sitio se decide al ponerla y queda escrito en la PLAZA
-- (`plazas_fijas.pausa_libera_sitio`): así encender el ajuste no cambia las pausas
-- ya puestas. Cuando la pausa empieza (y le queda más de una semana), la plaza pasa
-- a `estado = 'PAUSADA'` con sus fechas: la exclusión GiST (0083) y el motor ya
-- ignoran PAUSADA, así que el sitio y el cupo quedan libres sin tocar ninguno de
-- los dos. Antes de empezar sigue ACTIVA: hasta entonces la clase es suya. La
-- vuelta la decide el cron nocturno con `plaza_fija_hueco_para_volver`.
--
-- La tabla va SIN políticas RLS y sin grants a anon/authenticated: todo pasa por
-- el servidor (service_role), la alumna con su token y el estudio con su sesión.

-- Tablas calientes: un ALTER que no consigue su lock enseguida falla en vez de
-- dejar en cola las lecturas.
set lock_timeout = '5s';

-- ── Ajustes del estudio ──────────────────────────────────────────────────────
alter table public.studios
  add column if not exists plaza_fija_solicitar_desde_app boolean not null default false,
  add column if not exists plaza_fija_pausa_desde_app boolean not null default false,
  add column if not exists plaza_fija_pausa_libera_sitio boolean not null default false,
  add column if not exists plaza_fija_fin_pausa text not null default 'RECUPERAR_SI_LIBRE';

alter table public.studios drop constraint if exists studios_plaza_fija_fin_pausa_check;
alter table public.studios add constraint studios_plaza_fija_fin_pausa_check
  check (plaza_fija_fin_pausa in ('RECUPERAR_SI_LIBRE', 'PENDIENTE_CONFIRMAR'));

grant update (plaza_fija_solicitar_desde_app, plaza_fija_pausa_desde_app, plaza_fija_pausa_libera_sitio, plaza_fija_fin_pausa)
  on public.studios to authenticated;

-- ── La marca de la pausa, en la plaza ────────────────────────────────────────
-- La escribe solo el servidor al poner la pausa. Sin grant de columna nuevo: la
-- RLS de `plazas_fijas` ya la cubre y el panel no la escribe.
alter table public.plazas_fijas
  add column if not exists pausa_libera_sitio boolean not null default false;

alter table public.plazas_fijas drop constraint if exists plazas_fijas_libera_sitio_con_pausa;
alter table public.plazas_fijas add constraint plazas_fijas_libera_sitio_con_pausa
  check (not pausa_libera_sitio or pausa_desde is not null);

-- ── Las solicitudes ──────────────────────────────────────────────────────────
create table if not exists public.solicitudes_plaza_fija (
  id text primary key default ('spf-' || gen_random_uuid()::text),
  studio_id text not null references public.studios(id) on delete cascade,
  socio_id text not null references public.socios(id) on delete cascade,
  tipo text not null check (tipo in ('CREAR', 'PAUSAR', 'REANUDAR')),
  -- REANUDAR la crea el cron (SISTEMA) cuando la vuelta de una pausa necesita confirmación.
  origen text not null default 'ALUMNA' check (origen in ('ALUMNA', 'SISTEMA')),
  estado text not null default 'PENDIENTE'
    check (estado in ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'CANCELADA', 'CADUCADA')),
  -- CREAR: la clase desde la que pide y la franja congelada al pedir (la clase puede moverse).
  sesion_id text references public.sesiones(id) on delete set null,
  dia_semana smallint check (dia_semana between 0 and 6),
  hora_inicio time,
  sala_id text,
  tipo_clase_id text,
  -- Pasaba del límite semanal de su cuota al pedirla: la decide el estudio.
  supera_limite boolean not null default false,
  -- PAUSAR / REANUDAR
  plaza_id text references public.plazas_fijas(id) on delete cascade,
  desde_propuesta date,
  hasta_propuesta date,
  desde_aprobada date,
  hasta_aprobada date,
  -- REANUDAR: por qué no volvió sola (SIN_CUPO | SITIO_OCUPADO | SIN_CUOTA | SUPERA_LIMITE | PREGUNTAR).
  motivo_sistema text,
  motivo_rechazo text check (motivo_rechazo is null or length(motivo_rechazo) <= 200),
  resultado_plaza_id text references public.plazas_fijas(id) on delete set null,
  creada_en timestamptz not null default now(),
  resuelta_en timestamptz,
  resuelta_por uuid,
  constraint solicitudes_plaza_fija_resuelta_coherente check ((estado = 'PENDIENTE') = (resuelta_en is null)),
  constraint solicitudes_plaza_fija_crear_con_franja check (tipo <> 'CREAR' or (dia_semana is not null and hora_inicio is not null and sala_id is not null and plaza_id is null)),
  constraint solicitudes_plaza_fija_con_plaza check (tipo = 'CREAR' or plaza_id is not null),
  constraint solicitudes_plaza_fija_pausa_fechas check (tipo <> 'PAUSAR' or (desde_propuesta is not null and hasta_propuesta is not null and hasta_propuesta >= desde_propuesta))
);

-- Una sola pendiente por plaza y tipo, y por franja al pedir plaza (doble toque = la misma).
create unique index if not exists spf_una_pendiente_plaza
  on public.solicitudes_plaza_fija (plaza_id, tipo) where estado = 'PENDIENTE' and plaza_id is not null;
create unique index if not exists spf_una_pendiente_franja
  on public.solicitudes_plaza_fija (socio_id, dia_semana, hora_inicio, sala_id) where estado = 'PENDIENTE' and tipo = 'CREAR';
create index if not exists spf_bandeja on public.solicitudes_plaza_fija (studio_id, estado);

alter table public.solicitudes_plaza_fija enable row level security;
-- Sin políticas: solo service_role. Los grants por defecto de tabla SÍ llegan a
-- anon/authenticated en este proyecto, así que se quitan explícitamente.
revoke all on public.solicitudes_plaza_fija from public, anon, authenticated;
grant all on public.solicitudes_plaza_fija to service_role;

-- ── ¿Puede volver de su pausa? ───────────────────────────────────────────────
-- Espejo de solo lectura del emparejamiento del motor. Cuenta PLAZAS FIJAS, no
-- reservas: que una semana concreta la haya reservado alguien clase a clase no le
-- quita la plaza recurrente (eso ya lo avisa `plazas_fijas_sin_materializar`).
--   'SITIO_OCUPADO' → otra plaza ACTIVA tiene su sitio concreto en su franja;
--   'SIN_CUPO'      → en alguna clase de su franja de las 6 semanas tras la pausa,
--                     las plazas fijas ACTIVAS de otras ya llenan el aforo;
--   'OK'            → puede volver.
create or replace function public.plaza_fija_hueco_para_volver(p_plaza_id text)
 returns text
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  with p as (
    select * from plazas_fijas where id = p_plaza_id
  )
  select case
    when exists (
      select 1 from plazas_fijas o, p
      where o.id <> p.id and o.studio_id = p.studio_id and o.estado = 'ACTIVA'
        and p.spot_id is not null and o.spot_id = p.spot_id
        and o.sala_id = p.sala_id and o.dia_semana = p.dia_semana and o.hora_inicio = p.hora_inicio
        and (o.vigencia_hasta is null or o.vigencia_hasta >= coalesce(p.pausa_hasta, current_date))
    ) then 'SITIO_OCUPADO'
    when exists (
      select 1
      from p
      join sesiones s
        on s.studio_id = p.studio_id and s.sala_id = p.sala_id and coalesce(s.cancelada, false) = false
       and s.inicio >= greatest(now(), (coalesce(p.pausa_hasta, current_date) + 1)::timestamp at time zone 'Europe/Madrid')
       and s.inicio < (coalesce(p.pausa_hasta, current_date) + 43)::timestamp at time zone 'Europe/Madrid'
       and extract(dow from s.inicio at time zone 'Europe/Madrid') = p.dia_semana
       and (s.inicio at time zone 'Europe/Madrid')::time = p.hora_inicio
       and (p.tipo_clase_id is null or s.tipo_clase_id = p.tipo_clase_id)
      where (
        select count(*) from plazas_fijas o
        where o.id <> p.id and o.studio_id = p.studio_id and o.estado = 'ACTIVA'
          and o.sala_id = p.sala_id and o.dia_semana = p.dia_semana and o.hora_inicio = p.hora_inicio
          and (o.tipo_clase_id is null or o.tipo_clase_id = s.tipo_clase_id)
          and (s.inicio at time zone 'Europe/Madrid')::date >= o.vigencia_desde
          and (o.vigencia_hasta is null or (s.inicio at time zone 'Europe/Madrid')::date <= o.vigencia_hasta)
          and not (o.pausa_desde is not null and (s.inicio at time zone 'Europe/Madrid')::date between o.pausa_desde and o.pausa_hasta)
      ) >= aforo_efectivo(s.id)
    ) then 'SIN_CUPO'
    else 'OK'
  end;
$function$;

revoke all on function public.plaza_fija_hueco_para_volver(text) from public, anon, authenticated;
grant execute on function public.plaza_fija_hueco_para_volver(text) to service_role;
