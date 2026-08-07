-- Primera pieza de "configuración centralizada de cadena": catálogo de
-- tipos de clase que se COPIA (nunca vínculo vivo) a las sedes de la cadena.
-- Solo columnas de identidad de catálogo, deliberadamente SIN las columnas de
-- política de reserva/cancelación/penalización de tipos_clase (Fase 1-3):
-- esas siguen siendo 100% decisión de cada sede, sin excepción.
create table public.cadena_tipos_clase (
  id text primary key,
  cadena_id text not null references public.cadenas(id) on delete cascade,
  nombre text not null,
  color text default '#4F46E5',
  duracion_minutos integer default 60,
  descripcion text,
  nivel text default 'TODOS' check (nivel in ('TODOS','PRINCIPIANTE','MEDIO','AVANZADO')),
  foto_url text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index idx_cadena_tipos_clase_cadena_id on public.cadena_tipos_clase(cadena_id);

alter table public.cadena_tipos_clase enable row level security;

-- Mismo criterio que "Añadir sede" (app/api/cadena/sedes/route.ts): solo la
-- dueña de la cadena, nunca MANAGER/RECEPCION de una sede individual.
create policy owner_cadena_tipos_clase on public.cadena_tipos_clase
  for all
  to authenticated
  using (exists (select 1 from public.cadenas c where c.id = cadena_id and c.owner_auth_user_id = auth.uid()))
  with check (exists (select 1 from public.cadenas c where c.id = cadena_id and c.owner_auth_user_id = auth.uid()));

revoke all on public.cadena_tipos_clase from anon, public;
grant select, insert, update, delete on public.cadena_tipos_clase to authenticated;
grant all on public.cadena_tipos_clase to service_role;
