-- ─────────────────────────────────────────────────────────────────────────────
-- Comentarios del tablón con nombre e inicial, también los ya guardados.
--
-- El POST de la alumna guardaba su nombre completo («Lucía Martínez Gómez») en
-- `comentarios_comunidad.autor_nombre`, y lo leían todas sus compañeras. Desde
-- este cambio el servidor guarda «Lucía M.» (`nombreEnElTablon`,
-- lib/comunidad/comentarios-reglas.ts, la misma regla que la lista de clase de
-- la instructora). Esto recorta con esa MISMA regla lo que ya estaba guardado,
-- a partir de su ficha:
--   · nombre + espacio + inicial en mayúscula del PRIMER apellido + punto;
--   · sin apellidos, solo el nombre; sin nombre, la inicial («M.») o «Clienta».
-- La inicial del avatar (`autor_inicial`) pasa a ser la del nombre y la del
-- apellido, como la calcula el servidor.
--
-- Solo las filas de una alumna (`socio_id`): lo que firma el estudio o el
-- equipo se queda como está. Solo datos, sin permisos ni funciones.
--
-- ⚠️ Va DESPUÉS de desplegar el código: con el POST de antes, un comentario
-- escrito entre medias volvería a guardar el nombre completo. Se puede repetir
-- (solo toca las filas cuyo nombre todavía no es el corto).
-- ─────────────────────────────────────────────────────────────────────────────

with cortos as (
  select cc.id,
         btrim(coalesce(s.nombre, '')) as nombre,
         upper(left(split_part(btrim(coalesce(s.apellidos, '')), ' ', 1), 1)) as inicial_apellido
    from public.comentarios_comunidad cc
    join public.socios s on s.id = cc.socio_id and s.studio_id = cc.studio_id
   where cc.socio_id is not null
), nuevos as (
  select id,
         case
           when nombre = '' and inicial_apellido = '' then 'Clienta'
           when nombre = '' then inicial_apellido || '.'
           when inicial_apellido = '' then nombre
           else nombre || ' ' || inicial_apellido || '.'
         end as autor_nombre,
         coalesce(nullif(upper(left(nombre, 1)) || inicial_apellido, ''), 'C') as autor_inicial
    from cortos
)
update public.comentarios_comunidad cc
   set autor_nombre = n.autor_nombre,
       autor_inicial = n.autor_inicial
  from nuevos n
 where cc.id = n.id
   and (cc.autor_nombre is distinct from n.autor_nombre or cc.autor_inicial is distinct from n.autor_inicial);
