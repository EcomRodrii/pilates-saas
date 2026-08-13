-- Tentare Network, Fase 2 (wizard de onboarding, verificación de identidad)
-- — docs/NETWORK-IMPLEMENTATION-PLAN.md. Datos legales de la profesional
-- (nombre completo, DNI/pasaporte, dirección, teléfono/email verificados).
--
-- Tabla SEPARADA de red_perfiles a propósito — no columnas nuevas ahí,
-- pese a que el encargo original las pedía en red_perfiles. Motivo, mismo
-- que ya separó mandatos_sepa de socios (citado explícitamente en el
-- encargo): RLS es por FILA, no por columna. red_perfiles_select_publicado
-- ya da el row COMPLETO (todas las columnas, email_contacto/
-- telefono_contacto incluidos) a CUALQUIER authenticated cuando el perfil
-- está 'published'. Meter un DNI o una fecha de nacimiento ahí lo
-- filtraría a toda la red igual que un dato bancario en socios — y aquí es
-- más grave (documento de identidad real, primera vez en este repo).
-- lib/network/publico.ts NUNCA debe seleccionar de esta tabla.
create table public.red_perfiles_identidad (
  perfil_id text primary key references public.red_perfiles(id) on delete cascade,
  apellido1 text,
  apellido2 text,
  fecha_nacimiento date,
  pais_residencia text,
  tipo_documento text check (tipo_documento in ('DNI', 'NIE', 'Pasaporte')),
  numero_documento text,
  direccion_cp text,
  direccion_ciudad text,
  direccion_provincia text,
  direccion_pais text,
  telefono_verificado_en timestamptz,
  email_verificado_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

alter table public.red_perfiles_identidad enable row level security;

-- SELECT: solo el dueño, nunca una rama "published" — a diferencia de
-- red_perfiles, aquí no existe ninguna vía de lectura para otra persona.
create policy red_perfiles_identidad_select_propio on public.red_perfiles_identidad
  for select to authenticated
  using (exists (
    select 1 from public.red_perfiles rp
    where rp.id = red_perfiles_identidad.perfil_id and rp.auth_user_id = auth.uid()
  ));

create policy red_perfiles_identidad_insert_propio on public.red_perfiles_identidad
  for insert to authenticated
  with check (
    exists (
      select 1 from public.red_perfiles rp
      where rp.id = red_perfiles_identidad.perfil_id and rp.auth_user_id = auth.uid()
    )
    and telefono_verificado_en is null
    and email_verificado_en is null
  );

create policy red_perfiles_identidad_update_propio on public.red_perfiles_identidad
  for update to authenticated
  using (exists (
    select 1 from public.red_perfiles rp
    where rp.id = red_perfiles_identidad.perfil_id and rp.auth_user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.red_perfiles rp
    where rp.id = red_perfiles_identidad.perfil_id and rp.auth_user_id = auth.uid()
  ));

-- telefono_verificado_en/email_verificado_en: solo el sistema los certifica
-- (flujo real de verificación por OTP/etc., fuera de esta fase) — mismo
-- patrón de trigger que ya protege red_perfiles.identidad_verificada_en/
-- destacado (migraciones 20260813135453 / 20260813175606): el dueño puede
-- hacer UPDATE de su fila, pero no de estas dos columnas.
create or replace function public.red_perfiles_identidad_proteger_verificacion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() is distinct from 'service_role' then
    new.telefono_verificado_en := old.telefono_verificado_en;
    new.email_verificado_en := old.email_verificado_en;
  end if;
  new.actualizado_en := now();
  return new;
end;
$$;

drop trigger if exists red_perfiles_identidad_proteger_verificacion_trigger on public.red_perfiles_identidad;
create trigger red_perfiles_identidad_proteger_verificacion_trigger
  before update on public.red_perfiles_identidad
  for each row execute function public.red_perfiles_identidad_proteger_verificacion();
