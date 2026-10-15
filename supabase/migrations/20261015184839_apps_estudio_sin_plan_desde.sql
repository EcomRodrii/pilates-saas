-- La app de un estudio que deja de pagar Estudio/Cadena (o baja a Founding): 30 días de margen con
-- aviso a la propietaria y, después, se pausa y se retira de la App Store (decisión del fundador,
-- 15-oct-2026). Esta columna es el reloj de ese margen; lo mueve SOLO el servidor
-- (lib/app-nativa/apps-sin-plan.ts, desde el cron horario `notif-trial`). La tabla sigue cerrada al
-- navegador (sin GRANT a anon/authenticated).
alter table public.apps_estudio add column if not exists sin_plan_desde timestamptz;
comment on column public.apps_estudio.sin_plan_desde is 'Desde cuándo el dueño de la app ya no tiene Estudio/Cadena pagado. A los 30 días se pausa y se retira de la App Store (lib/app-nativa/apps-sin-plan.ts). NULL = paga.';
