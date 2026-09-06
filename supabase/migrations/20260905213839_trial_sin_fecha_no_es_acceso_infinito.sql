-- Un 'trialing' NUESTRO sin fecha de fin era acceso gratis para siempre.
--
-- `cerrar_pruebas_vencidas()` filtraba `trial_ends_at is not null`, así que una
-- fila sin fecha le era invisible; y `estadoTrial()` contestaba «SIN_PRUEBA —
-- que decida la suscripción», siendo la suscripción ese mismo 'trialing'.
-- Nadie cerraba. Visto en producción el 2026-09-05: un estudio con 35 días de
-- plan CADENA sin pagar y sin nada que fuera a terminarlo.
--
-- Se arregla por los dos lados: la derivación en TS deja de dar acceso a esa
-- combinación (lib/billing/trial.ts), y aquí se repara el dato para que ningún
-- estudio se quede fuera de golpe cuando ese código llegue a producción.

-- ── A. Reparación puntual de lo que ya existe ────────────────────────────────
-- Margen de 7 días desde HOY, no `creado_en + 7`, que para estos ya está
-- pasado: cortarle el acceso de golpe a un estudio que lleva semanas entrando
-- con normalidad —y que no hizo nada mal— sería cobrarle nuestro fallo a él.
-- Con fecha puesta entra en el circuito normal y recibe los avisos de
-- `trial-avisos-cron` antes de que expire.
update public.studios
   set trial_ends_at = now() + interval '7 days',
       current_period_end = now() + interval '7 days'
 where subscription_status = 'trialing'
   and subscription_id is null
   and trial_ends_at is null;

-- ── B. Que no vuelva a quedarse una fila sin cerrar ──────────────────────────
-- El barrido pasa a REPARAR además de cerrar. Aquí sí con `creado_en + 7`, la
-- fecha que le habría tocado: la excepción de arriba es una decisión de
-- producto puntual, y dejarla como regla permanente sería regalar una semana
-- cada vez que aparezca una fila incoherente.
--
-- Es idempotente: en cuanto la fila tiene fecha deja de casar con el UPDATE de
-- reparación, así que nadie encadena prórrogas.
--
-- Sin cambio de firma: `CREATE OR REPLACE` no crea objeto función nuevo y los
-- grants se mantienen.
create or replace function public.cerrar_pruebas_vencidas()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_cerradas integer;
begin
  -- Reparar: 'trialing' nuestro sin fecha de fin no puede quedarse así.
  update public.studios
     set trial_ends_at = creado_en + interval '7 days',
         current_period_end = coalesce(current_period_end, creado_en + interval '7 days')
   where subscription_status = 'trialing'
     and subscription_id is null
     and trial_ends_at is null;

  -- Cerrar: lo de siempre, que ahora ya alcanza también a las reparadas.
  update public.studios
     set subscription_status = 'trial_expirado'
   where trial_ends_at is not null
     and trial_ends_at < now()
     and subscription_status = 'trialing'
     and subscription_id is null;
  get diagnostics v_cerradas = row_count;
  return v_cerradas;
end;
$function$;
