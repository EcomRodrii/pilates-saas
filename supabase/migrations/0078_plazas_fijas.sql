-- F2 · Paso 4a — Plaza fija semanal: tabla + exclusión anti-solape (informe B2.2).
--
-- Anclaje por SLOT (dia_semana + hora_inicio local + sala), no por serie_id
-- (verificado: 0/56 sesiones tienen serie_id en prod). La materialización
-- (pg_cron, PR 4b) creará reservas normales para las sesiones futuras que encajen.
-- Esta migración sólo crea la tabla + la protección anti-solape; nada la consume
-- todavía (capa de datos lista para 4b/4c).

create table if not exists public.plazas_fijas (
  id             text primary key,
  studio_id      text not null references public.studios(id),
  socio_id       text not null references public.socios(id),
  dia_semana     smallint not null,   -- 0=domingo … 6=sábado (= extract(dow), hora local)
  hora_inicio    time not null,       -- hora local del estudio
  sala_id        text not null references public.salas(id),
  tipo_clase_id  text references public.tipos_clase(id),  -- opcional: acota a un tipo
  spot_id        text references public.spots(id),        -- "tu reformer" (opcional)
  vigencia_desde date not null,
  vigencia_hasta date,                 -- null = indefinida
  estado         text not null default 'ACTIVA',   -- ACTIVA / PAUSADA / BAJA
  creada_en      timestamptz not null default now()
);

alter table public.plazas_fijas enable row level security;

create policy admin_plazas_fijas on public.plazas_fijas
  for all to authenticated
  using (studio_id = current_studio_id())
  with check (studio_id = current_studio_id());

-- Un sitio no puede estar asignado a dos socias en el MISMO slot semanal con
-- vigencias solapadas. btree_gist (ya activo) permite mezclar `=` con el `&&` del
-- rango; mismo patrón que sesiones_sala_sin_solape. Sólo aplica a plazas ACTIVAS
-- con sitio concreto (sin spot = sitio libre del aforo, no colisiona).
alter table public.plazas_fijas
  add constraint plazas_fijas_spot_sin_solape
  exclude using gist (
    spot_id with =, dia_semana with =, hora_inicio with =,
    daterange(vigencia_desde, vigencia_hasta) with &&
  ) where (spot_id is not null and estado = 'ACTIVA');

-- La materialización barre por estudio + estado + día de la semana.
create index if not exists idx_plazas_fijas_materializar
  on public.plazas_fijas (studio_id, estado, dia_semana);
