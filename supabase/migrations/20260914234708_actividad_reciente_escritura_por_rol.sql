-- La actividad que registran gerencia y recepción deja de perderse.
--
-- `actividad_reciente` tenía UNA política para todo (`owner_actividad_reciente`,
-- FOR ALL, solo PROPIETARIO). Las escrituras del panel (`addActividadReciente` en
-- lib/studio-context.tsx y el calendario) salen con la sesión de quien actúa: con
-- MANAGER o RECEPCION la política rechazaba el INSERT y el error solo llegaba a
-- un log. «Quién ha hecho qué» enseñaba solo lo que hacía la propietaria.
--
-- Decisión del fundador (opción A): la RLS se parte por operación y rol; las
-- llamadas del navegador no cambian. Se aplica ANTES de desplegar el código que
-- escribe `origen` en servidor (lib/decision/db.ts, lib/inngest/decision.ts): la
-- columna tiene DEFAULT y el código anterior sigue funcionando igual; al revés,
-- esas inserciones fallarían hasta aplicarla.
--
-- Qué cambia:
--   · Columna `origen`: 'EQUIPO' (lo hizo una persona del estudio, también cuando
--     Tentare ejecuta lo que la propietaria aprobó) o 'TENTARE' (Tentare actuó
--     solo: piloto automático del Decision OS, `resuelto_por = 'AUTONOMIA'`).
--     Solo el servidor escribe 'TENTARE'.
--   · SELECT: igual que hoy, la propietaria de su estudio.
--   · INSERT: PROPIETARIO, MANAGER y RECEPCION, en su estudio y solo 'EQUIPO'.
--     INSTRUCTOR sigue fuera: su app escribe por servidor.
--   · Sin UPDATE ni DELETE desde una sesión: el registro no se reescribe desde el
--     cliente. Se retira el PRIVILEGIO de tabla, no solo la política.
--
-- Qué NO se toca: `purgar_datos_caducados` (24 meses), `anonimizar_socio`,
-- `purgar_estudio_vencido` y `restaurar_backup` son SECURITY DEFINER de
-- `postgres`: no dependen de los privilegios de `authenticated`.
-- `restaurar_backup` solo inserta las columnas que trae la copia, así que una
-- copia anterior a esta migración recibe el DEFAULT 'EQUIPO'.

-- ── Origen ───────────────────────────────────────────────────────────────────
alter table public.actividad_reciente
  add column if not exists origen text not null default 'EQUIPO' check (origen in ('EQUIPO', 'TENTARE'));

comment on column public.actividad_reciente.origen is
  'EQUIPO: lo hizo una persona del estudio (incluido lo que la propietaria aprobó y Tentare ejecutó). TENTARE: Tentare actuó solo (piloto automático). Solo el servidor escribe TENTARE.';

-- Líneas que ya escribió el ejecutor del Decision OS para una recomendación que
-- aprobó el piloto automático. Las de la propietaria (aprobar, descartar,
-- posponer) se quedan en 'EQUIPO'. El ejecutor escribe «Gestionada: <título>»,
-- «No se pudo completar: <título> — …» o «<nombre>: <detalle>», con el mismo
-- estudio y socia, después de la aprobación.
update public.actividad_reciente a
   set origen = 'TENTARE'
  from public.recomendaciones r
 where a.tipo = 'DECISION_GESTIONADA'
   and a.enlace = '/centro-de-control'
   and a.actor_nombre is null
   and r.resuelto_por = 'AUTONOMIA'
   and r.studio_id = a.studio_id
   and r.socio_id is not distinct from a.socio_id
   and a.creado_en >= r.resuelto_en
   and a.creado_en < r.resuelto_en + interval '1 day'
   and (a.texto = 'Gestionada: ' || r.titulo
        or starts_with(a.texto, 'No se pudo completar: ' || r.titulo || ' — ')
        or (r.datos_usados ->> 'nombre' is not null
            and starts_with(a.texto, (r.datos_usados ->> 'nombre') || ': ')));

create index if not exists idx_actividad_reciente_studio_origen_creado
  on public.actividad_reciente (studio_id, origen, creado_en desc);

-- ── Políticas ────────────────────────────────────────────────────────────────
drop policy if exists owner_actividad_reciente on public.actividad_reciente;

create policy actividad_reciente_lectura on public.actividad_reciente
  for select to authenticated
  using ((studio_id = (select public.current_studio_id()))
         and ((select public.current_rol()) = 'PROPIETARIO'));

create policy actividad_reciente_insercion_equipo on public.actividad_reciente
  for insert to authenticated
  with check ((studio_id = (select public.current_studio_id()))
              and ((select public.current_rol()) in ('PROPIETARIO', 'MANAGER', 'RECEPCION'))
              and origen = 'EQUIPO');

-- ── Privilegios ──────────────────────────────────────────────────────────────
-- REVOKE ALL + GRANT exacto: un REVOKE parcial no quita lo concedido por otra
-- vía, y así la tabla queda con lo que se ve aquí y nada más.
revoke all on table public.actividad_reciente from anon;
revoke all on table public.actividad_reciente from authenticated;
grant select, insert on table public.actividad_reciente to authenticated;
grant all on table public.actividad_reciente to service_role;

do $verificacion$
declare
  v_fallo text;
begin
  if has_table_privilege('anon', 'public.actividad_reciente', 'SELECT')
     or has_table_privilege('anon', 'public.actividad_reciente', 'INSERT')
     or has_table_privilege('anon', 'public.actividad_reciente', 'UPDATE')
     or has_table_privilege('anon', 'public.actividad_reciente', 'DELETE')
     or has_any_column_privilege('anon', 'public.actividad_reciente', 'SELECT, INSERT, UPDATE') then
    raise exception 'anon conserva privilegios sobre actividad_reciente';
  end if;
  if has_table_privilege('authenticated', 'public.actividad_reciente', 'UPDATE')
     or has_table_privilege('authenticated', 'public.actividad_reciente', 'DELETE')
     or has_table_privilege('authenticated', 'public.actividad_reciente', 'TRUNCATE')
     or has_any_column_privilege('authenticated', 'public.actividad_reciente', 'UPDATE') then
    raise exception 'authenticated conserva UPDATE/DELETE sobre actividad_reciente';
  end if;
  if not has_table_privilege('authenticated', 'public.actividad_reciente', 'SELECT')
     or not has_table_privilege('authenticated', 'public.actividad_reciente', 'INSERT') then
    raise exception 'authenticated perdió SELECT/INSERT: el feed del panel dejaría de escribirse';
  end if;
  if not has_table_privilege('service_role', 'public.actividad_reciente', 'INSERT')
     or not has_table_privilege('service_role', 'public.actividad_reciente', 'DELETE') then
    raise exception 'service_role no puede escribir actividad_reciente';
  end if;

  select string_agg(policyname || ':' || cmd, ', ') into v_fallo
    from pg_policies
   where schemaname = 'public' and tablename = 'actividad_reciente'
     and (cmd not in ('SELECT', 'INSERT') or roles <> array['authenticated']::name[]);
  if v_fallo is not null then
    raise exception 'políticas de actividad_reciente fuera de lo previsto: %', v_fallo;
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'actividad_reciente') <> 2 then
    raise exception 'actividad_reciente debe tener exactamente dos políticas (lectura e inserción)';
  end if;
end
$verificacion$;
