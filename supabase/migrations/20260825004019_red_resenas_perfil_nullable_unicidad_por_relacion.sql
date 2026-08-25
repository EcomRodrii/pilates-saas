-- Reseñas de alumna sobre un ESTUDIO (sin instructora concreta) no tienen
-- perfil_id natural (red_perfiles solo tiene instructoras). Y el unique
-- (studio_id, perfil_id) era GLOBAL: pensado para "una relación validada
-- estudio->instructora, una reseña", pero del lado alumna varias alumnas
-- distintas deben poder reseñar a la MISMA instructora en el MISMO estudio,
-- cada una con su propia relación (solicitud_id o reserva_id).
-- Verificado: red_resenas tiene 0 filas en producción, sin riesgo de dato.

alter table public.red_resenas alter column perfil_id drop not null;

alter table public.red_resenas drop constraint red_resenas_studio_id_perfil_id_key;

-- Una relación validada (una solicitud aceptada, o una reserva real) da
-- derecho a exactamente una reseña; relaciones distintas no colisionan
-- aunque compartan studio_id+perfil_id.
create unique index red_resenas_una_por_solicitud on public.red_resenas (solicitud_id) where solicitud_id is not null;
create unique index red_resenas_una_por_reserva on public.red_resenas (reserva_id) where reserva_id is not null;

-- perfil_id es obligatorio cuando la reseña viene de una solicitud (siempre
-- es sobre una instructora concreta), opcional cuando viene de una reserva
-- (puede ser sobre el estudio en general, o sobre una instructora si
-- perfil_id también se rellena).
alter table public.red_resenas
  add constraint red_resenas_perfil_obligatorio_si_solicitud
  check (solicitud_id is null or perfil_id is not null);
