-- red_perfiles.destacado (migr 20260813175242) es editorial, solo el
-- equipo de Tentare la escribe (app/api/interno/network/perfiles PATCH,
-- service_role) — pero RLS es por FILA, no por columna: la política de
-- UPDATE del dueño (red_perfiles_update_propio) no distingue qué columna se
-- toca, así que sin esto una instructora podría autodeclararse "destacada"
-- por REST directo con su propio JWT. Mismo trigger, mismo criterio exacto
-- que ya protege identidad_verificada_en (20260813135453) — se amplía en
-- vez de crear uno nuevo.
create or replace function public.red_perfiles_proteger_verificacion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() is distinct from 'service_role' then
    new.identidad_verificada_en := old.identidad_verificada_en;
    new.destacado := old.destacado;
  end if;
  return new;
end;
$$;
