-- `heredar_plan_de_cadena()` y `propagar_plan_cadena()`: sin EXECUTE para anon.
--
-- La 0076 las cerró con `revoke execute ... from public`, que NO quita el permiso
-- DIRECTO a `anon` que daba el default de la época (el gotcha documentado en
-- .claude/tentare-os.md: REVOKE FROM PUBLIC no basta). En producción ya están sin
-- anon (medido: relacl = postgres, authenticated, service_role), pero una base
-- construida desde las migraciones —el CI, un entorno nuevo— las dejaba
-- ejecutables por anon. Lo destapó supabase/tests/rls-grants-funciones.test.ts, la
-- primera guarda que mira el catálogo entero y no solo las funciones que alguien
-- ya había pensado en vigilar.
--
-- Son funciones de trigger (`returns trigger`): nunca fueron invocables como RPC,
-- así que esto no cambia ningún comportamiento. Solo alinea el repo con producción,
-- donde esta migración no tiene efecto.

revoke execute on function public.heredar_plan_de_cadena() from anon;
revoke execute on function public.propagar_plan_cadena() from anon;
