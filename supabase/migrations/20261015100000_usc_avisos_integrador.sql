-- Avisos de integrador de Urban Sports Club (webhook tipo 4, «Integrator Update»).
--
-- ⚠️ PENDIENTE DE APLICAR EN PRODUCCIÓN: esta migración está escrita y NO
-- aplicada (el interruptor USC_AVISOS_INTEGRADOR va apagado y USC aún no nos ha
-- dado credenciales). Aplicarla con el resto de lo de USC, antes de registrar la
-- URL del webhook allí. Solo aditiva: tabla nueva, nada existente cambia.
--
-- USC avisa cuando asocia, actualiza o quita a Tentare como integrador de un
-- proveedor (un estudio suyo) y cuando le añade o termina una ubicación. El
-- aviso no trae ningún dato de Tentare, solo el id de proveedor de USC y, en el
-- alta, su nombre: por eso es un BUZÓN. Se guarda todo, no se aplica nada solo,
-- y la propietaria del estudio candidato lo confirma (el servidor comprueba
-- antes con USC que el proveedor existe para nuestro client).
--
-- Se insertan todas las filas y quien lee decide el aviso vigente por
-- `modificado_usc`: USC no garantiza el orden y así un aviso viejo no puede
-- pisar nada. `huella` única: `reclamar_webhook_event` falla abierto y los
-- reintentos de USC (5) no deben duplicar filas.
--
-- Solo lo toca el servidor (service role): sin lectura para el navegador.

create table if not exists public.usc_avisos_integrador (
  id uuid primary key default gen_random_uuid(),
  huella text not null unique,
  tipo text not null check (tipo in (
    'IntegratorAssociated', 'IntegratorUpdated', 'IntegratorRemoved',
    'IntegratorLocationAdded', 'IntegratorLocationTerminated'
  )),
  provider_id uuid not null,
  location_id uuid,
  -- Nombre de un negocio, no de una persona; solo se sirve al estudio candidato.
  provider_nombre text check (char_length(provider_nombre) <= 120),
  nombre_normalizado text,
  ubicacion_nombre text check (char_length(ubicacion_nombre) <= 120),
  inicio timestamptz,
  fin timestamptz,
  modificado_usc timestamptz,
  estado text not null check (estado in ('SIN_ASIGNAR', 'PENDIENTE', 'CONFIRMADO', 'RECHAZADO', 'CONFLICTO', 'INFORMATIVO')),
  estudio_candidato_id text references public.studios(id) on delete set null,
  resuelto_por text,
  resuelto_en timestamptz,
  recibido_en timestamptz not null default now()
);

-- Un proveedor de USC solo puede estar confirmado por UN estudio: el reclamo
-- anti-robo es esta fila única, antes de escribir ninguna configuración.
create unique index if not exists usc_avisos_proveedor_confirmado
  on public.usc_avisos_integrador (provider_id)
  where tipo = 'IntegratorAssociated' and estado = 'CONFIRMADO';
create index if not exists usc_avisos_candidato on public.usc_avisos_integrador (estudio_candidato_id, recibido_en desc);
create index if not exists usc_avisos_proveedor on public.usc_avisos_integrador (provider_id, modificado_usc desc);

alter table public.usc_avisos_integrador enable row level security;

-- Verificación en dos pasos del equipo (tentare-os): restrictiva en cada tabla nueva.
create policy exige_doble_factor on public.usc_avisos_integrador as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()));

-- Sin política de lectura ni escritura para el navegador: todo pasa por el servidor.
revoke all on public.usc_avisos_integrador from anon, authenticated;
grant all on public.usc_avisos_integrador to service_role;

do $$
declare p text;
begin
  foreach p in array array['select', 'insert', 'update', 'delete'] loop
    if has_table_privilege('anon', 'public.usc_avisos_integrador', p)
       or has_table_privilege('authenticated', 'public.usc_avisos_integrador', p) then
      raise exception 'usc_avisos_integrador: el navegador no debe tener % sobre la tabla', p;
    end if;
  end loop;
  if not has_table_privilege('service_role', 'public.usc_avisos_integrador', 'select')
     or not has_table_privilege('service_role', 'public.usc_avisos_integrador', 'insert')
     or not has_table_privilege('service_role', 'public.usc_avisos_integrador', 'update') then
    raise exception 'usc_avisos_integrador: service_role sin permisos';
  end if;
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'usc_avisos_integrador' and policyname = 'exige_doble_factor'
  ) then
    raise exception 'usc_avisos_integrador: falta la política exige_doble_factor';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.usc_avisos_integrador'::regclass) then
    raise exception 'usc_avisos_integrador: RLS desactivada';
  end if;
end $$;
