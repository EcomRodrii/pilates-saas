-- ─────────────────────────────────────────────────────────────────────────────
-- Opening OS · «Abrimos mañana».
--
-- Si la propietaria lo enciende, el día antes de la fecha de apertura sale un
-- aviso (push + email, evento OPENING_ABRIMOS) a cada socia con una cuota
-- activa de un plan de etapa de lanzamiento. Apagado por defecto: nada masivo
-- sin su visto bueno. Va dentro del barrido horario que ya existe
-- (lib/opening/alertas-cron.ts), sin cron ni job nuevo.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.opening_config add column if not exists avisar_abrimos boolean not null default false;
