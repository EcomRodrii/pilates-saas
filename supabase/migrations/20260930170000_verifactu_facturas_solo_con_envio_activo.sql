-- Tentare solo emite facturas para un estudio que ya funciona como VERI*FACTU.
--
-- Por qué (30-sep-2026): la declaración responsable dice que Tentare «solo puede
-- funcionar exclusivamente como VERI*FACTU» (Orden HAC/1177/2024, art. 15.1.e;
-- campo `TipoUsoPosibleSoloVerifactu` = S). Hasta hoy un estudio podía encender
-- «Emitir facturas» antes de que Tentare activara su envío a la AEAT, y durante
-- ese tiempo Tentare generaba facturas con su registro SIN remitirlas: ni
-- VERI*FACTU (no hay envío) ni la otra modalidad (exige firmar cada registro, y
-- Tentare no firma). Con eso, la declaración no diría la verdad.
--
-- La regla, en la base de datos y no en la pantalla:
--   · `modo_facturacion = 'verifactu'` solo con el envío activado alguna vez
--     (`verifactu_estudios.activado_produccion_en`, que fija la PRIMERA
--     activación y no se mueve). `reservar_numero_factura` ya rechaza la serie A
--     fuera de 'verifactu', así que con esto ninguna factura nueva nace sin envío.
--   · Una vez activado, una pausa o una suspensión NO para las facturas: es una
--     incidencia, los registros se generan y se envían al volver (FAQ de la AEAT
--     sobre incidencias; art. 17.2: el funcionamiento como VERI*FACTU se mantiene
--     hasta el 31 de diciembre del último año en que se funcionó así).
--   · Al activar el envío por primera vez, el estudio empieza a emitir: el alta
--     (datos fiscales + poder IZ860 + mandato) ya es la decisión de usarlo.
--
-- ⚠️ Fuera a propósito: la serie R. Una rectificativa de una factura ya entregada
-- se sigue pudiendo emitir, como hasta ahora: una factura entregada tiene que
-- poder corregirse. Solo afecta a las facturas emitidas antes de esta regla, que
-- esperan criterio escrito (ver la barrera de activación).

-- ── 1. Los estudios que emiten sin envío activo dejan de emitir ─────────────
-- Sus facturas ya emitidas no se tocan (ni la cadena ni los registros).
-- ⚠️ Avisar a cada estudio afectado ANTES de aplicar esto: sus cobros pasan a
-- dar justificante y sus facturas las hace fuera hasta que se active su envío.
update public.studios s
   set modo_facturacion = 'sin_facturas'
 where s.modo_facturacion = 'verifactu'
   and not exists (
     select 1 from public.verifactu_estudios v
      where v.studio_id = s.id and v.activado_produccion_en is not null
   );

-- ── 2. La invariante ────────────────────────────────────────────────────────
-- Solo al PASAR a 'verifactu' (o al nacer con él): una actualización de otra
-- columna del estudio no tiene por qué volver a comprobarlo.
create or replace function public.studios_facturas_exigen_envio_activo()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.modo_facturacion = 'verifactu'
     and (tg_op = 'INSERT' or old.modo_facturacion is distinct from 'verifactu')
     and not exists (
       select 1 from verifactu_estudios v
        where v.studio_id = new.id and v.activado_produccion_en is not null
     ) then
    raise exception 'VERIFACTU_SIN_ACTIVAR: Tentare solo emite facturas cuando el envío a la AEAT de este estudio está activo'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_studios_facturas_exigen_envio_activo on public.studios;
create trigger trg_studios_facturas_exigen_envio_activo
  before insert or update of modo_facturacion on public.studios
  for each row execute function public.studios_facturas_exigen_envio_activo();

-- ── 3. La primera activación enciende las facturas ─────────────────────────
-- Solo la PRIMERA (NULL → fecha): si el estudio dejó de emitir después, una
-- reactivación tras una pausa no se lo vuelve a encender.
create or replace function public.verifactu_activacion_enciende_facturas()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if old.activado_produccion_en is null and new.activado_produccion_en is not null then
    update studios
       set modo_facturacion = 'verifactu'
     where id = new.studio_id
       and modo_facturacion is distinct from 'verifactu';
  end if;
  return null;
end;
$$;

drop trigger if exists trg_verifactu_activacion_enciende_facturas on public.verifactu_estudios;
create trigger trg_verifactu_activacion_enciende_facturas
  after update of activado_produccion_en on public.verifactu_estudios
  for each row execute function public.verifactu_activacion_enciende_facturas();

-- Funciones de trigger: nadie las llama como RPC. Sin EXECUTE para nadie del
-- cliente (el ACL por defecto de este proyecto las da directas a anon y
-- authenticated; revocar PUBLIC no basta).
revoke execute on function public.studios_facturas_exigen_envio_activo() from public, anon, authenticated;
revoke execute on function public.verifactu_activacion_enciende_facturas() from public, anon, authenticated;

-- ── Verificación ─────────────────────────────────────────────────────────────
do $$
declare
  n int;
begin
  select count(*) into n
    from public.studios s
   where s.modo_facturacion = 'verifactu'
     and not exists (select 1 from public.verifactu_estudios v where v.studio_id = s.id and v.activado_produccion_en is not null);
  if n > 0 then raise exception 'quedan % estudios emitiendo sin envío activo', n; end if;

  if has_function_privilege('anon', 'public.studios_facturas_exigen_envio_activo()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.studios_facturas_exigen_envio_activo()', 'EXECUTE')
     or has_function_privilege('anon', 'public.verifactu_activacion_enciende_facturas()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.verifactu_activacion_enciende_facturas()', 'EXECUTE') then
    raise exception 'una función de trigger nueva es ejecutable desde el cliente';
  end if;
end $$;
