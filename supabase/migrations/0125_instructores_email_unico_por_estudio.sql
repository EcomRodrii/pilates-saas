-- Un email, una ficha por estudio.
--
-- Cierra la vía que quedaba abierta tras la 0124. Aquella impide que el
-- self-claim ascienda de rol, pero no impide fabricar la ficha que se reclama:
-- un MANAGER puede dar de alta a alguien con rol INSTRUCTOR o RECEPCION
-- (rolesQuePuedeAsignar('MANAGER') lo permite, y así debe ser) usando SU PROPIO
-- email, que ya tiene una ficha. Sin este índice nada lo impedía, y esa segunda
-- ficha era el cebo del ataque.
--
-- Aparte de la seguridad, es la regla de negocio que la app ya daba por hecha:
-- el mensaje de error de POST /api/equipo lleva escrito desde hace tiempo
-- «Revisa que el email no esté ya en uso», y el self-claim resuelve la ficha
-- por email (email = auth.jwt() ->> 'email'), así que dos fichas con el mismo
-- email en el mismo estudio ya eran ambiguas por diseño.
--
-- Decisiones:
--  · lower(): los emails no distinguen mayúsculas y Supabase los normaliza en
--    auth.users, así que 'Ana@x.com' y 'ana@x.com' son la misma persona. Sin
--    lower() bastaría cambiar una letra para volver a fabricar el cebo.
--    (El endpoint ya hace trim y convierte '' en null.)
--  · WHERE email is not null: hay fichas sin email (personal que no entra al
--    panel). En un índice único los NULL son distintos entre sí, así que el
--    parcial no es imprescindible — pero deja explícito que esas filas quedan
--    fuera a propósito, y mantiene el índice más pequeño.
--  · Incluye las fichas INACTIVAS a propósito. Si alguien se da de baja y vuelve,
--    lo correcto es reactivar su ficha (conserva su historial de clases y
--    valoraciones), no crear una segunda. El alta fallará con el mensaje de
--    arriba, que es exactamente lo que hay que hacer.
--
-- Verificado antes de aplicar: 0 colisiones en producción, ni exactas ni por
-- mayúsculas (18 fichas, 4 sin email, 0 vacías, 0 con espacios).

create unique index instructores_email_unico_por_estudio
  on public.instructores (studio_id, lower(email))
  where email is not null;
