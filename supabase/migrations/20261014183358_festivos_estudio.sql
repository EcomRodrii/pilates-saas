-- Los festivos propios de cada estudio: el módulo «Festivos» del panel nuevo (14-oct-2026).
--
-- Lo que se guarda aquí es lo que NO está en el boletín oficial: las fiestas
-- LOCALES que propone la búsqueda con IA y la propietaria marca a mano después
-- de verlas con su fuente (`origen = 'ia'`), y los días propios del estudio
-- (`origen = 'manual'`). Los oficiales NO se guardan: salen siempre del
-- calendario copiado del boletín (lib/festivos/oficiales.ts) por la dirección
-- del estudio, así que una corrección o el año nuevo llegan solos y la lista, la
-- bandeja y «Repetir este mes» dicen siempre lo mismo.
--
-- Un festivo guardado NO toca clases, reservas ni bonos. Cerrar el día sigue
-- siendo un cierre de un día en `cierres_estudio` (POST /api/cierres, el mismo
-- camino que «Cerrar el centro») y abrir igualmente, una fila de
-- `festivos_abiertos`. Lo que cambia es que esos dos caminos, «Repetir este mes»
-- y el aviso de la bandeja ven también estos días.
--
-- `ambito` lo pone el servidor (nacional, autonómico, local o propio): es la
-- chapa de la lista, no una regla.
--
-- Solo escribe el servidor (/api/festivos/estudio, con service-role): la fecha y
-- el origen hay que comprobarlos allí. Mismo patrón que `festivos_abiertos`.

create table if not exists public.festivos_estudio (
  id uuid primary key default gen_random_uuid(),
  studio_id text not null references public.studios(id) on delete cascade,
  fecha date not null,
  nombre text not null check (char_length(btrim(nombre)) between 1 and 80),
  ambito text not null check (ambito in ('nacional', 'autonomico', 'local', 'propio')),
  origen text not null check (origen in ('ia', 'manual')),
  -- De dónde sale (el boletín, la web del ayuntamiento). Solo https.
  fuente_url text check (fuente_url is null or (fuente_url ~ '^https://[^[:space:]]+$' and char_length(fuente_url) <= 500)),
  creado_por uuid,
  creado_en timestamptz not null default now(),
  -- Un día es festivo una vez: guardar dos veces el mismo no duplica.
  unique (studio_id, fecha)
);

comment on table public.festivos_estudio is
  'Festivos propios del estudio que no están en el boletín oficial (locales que propuso la IA y confirmó, o días propios). No cancela nada: cerrar un día es un cierre en cierres_estudio. Solo escribe el servidor (/api/festivos/estudio).';

-- `festivos_abiertos` ya no es solo de festivos oficiales: también sirve para
-- abrir un festivo de esta tabla (POST /api/festivos lo comprueba contra los dos).
comment on table public.festivos_abiertos is
  'Festivos que el estudio decidió abrir («Abrimos igualmente»): oficiales de su zona o de su lista (festivos_estudio). Solo escribe el servidor (/api/festivos), tras comprobar la fecha.';

alter table public.festivos_estudio enable row level security;

-- Lectura: quien puede cerrar el centro (PROPIETARIO, MANAGER), en su estudio.
-- Mismo criterio que `festivos_abiertos` y `cierres_estudio`: lo que se decide
-- con un festivo es abrir o cerrar.
create policy festivos_estudio_lectura on public.festivos_estudio
  for select to authenticated
  using (studio_id = (select public.current_studio_id()) and (select public.puede_gestionar_sede()));

-- Verificación en dos pasos del equipo (tentare-os): restrictiva en cada tabla nueva.
create policy exige_doble_factor on public.festivos_estudio as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()));

-- Sin escritura desde el navegador.
revoke all on public.festivos_estudio from anon, authenticated;
grant select on public.festivos_estudio to authenticated;
grant all on public.festivos_estudio to service_role;
