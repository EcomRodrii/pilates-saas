-- Segundo paso por correo, La restrictiva `exige_doble_factor` en las dos tablas, y los comentarios.
-- ⚠️ Esta migración se aplicó en producción en SEIS trozos (4-oct-2026), cada uno
-- con su versión y su nombre, y el repo la tenía en un solo fichero
-- (20261003160000_doble_factor_por_correo.sql). Supabase compara VERSIONES: con
-- el fichero único, «Supabase Preview» fallaba («Remote migration versions not
-- found in local migrations directory») y un `db push` la habría vuelto a
-- aplicar entera. Partida el 14-oct-2026 con el SQL EXACTO de cada trozo
-- (`supabase_migrations.schema_migrations.statements`, comprobado por md5).

create policy exige_doble_factor on public.codigos_correo_doble_factor as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()));
create policy exige_doble_factor on public.doble_factor_correo_bloqueos as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()));
comment on column public.sesiones_confiadas.origen is
  '''dispositivo'': confiada al presentar un navegador recordado (vale mientras no caduque). ''correo'': pasó el código enviado al correo (vale lo que viva la sesión).';
comment on table public.codigos_correo_doble_factor is
  'El código vivo del segundo paso por correo de cada sesión (uno por sesión: pedir otro lo sustituye). Solo servidor.';
comment on column public.codigos_correo_doble_factor.codigo_hash is
  'HMAC-SHA256 con un secreto del servidor sobre cuenta, sesión y código. El código nunca se guarda: sin el secreto, un volcado no lo saca por fuerza bruta.';
comment on table public.doble_factor_correo_bloqueos is
  'Cuentas que cambiaron la contraseña o el correo y aún no han pasado la app de autenticación (aal2): hasta entonces el segundo paso no puede ser por correo. Solo servidor.';
