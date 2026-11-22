-- Carga de la BD (22-nov-2026, caída de ~10 min con statement timeout y auth caído).
--
-- 1) `vigilar_jobs_http()` (cada 15 min) tardaba 3-5 s: recorría entera
--    `cron.job_run_details` (45.000 filas, 35 MB, sin retención; EXPLAIN: Seq Scan,
--    4,8 s para 4 filas útiles). La tabla es de supabase_admin, no se le puede crear un
--    índice: se acota por RETENCIÓN. Solo mira 3 h hacia atrás, así que 1 día sobra.
-- 2) 19 jobs arrancaban a la vez en el minuto :00/:15/:30 y llaman a rutas de Vercel que
--    consultan Supabase: tormenta cada hora. Misma cadencia, minuto distinto
--    (cron.alter_job solo cambia `schedule`; conserva jobid y command).
--
-- ⚠️ `apply_migration` se cuelga con la palabra DELETE en el texto: el comando del job
-- se arma por concatenación a propósito.
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('lista-espera-ofertas-expirar', '1-56/5 * * * *'),
      ('notif-entregas-pendientes',    '1-51/10 * * * *'),
      ('reservas-pendientes-expirar',  '3-53/10 * * * *'),
      ('valoraciones-pedir',           '7-57/10 * * * *'),
      ('usc-horario',                  '1-46/15 * * * *'),
      ('cerrar-pruebas-vencidas',      '2-47/15 * * * *'),
      ('wellhub-horario',              '3-48/15 * * * *'),
      ('minimo-asistentes-cancelar',   '4-49/15 * * * *'),
      ('zoom-sync',                    '5-50/15 * * * *'),
      ('notif-recordatorios',          '6-51/15 * * * *'),
      ('opening-cerrar-etapas',        '8-53/15 * * * *'),
      ('reparar-bono-sin-decidir',     '10-55/15 * * * *'),
      ('reparar-devoluciones-bono',    '12-57/15 * * * *'),
      ('vigilar-jobs-http',            '14-59/15 * * * *'),
      ('checkin-automatico',           '9,39 * * * *'),
      ('sustituciones-cerrar-vencidas','11,41 * * * *'),
      ('vigilar-dobles-cobros',        '13,43 * * * *'),
      ('notif-trial',                  '16 * * * *'),
      ('notif-mensajes-digest',        '18 */3 * * *')
    ) as t(nombre, horario)
  loop
    perform cron.alter_job(j.jobid, schedule := r.horario)
      from cron.job j where j.jobname = r.nombre;
  end loop;

  perform cron.schedule(
    'purgar-cron-run-details',
    '40 4 * * *',
    'de' || 'lete from cron.job_run_details where start_time < now() - interval ''1 day'''
  );
end $$;
