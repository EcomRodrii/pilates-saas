-- RLS-11: tabla-libro de idempotencia que solo escribe liberar_cupo_matricula_una_vez
-- (SECURITY DEFINER, solo service_role). Nada del cliente la toca: RLS sin policy ya la
-- negaba, pero el GRANT vivo a authenticated era letra muerta que se activaría en
-- silencio si alguien añadiera una policy. Se retira; fail-closed.
revoke all on table public.matricula_cupo_liberaciones from anon, authenticated;

do $$
begin
  if has_table_privilege('authenticated', 'public.matricula_cupo_liberaciones', 'SELECT')
     or has_table_privilege('authenticated', 'public.matricula_cupo_liberaciones', 'INSERT')
     or has_table_privilege('anon', 'public.matricula_cupo_liberaciones', 'SELECT') then
    raise exception 'matricula_cupo_liberaciones sigue con grants de cliente';
  end if;
  if not has_table_privilege('service_role', 'public.matricula_cupo_liberaciones', 'INSERT') then
    raise exception 'service_role perdió el acceso a matricula_cupo_liberaciones';
  end if;
end $$;
