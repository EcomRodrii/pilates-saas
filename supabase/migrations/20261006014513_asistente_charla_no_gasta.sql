-- ─────────────────────────────────────────────────────────────────────────────
-- El asistente: la charla no gasta consulta (decisión del fundador, 6-oct-2026).
--
-- Una respuesta SOLO gasta consulta si ha usado al menos una herramienta de
-- datos (`p_n_herramientas > 0`). La que se responde sin mirar nada —un saludo,
-- «¿cómo hago X?», un consejo— cierra CONSUMIDA con 0 unidades, hasta
-- `MAX_CHARLAS_GRATIS_DIA` (50) por estudio y día de Madrid. Pasado el tope, la
-- charla vuelve a gastar con la fórmula de siempre: no se corta (eso sería otro
-- camino de error y otra pantalla), y el gasto sigue acotado por el antirráfaga
-- y por el tope de 3 $/día de `ia_reservar_consulta`.
--
-- Por qué en SQL y no en la ruta: `ia_cerrar_consulta` es la ÚNICA dueña de la
-- fórmula de unidades (migr 20261005213749). El tope se cuenta en el propio libro
-- —una charla gratis es una fila CONSUMIDA con `n_herramientas = 0` y
-- `unidades = 0`, que la fórmula de siempre no produce nunca (da de 1 a 5)— y se
-- cuenta DENTRO del bloqueo de la fila del estudio que ya toma el cierre, así que
-- dos pestañas no se cuelan las dos en la charla número 50.
--
-- La reserva NO cambia: sigue haciendo falta una consulta disponible para
-- preguntar, porque antes de llamar a Anthropic no se sabe si la respuesta usará
-- datos (fail-closed: sin libro, no hay llamada). Al cerrar sin herramientas, la
-- reserva se devuelve y el saldo («Te quedan N») queda como estaba.
--
-- Misma firma que en 20261005213749: `create or replace` sobre el MISMO objeto
-- conserva sus permisos. Aun así se repiten los tres pasos y la comprobación con
-- has_function_privilege: no se fía del comentario (tentare-os.md, «Seguridad»).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.ia_cerrar_consulta(
  p_consumo_id uuid, p_studio_id text, p_estado text,
  p_input integer, p_cache_read integer, p_cache_creation integer, p_output integer,
  p_coste_usd numeric, p_n_llamadas integer, p_n_herramientas integer, p_codigo_error text, p_herramientas text[]
)
returns table (unidades_cobradas integer, disponibles integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_c record;
  v_saldo record;
  v_u integer;
  v_cuota_queda integer;
  v_de_cuota integer := 0;
  v_de_pack integer := 0;
  v_resto integer;
  v_pack record;
  v_toma integer;
  v_charlas integer;
  -- Espejo TS: MAX_CHARLAS_GRATIS_DIA en lib/asistente/limites.ts (lo cruza coste.test.ts).
  v_max_charlas constant integer := 50;
  v_inicio_dia timestamptz := (date_trunc('day', now() at time zone 'Europe/Madrid')) at time zone 'Europe/Madrid';
begin
  if p_estado not in ('CONSUMIDA', 'FALLIDA', 'LIBERADA') then
    raise exception 'estado de cierre no válido: %', p_estado;
  end if;

  -- Mismo orden de bloqueo que la reserva (estudio y luego consumo): sin interbloqueos.
  perform 1 from public.studios s where s.id = p_studio_id for no key update;

  select c.* into v_c from public.ia_consumos c
   where c.id = p_consumo_id and c.studio_id = p_studio_id
   for update;
  if not found then
    raise exception 'consumo % no existe en el estudio', p_consumo_id;
  end if;

  -- Idempotente: una segunda llamada devuelve lo ya cerrado sin tocar nada.
  if v_c.estado <> 'RESERVADA' then
    select * into v_saldo from public.ia_saldo_consultas(p_studio_id) s;
    return query select v_c.unidades::integer, coalesce(v_saldo.disponibles, 0);
    return;
  end if;

  v_u := case when p_estado = 'CONSUMIDA'
              then least(5, greatest(1, ceil(coalesce(p_coste_usd, 0) / 0.03)))::integer
              else 0 end;

  -- La charla: respondida sin ninguna herramienta de datos. Gratis hasta el tope del día.
  if v_u > 0 and coalesce(p_n_herramientas, 0) = 0 then
    select count(*)::integer into v_charlas
      from public.ia_consumos c
     where c.studio_id = p_studio_id
       and c.estado = 'CONSUMIDA'
       and c.n_herramientas = 0
       and c.unidades = 0
       and c.creado_en >= v_inicio_dia
       and c.id <> p_consumo_id;
    if v_charlas < v_max_charlas then
      v_u := 0;
    end if;
  end if;

  if v_u > 0 then
    -- Lo que queda de cuota SIN contar esta reserva (aún RESERVADA): el saldo la
    -- cuenta como «en vuelo», y aquí se está liquidando precisamente ella.
    select * into v_saldo from public.ia_saldo_consultas(p_studio_id) s;
    v_cuota_queda := greatest(0, v_saldo.cuota - v_saldo.usadas);
    v_de_cuota := least(v_u, v_cuota_queda);
    v_resto := v_u - v_de_cuota;

    if v_resto > 0 then
      for v_pack in
        select p.id, p.unidades - p.unidades_usadas as quedan
          from public.ia_packs p
         where p.studio_id = p_studio_id and p.estado = 'ACTIVO' and p.caduca_en > now() and p.unidades_usadas < p.unidades
         order by p.caduca_en, p.id
         for update
      loop
        exit when v_resto <= 0;
        v_toma := least(v_resto, v_pack.quedan);
        update public.ia_packs p set unidades_usadas = p.unidades_usadas + v_toma where p.id = v_pack.id;
        v_de_pack := v_de_pack + v_toma;
        v_resto := v_resto - v_toma;
      end loop;
    end if;
  end if;

  update public.ia_consumos c set
    estado = p_estado,
    input_tokens = greatest(0, coalesce(p_input, 0)),
    cache_read_input_tokens = greatest(0, coalesce(p_cache_read, 0)),
    cache_creation_input_tokens = greatest(0, coalesce(p_cache_creation, 0)),
    output_tokens = greatest(0, coalesce(p_output, 0)),
    n_llamadas = least(32767, greatest(0, coalesce(p_n_llamadas, 0))),
    n_herramientas = least(32767, greatest(0, coalesce(p_n_herramientas, 0))),
    herramientas = coalesce(p_herramientas, '{}'),
    coste_usd = greatest(0, coalesce(p_coste_usd, 0)),
    unidades = v_u,
    unidades_cuota = v_de_cuota,
    unidades_pack = v_de_pack,
    unidades_sin_saldo = v_u - v_de_cuota - v_de_pack,
    codigo_error = p_codigo_error,
    cerrado_en = now()
  where c.id = p_consumo_id;

  select * into v_saldo from public.ia_saldo_consultas(p_studio_id) s;
  return query select v_u, coalesce(v_saldo.disponibles, 0);
end;
$$;

-- Para contar las charlas del día sin recorrer todo el mes del estudio.
create index if not exists ia_consumos_charlas_dia on public.ia_consumos (studio_id, creado_en)
  where estado = 'CONSUMIDA' and n_herramientas = 0 and unidades = 0;

revoke all on function public.ia_cerrar_consulta(uuid, text, text, integer, integer, integer, integer, numeric, integer, integer, text, text[]) from public;
revoke all on function public.ia_cerrar_consulta(uuid, text, text, integer, integer, integer, integer, numeric, integer, integer, text, text[]) from anon;
revoke all on function public.ia_cerrar_consulta(uuid, text, text, integer, integer, integer, integer, numeric, integer, integer, text, text[]) from authenticated;
grant execute on function public.ia_cerrar_consulta(uuid, text, text, integer, integer, integer, integer, numeric, integer, integer, text, text[]) to service_role;

do $$
declare
  v_fn text := 'public.ia_cerrar_consulta(uuid, text, text, integer, integer, integer, integer, numeric, integer, integer, text, text[])';
begin
  if has_function_privilege('anon', v_fn, 'EXECUTE') then
    raise exception 'anon puede ejecutar %', v_fn;
  end if;
  if has_function_privilege('authenticated', v_fn, 'EXECUTE') then
    raise exception 'authenticated puede ejecutar %: cualquier sesión cerraría consultas de otro estudio', v_fn;
  end if;
  if not has_function_privilege('service_role', v_fn, 'EXECUTE') then
    raise exception 'service_role no puede ejecutar %: el asistente se quedaría sin libro', v_fn;
  end if;
end
$$;
