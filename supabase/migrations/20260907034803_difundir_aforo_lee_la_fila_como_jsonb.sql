-- ⚠️ `new.sesion_id` NO se puede escribir en un trigger compartido por dos
-- tablas, aunque esté dentro de un CASE que no se toma: PL/pgSQL resuelve el
-- campo contra el tipo real de la fila y `sesiones` no tiene `sesion_id`, así
-- que reventaba con «record "new" has no field "sesion_id"» — y no en el
-- broadcast, sino en la asignación, o sea FUERA del guardián de excepciones.
-- Resultado: cualquier UPDATE de `sesiones` que cambiara hora, sala, capacidad
-- o cancelación fallaba entero.
--
-- Encontrado con el ensayo en vivo (execute_sql + ROLLBACK), no por un usuario.
-- Por eso se ensaya.
--
-- Se lee la fila como jsonb: `to_jsonb(new)->>'clave'` da NULL si la clave no
-- está, en vez de fallar al compilar la expresión. Y de paso TODO el cuerpo
-- queda dentro del guardián, no solo el `realtime.send`: este trigger cuelga de
-- la transacción de reservar y cancelar, que mueve bonos y dinero. Nada de lo
-- que haga puede tumbarla.

create or replace function public.difundir_cambio_aforo()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_fila jsonb;
  v_studio_id text;
  v_sesion_id text;
begin
  begin
    v_fila := to_jsonb(case when tg_op = 'DELETE' then old else new end);
    v_studio_id := v_fila->>'studio_id';
    -- En `reservas` la clase es `sesion_id`; en `sesiones`, su propio `id`.
    v_sesion_id := coalesce(v_fila->>'sesion_id', v_fila->>'id');

    if v_studio_id is not null and v_sesion_id is not null then
      perform realtime.send(
        jsonb_build_object('sesionId', v_sesion_id),
        'aforo',
        'aforo:' || v_studio_id,
        true
      );
    end if;
  exception when others then
    raise warning '[aforo] no se pudo difundir el cambio: %', sqlerrm;
  end;

  return null;
end;
$$;
