-- ─────────────────────────────────────────────────────────────────────────────
-- Canjes: código único, entrega trazada y una sola operación atómica.
--
-- ── Qué estaba pasando ───────────────────────────────────────────────────────
-- El 9-sep-2026 el fundador canjeó una botella por 5 créditos en producción y
-- no vio nada. Volvió a pulsar 41 segundos después. Resultado: DOS canjes,
-- 10 créditos, una botella. Los datos estaban bien —los dos canjes existen y
-- los dos descuentos cuadran— pero nada se lo dijo, así que pagó dos veces.
--
-- Lo que faltaba no era un mensaje: era el objeto del que hablar. `codigo`,
-- `entregado_en` y `entregado_por` no existían, así que el canje no se podía
-- enseñar, ni buscar, ni entregar, ni cerrar.
--
-- ── El agujero que no se veía ────────────────────────────────────────────────
-- El canje se hacía en TRES llamadas seguidas desde TypeScript: reservar stock,
-- descontar créditos, insertar la fila. Las dos primeras eran atómicas cada una
-- por su lado; la tercera ni siquiera comprobaba su error. Entre la segunda y
-- la tercera cabe un fallo que deja a la socia sin créditos y sin canje — el
-- «canje fantasma» exacto que el encargo pide impedir. Aquí pasan a ser UNA
-- función, y una función PL/pgSQL es una transacción: o todo, o nada.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Las columnas que faltaban ─────────────────────────────────────────────
alter table public.reward_redemptions
  add column if not exists codigo text,
  add column if not exists entregado_en timestamptz,
  add column if not exists entregado_por text,
  -- La clase gratis se entrega creando una `recuperacion`. Hasta ahora el único
  -- rastro era la frase «Canje de recompensa: X» en `motivo`: para saber si una
  -- reserva se pagó con una recompensa había que leer castellano. Con la clave
  -- se puede preguntar.
  add column if not exists recuperacion_id text;

comment on column public.reward_redemptions.codigo is
  'Código que la socia enseña en el estudio (TNT-XXXXXX). Único por estudio. NO es la única forma de validar: el mostrador puede entregar desde el panel sin pedirlo.';
comment on column public.reward_redemptions.entregado_por is
  'auth.uid() de quien lo entregó. NULL mientras está PENDIENTE, y también en los ENTREGADO históricos anteriores a esta migración.';

-- ── 2. Generador del código ──────────────────────────────────────────────────
--
-- Alfabeto sin O/0/I/1: el código se dicta en voz alta y se teclea en un
-- mostrador. Confundir una O con un cero convierte una entrega en una
-- discusión.
--
-- ⚠️ `extensions.gen_random_bytes`, NO `random()`. `random()` es un PRNG
-- sembrable: quien conozca la semilla reproduce la secuencia entera. Para un
-- código que autoriza llevarse algo del estudio, eso no vale — y el encargo
-- pide explícitamente que no sea adivinable.
create or replace function public.generar_codigo_canje(p_studio_id text)
returns text
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- 32 símbolos
  v_codigo text;
  v_bytes bytea;
  v_intentos int := 0;
begin
  loop
    v_bytes := extensions.gen_random_bytes(6);
    v_codigo := 'TNT-';
    for i in 0..5 loop
      -- `& 31` mapea cada byte al alfabeto sin sesgo: 256 es múltiplo de 32.
      v_codigo := v_codigo || substr(v_alfabeto, (get_byte(v_bytes, i) & 31) + 1, 1);
    end loop;

    exit when not exists (
      select 1 from reward_redemptions r
      where r.studio_id = p_studio_id and r.codigo = v_codigo
    );

    -- 32^6 son mil millones de combinaciones por estudio. Veinte colisiones
    -- seguidas no es mala suerte: es que algo va mal. Mejor fallar que girar.
    v_intentos := v_intentos + 1;
    if v_intentos >= 20 then
      raise exception 'CODIGO_NO_GENERADO';
    end if;
  end loop;
  return v_codigo;
end;
$function$;

-- ── 3. Los canjes que ya existen se quedan sin código ────────────────────────
-- Son dos, de la prueba del fundador. Sin código no se pueden entregar por la
-- vía nueva, así que se les pone uno antes de exigir la columna.
update public.reward_redemptions
   set codigo = public.generar_codigo_canje(studio_id)
 where codigo is null;

alter table public.reward_redemptions
  alter column codigo set not null;

-- Único POR ESTUDIO, no global: dos estudios distintos pueden repetir código
-- sin que eso confunda a nadie, y hacerlo global obligaría a coordinarlos.
-- El índice es además por lo que se busca en el mostrador.
create unique index if not exists idx_reward_redemptions_codigo
  on public.reward_redemptions (studio_id, codigo);

-- ── 4. El canje entero, en una sola transacción ──────────────────────────────
--
-- Sustituye a `reservar_recompensa` + `ajustar_creditos` + INSERT desde TS.
-- Devuelve el código, que es lo que la pantalla necesita para poder enseñar
-- algo. Los errores salen como CÓDIGO, no como frase: el mensaje lo pone quien
-- llama, que es el que sabe si habla con la clienta o con el mostrador.
create or replace function public.canjear_recompensa(
  p_redemption_id text,
  p_item_id text,
  p_studio_id text,
  p_socio_id text
) returns text
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_activo boolean;
  v_stock int;
  v_limite int;
  v_desde date;
  v_hasta date;
  v_coste int;
  v_nombre text;
  v_usadas int;
  v_codigo text;
  v_hoy date := (now() at time zone 'Europe/Madrid')::date;
begin
  perform public.validar_studio_mismatch(p_studio_id);
  perform public.validar_socio_del_studio(p_socio_id, p_studio_id);

  -- Mismo guardián que `reservar_recompensa`: con service role (`auth.uid()`
  -- nulo) entra el canje del portal, que ya verificó la identidad contra el
  -- JWT; con sesión de navegador entra el mostrador, y ahí hace falta rol de
  -- gestión. Una socia autenticada NO pasa por aquí.
  if auth.uid() is not null and not public.puede_gestionar_clientas() then
    raise exception 'NO_AUTORIZADO';
  end if;

  -- `for update` serializa todos los canjes de este ítem. Es lo que hace
  -- fiable contar los ya usados: sin el cerrojo, dos peticiones simultáneas de
  -- la misma socia leerían el mismo conteo y pasarían las dos.
  select c.activo, c.stock, c.limite_por_socia, c.disponible_desde, c.disponible_hasta,
         c.coste_creditos, c.nombre
    into v_activo, v_stock, v_limite, v_desde, v_hasta, v_coste, v_nombre
  from reward_catalog c
  where c.id = p_item_id and c.studio_id = p_studio_id
  for update;

  if not found or not v_activo then
    raise exception 'NO_DISPONIBLE';
  end if;

  if (v_desde is not null and v_hoy < v_desde) or (v_hasta is not null and v_hoy > v_hasta) then
    raise exception 'FUERA_DE_VIGENCIA';
  end if;

  if v_limite is not null then
    -- Los CANCELADOS no cuentan: cancelar devuelve créditos y stock, así que
    -- devuelve también el derecho a volver a canjearla.
    select count(*) into v_usadas
    from reward_redemptions r
    where r.studio_id = p_studio_id and r.socio_id = p_socio_id
      and r.catalog_item_id = p_item_id and r.estado is distinct from 'CANCELADO';
    if v_usadas >= v_limite then
      raise exception 'LIMITE_ALCANZADO';
    end if;
  end if;

  if v_stock is not null then
    if v_stock <= 0 then
      raise exception 'SIN_STOCK';
    end if;
    update reward_catalog set stock = stock - 1
     where id = p_item_id and studio_id = p_studio_id;
  end if;

  -- El coste sale del CATÁLOGO, nunca del parámetro: quien llama no decide
  -- cuánto cuesta una recompensa. Lanza SALDO_INSUFICIENTE si no llega.
  perform public.ajustar_creditos(p_socio_id, p_studio_id, -v_coste, 0, v_coste);

  v_codigo := public.generar_codigo_canje(p_studio_id);

  insert into reward_redemptions
    (id, studio_id, socio_id, catalog_item_id, creditos_gastados, estado, codigo, creado_en)
  values
    (p_redemption_id, p_studio_id, p_socio_id, p_item_id, v_coste, 'PENDIENTE', v_codigo, now());

  -- El apunte en el histórico de créditos va DENTRO de la transacción por el
  -- mismo motivo que todo lo demás: un saldo que baja sin apunte es un saldo
  -- que nadie puede explicar después.
  insert into credit_transactions (id, studio_id, socio_id, tipo, creditos, descripcion, ref_id, creado_en)
  values ('ctx-' || p_redemption_id, p_studio_id, p_socio_id, 'CANJE', -v_coste,
          'Canje: ' || v_nombre, p_redemption_id, now());

  return v_codigo;
end;
$function$;

-- ── 5. Entregar ──────────────────────────────────────────────────────────────
--
-- Idempotente y con memoria: guarda QUIÉN y CUÁNDO. Se puede llamar con el
-- código (la socia lo enseña) o con el id (la propietaria la reconoce y lo
-- entrega desde el panel, sin pedir nada) — el encargo insiste en que el código
-- no puede ser una barrera, así que no es la única llave.
create or replace function public.entregar_canje(
  p_studio_id text,
  p_redemption_id text default null,
  p_codigo text default null
) returns text
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_id text;
  v_estado text;
begin
  perform public.validar_studio_mismatch(p_studio_id);

  if auth.uid() is not null and not public.puede_gestionar_clientas() then
    raise exception 'NO_AUTORIZADO';
  end if;

  if p_redemption_id is null and p_codigo is null then
    raise exception 'FALTA_IDENTIFICADOR';
  end if;

  -- `for update` para que dos pulsaciones simultáneas de «Entregar» no puedan
  -- ver las dos el estado PENDIENTE.
  select r.id, r.estado into v_id, v_estado
  from reward_redemptions r
  where r.studio_id = p_studio_id
    and (p_redemption_id is null or r.id = p_redemption_id)
    and (p_codigo is null or r.codigo = upper(trim(p_codigo)))
  for update;

  if not found then
    raise exception 'CANJE_NO_ENCONTRADO';
  end if;

  -- Un código ya usado se rechaza en vez de «entregarse» otra vez. Esto es lo
  -- que impide que la misma botella salga dos veces del estudio.
  if v_estado = 'ENTREGADO' then
    raise exception 'YA_ENTREGADO';
  end if;
  if v_estado = 'CANCELADO' then
    raise exception 'CANJE_CANCELADO';
  end if;

  update reward_redemptions
     set estado = 'ENTREGADO', entregado_en = now(), entregado_por = auth.uid()::text
   where id = v_id;

  return v_id;
end;
$function$;

-- ── 6. RLS: leer todo el estudio, escribir solo quien gestiona ───────────────
--
-- ⚠️ Había UNA política, `ALL` con `studio_id = current_studio_id()` y SIN
-- comprobación de rol: una instructora podía marcar un canje como entregado o
-- CANCELARLO — y cancelar devuelve créditos y stock. La tabla de al lado,
-- `recuperaciones`, ya distinguía lectura de escritura desde siempre; esta se
-- quedó atrás. Mismo criterio ahora.
drop policy if exists admin_reward_redemptions on public.reward_redemptions;

create policy reward_redemptions_lectura on public.reward_redemptions
  for select using (studio_id = public.current_studio_id());

create policy reward_redemptions_insert on public.reward_redemptions
  for insert with check (studio_id = public.current_studio_id() and public.puede_gestionar_clientas());

create policy reward_redemptions_update on public.reward_redemptions
  for update using (studio_id = public.current_studio_id() and public.puede_gestionar_clientas());

create policy reward_redemptions_delete on public.reward_redemptions
  for delete using (studio_id = public.current_studio_id() and public.puede_gestionar_clientas());

-- ── 7. Grants ────────────────────────────────────────────────────────────────
--
-- ⚠️ Firmas NUEVAS: Postgres crea objetos función nuevos con `EXECUTE` a
-- PUBLIC por defecto, y `pg_default_acl` en este proyecto además se lo da
-- directo a anon/authenticated. Revocar PUBLIC no basta — hay que revocar los
-- tres y volver a conceder a mano. Va documentado en `.claude/tentare-os.md` y
-- ya ha mordido cuatro veces.
revoke all on function public.generar_codigo_canje(text) from public, anon, authenticated;
grant execute on function public.generar_codigo_canje(text) to service_role;

revoke all on function public.canjear_recompensa(text, text, text, text) from public, anon;
grant execute on function public.canjear_recompensa(text, text, text, text) to authenticated, service_role;

revoke all on function public.entregar_canje(text, text, text) from public, anon;
grant execute on function public.entregar_canje(text, text, text) to authenticated, service_role;
