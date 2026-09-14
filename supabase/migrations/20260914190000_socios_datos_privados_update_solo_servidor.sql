-- Datos privados de la socia: el navegador ya no los ESCRIBE.
--
-- El cierre de M1 (20260914080445 / 20260914091149) quitó la LECTURA de estas
-- columnas a `authenticated`, pero dejó el UPDATE por columna porque el
-- formulario de la ficha guardaba el NIF con la sesión del navegador. El trigger
-- `socios_guarda_datos_privados` lo acota a PROPIETARIO y RECEPCION; aun así,
-- esos dos roles podían reescribir desde el cliente los identificadores de pago
-- o la prueba de aceptación del contrato de cualquier socia de su estudio.
--
-- Quién escribe cada cosa a partir de aquí:
--  · NIF → PUT /api/socios/[id]/nif (rol comprobado en servidor).
--  · Pago, tarjeta y SEPA → webhooks y crons, con service_role. Tampoco en el
--    alta: el panel nunca tuvo un valor real que mandar ahí.
--  · Aceptación del contrato → la RPC `aceptacion_contrato_registrar` (definer),
--    vía /api/socios/[id]/aceptacion-contrato y /api/public/socio.
--  · Dirección y fecha de nacimiento → ya solo desde servidor (portal, importador).
--
-- ⚠️ Revocar por COLUMNA solo resta si el rol no tiene el privilegio de TABLA. En
-- `socios` no lo tiene (`authenticated=dm`); el bloque de abajo lo comprueba en
-- vez de suponerlo.
-- El INSERT de NIF, dirección, nacimiento y firma se queda: el alta de mostrador
-- los escribe, y el trigger ya lo limita por rol (el bloque comprueba que sigue
-- ahí y encendido).

revoke update (
  nif, direccion, fecha_nacimiento,
  tarjeta_marca, tarjeta_ultimos4, tarjeta_exp_mes, tarjeta_exp_anio,
  stripe_customer_id, stripe_payment_method_id,
  sepa_mandate_id, sepa_payment_method_id,
  aceptacion_firma, aceptacion_fecha, aceptacion_version, aceptacion_origen, aceptacion_por
) on public.socios from authenticated;

revoke insert (
  tarjeta_marca, tarjeta_ultimos4, tarjeta_exp_mes, tarjeta_exp_anio,
  stripe_customer_id, stripe_payment_method_id,
  sepa_mandate_id, sepa_payment_method_id
) on public.socios from authenticated;

do $$
declare
  c text;
  v_solo_servidor text[] := array[
    'nif', 'direccion', 'fecha_nacimiento',
    'tarjeta_marca', 'tarjeta_ultimos4', 'tarjeta_exp_mes', 'tarjeta_exp_anio',
    'stripe_customer_id', 'stripe_payment_method_id',
    'sepa_mandate_id', 'sepa_payment_method_id',
    'aceptacion_firma', 'aceptacion_fecha', 'aceptacion_version', 'aceptacion_origen', 'aceptacion_por'
  ];
  v_pago text[] := array[
    'tarjeta_marca', 'tarjeta_ultimos4', 'tarjeta_exp_mes', 'tarjeta_exp_anio',
    'stripe_customer_id', 'stripe_payment_method_id',
    'sepa_mandate_id', 'sepa_payment_method_id'
  ];
  -- Lo que `dbUpdateSocio` sigue guardando con la sesión del navegador.
  v_panel text[] := array[
    'studio_id', 'nombre', 'apellidos', 'email', 'telefono', 'fecha_alta', 'activo',
    'lead_stage', 'tags', 'avatar', 'metodo_pago_preferido', 'foto_url', 'usuario',
    'referido_por', 'origen_lead', 'campos_extra', 'auth_user_id',
    'consentimiento_marketing_en', 'consentimiento_marketing_texto', 'consentimiento_marketing_por'
  ];
  -- Lo que el alta de mostrador sigue mandando en el INSERT.
  v_alta text[] := array[
    'nif', 'direccion', 'fecha_nacimiento',
    'aceptacion_firma', 'aceptacion_fecha', 'aceptacion_version', 'aceptacion_origen', 'aceptacion_por'
  ];
begin
  if has_table_privilege('authenticated', 'public.socios', 'UPDATE')
     or has_table_privilege('authenticated', 'public.socios', 'INSERT') then
    raise exception 'authenticated tiene UPDATE o INSERT de TABLA en socios: revocar por columna sería un no-op';
  end if;
  foreach c in array v_solo_servidor loop
    if has_column_privilege('authenticated', 'public.socios', c, 'UPDATE') then
      raise exception 'authenticated sigue pudiendo escribir la columna privada %', c;
    end if;
    if has_column_privilege('anon', 'public.socios', c, 'UPDATE') then
      raise exception 'anon puede escribir la columna privada %', c;
    end if;
    if not has_column_privilege('service_role', 'public.socios', c, 'UPDATE') then
      raise exception 'service_role ha perdido el UPDATE de %: el servidor no podría guardarla', c;
    end if;
  end loop;
  foreach c in array v_pago loop
    if has_column_privilege('authenticated', 'public.socios', c, 'INSERT')
       or has_column_privilege('anon', 'public.socios', c, 'INSERT') then
      raise exception 'el navegador sigue pudiendo dar de alta una socia con %', c;
    end if;
    if not has_column_privilege('service_role', 'public.socios', c, 'INSERT') then
      raise exception 'service_role ha perdido el INSERT de %', c;
    end if;
  end loop;
  foreach c in array v_panel loop
    if not has_column_privilege('authenticated', 'public.socios', c, 'UPDATE') then
      raise exception 'authenticated ha perdido el UPDATE de %: la ficha dejaría de guardar', c;
    end if;
  end loop;
  foreach c in array v_alta loop
    if not has_column_privilege('authenticated', 'public.socios', c, 'INSERT') then
      raise exception 'authenticated ha perdido el INSERT de %: el alta de mostrador fallaría', c;
    end if;
  end loop;
  -- El INSERT que queda solo está acotado por rol gracias a este trigger.
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.socios'::regclass
      and tgname = 'trg_socios_guarda_datos_privados'
      and tgenabled <> 'D'
  ) then
    raise exception 'falta (o está desactivado) trg_socios_guarda_datos_privados: el alta quedaría sin control de rol';
  end if;
end $$;
