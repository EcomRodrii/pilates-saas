-- «Abrimos igualmente»: el estudio decide abrir un festivo oficial que tiene
-- clases, y el aviso de la bandeja no vuelve a preguntar por ese día.
--
-- La decisión contraria («Cerrar ese día») no necesita tabla: es un cierre de
-- un día en `cierres_estudio`, por la misma puerta que «Cerrar el centro».
--
-- Por qué una tabla y no otra cosa: un cierre bloquearía las reservas de ese
-- día; una columna de `studios` no guarda una lista; localStorage es por
-- dispositivo (la propietaria y la gerente verían el aviso dos veces).
--
-- ⚠️ Escrita el 12-oct-2026 y SIN APLICAR (encargo del fundador: ninguna
-- migración a producción). Mientras no exista la tabla, el aviso de festivos
-- no sale (lib/festivos/por-decidir-servidor.ts lo detecta con
-- esTablaQueFalta): un aviso que solo se pudiera quitar cerrando empujaría a
-- cerrar. Al aplicarla, renombrar este fichero a la versión que le ponga
-- `apply_migration` y cruzar por NOMBRE (ver .claude/tentare-os.md).

create table if not exists public.festivos_abiertos (
  studio_id text not null references public.studios(id) on delete cascade,
  fecha date not null,
  -- El festivo tal como se enseñó, para leer el histórico sin la tabla del código.
  nombre text not null,
  decidido_por uuid,
  decidido_en timestamptz not null default now(),
  -- Un festivo se decide una vez por estudio: el segundo «abrimos» no duplica.
  primary key (studio_id, fecha)
);

comment on table public.festivos_abiertos is
  'Festivos oficiales que el estudio decidió abrir («Abrimos igualmente»). Solo escribe el servidor (/api/festivos), tras comprobar que la fecha es un festivo de su zona.';

alter table public.festivos_abiertos enable row level security;

-- Lectura: quien puede cerrar el centro (PROPIETARIO, MANAGER), en su estudio.
-- Abrir es la decisión contraria sobre lo mismo. Hoy nadie la lee desde el
-- navegador (todo pasa por el servidor); «Repetir este mes», que también usa
-- recepción, recibe del servidor qué festivos se abren: son fechas oficiales,
-- no un dato sensible, y recepción ya ve el calendario.
create policy festivos_abiertos_lectura on public.festivos_abiertos
  for select to authenticated
  using (studio_id = (select public.current_studio_id()) and (select public.puede_gestionar_sede()));

-- Verificación en dos pasos del equipo (tentare-os): restrictiva en cada tabla nueva.
create policy exige_doble_factor on public.festivos_abiertos as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()));

-- Sin escritura desde el navegador: la fecha hay que comprobarla en el servidor.
revoke all on public.festivos_abiertos from anon, authenticated;
grant select on public.festivos_abiertos to authenticated;
grant all on public.festivos_abiertos to service_role;
