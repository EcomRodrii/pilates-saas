-- El estudio decide si quiere pedir por correo la valoración de cada clase.
-- Por defecto conserva el comportamiento actual; los avisos dentro de la app
-- no dependen de este ajuste.
alter table public.studios
  add column if not exists pedir_valoracion_por_email boolean not null default true;

comment on column public.studios.pedir_valoracion_por_email is
  'Si true, el correo automático invita a valorar cada clase asistida. Apagado solo afecta esos emails, no los avisos de la app.';

grant update (pedir_valoracion_por_email) on public.studios to authenticated;
