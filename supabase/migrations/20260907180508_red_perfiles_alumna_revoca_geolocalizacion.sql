-- Auditoría 26ª pasada, P-6. Decisión de producto explícita del fundador: el
-- directorio de alumnas de red_perfiles_alumna ES global por diseño (la
-- policy de lectura, que solo exige pertenecer a algún estudio sin comparar
-- studio_id, es correcta y no se toca). Lo que sobraba era el GRANT de las
-- columnas lat/lng: hoy no hay ningún endpoint que las lea (el único
-- consumidor, app/api/auth/destino-post-login/route.ts, pide solo `estado`,
-- vía service-role), pero un `select('*')` futuro al construir el directorio
-- de verdad las filtraría sin que nadie se diera cuenta. `ciudad`/`zona` ya
-- existen en la misma tabla para un "cerca de ti" aproximado sin coordenadas
-- exactas.
--
-- REVOKE a secas NO basta aquí: `authenticated` tenía SELECT de TABLA
-- completa, así que un REVOKE de columna a secas sería un no-op silencioso
-- (mismo gotcha ya documentado: revoke-columna-no-resta-de-grant-tabla.md).
-- Se revoca la tabla entera y se regrant explícito columna a columna, sin
-- lat/lng — fail-closed para cualquier columna sensible que se añada después.
revoke select on public.red_perfiles_alumna from authenticated;
grant select (id, auth_user_id, nombre, foto_url, ciudad, zona, intereses, disponibilidad_horarios, estado, creado_en, actualizado_en)
  on public.red_perfiles_alumna to authenticated;
