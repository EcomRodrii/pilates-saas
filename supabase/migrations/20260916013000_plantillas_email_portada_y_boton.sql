-- Tres cosas que la propietaria podía ver en sus correos y no podía cambiar:
-- la foto de portada, si ese correo lleva foto, y a dónde va el botón.
--
-- Hasta ahora la portada salía SIEMPRE de `studios.imagen_bienvenida_url` (la
-- misma que ve la alumna al abrir su app) o, sin ella, de la del producto. Es
-- un buen valor por defecto y se mantiene: estas columnas son un override por
-- plantilla, igual que `logo_url` o `color_cabecera`, y NULL sigue queriendo
-- decir «lo de siempre» en cada una por separado.
alter table public.plantillas_email
  add column if not exists portada_url text,
  add column if not exists mostrar_portada boolean,
  add column if not exists boton_url text;

comment on column public.plantillas_email.portada_url is
  'Foto de portada SOLO para este correo. NULL = la portada de la app del estudio, y sin ella la del producto.';
comment on column public.plantillas_email.mostrar_portada is
  'true/false = la propietaria decide si este correo lleva foto. NULL = lo que decida la plantilla (la reserva sí, la cancelacion no).';
comment on column public.plantillas_email.boton_url is
  'A donde lleva el boton de este correo. NULL = el destino de siempre (su app, la pagina de valoracion...).';

-- ⚠️ El destino del botón lo escribe el navegador, así que se acota en la BASE
-- y no solo en el formulario: el correo lo firma la dirección verificada de la
-- plataforma, y un `javascript:` o un `data:` ahí sería un enlace ejecutable
-- con nuestra cara. `lib/emails/estudio/plantilla.ts` vuelve a comprobarlo al
-- pintar (un destino rechazado se queda en `#`), pero eso es defensa en
-- profundidad, no la cerradura.
alter table public.plantillas_email
  drop constraint if exists plantillas_email_boton_url_http;
alter table public.plantillas_email
  add constraint plantillas_email_boton_url_http
  check (boton_url is null or boton_url ~* '^https?://[^[:space:]]+$');

-- Misma acotación para las dos imágenes: una URL de imagen en un correo solo
-- puede ser http(s). Un `data:` además metería el peso del archivo dentro del
-- propio correo, que es la forma más rápida de cruzar el recorte de Gmail.
alter table public.plantillas_email
  drop constraint if exists plantillas_email_portada_url_http;
alter table public.plantillas_email
  add constraint plantillas_email_portada_url_http
  check (portada_url is null or portada_url ~* '^https?://[^[:space:]]+$');

-- ⚠️ `logo_url` se queda SIN CHECK a propósito, aunque tenga el mismo problema.
-- Un `add constraint ... check` valida las filas que ya existen, y si algún
-- estudio guardó ahí una ruta relativa la migración entera falla al aplicarse.
-- Las columnas nuevas no tienen ese riesgo porque nacen vacías. Acotar
-- `logo_url` es una limpieza aparte, con su barrido previo.

-- Sin política ni grant nuevos, por el mismo motivo que la migración de
-- `enviar` (20260907121459): `plantillas_email` tiene una única policy FOR ALL
-- acotada a PROPIETARIO + su studio_id, y los GRANT de authenticated /
-- service_role son de TABLA, no por columna — una columna nueva los hereda.
