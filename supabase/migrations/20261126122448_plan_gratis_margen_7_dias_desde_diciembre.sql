-- Plan gratis (decisión del fundador, 26-nov-2026): 7 días de margen para quien
-- se pase del límite desde el 1 de diciembre; quien se pasó antes conserva sus 30.
-- Espejo SQL de `margenDe`/`estadoGratis` (lib/billing/plan-gratis.ts). Misma
-- firma: los permisos de la función se conservan.
create or replace function public.fase_plan_gratis(p_alumnas integer, p_reservas integer, p_excedido_desde date, p_hoy date)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  c_limite_reservas constant integer := 150;
  c_margen_dias constant integer := 7;
  c_margen_dias_anterior constant integer := 30;
  c_margen_nuevo_desde constant date := date '2026-12-01';
  c_aviso_pct constant numeric := 0.8;
  -- Pasado sin fecha guardada todavía: el margen empieza hoy.
  v_desde date := coalesce(p_excedido_desde, p_hoy);
  v_cierra date;
begin
  v_cierra := v_desde + case when v_desde < c_margen_nuevo_desde then c_margen_dias_anterior else c_margen_dias end;
  if p_excedido_desde is not null and p_hoy >= v_cierra then
    return 'CERRADO';
  end if;
  if p_alumnas is null or p_reservas is null then
    return 'SIN_MEDIR';
  end if;
  if p_reservas > c_limite_reservas then
    return case when v_cierra - p_hoy > 0 then 'MARGEN' else 'CERRADO' end;
  end if;
  if p_reservas >= ceil(c_limite_reservas * c_aviso_pct) then
    return 'CERCA';
  end if;
  return 'DENTRO';
end;
$$;
