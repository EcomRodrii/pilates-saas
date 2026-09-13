-- Derechos RGPD de la alumna (auditoría RGPD, hallazgos R-4 y R-8).
--
-- Hasta aquí la alumna no podía ejercer ningún derecho desde su app. La
-- decisión de producto (cerrada) es:
--   · acceso/portabilidad → la alumna DESCARGA sus datos al momento (sin tabla:
--     lo sirve una ruta de servidor, ver lib/socios/exportar-datos-socia.ts);
--   · supresión, limitación y oposición → SOLICITUD al estudio, que es el
--     responsable del tratamiento, con plazo de 30 días, y que el estudio
--     ejecuta desde el panel;
--   · oposición al perfilado del Decision OS → interruptor que controla la
--     propia alumna (`socios.excluir_de_perfilado`).

-- ── 1) Oposición al perfilado ───────────────────────────────────────────────
alter table public.socios
  add column if not exists excluir_de_perfilado boolean not null default false;

comment on column public.socios.excluir_de_perfilado is
  'Art. 21 RGPD: la socia se opone a que sus datos se usen para recomendaciones automáticas del estudio (Decision OS). Solo la cambia ella desde su app (ruta de servidor).';

-- La decisión es de la socia, no del estudio. El staff tiene UPDATE sobre
-- `socios` (tabla entera), y un REVOKE por columna no resta de un GRANT de
-- tabla — así que la cerradura va en un trigger: con un JWT de staff (o anon)
-- este campo no se mueve. Service-role (la ruta del portal que ya verificó a
-- la socia) sí puede.
create or replace function public.socios_guarda_excluir_de_perfilado()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.excluir_de_perfilado is distinct from old.excluir_de_perfilado
     and coalesce(auth.role(), '') in ('authenticated', 'anon') then
    raise exception 'La oposición al perfilado solo la cambia la propia socia desde su app'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.socios_guarda_excluir_de_perfilado() from public, anon, authenticated;

drop trigger if exists trg_socios_guarda_excluir_de_perfilado on public.socios;
create trigger trg_socios_guarda_excluir_de_perfilado
  before update of excluir_de_perfilado on public.socios
  for each row execute function public.socios_guarda_excluir_de_perfilado();

-- ── 2) Solicitudes de derechos ──────────────────────────────────────────────
create table if not exists public.solicitudes_derechos (
  id text primary key default gen_random_uuid()::text,
  studio_id text not null references public.studios(id) on delete cascade,
  -- La socia nunca se borra de verdad (la supresión anonimiza), así que el
  -- registro de la solicitud sobrevive a su ejecución: es la prueba de que se
  -- atendió en plazo (art. 5.2).
  socio_id text not null references public.socios(id) on delete cascade,
  tipo text not null check (tipo in ('supresion', 'oposicion', 'limitacion')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'resuelta', 'rechazada')),
  solicitada_en timestamptz not null default now(),
  plazo_hasta timestamptz not null default (now() + interval '30 days'),
  resuelta_en timestamptz,
  -- Sin FK a auth.users a propósito: una FK NO ACTION impediría borrar esa
  -- cuenta algún día (hallazgo R-6).
  resuelta_por uuid,
  nota text
);

-- (Las restricciones de varias columnas van aparte y no dentro del CREATE: el
-- generador de `lib/db-types.ts` lee cada línea del CREATE como una columna.)
alter table public.solicitudes_derechos
  add constraint solicitudes_derechos_cierre_coherente check (
    (estado = 'pendiente' and resuelta_en is null)
    or (estado <> 'pendiente' and resuelta_en is not null)
  );

-- Rechazar una solicitud de derechos exige decir por qué (p. ej. la obligación
-- legal de conservar las facturas).
alter table public.solicitudes_derechos
  add constraint solicitudes_derechos_rechazo_con_nota check (
    estado <> 'rechazada' or length(btrim(coalesce(nota, ''))) > 0
  );

-- Idempotencia en el esquema, no solo en la ruta: una socia no puede tener dos
-- solicitudes PENDIENTES del mismo tipo (doble toque, dos pestañas).
create unique index if not exists solicitudes_derechos_una_pendiente
  on public.solicitudes_derechos (socio_id, tipo) where estado = 'pendiente';

create index if not exists solicitudes_derechos_studio_estado
  on public.solicitudes_derechos (studio_id, estado, plazo_hasta);

alter table public.solicitudes_derechos enable row level security;

-- Lectura: quien gestiona clientas en SU estudio (mismo criterio que
-- `documentos_socio` y que `/api/socios/eliminar`).
create policy solicitudes_derechos_lectura on public.solicitudes_derechos
  for select to authenticated
  using (
    studio_id = (select public.current_studio_id())
    and (select public.puede_gestionar_clientas())
  );

-- Actualización: solo cerrar una PENDIENTE (una resuelta no se reabre), firmada
-- por quien la cierra, y una supresión solo se da por resuelta si la socia está
-- de verdad suprimida.
create policy solicitudes_derechos_resolver on public.solicitudes_derechos
  for update to authenticated
  using (
    estado = 'pendiente'
    and studio_id = (select public.current_studio_id())
    and (select public.puede_gestionar_clientas())
  )
  with check (
    studio_id = (select public.current_studio_id())
    and (select public.puede_gestionar_clientas())
    and (resuelta_por is null or resuelta_por = (select auth.uid()))
    and (
      tipo <> 'supresion' or estado <> 'resuelta'
      or exists (
        select 1 from public.socios s
        where s.id = solicitudes_derechos.socio_id and s.borrado_en is not null
      )
    )
  );

-- Sin policy de INSERT ni DELETE: la solicitud la crea solo el servidor (ruta
-- del portal con la sesión verificada de la socia) y nadie la borra.
--
-- ⚠️ Grants explícitos: el `pg_default_acl` de este proyecto da
-- INSERT/SELECT/UPDATE/DELETE a `authenticated` en toda tabla nueva. Se revoca
-- todo y se concede solo lo que las policies de arriba contemplan, y el UPDATE
-- solo sobre las columnas de cierre.
revoke all on table public.solicitudes_derechos from public, anon, authenticated;
grant select on table public.solicitudes_derechos to authenticated;
grant update (estado, resuelta_en, resuelta_por, nota) on table public.solicitudes_derechos to authenticated;
grant all on table public.solicitudes_derechos to service_role;
