-- ═══════════════════════════════════════════════════════════════════════════
-- Créditos en vivo: avisar de que el saldo de alguien ha cambiado.
--
-- El caso: la clienta termina su clase, el mostrador le hace el check-in y con
-- él gana créditos. Su app, abierta en la mano, sigue diciendo el saldo de
-- antes — la base estaba bien desde el primer instante, lo que faltaba era una
-- vía para que la pantalla ABIERTA se enterara.
--
-- Mismo diseño que `difundir_cambio_aforo` (20260907033951), y por las mismas
-- razones medidas en este repo:
--
--  · Broadcast y NO `postgres_changes`: `realtime.apply_rls()` decodificando
--    WAL era el 58 % de la CPU de la base, y se paga aunque no haya nadie
--    escuchando.
--  · El mensaje NO LLEVA DATOS, ni siquiera el `socio_id`. El canal es del
--    estudio entero y lo escuchan otras socias: difundir de quién es el saldo
--    metería un identificador de una clienta en un canal ajeno. Cada app
--    vuelve a pedir LO SUYO por su camino de siempre, que ya la autoriza.
--  · El aviso no puede tumbar la escritura que lo provoca. Esto corre dentro
--    de la transacción que mueve créditos —que es dinero de fidelización— así
--    que un fallo del esquema de realtime dejaría a alguien sin poder canjear
--    por no haber podido avisar. Se traga el error: el peor caso es volver a
--    como estábamos (hace falta refrescar), no un canje perdido.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.difundir_cambio_creditos()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
begin
  begin
    perform realtime.send(
      -- Sin `socio_id` a propósito: ver la nota de arriba.
      jsonb_build_object('cambio', 'creditos'),
      'creditos',
      'creditos:' || new.studio_id,
      true
    );
  exception when others then
    raise warning '[creditos] no se pudo difundir el cambio de %: %', new.studio_id, sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function public.difundir_cambio_creditos() from public, anon, authenticated;
revoke all on function public.difundir_cambio_creditos() from service_role;
grant execute on function public.difundir_cambio_creditos() to service_role;

-- Solo cuando cambia algo que se VE. Sin este filtro, tocar `actualizado_en`
-- —que se escribe en CADA ajuste, incluidos los que no mueven el saldo—
-- despertaría a todas las apps del estudio para no enseñar nada nuevo.
-- Solo cuando cambia algo que se VE. Sin este filtro, tocar `actualizado_en`
-- —que se escribe en CADA ajuste, incluidos los que no mueven el saldo—
-- despertaría a todas las apps del estudio para no enseñar nada nuevo.
--
-- Van DOS disparadores y no uno con `tg_op` dentro del `when`: en una cláusula
-- `when` no existe `tg_op`, y `old` no es válida para INSERT. Separarlos deja
-- además el filtro a la vista en la propia declaración.
drop trigger if exists trg_difundir_cambio_creditos on public.member_credits;
drop trigger if exists trg_difundir_creditos_alta on public.member_credits;
drop trigger if exists trg_difundir_creditos_cambio on public.member_credits;

-- Alta: la primera vez que alguien tiene saldo, siempre es novedad.
create trigger trg_difundir_creditos_alta
  after insert on public.member_credits
  for each row execute function public.difundir_cambio_creditos();

create trigger trg_difundir_creditos_cambio
  after update of saldo, total_ganado, total_canjeado, caduca_el
  on public.member_credits
  for each row
  when (
    new.saldo is distinct from old.saldo
    or new.total_ganado is distinct from old.total_ganado
    or new.caduca_el is distinct from old.caduca_el
  )
  execute function public.difundir_cambio_creditos();
