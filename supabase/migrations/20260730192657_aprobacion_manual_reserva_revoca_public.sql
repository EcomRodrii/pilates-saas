-- El intento anterior revocó de 'anon' pero el grant real estaba en PUBLIC
-- (default de Postgres al crear una función) — anon hereda de PUBLIC, así que
-- seguía pudiendo ejecutar. cancelar_reserva_plaza NO tiene ese grant de
-- PUBLIC (se revocó en su día); estas dos deben quedar igual.
revoke execute on function public.reservar_plaza(text, text, text, text, boolean, boolean) from public;
revoke execute on function public.resolver_reserva_pendiente(text, text, boolean) from public;
-- Re-conceder explícitamente a los roles que sí deben poder llamarlas
-- (revocar de PUBLIC quita también a postgres/authenticated/service_role si
-- no tenían grant propio aparte del de PUBLIC).
grant execute on function public.reservar_plaza(text, text, text, text, boolean, boolean) to authenticated, service_role, postgres;
grant execute on function public.resolver_reserva_pendiente(text, text, boolean) to authenticated, service_role, postgres;
