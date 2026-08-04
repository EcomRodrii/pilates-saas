-- Fila 14 del informe estratégico (P1, Impacto 4/Dificultad 1 según el
-- informe — subestimada: no había NINGÚN rastro de un intento de reserva
-- fallido en el sistema, a diferencia de "margen por clase"/"citas", que
-- solo leían datos ya existentes). "Intentos de reserva fallidos como señal
-- de riesgo máximo: es la alumna que quería pagar y no pudo."
--
-- Solo instrumenta el camino self-service (crearReservaPublica) — un fallo
-- en el panel de recepción (dbReservarPlaza) es fricción de mostrador con
-- alguien delante para resolverlo, no "se fue enfadada sin que nadie se
-- enterara". No incluye YA_RESERVADA/sesión no encontrada/cancelada/ya
-- empezada: ruido técnico (doble clic, enlace caducado), no intención
-- frustrada.
create table if not exists public.intentos_reserva_fallidos (
  id text primary key,
  studio_id text not null references public.studios(id) on delete cascade,
  socio_id text not null references public.socios(id) on delete cascade,
  sesion_id text references public.sesiones(id) on delete set null,
  tipo_clase_id text references public.tipos_clase(id) on delete set null,
  motivo text not null check (motivo in (
    'AFORO_LLENO_SIN_ESPERA', 'SIN_PLAN', 'PLAN_NO_INCLUYE_TIPO',
    'FUERA_VENTANA_MINIMA', 'FUERA_VENTANA_MAXIMA',
    'LIMITE_SEMANAL', 'MAX_SIMULTANEAS'
  )),
  creado_en timestamptz not null default now()
);

create index if not exists idx_intentos_reserva_fallidos_socio
  on public.intentos_reserva_fallidos (socio_id, creado_en desc);
create index if not exists idx_intentos_reserva_fallidos_studio
  on public.intentos_reserva_fallidos (studio_id, creado_en desc);

comment on table public.intentos_reserva_fallidos is
  'Fila 14 del informe estratégico: intento de reserva self-service que el servidor rechazó de verdad (no lista de espera, que sí se persiste como reserva). Alimenta la señal de riesgo de RETENCION/ONBOARDING — nunca escrita por authenticated/anon.';

alter table public.intentos_reserva_fallidos enable row level security;

-- Mismo criterio que penalizaciones/recibos: solo quien puede mover dinero
-- lee (es una señal comercial/de riesgo, no de calendario). Sin policy de
-- escritura para authenticated/anon: solo crearReservaPublica, vía
-- service-role, inserta aquí — igual que el resto de tablas de detección.
create policy intentos_reserva_fallidos_lectura on public.intentos_reserva_fallidos
  for select to authenticated
  using (
    studio_id = public.current_studio_id()
    and public.current_rol() in ('PROPIETARIO', 'RECEPCION', 'MANAGER')
  );
