-- Tentare Network 2.0, Fase 0 (esquema). Prepara `red_resenas` para que una
-- reseña pueda venir de una ALUMNA sobre un estudio (vía una reserva real
-- suya), no solo del estudio sobre una instructora (vía solicitud de
-- contacto aceptada, 20260813183513). Solo esquema en esta migración: sin
-- endpoint, RPC, ni política RLS de INSERT nueva para reserva_id — eso es
-- Fase 3. red_resenas ya no tiene RLS de INSERT para `authenticated` (todo
-- pasa por API con service-role), así que este gate no necesita tocar
-- policies.
--
-- Verificado antes de aplicar: red_resenas está vacía en producción
-- (0 filas), así que no hay fila existente con solicitud_id NULL que
-- pudiera romper el CHECK nuevo.

alter table public.red_resenas
  add column reserva_id text references public.reservas(id) on delete cascade,
  alter column solicitud_id drop not null;

alter table public.red_resenas
  add constraint red_resenas_gate_unico
  check ((solicitud_id is not null) <> (reserva_id is not null));

comment on constraint red_resenas_gate_unico on public.red_resenas is
  'Una reseña viene de exactamente una relación validada: solicitud de contacto aceptada (instructora) O una reserva real (alumna), nunca ninguna o ambas.';
