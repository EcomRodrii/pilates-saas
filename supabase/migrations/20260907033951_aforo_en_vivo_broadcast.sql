-- Aforo en vivo: avisar por Broadcast cuando cambia una reserva o una clase.
--
-- EL FALLO
-- La propietaria quita a una alumna de una clase llena y su propio calendario
-- sigue diciendo 8/8; la app de la alumna sigue diciendo «en lista de espera».
-- Con F5 aparece bien. La BD estaba bien desde el primer momento: lo que no
-- existía era ninguna vía para que las pantallas ABIERTAS se enteraran.
--
-- POR QUÉ BROADCAST Y NO `postgres_changes`
-- No es preferencia: está medido en este repo. `realtime.apply_rls()`
-- decodificando WAL era el 58 % de la CPU de esta base (2.791.881 ms de
-- 4.780.468 con pg_stat_statements), 523.981 llamadas a 5,33 ms, y se paga
-- AUNQUE NO HAYA NADA QUE ENTREGAR. Por eso 20260806150000 SACÓ una tabla de
-- la publicación en vez de añadir más. `reservas` se escribe mucho más que
-- aquella. Meterla en la publicación sería repetir el error a lo grande.
--
-- Broadcast desde la BD ya es el mecanismo de la casa (mensajería y feed de
-- comunidad, 20260826015940 y 20260826015949): el trigger publica solo cuando
-- algo cambia de verdad, y la autorización es una policy sobre
-- `realtime.messages` que se evalúa AL SUSCRIBIRSE, una vez, no por fila de WAL.
--
-- QUÉ VIAJA: SOLO `sesionId`. Nada de la fila.
-- Deliberado, y es lo que hace que el canal pueda ser del estudio entero sin
-- filtrar nada: el aviso dice «la clase X ha cambiado, vuelve a pedirla», y
-- cada cliente la vuelve a pedir POR SU CAMINO DE SIEMPRE, con su propia
-- autorización (el panel por /api/calendario, que ya recorta por rol; la
-- alumna por el payload público, que ya es anónimo). Difundir la fila entera
-- de `reservas` metería `socio_id` en un canal que escuchan otras socias.
--
-- Mismo razonamiento y misma policy que el feed: la cerradura de tenant es que
-- una socia o instructora de OTRO estudio no puede suscribirse a `aforo:{id}`
-- ajeno.

create or replace function public.difundir_cambio_aforo()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_studio_id text;
  v_sesion_id text;
begin
  if tg_op = 'DELETE' then
    v_studio_id := old.studio_id;
    v_sesion_id := case when tg_table_name = 'reservas' then old.sesion_id else old.id end;
  else
    v_studio_id := new.studio_id;
    v_sesion_id := case when tg_table_name = 'reservas' then new.sesion_id else new.id end;
  end if;

  -- ⚠️ El aviso NO puede tumbar la escritura que lo provoca. Este trigger va
  -- dentro de la transacción de reservar/cancelar —que mueve bonos y dinero—,
  -- así que un fallo del esquema de realtime dejaría a una socia sin poder
  -- reservar por no haber podido avisar a nadie. Se traga el error a
  -- propósito: el peor caso es volver a como estábamos (hace falta refrescar),
  -- no una reserva perdida.
  begin
    perform realtime.send(
      jsonb_build_object('sesionId', v_sesion_id),
      'aforo',
      'aforo:' || v_studio_id,
      true
    );
  exception when others then
    raise warning '[aforo] no se pudo difundir el cambio de %: %', v_sesion_id, sqlerrm;
  end;

  return null; -- AFTER trigger: el valor no se usa
end;
$$;

revoke all on function public.difundir_cambio_aforo() from public, anon, authenticated;
revoke all on function public.difundir_cambio_aforo() from service_role;
grant execute on function public.difundir_cambio_aforo() to service_role;

-- RESERVAS. En UPDATE solo si cambió algo que se VE: estado (ocupa o no
-- ocupa), sitio, asistencia y la oferta de lista de espera con plazo. Sin este
-- filtro, guardar una valoración de la clase despertaría a todo el estudio.
drop trigger if exists trg_difundir_cambio_aforo_reservas on public.reservas;
create trigger trg_difundir_cambio_aforo_reservas
  after insert or delete on public.reservas
  for each row execute function public.difundir_cambio_aforo();

drop trigger if exists trg_difundir_cambio_aforo_reservas_upd on public.reservas;
create trigger trg_difundir_cambio_aforo_reservas_upd
  after update on public.reservas
  for each row
  when (
    old.estado is distinct from new.estado
    or old.spot_id is distinct from new.spot_id
    or old.check_in_en is distinct from new.check_in_en
    or old.posicion_espera is distinct from new.posicion_espera
    or old.oferta_expira_en is distinct from new.oferta_expira_en
  )
  execute function public.difundir_cambio_aforo();

-- SESIONES. Cambiar la capacidad de 8 a 10 mueve el «8/8» igual que quitar a
-- una alumna, y cancelar la clase también. Mover hora/sala/instructora repinta
-- la rejilla, así que entra por el mismo canal.
drop trigger if exists trg_difundir_cambio_aforo_sesiones on public.sesiones;
create trigger trg_difundir_cambio_aforo_sesiones
  after insert or delete on public.sesiones
  for each row execute function public.difundir_cambio_aforo();

drop trigger if exists trg_difundir_cambio_aforo_sesiones_upd on public.sesiones;
create trigger trg_difundir_cambio_aforo_sesiones_upd
  after update on public.sesiones
  for each row
  when (
    old.aforo_maximo is distinct from new.aforo_maximo
    or old.cancelada is distinct from new.cancelada
    or old.inicio is distinct from new.inicio
    or old.fin is distinct from new.fin
    or old.sala_id is distinct from new.sala_id
    or old.instructor_id is distinct from new.instructor_id
  )
  execute function public.difundir_cambio_aforo();

-- Quién puede escuchar: el staff de ese estudio, o una socia ACTIVA de ese
-- estudio. Copia literal de `feed_broadcast_lectura` (20260826015949) — misma
-- forma de topic (`algo:{studio_id}`, el estudio en el 2º segmento) y misma
-- doble vía, porque el canal tiene exactamente las mismas dos audiencias.
--
-- ⚠️ Nada de `ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY`: ya la
-- tiene, y la tabla es de `supabase_realtime_admin`, así que ese ALTER falla
-- aquí con «must be owner» aunque sea un no-op. `CREATE POLICY` sí funciona.
drop policy if exists aforo_broadcast_lectura on realtime.messages;
create policy aforo_broadcast_lectura on realtime.messages
  for select
  to authenticated
  using (
    extension = 'broadcast'
    and split_part(realtime.topic(), ':', 1) = 'aforo'
    and (
      exists (
        select 1 from public.socios s
         where s.auth_user_id = (select auth.uid())
           and s.activo = true
           and s.studio_id = split_part(realtime.topic(), ':', 2)
      )
      or split_part(realtime.topic(), ':', 2) = public.current_studio_id()
    )
  );
