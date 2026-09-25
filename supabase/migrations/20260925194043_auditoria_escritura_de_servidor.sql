-- ════════════════════════════════════════════════════════════════════════════
-- Auditoría: el servidor puede escribir en el libro, con un actor explícito
-- ════════════════════════════════════════════════════════════════════════════
--
-- Tercer paso de la auditoría de dinero del estudio (el libro salió en
-- 20260925152253, y «eliminar un recibo» con motivo en 20260925175253).
--
-- El trigger del libro solo ve lo que hace una persona con SU sesión. Una ruta de
-- servidor escribe con service-role, `auth.uid()` es NULL y el trigger sale sin
-- registrar: reembolsos, «marcar devuelto», ingresos manuales, la reversión de una
-- devolución y la aprobación de una penalización quedaban sin rastro de quién los
-- hizo. Ahora esas rutas escriben su propia entrada (`origen = 'servidor'`) con el
-- actor que resolvió `verificarSesionStaff`, nunca con lo que diga el cuerpo.
--
-- En la migración del libro se le quitó a service_role el INSERT «sin consumidor,
-- un permiso de más solo serviría para fabricar entradas con un actor falso». Ahora
-- hay consumidor (`lib/auditoria/registrar-servidor.ts`), así que se concede — y
-- solo eso: nunca UPDATE ni DELETE, y el trigger de inmutabilidad los rechaza igual.
-- Tampoco USAGE de la secuencia: `id` es `generated always as identity`, y insertar
-- en una columna identity no comprueba permisos sobre su secuencia (medido en
-- producción con `set local role service_role`), así que concederlo solo le
-- permitiría gastar ids.
--
-- ⚠️ Quien tiene la clave de service-role puede escribir una entrada con el actor
-- que quiera: es el precio de que el servidor pueda registrar, y por eso la clave
-- no sale del servidor. Lo que el libro garantiza es que NADIE la puede modificar
-- ni borrar después, y que un cliente (anon/authenticated) no la escribe.

grant insert on table public.auditoria_estudio to service_role;

-- Una entrada de servidor dice QUÉ hizo la persona (`contexto.accion`, un código de
-- `ACCIONES` en lib/auditoria-estudio.ts): sin él la pantalla no sabría contarla y
-- quedaría como «Cambió un recibo» sin más. Lo exige la base de datos, no la buena
-- voluntad de quien escribe la ruta. `coalesce`: un contexto NULL daría NULL, y un
-- CHECK con NULL PASA. Y no vacío: una cadena vacía es un código sin código.
alter table public.auditoria_estudio
  drop constraint if exists auditoria_estudio_servidor_con_accion_chk;
alter table public.auditoria_estudio
  add constraint auditoria_estudio_servidor_con_accion_chk
  check (origen <> 'servidor' or coalesce(
    jsonb_typeof(contexto -> 'accion') = 'string' and length(contexto ->> 'accion') > 0,
    false));

-- Un mismo reembolso de Stripe se anota UNA vez. Un doble clic llega a Stripe dos
-- veces y este devuelve el mismo reembolso (clave de idempotencia por recibo): sin
-- esto, dos clics a la vez —los dos leyeron el recibo antes de que ninguno lo
-- marcara— dejarían dos entradas idénticas en un libro que no se puede corregir.
-- Otro reembolso del mismo recibo (otro id de Stripe) no choca. El helper trata el
-- 23505 como «ya estaba» y no avisa (lib/auditoria/registrar-servidor.ts).
create unique index if not exists auditoria_estudio_reembolso_unico_idx
  on public.auditoria_estudio (studio_id, fila_id, (despues ->> 'reembolso_stripe_id'))
  where origen = 'servidor' and contexto ->> 'accion' = 'REEMBOLSO_PEDIDO';

-- ── Comprobación al aplicar (no fiarse del comentario SQL) ─────────────────
do $$
declare
  v_rol text;
begin
  foreach v_rol in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_rol, 'public.auditoria_estudio', 'INSERT')
       or has_table_privilege(v_rol, 'public.auditoria_estudio', 'UPDATE')
       or has_table_privilege(v_rol, 'public.auditoria_estudio', 'DELETE')
       or has_table_privilege(v_rol, 'public.auditoria_estudio', 'TRUNCATE') then
      raise exception 'auditoria_estudio es escribible por %', v_rol;
    end if;
    if has_sequence_privilege(v_rol, 'public.auditoria_estudio_id_seq', 'USAGE')
       or has_sequence_privilege(v_rol, 'public.auditoria_estudio_id_seq', 'UPDATE') then
      raise exception 'la secuencia de auditoria_estudio es utilizable por %', v_rol;
    end if;
  end loop;
  if not has_table_privilege('service_role', 'public.auditoria_estudio', 'INSERT') then
    raise exception 'service_role no puede escribir en auditoria_estudio';
  end if;
  if has_table_privilege('service_role', 'public.auditoria_estudio', 'UPDATE')
     or has_table_privilege('service_role', 'public.auditoria_estudio', 'DELETE')
     or has_table_privilege('service_role', 'public.auditoria_estudio', 'TRUNCATE') then
    raise exception 'auditoria_estudio es modificable por service_role';
  end if;
  -- Lo que este fichero deja puesto tiene que estar de verdad.
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.auditoria_estudio'::regclass
                    and conname = 'auditoria_estudio_servidor_con_accion_chk') then
    raise exception 'falta el CHECK que exige la acción en las entradas de servidor';
  end if;
  if not exists (select 1 from pg_indexes
                  where schemaname = 'public' and tablename = 'auditoria_estudio'
                    and indexname = 'auditoria_estudio_reembolso_unico_idx') then
    raise exception 'falta el índice único del reembolso';
  end if;
  -- Y lo que la migración del libro ya garantizaba sigue en pie (append-only + solo PROPIETARIO lee).
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relname = 'auditoria_estudio' and c.relrowsecurity) then
    raise exception 'auditoria_estudio ha perdido su RLS';
  end if;
  if (select count(*) from pg_trigger
       where tgrelid = 'public.auditoria_estudio'::regclass and not tgisinternal) < 2 then
    raise exception 'auditoria_estudio ha perdido sus triggers de inmutabilidad';
  end if;
end;
$$;
