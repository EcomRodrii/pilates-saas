-- Fase C del constructor de widgets: dónde se ve lo pegado y con qué versión.
-- Solo el ORIGEN de la web (nunca la ruta), solo en widget_loaded y solo para
-- iframe, popup y nativa. Botón y enlace no escriben nada aquí, a propósito:
-- quien llega por un enlace viene de Instagram, de WhatsApp o de un blog
-- personal, y la misma sesión lleva después el socio_id de la socia.
--
-- Quién rellena cada columna (lib/widgets/evento-pegado.ts, en la ruta
-- /api/public/evento):
--   * `forma`: 'incrustado' (iframe) y 'ventana' (popup) las dice la página;
--     'nativa' la pone el servidor, cuando la petición trae `?studioId=` en la
--     URL y una cabecera Origin que no es de Tentare.
--   * `anfitrion`: el origen de la web del estudio (http o https). En la
--     nativa sale de la cabecera Origin; en el resto, del referrer que manda
--     la página. NULL = la web no nos dice su dirección (no-referrer, sandbox).
--   * `firma`: `firmaDeUrl` (lib/widgets/firma-contenido.ts) de lo que cargó.
--     La nativa no la manda.
--
-- Las tres son columnas nullable de una tabla que ya purga a los 13 meses
-- (purgar_datos_caducados) y que ya borra c_borrar: no hace falta tocar la
-- purga, el borrado de estudios ni anonimizar_socio (el anfitrión es la web
-- del estudio, no de una persona). Tampoco grants de columna: la tabla no los
-- tiene y quien escribe es service_role.
alter table public.widget_eventos
  add column anfitrion text,
  add column forma text,
  add column firma text;

-- Los mismos criterios que `origenAnfitrion`, `FORMAS_PEGADAS` y
-- `FIRMA_CONTENIDO_VALIDA` (lib/widgets/pegado.ts). Hay un test que compara
-- este fichero con esas constantes: si divergen, el insert falla y se pierde
-- la visita entera, no solo el anfitrión.
alter table public.widget_eventos
  add constraint widget_eventos_anfitrion_es_origen check (
    anfitrion is null or (length(anfitrion) <= 300
      and anfitrion ~ '^https?://[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]{1,5})?$')),
  add constraint widget_eventos_forma_valida check (
    forma is null or forma in ('incrustado', 'ventana', 'nativa')),
  add constraint widget_eventos_firma_valida check (
    firma is null or firma ~ '^c[0-9][0-9a-z]{1,7}$'),
  add constraint widget_eventos_pegado_solo_al_cargar check (
    (anfitrion is null and forma is null and firma is null)
    or (tipo = 'widget_loaded' and forma is not null));

-- SECURITY INVOKER: la cerradura sigue siendo widget_eventos_lectura
-- (su estudio; PROPIETARIO/MANAGER). A RECEPCION la RLS le devuelve cero
-- filas, y el panel no puede leer eso como «aún no lo vemos»: por eso solo lo
-- pide quien puede ver los resultados.
-- Sin fecha: abarca los 13 meses de la purga.
-- Tope de 200: el anfitrión se puede inflar con curl.
create or replace function public.widget_vistos()
returns table(origen text, forma text, anfitrion text, firma text,
              primero timestamptz, ultimo timestamptz, n bigint)
language sql stable security invoker set search_path = public
as $$
  select e.origen, e.forma, e.anfitrion, e.firma,
         min(e.creado_en), max(e.creado_en), count(*)
  from public.widget_eventos as e
  where e.studio_id = public.current_studio_id()
    and e.tipo = 'widget_loaded'
    and e.forma is not null
    and e.origen is not null
  group by e.origen, e.forma, e.anfitrion, e.firma
  order by max(e.creado_en) desc
  limit 200;
$$;

-- Los tres pasos explícitos: el ACL por defecto de este proyecto da EXECUTE
-- DIRECTO a anon/authenticated/service_role en cada función nueva, así que
-- revocar PUBLIC no le quita nada a anon. Verificar después con
-- has_function_privilege para los tres roles (anon f, authenticated t,
-- service_role t).
revoke all on function public.widget_vistos() from public;
revoke all on function public.widget_vistos() from anon;
grant execute on function public.widget_vistos() to authenticated;
grant execute on function public.widget_vistos() to service_role;
