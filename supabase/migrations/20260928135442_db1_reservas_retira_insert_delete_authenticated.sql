-- Auditoría 62ª pasada (DB-1). `reservas_escritura_insert`/`_delete` dejaban a
-- cualquier PROPIETARIO/MANAGER/RECEPCION insertar o borrar filas de `reservas`
-- directamente con su JWT, saltándose por completo el motor (`reservar_plaza`,
-- `cancelar_reserva_plaza`): sin aforo, sin consumo de bono, sin límite semanal,
-- sin conflicto de horario, y un DELETE se saltaba `bono_devolucion_debida_en`
-- (la socia pierde el crédito en silencio). Las seis RPC del motor ya tienen
-- EXECUTE revocado a authenticated/anon; esta era la puerta que quedó abierta.
--
-- Verificado que nada de la app lo necesita: el único INSERT sobre `reservas`
-- fuera de las RPC es app/api/reservas/import/route.ts, con el cliente admin
-- (service-role, ignora la RLS). Ningún DELETE directo en todo el repo.
--
-- Verificado en vivo (transacción revertida) con la propietaria real de
-- studio-1 (auth_user_id 480ef964-...): ve la fila (RLS de lectura intacta),
-- INSERT → 42501, DELETE sobre una fila que sí puede ver → la fila sigue
-- existiendo después.
--
-- `reservas_escritura_update` se conserva: lib/supabase-data.ts lo usa desde
-- el navegador (dbCancelarReservasPorSesiones, cancelación manual de serie).

drop policy if exists reservas_escritura_insert on public.reservas;
drop policy if exists reservas_escritura_delete on public.reservas;
