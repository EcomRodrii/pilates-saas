-- ═══════════════════════════════════════════════════════════════════════════
-- Saca los correos de datos de demo/prueba a dominios reservados (RFC 2606)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- POR QUÉ. Los estudios de prueba tienen socias sembradas con direcciones de
-- dominios REALES (gmail.com, hotmail.com, yahoo.es, email.com). Cualquier
-- prueba manual de algo que manda correo —cancelar una clase, el recordatorio
-- de 24 h, un recibo, promocionar de la lista de espera, el aviso de cambio de
-- instructora— escribe a buzones de personas de verdad desde nuestro dominio de
-- envío. Además de la molestia, cada rebote ensucia la reputación en Resend.
--
-- QUÉ HACE. Cambia SOLO el dominio y conserva la parte local, para que la ficha
-- siga siendo reconocible en el panel: ana.fernandez@gmail.com pasa a ser
-- ana.fernandez@ejemplo.test. `.test` es un TLD reservado por la RFC 2606: no
-- existe y no se resolverá nunca. `socios.email` no tiene índice único, así que
-- dos filas que compartan parte local no rompen nada.
--
-- QUÉ **NO** HACE. No borra filas, no toca `auth.users` y no toca los correos
-- de acceso del personal. Es reversible mientras guardes la salida del PASO 0.
--
-- CÓMO SE USA. Los pasos van SUELTOS y en orden. Ejecuta el PASO 0, revisa la
-- salida, y sólo entonces ejecuta el PASO 1 y/o el PASO 2. No pegues el archivo
-- entero de una vez.
--
-- El origen ya está tapado en el código (lib/migracion/ejemplos.ts y
-- supabase/seed.sql generan direcciones reservadas, y hay guarda antes de
-- llamar a Resend en app/api/emails/send/route.ts y lib/emails/send-server.ts).
-- Esto es sólo para las filas que YA están escritas en producción.


-- ───────────────────────────────────────────────────────────────────────────
-- PASO 0 — INVENTARIO. Sólo lee. Guarda esta salida: es tu marcha atrás.
-- ───────────────────────────────────────────────────────────────────────────
-- Antes de nada: ¿en qué estudios hay direcciones de dominio real? Sirve para
-- decidir la lista del PASO 1 con datos delante en vez de de memoria.

select s.id                                  as studio_id,
       s.nombre                              as estudio,
       count(*)                              as socias_con_dominio_real,
       count(*) filter (where so.email in (
         -- Las 5 direcciones inventadas de los CSV de ejemplo de la landing
         -- (lib/migracion/ejemplos.ts). Si aparecen, esa fila entró importando
         -- el archivo de muestra: es demo, no una clienta.
         'maria.soler@gmail.com', 'nora.ruiz@hotmail.com', 'lucia.g@gmail.com',
         'ana.fernandez@gmail.com', 'berta.moreno@gmail.com'
       ))                                    as vienen_del_csv_de_ejemplo,
       min(so.fecha_alta)                    as alta_mas_antigua,
       string_agg(distinct split_part(so.email, '@', 2), ', ' order by split_part(so.email, '@', 2)) as dominios
  from socios so
  join studios s on s.id = so.studio_id
 where so.email is not null
   and so.email <> ''
   -- Sólo lo que NO está ya en un dominio reservado.
   and split_part(lower(trim(so.email)), '@', 2) not in
       ('example.com', 'example.org', 'example.net', 'ejemplo.com', 'invalid', 'localhost')
   and split_part(lower(trim(so.email)), '@', 2) not like '%.test'
 group by s.id, s.nombre
 order by vienen_del_csv_de_ejemplo desc, socias_con_dominio_real desc;

-- Y el detalle fila a fila de los estudios que vayas a tocar. Cambia la lista.
-- ESTA es la salida que hay que guardar para poder deshacer.
select so.id, so.studio_id, so.nombre, so.apellidos, so.email
  from socios so
 where so.studio_id in ('studio-1784759384830-lw2lm9' /* , 'otro-studio-id' */)
 order by so.studio_id, so.nombre;


-- ───────────────────────────────────────────────────────────────────────────
-- PASO 1 — Estudios de prueba enteros.
-- ───────────────────────────────────────────────────────────────────────────
-- ⚠️ Sólo ids que sean estudios de PRUEBA de principio a fin. Si un estudio
-- mezcla clientas reales con sembradas, NO lo pongas aquí: usa el PASO 2, que
-- va dirigido sólo a las direcciones que sabemos inventadas.
--
-- `studio-1` merece un momento de duda: es a la vez el estudio sembrado y el
-- estudio real de Tentare, así que puede tener clientas de verdad mezcladas.

begin;

update socios
   set email = split_part(email, '@', 1) || '@ejemplo.test'
 where studio_id in ('studio-1784759384830-lw2lm9' /* , 'otro-studio-id' */)
   and email is not null
   and email <> ''
   and split_part(lower(trim(email)), '@', 2) not like '%.test';

-- Las instructoras también reciben correo (sustituciones, invitación de equipo),
-- así que en un estudio de prueba van por el mismo camino.
update instructores
   set email = split_part(email, '@', 1) || '@ejemplo.test'
 where studio_id in ('studio-1784759384830-lw2lm9' /* , 'otro-studio-id' */)
   and email is not null
   and email <> ''
   and split_part(lower(trim(email)), '@', 2) not like '%.test';

-- Comprueba ANTES de confirmar: no debe quedar ningún dominio real.
select 'socios' as tabla, email from socios
 where studio_id in ('studio-1784759384830-lw2lm9' /* , 'otro-studio-id' */)
   and email is not null and email <> ''
union all
select 'instructores', email from instructores
 where studio_id in ('studio-1784759384830-lw2lm9' /* , 'otro-studio-id' */)
   and email is not null and email <> '';

-- Si la salida es la esperada:  commit;
-- Si no:                        rollback;
rollback;


-- ───────────────────────────────────────────────────────────────────────────
-- PASO 2 — Las direcciones de los CSV de ejemplo, estén donde estén.
-- ───────────────────────────────────────────────────────────────────────────
-- Estas 5 personas no existen: son las del archivo de muestra que se descarga
-- de la landing. Donde aparezcan, la fila entró probando el importador. Ojo:
-- esto puede tocar el estudio de una clienta de verdad que probó la migración
-- con el archivo de muestra — lo cual es exactamente lo que queremos, porque
-- ese estudio también le escribiría a esos buzones. Revisa el PASO 0 primero.

begin;

update socios
   set email = split_part(email, '@', 1) || '@ejemplo.test'
 where lower(trim(email)) in (
         'maria.soler@gmail.com', 'nora.ruiz@hotmail.com', 'lucia.g@gmail.com',
         'ana.fernandez@gmail.com', 'berta.moreno@gmail.com'
       );

-- Las 8 socias del seed original (supabase/seed.sql), que iban a `@email.com`.
-- `email.com` parece de mentira pero es un proveedor de correo REAL y activo.
update socios
   set email = split_part(email, '@', 1) || '@ejemplo.test'
 where split_part(lower(trim(email)), '@', 2) = 'email.com';

select id, studio_id, nombre, email from socios
 where split_part(lower(trim(email)), '@', 2) = 'ejemplo.test'
 order by studio_id, nombre;

-- Si la salida es la esperada:  commit;
-- Si no:                        rollback;
rollback;


-- ───────────────────────────────────────────────────────────────────────────
-- PASO 3 — La ficha que se puso a mano para probar el aviso de instructora.
-- ───────────────────────────────────────────────────────────────────────────
-- soc-ms11p2wm-3-nqsqi (Ana Fernández Gil) lleva la dirección personal de Marco
-- para poder verificar en vivo el aviso de cambio de instructora. Devuélvela a
-- un dominio de ejemplo cuando termines de comprobarlo — si no, seguirá
-- recibiendo cada prueba de cada correo del producto.
--
-- Los PASOS 1 y 2 la cogen sólo si su estudio está en la lista del PASO 1; este
-- paso la arregla suelta, por si no lo está.

update socios
   set email = 'ana.fernandez@ejemplo.test'
 where id = 'soc-ms11p2wm-3-nqsqi';
