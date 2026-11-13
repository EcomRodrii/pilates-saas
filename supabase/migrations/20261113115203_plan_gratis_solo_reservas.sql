-- Plan gratis (decisión del fundador, 13-nov-2026): sin tope de alumnas y 150
-- reservas al mes (antes 150 alumnas «Activa» y 250 reservas). Espejo SQL de
-- `estadoGratis` (lib/billing/plan-gratis.ts). Misma firma: los permisos de la
-- función se conservan; `p_alumnas` sigue en la firma pero ya no limita.
create or replace function public.fase_plan_gratis(p_alumnas integer, p_reservas integer, p_excedido_desde date, p_hoy date)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  c_limite_reservas constant integer := 150;
  c_margen_dias constant integer := 30;
  c_aviso_pct constant numeric := 0.8;
begin
  if p_excedido_desde is not null and p_hoy >= p_excedido_desde + c_margen_dias then
    return 'CERRADO';
  end if;
  if p_alumnas is null or p_reservas is null then
    return 'SIN_MEDIR';
  end if;
  if p_reservas > c_limite_reservas then
    return case when (coalesce(p_excedido_desde, p_hoy) + c_margen_dias) - p_hoy > 0 then 'MARGEN' else 'CERRADO' end;
  end if;
  if p_reservas >= ceil(c_limite_reservas * c_aviso_pct) then
    return 'CERCA';
  end if;
  return 'DENTRO';
end;
$$;
