-- Motor de derechos, FASE B: `recuperaciones` solo la escribe el servidor.
--
-- Desde la fase A (`anular_recuperacion`, migr 20261002144936) ningún código del navegador escribe ya en la tabla. Las
-- escrituras legítimas pasan por funciones SECURITY DEFINER (`crear_recuperacion`, `anular_recuperacion`,
-- `ampliar_caducidades`, `reservar_plaza`, `cancelar_reserva_plaza`, `liberar_derecho`…), cuyo dueño es postgres y no está
-- sujeto a RLS (la tabla no la fuerza), y por el servidor (service_role).
--
-- Lo que se cierra: hasta ahora cualquier persona del personal que gestiona clientas podía, con su sesión, insertar una
-- recuperación saltándose el tope de recuperaciones vivas y la caducidad que fija el estudio, o editar una existente
-- (fecha de caducidad, estado), todo ello por fuera del ledger de derechos. La lectura no cambia.
--
-- Se retiran también las tres políticas de escritura: con el privilegio revocado ya no hacían nada, y sin ellas un GRANT
-- futuro por descuido sigue sin dejar escribir (la RLS es la cerradura real).

drop policy if exists recuperaciones_escritura_insert on public.recuperaciones;
drop policy if exists recuperaciones_escritura_update on public.recuperaciones;
drop policy if exists recuperaciones_escritura_delete on public.recuperaciones;
revoke insert, update, delete on public.recuperaciones from public, anon, authenticated;

do $$
begin
  if has_table_privilege('authenticated', 'public.recuperaciones', 'INSERT')
     or has_table_privilege('authenticated', 'public.recuperaciones', 'UPDATE')
     or has_table_privilege('authenticated', 'public.recuperaciones', 'DELETE')
     or has_table_privilege('anon', 'public.recuperaciones', 'INSERT')
     or has_table_privilege('anon', 'public.recuperaciones', 'UPDATE')
     or has_table_privilege('anon', 'public.recuperaciones', 'DELETE') then
    raise exception 'recuperaciones sigue siendo escribible desde el navegador';
  end if;
  if not has_table_privilege('authenticated', 'public.recuperaciones', 'SELECT') then
    raise exception 'recuperaciones ha perdido la lectura del navegador';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recuperaciones' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')) then
    raise exception 'quedan políticas de escritura sobre recuperaciones';
  end if;
end $$;
