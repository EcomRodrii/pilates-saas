-- Higiene de datos para las métricas (North Star, fase 1). Solo ADITIVA: no
-- cambia ningún comportamiento del producto, solo deja constancia.
--
-- 1) studios.excluir_de_metricas: estudios internos o de pruebas que no deben
--    contar en ninguna cifra de negocio (es_demo cubre las demos, no estos).
--    Solo lo cambia el servidor: si la propietaria pudiera, se escondería de
--    las métricas a su gusto.
-- 2) reservas.asistencia_origen: QUIÉN dejó la reserva en ASISTIDA/NO_ASISTIO.
--    Sin esto «no vino» y «nadie pasó lista» son indistinguibles, porque el
--    barrido nocturno marca NO_ASISTIO a todo lo que sigue CONFIRMADA.
--    PERSONA = equipo o alumna (lista del panel, app de la instructora, QR);
--    SISTEMA = el barrido nocturno o la marca automática de clases sin lista.

alter table public.studios
  add column if not exists excluir_de_metricas boolean not null default false;
comment on column public.studios.excluir_de_metricas is
  'Estudio interno o de pruebas: se excluye de las métricas de negocio. Solo lo escribe el servidor.';

create or replace function public.trg_studios_excluir_de_metricas_solo_servidor()
returns trigger
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.excluir_de_metricas is distinct from old.excluir_de_metricas
     and not public.es_llamada_servicio() then
    raise exception 'excluir_de_metricas solo lo cambia el servidor' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_studios_excluir_de_metricas on public.studios;
create trigger trg_studios_excluir_de_metricas
  before update on public.studios
  for each row execute function public.trg_studios_excluir_de_metricas_solo_servidor();

-- El INSERT desde el navegador (alta de estudio) no puede nacer excluido.
create or replace function public.trg_studios_nace_no_excluido()
returns trigger
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.excluir_de_metricas and not public.es_llamada_servicio() then
    new.excluir_de_metricas := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_studios_nace_no_excluido on public.studios;
create trigger trg_studios_nace_no_excluido
  before insert on public.studios
  for each row execute function public.trg_studios_nace_no_excluido();

alter table public.reservas
  add column if not exists asistencia_origen text
  check (asistencia_origen is null or asistencia_origen in ('PERSONA', 'SISTEMA'));
comment on column public.reservas.asistencia_origen is
  'Quién dejó la reserva en ASISTIDA o NO_ASISTIO: PERSONA o SISTEMA (barrido/marca automática). NULL = no se ha resuelto o es anterior a esta columna (no se rellena hacia atrás: sería inventar).';

-- Si quien escribe no dice el origen, es una persona. El servidor automático lo
-- dice explícitamente ('SISTEMA'). Al salir de ASISTIDA/NO_ASISTIO se limpia.
create or replace function public.trg_reservas_asistencia_origen()
returns trigger
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.estado in ('ASISTIDA', 'NO_ASISTIO') then
    if old.estado is distinct from new.estado
       and new.asistencia_origen is not distinct from old.asistencia_origen then
      new.asistencia_origen := 'PERSONA';
    end if;
  elsif old.estado in ('ASISTIDA', 'NO_ASISTIO') then
    new.asistencia_origen := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reservas_asistencia_origen on public.reservas;
create trigger trg_reservas_asistencia_origen
  before update on public.reservas
  for each row execute function public.trg_reservas_asistencia_origen();
