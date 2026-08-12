-- ═══════════════════════════════════════════════════════════════════════════
-- Facturas rectificativas (Fase A — base de datos + numeración, disparo MANUAL)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Issue #769: al devolver un cobro ya facturado (reembolso total/parcial,
-- disputa perdida) la factura emitida no se toca hoy. La normativa española
-- (Veri*Factu, tipos R1-R5) exige emitir una factura RECTIFICATIVA, no
-- anular la original. `docs/VERIFACTU-INVESTIGACION-TECNICA.md` §8 ya
-- documenta que una rectificativa se registra como un registro de ALTA con
-- `TipoFactura=R1-R5` (reutiliza `calcularHuellaAlta`, lib/verifactu.ts,
-- YA existente y probado) — no como anulación (`calcularHuellaAnulacion` es
-- para el caso distinto "esta factura nunca debió existir").
--
-- Alcance de esta migración: solo esquema + numeración por serie. La emisión
-- en sí (lib/billing/sellar-factura-server.ts) y el endpoint van en el mismo
-- PR, pero el ENVÍO a Fiskaly queda deliberadamente sin activar (ver el
-- comentario en sellarRectificativaDeFactura) — su payload exacto para
-- rectificativas no está verificado contra su sandbox real.

-- 1) Columnas nuevas. `tipo` empieza NULLABLE para poder hacer el backfill
-- antes de exigir NOT NULL — las 17+ facturas ya emitidas no tenían este
-- concepto.
alter table facturas add column if not exists serie text not null default 'A';
alter table facturas add column if not exists tipo text;
alter table facturas add column if not exists rectifica_a text references facturas(id);
alter table facturas add column if not exists tipo_rectificativa text;
alter table facturas add column if not exists importe_rectificacion numeric(10,2);

-- Backfill: mismo criterio que ya usaba sellar-factura-server.ts al construir
-- el registro Veri*Factu (receptor_nif informado → F1, si no F2).
update facturas
   set tipo = case when receptor_nif is not null and receptor_nif <> '' then 'F1' else 'F2' end
 where tipo is null;

alter table facturas alter column tipo set not null;

-- 2) Invariantes duras.
alter table facturas add constraint facturas_tipo_valido
  check (tipo in ('F1', 'F2', 'R1', 'R2', 'R3', 'R4', 'R5'));

alter table facturas add constraint facturas_serie_valida
  check (serie in ('A', 'R'));

alter table facturas add constraint facturas_tipo_rectificativa_valido
  check (tipo_rectificativa is null or tipo_rectificativa in ('S', 'I'));

-- TipoRectificativa es obligatorio SI Y SOLO SI el tipo es R1-R5 (doc §8).
alter table facturas add constraint facturas_tipo_rectificativa_solo_en_r
  check ((tipo in ('R1', 'R2', 'R3', 'R4', 'R5')) = (tipo_rectificativa is not null));

comment on column facturas.serie is
  'Serie de numeración (A-2026-0001 / R-2026-0001). Whitelist en reservar_numero_factura: solo A o R.';
comment on column facturas.tipo is
  'Catálogo AEAT: F1/F2 (alta), R1-R5 (rectificativa). No incluye F3 (sustitutiva) — no implementada.';
comment on column facturas.rectifica_a is
  'Factura original que esta rectificativa corrige. AEAT lo trata como opcional (FacturasRectificadas), pero en Tentare siempre se rellena: no se emite una rectificativa sin saber a cuál corrige.';
comment on column facturas.tipo_rectificativa is
  'S (sustitución, la rectificativa reemplaza a la original) o I (por diferencia, ambas quedan vigentes). Obligatorio si y solo si tipo es R1-R5.';
comment on column facturas.importe_rectificacion is
  'Importe corregido — su significado exacto (total sustituido vs. delta) depende de tipo_rectificativa. Decisión de negocio, no derivada automáticamente: la introduce quien emite la rectificativa.';

-- 3) Numeración: reservar_numero_factura gana p_serie/p_tipo. La cadena
-- verifactu_seq sigue siendo UNA sola por estudio (mezcla A y R a propósito,
-- ver issue #769: "debe consumir seq de esa misma cadena, no una paralela")
-- — solo numero_completo cambia de prefijo. p_serie whitelisted a 'A'/'R'
-- ANTES de interpolarla en el regexp/LIKE: no hay entrada de usuario aquí
-- (solo la llama código propio con service_role), pero whitelist explícito
-- es más barato que razonar sobre si el regexp es seguro.
-- Un CREATE OR REPLACE con parámetros NUEVOS (aunque tengan DEFAULT) no
-- reemplaza la firma de 10 argumentos: Postgres la trata como un overload
-- distinto y deja las DOS versiones vivas. Sin este DROP, el código viejo
-- (10 args) seguiría siendo llamable y saltándose la whitelist de p_serie.
drop function if exists public.reservar_numero_factura(
  text, text, text, date, text, text, numeric, numeric, numeric, numeric
);

create function public.reservar_numero_factura(
  p_factura_id      text,
  p_studio_id       text,
  p_recibo_id       text,
  p_fecha_emision   date,
  p_receptor_nombre text,
  p_receptor_nif    text,
  p_base_imponible  numeric,
  p_tipo_iva        numeric,
  p_cuota_iva       numeric,
  p_total           numeric,
  p_serie           text default 'A',
  p_tipo            text default null,
  p_rectifica_a           text default null,
  p_tipo_rectificativa    text default null,
  p_importe_rectificacion numeric default null
)
returns table(numero_completo text, verifactu_seq bigint, verifactu_prev_hash text)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_anio      int;
  v_max_num   int;
  v_numero    text;
  v_tip_hash  text;
  v_tip_seq   bigint;
  v_seq       bigint;
  v_intentos  int := 0;
  v_tipo      text;
begin
  if auth.uid() is not null and p_studio_id is distinct from current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;

  if p_serie not in ('A', 'R') then
    raise exception 'SERIE_INVALIDA: % no es una serie reconocida', p_serie;
  end if;

  v_tipo := coalesce(p_tipo, case when p_receptor_nif is not null and p_receptor_nif <> '' then 'F1' else 'F2' end);
  if v_tipo not in ('F1', 'F2', 'R1', 'R2', 'R3', 'R4', 'R5') then
    raise exception 'TIPO_INVALIDO: %', v_tipo;
  end if;

  -- tipo_rectificativa es obligatorio si y solo si v_tipo es R1-R5 (mismo
  -- CHECK de la tabla, comprobado aquí TAMBIÉN para dar un error legible
  -- antes de que lo rechace el constraint con un mensaje genérico.
  if (v_tipo in ('R1', 'R2', 'R3', 'R4', 'R5')) <> (p_tipo_rectificativa is not null) then
    raise exception 'TIPO_RECTIFICATIVA_INCONSISTENTE: % requiere tipo_rectificativa, % no lo admite', v_tipo, v_tipo;
  end if;

  perform pg_advisory_xact_lock(hashtext(p_studio_id || ':verifactu'));

  v_anio := extract(year from p_fecha_emision);

  select coalesce(max((regexp_match(f.numero_completo, p_serie || '-\d{4}-(\d+)'))[1]::int), 0)
    into v_max_num
  from facturas f
  where f.studio_id = p_studio_id
    and f.numero_completo like (p_serie || '-' || v_anio || '-%');

  v_numero := p_serie || '-' || v_anio || '-' || lpad((v_max_num + 1)::text, 4, '0');

  loop
    select f.verifactu_hash, f.verifactu_seq
      into v_tip_hash, v_tip_seq
    from facturas f
    where f.studio_id = p_studio_id
      and f.verifactu_seq is not null
    order by f.verifactu_seq desc
    limit 1;

    exit when v_tip_seq is null or v_tip_hash is not null;

    v_intentos := v_intentos + 1;
    if v_intentos > 100 then
      raise exception 'CADENA_PENDIENTE: la factura anterior de este estudio no terminó de sellarse (huella pendiente). Reintenta en unos segundos.';
    end if;
    perform pg_sleep(0.05);
  end loop;

  v_seq := coalesce(v_tip_seq, 0) + 1;

  insert into facturas (
    id, studio_id, recibo_id, numero_completo, fecha_emision,
    receptor_nombre, receptor_nif, base_imponible, tipo_iva, cuota_iva, total,
    verifactu_seq, verifactu_prev_hash, serie, tipo,
    rectifica_a, tipo_rectificativa, importe_rectificacion
  ) values (
    p_factura_id, p_studio_id, p_recibo_id, v_numero, p_fecha_emision,
    p_receptor_nombre, p_receptor_nif, p_base_imponible, p_tipo_iva, p_cuota_iva, p_total,
    v_seq, coalesce(v_tip_hash, ''), p_serie, v_tipo,
    p_rectifica_a, p_tipo_rectificativa, p_importe_rectificacion
  );

  return query select v_numero, v_seq, coalesce(v_tip_hash, '');
end;
$$;

-- ⚠️ Gotcha de grants, ya documentado varias veces en este repo — y una
-- variante más severa de lo que decía la nota hasta ahora: el default ACL de
-- este proyecto (`pg_default_acl`, rol `postgres`) concede EXECUTE en toda
-- función NUEVA del esquema `public` directamente a anon/authenticated/
-- service_role, no solo a PUBLIC. Verificado en vivo: la función de 10
-- argumentos que esta migración sustituye YA tenía `authenticated` con
-- EXECUTE pese a su propio comentario ("aquí NADIE del cliente debe poder
-- llamarla") y pese a llevar `revoke ... from public` — porque ese REVOKE
-- nunca tocó el grant DIRECTO a `authenticated`. `REVOKE ... FROM PUBLIC` no
-- basta cuando el otorgante es un default ACL: hace falta revocar de
-- `anon`/`authenticated` explícitamente, no solo de `public`.
revoke execute on function public.reservar_numero_factura(
  text, text, text, date, text, text, numeric, numeric, numeric, numeric, text, text, text, text, numeric
) from public;
revoke execute on function public.reservar_numero_factura(
  text, text, text, date, text, text, numeric, numeric, numeric, numeric, text, text, text, text, numeric
) from anon;
revoke execute on function public.reservar_numero_factura(
  text, text, text, date, text, text, numeric, numeric, numeric, numeric, text, text, text, text, numeric
) from authenticated;
grant execute on function public.reservar_numero_factura(
  text, text, text, date, text, text, numeric, numeric, numeric, numeric, text, text, text, text, numeric
) to service_role;
