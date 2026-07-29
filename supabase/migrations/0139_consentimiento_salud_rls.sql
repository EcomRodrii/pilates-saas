-- 0139 · el consentimiento de salud (0138/#511) cerraba el hueco en la UI
-- (ficha-salud.tsx exige darlo antes de abrir el formulario), pero no en la
-- base de datos: nada impedía un INSERT directo en condiciones_salud sin
-- consentimiento (un futuro importador, un script, o un bug que no pase por
-- abrirNueva()). Mismo patrón que ya costó los agujeros de 0112/0118/0122 —
-- la RLS es la cerradura real, la UI nunca es el límite.
--
-- Se separa la policy FOR ALL de condiciones_salud (0095) en lectura sin
-- cambios + escritura, y el INSERT exige además consentimiento_salud_fecha
-- en la socia referenciada. UPDATE/DELETE quedan igual que 0095: no hay
-- flujo de revocación de consentimiento todavía, y exigirlo ahí sin ese
-- flujo solo bloquearía ediciones legítimas de condiciones ya consentidas.

create or replace function public.tiene_consentimiento_salud(p_socio_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select consentimiento_salud_fecha is not null
  from public.socios
  where id = p_socio_id;
$$;

drop policy if exists salud_condiciones_salud on public.condiciones_salud;

create policy salud_condiciones_salud_lectura on public.condiciones_salud
  for select to authenticated
  using (studio_id = current_studio_id() and current_rol() in ('PROPIETARIO','INSTRUCTOR'));

create policy salud_condiciones_salud_insert on public.condiciones_salud
  for insert to authenticated
  with check (
    studio_id = current_studio_id()
    and current_rol() in ('PROPIETARIO','INSTRUCTOR')
    and public.tiene_consentimiento_salud(socio_id)
  );

create policy salud_condiciones_salud_update on public.condiciones_salud
  for update to authenticated
  using      (studio_id = current_studio_id() and current_rol() in ('PROPIETARIO','INSTRUCTOR'))
  with check (studio_id = current_studio_id() and current_rol() in ('PROPIETARIO','INSTRUCTOR'));

create policy salud_condiciones_salud_delete on public.condiciones_salud
  for delete to authenticated
  using (studio_id = current_studio_id() and current_rol() in ('PROPIETARIO','INSTRUCTOR'));
