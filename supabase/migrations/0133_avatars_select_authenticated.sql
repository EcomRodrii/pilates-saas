-- La 0077 (avatars_bucket_lockdown) cerró el bucket público `avatars` quitando
-- SELECT a todo el mundo (incl. `authenticated`), razonando que la app solo
-- necesita `getPublicUrl()` para mostrar avatares — cierto para LEER, pero
-- falso para SUBIR: `supabase.storage.upload()` hace un INSERT ... RETURNING
-- por debajo, y sin policy de SELECT esa lectura del registro recién creado
-- también pasa por RLS y falla con "new row violates row-level security
-- policy for table objects" — el insert en sí llega a completarse, pero la
-- API no puede devolver la fila y el cliente ve un error. Reproducido en una
-- transacción de prueba (rollback): el INSERT sin RETURNING funciona, el
-- mismo INSERT con RETURNING (lo que hace de verdad el cliente de Storage)
-- falla exactamente con ese mensaje. Rompe TODAS las subidas al bucket desde
-- que se aplicó la 0077: logo/favicon de marca, foto de socia, de
-- instructora y de la propietaria — no solo el logo.
--
-- Se añade SELECT solo para `authenticated` (no para `anon`, que es
-- precisamente lo que la 0077 quería cerrar: el listado anónimo). Un
-- autenticado viendo metadatos de cualquier objeto del bucket público es
-- mucho menor riesgo que el acceso anónimo que cerró la 0077, y es lo mínimo
-- que Storage necesita para poder confirmar sus propias subidas.

create policy avatars_select_authenticated on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars');
