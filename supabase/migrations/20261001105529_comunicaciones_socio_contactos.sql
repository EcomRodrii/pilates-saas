-- Contactos apuntados a mano desde la ficha de la clienta: «la llamé», «le
-- escribí por WhatsApp», «hablé con ella en el estudio», con qué dijo.
--
-- Van en `comunicaciones_socio` (tipo 'contacto') y no en una tabla nueva: esa
-- tabla ya tiene resuelto todo lo que un dato de una clienta necesita —la borra
-- `anonimizar_socio`, la incluye la purga de un estudio vencido, la saca la
-- exportación de sus datos, y `anonimizar_instructor` ya sustituye el nombre de
-- quien la escribió—. Una tabla nueva obligaba a rehacer las cuatro cosas.
--
-- El navegador LEE (PROPIETARIO, MANAGER y RECEPCION, su política de siempre) y
-- el servidor ESCRIBE (app/api/socios/[id]/contactos), que comprueba el rol, que
-- la socia es del estudio, y que se guarda de verdad antes de decir «apuntado».

alter table public.comunicaciones_socio
  add column if not exists canal text,
  add column if not exists resultado text,
  add column if not exists nota text;

alter table public.comunicaciones_socio drop constraint if exists comunicaciones_socio_tipo_check;
alter table public.comunicaciones_socio add constraint comunicaciones_socio_tipo_check
  check (tipo in ('recibo', 'bienvenida', 'reserva', 'automatizacion', 'promocion', 'cancelacion', 'cambio', 'recordatorio', 'contacto'));
alter table public.comunicaciones_socio add constraint comunicaciones_socio_canal_check
  check (canal is null or canal in ('WHATSAPP', 'LLAMADA', 'EN_PERSONA', 'EMAIL'));
alter table public.comunicaciones_socio add constraint comunicaciones_socio_resultado_check
  check (resultado is null or resultado in ('VA_A_VOLVER', 'SE_LO_PIENSA', 'NO_CONTESTA', 'NO_QUIERE_SEGUIR'));
alter table public.comunicaciones_socio add constraint comunicaciones_socio_nota_check
  check (nota is null or length(btrim(nota)) between 1 and 1000);
-- Un contacto lleva canal y quien lo apuntó; un correo del sistema no lleva ni
-- canal, ni resultado, ni nota. Así un correo nunca se cuela como «la llamé».
alter table public.comunicaciones_socio add constraint comunicaciones_socio_contacto_coherente
  check (case when tipo = 'contacto' then canal is not null and creado_por is not null
              else canal is null and resultado is null and nota is null end);

-- El Decision OS lee los de 90 días de un estudio (fetchContactosManualesRecientes).
create index if not exists idx_comunicaciones_socio_contactos
  on public.comunicaciones_socio (studio_id, creado_en desc) where tipo = 'contacto';

-- La migración original solo dio SELECT a `authenticated`, sin quitar lo que
-- `pg_default_acl` da en este proyecto a anon/authenticated en cada tabla nueva.
-- Se deja explícito: el cliente solo lee; escribir y borrar, el servidor.
revoke all on table public.comunicaciones_socio from public, anon, authenticated;
grant select on table public.comunicaciones_socio to authenticated;
grant select, insert, delete on table public.comunicaciones_socio to service_role;

do $$
begin
  if has_table_privilege('anon', 'public.comunicaciones_socio', 'SELECT')
     or has_table_privilege('authenticated', 'public.comunicaciones_socio', 'INSERT')
     or has_table_privilege('authenticated', 'public.comunicaciones_socio', 'UPDATE')
     or has_table_privilege('authenticated', 'public.comunicaciones_socio', 'DELETE')
     or has_column_privilege('authenticated', 'public.comunicaciones_socio', 'nota', 'UPDATE') then
    raise exception 'comunicaciones_socio: el cliente no puede apuntar, cambiar ni borrar contactos';
  end if;
  if not has_table_privilege('authenticated', 'public.comunicaciones_socio', 'SELECT')
     or not has_table_privilege('service_role', 'public.comunicaciones_socio', 'INSERT')
     or not has_table_privilege('service_role', 'public.comunicaciones_socio', 'DELETE') then
    raise exception 'comunicaciones_socio: faltan los permisos del panel (leer) o del servidor (apuntar y borrar)';
  end if;
  if exists (
    select 1 from pg_constraint c
     where c.conrelid = 'public.comunicaciones_socio'::regclass and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ~ 'tipo' and pg_get_constraintdef(c.oid) !~ 'contacto'
  ) then
    raise exception 'comunicaciones_socio: queda un CHECK de tipo que rechaza los contactos';
  end if;
end $$;
