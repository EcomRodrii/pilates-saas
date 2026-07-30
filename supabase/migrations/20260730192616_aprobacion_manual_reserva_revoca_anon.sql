-- CREATE OR REPLACE con firma nueva crea un objeto de función nuevo en
-- Postgres (no hereda grants del anterior), así que reservar_plaza volvió a
-- quedar ejecutable por anon (grant PUBLIC por defecto al crear una función),
-- deshaciendo el endurecimiento de la migración previa
-- (reservar_plaza_5arg_revoca_anon). resolver_reserva_pendiente es nueva y
-- nunca tuvo el revoke. Mismo patrón que cancelar_reserva_plaza (anon: no,
-- authenticated: sí — la autorización real vive dentro de cada función).
revoke execute on function public.reservar_plaza(text, text, text, text, boolean, boolean) from anon;
revoke execute on function public.resolver_reserva_pendiente(text, text, boolean) from anon;
