-- Veri*Factu — sin poder para remitir, Tentare no emite facturas.
--
-- Criterio del fiscalista (30-sep-2026, cuestión 3.6 de la consulta): con el
-- poder revocado o caducado, bloquear las facturas nuevas hasta recuperarlo, porque
-- no es una incidencia técnica y un sistema «solo VERI*FACTU» no puede convertirse
-- en uno que genera registros y no los remite. Una incidencia técnica temporal de
-- la AEAT va aparte: se sigue emitiendo y se remite al restablecerse.
--
-- Por qué: Tentare se declara «solo VERI*FACTU» (Orden HAC/1177/2024, art.
-- 15.1.e), y la nota de transición que propone el fiscalista dice que la
-- versión 1.0.0 «no permite la expedición de facturas cuando no está operativo
-- el mecanismo de remisión automática». La migración 20260930170000 lo cumple
-- para un estudio que NUNCA activó el envío, pero no para uno que lo activó y
-- después pierde el poder: REVOCAR, CADUCAR o cambiar los datos fiscales lo
-- devuelven a pedir autorización y, sin esto, Tentare seguiría emitiendo
-- facturas que no puede remitir.
--
-- Qué distingue (la opción C de la consulta, la que confirma el fiscalista):
--   · Poder vigente: PRODUCCION, PAUSADO, SUSPENDIDO_AEAT y VERIFICADO (al que
--     vuelve un estudio al reanudar tras una pausa). Una pausa o una suspensión
--     de la AEAT es una incidencia: se sigue emitiendo y se remite al volver.
--   · Sin poder: PENDIENTE_AUTORIZACION y AUTORIZACION_EN_REVISION (poder
--     revocado, caducado o datos fiscales cambiados). No es una incidencia
--     técnica: las facturas se paran.
--
-- Al recuperar el poder no se vuelven a encender solas: lo decide la
-- propietaria en Configuración → Facturación (la invariante ya se lo deja).

-- ── 1. La invariante, más estricta: activado Y con poder vigente ─────────────
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
        where v.studio_id = new.id
          and v.activado_produccion_en is not null
          and v.estado in ('PRODUCCION', 'PAUSADO', 'SUSPENDIDO_AEAT', 'VERIFICADO')
     ) then
    raise exception 'VERIFACTU_SIN_ACTIVAR: Tentare solo emite facturas cuando el envío a la AEAT de este estudio está activo y con poder vigente'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- ── 2. Perder el poder para las facturas ────────────────────────────────────
create or replace function public.verifactu_sin_poder_para_facturas()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if old.estado in ('PRODUCCION', 'PAUSADO', 'SUSPENDIDO_AEAT', 'VERIFICADO')
     and new.estado not in ('PRODUCCION', 'PAUSADO', 'SUSPENDIDO_AEAT', 'VERIFICADO') then
    update studios
       set modo_facturacion = 'sin_facturas'
     where id = new.studio_id
       and modo_facturacion = 'verifactu';
  end if;
  return null;
end;
$$;

drop trigger if exists trg_verifactu_sin_poder_para_facturas on public.verifactu_estudios;
create trigger trg_verifactu_sin_poder_para_facturas
  after update of estado on public.verifactu_estudios
  for each row execute function public.verifactu_sin_poder_para_facturas();

revoke execute on function public.studios_facturas_exigen_envio_activo() from public, anon, authenticated;
revoke execute on function public.verifactu_sin_poder_para_facturas() from public, anon, authenticated;

-- ── 3. Los que ya estén así (hoy, ninguno: ningún estudio ha activado) ──────
update public.studios s
   set modo_facturacion = 'sin_facturas'
 where s.modo_facturacion = 'verifactu'
   and not exists (
     select 1 from public.verifactu_estudios v
      where v.studio_id = s.id and v.activado_produccion_en is not null
        and v.estado in ('PRODUCCION', 'PAUSADO', 'SUSPENDIDO_AEAT', 'VERIFICADO')
   );

-- ── Verificación ─────────────────────────────────────────────────────────────
do $$
begin
  if exists (
    select 1 from public.studios s
     where s.modo_facturacion = 'verifactu'
       and not exists (select 1 from public.verifactu_estudios v
                        where v.studio_id = s.id and v.activado_produccion_en is not null
                          and v.estado in ('PRODUCCION', 'PAUSADO', 'SUSPENDIDO_AEAT', 'VERIFICADO'))
  ) then
    raise exception 'quedan estudios emitiendo sin poder vigente';
  end if;
  if has_function_privilege('anon', 'public.verifactu_sin_poder_para_facturas()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.verifactu_sin_poder_para_facturas()', 'EXECUTE')
     or has_function_privilege('anon', 'public.studios_facturas_exigen_envio_activo()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.studios_facturas_exigen_envio_activo()', 'EXECUTE') then
    raise exception 'una función de trigger es ejecutable desde el cliente';
  end if;
end $$;
