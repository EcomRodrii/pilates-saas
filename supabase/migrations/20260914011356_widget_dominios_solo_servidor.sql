-- 20260914011356 · TENTARE — los dominios autorizados del widget dejan de ser
-- escribibles desde el navegador.
--
-- Auditoría RGPD/seguridad 2026-09-13 (A-1; control C02).
--
-- `studios.widget_dominios_autorizados` decide desde qué webs el navegador de
-- una visitante puede leer las respuestas de los endpoints del widget (CORS,
-- lib/cors-widget.ts). Se escribía con un UPDATE directo del cliente, sin
-- validar formato: nada impedía guardar `null` (casa con iframes sandbox y
-- `file://`) o un `http://` sin TLS.
--
-- Escritor legítimo después de esto: /api/estudio/widget-dominios (service-role,
-- solo PROPIETARIA, valida formato en lib/widget/dominios-autorizados.ts y deja
-- constancia en actividad_reciente).
--
-- 1) UPDATE: `authenticated` tiene UPDATE por COLUMNAS sobre `studios`
--    (20260910171150), así que aquí el REVOKE por columna SÍ resta.
-- 2) INSERT (alta desde el cliente, grant de TABLA) y cualquier concesión futura
--    de UPDATE: un trigger con el mismo patrón que
--    `studios_cuenta_cobro_solo_servidor` (20260913131051) — si no llama el
--    servidor (`public.es_llamada_servicio()`, 20260913233644; nunca «uid
--    nulo»), el INSERT arranca sin dominios y un UPDATE que los cambie falla.

revoke update (widget_dominios_autorizados) on public.studios from authenticated;
revoke update (widget_dominios_autorizados) on public.studios from anon;

create or replace function public.studios_widget_dominios_solo_servidor()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Rama de servidor: quién llama (service_role o sesión de administración),
  -- no «no hay usuario» (20260913233644, public.es_llamada_servicio()).
  if public.es_llamada_servicio() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.widget_dominios_autorizados := '{}'::text[];
    return new;
  end if;

  if new.widget_dominios_autorizados is distinct from old.widget_dominios_autorizados then
    raise exception 'studios_widget_dominios_solo_servidor: los dominios del widget se cambian desde Configuración'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function public.studios_widget_dominios_solo_servidor() from public, anon, authenticated;
grant execute on function public.studios_widget_dominios_solo_servidor() to service_role;

-- Nombre elegido para disparar después de los triggers existentes (orden alfabético).
drop trigger if exists trg_studios_widget_dominios_solo_servidor on public.studios;
create trigger trg_studios_widget_dominios_solo_servidor
  before insert or update on public.studios
  for each row execute function public.studios_widget_dominios_solo_servidor();

comment on function public.studios_widget_dominios_solo_servidor() is
  'Petición de usuario: INSERT arranca sin dominios del widget; UPDATE que los cambie falla. Service-role sin cambios.';

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN tras aplicar (solo lectura):
--
-- select has_column_privilege('authenticated', 'public.studios', 'widget_dominios_autorizados', 'UPDATE'), -- false
--        has_column_privilege('anon',          'public.studios', 'widget_dominios_autorizados', 'UPDATE'), -- false
--        has_column_privilege('service_role',  'public.studios', 'widget_dominios_autorizados', 'UPDATE'), -- true
--        has_column_privilege('authenticated', 'public.studios', 'nombre', 'UPDATE');                      -- true (resto intacto)
-- select has_function_privilege('authenticated', 'public.studios_widget_dominios_solo_servidor()', 'EXECUTE'); -- false
-- ─────────────────────────────────────────────────────────────────────────────
