-- Datos de DEMO para la tarjeta de "riesgo de concentración por instructora".
--
-- Se insertaron a mano en producción en algún momento y NO estaban en ningún
-- fichero del repo, así que al limpiarlos (25-07-2026) no había forma de
-- volver a generarlos. Este script existe para eso.
--
-- ⚠️ NO EJECUTAR CONTRA EL ESTUDIO DE UN CLIENTE REAL. Crea socias, recibos
-- COBRADOS y asistencias falsas: inflan la facturación (la versión anterior
-- metía 7.000 € que se colaban en el Cierre de año) y disparan una alerta de
-- riesgo ALTO inventada. Úsalo solo en local o en un estudio de pruebas.
--
--   psql "$DATABASE_URL" -v studio=studio-demo -f scripts/seed-riesgo-dependencia.sql
--
-- Tres instructoras con distinto grado de cartera cautiva: A dispara ALTO
-- (5 alumnas exclusivas y caras), B queda en medio, C es residual. Las cuatro
-- "flotantes" reparten asistencias entre las tres para que la exclusividad de
-- las cautivas signifique algo.

\set studio :studio

begin;

insert into instructores (id, studio_id, nombre, rol, activo) values
  ('seed-dep-ins-A', :'studio', 'Lucía (demo)', 'INSTRUCTOR', true),
  ('seed-dep-ins-B', :'studio', 'Marta (demo)', 'INSTRUCTOR', true),
  ('seed-dep-ins-C', :'studio', 'Elena (demo)', 'INSTRUCTOR', true)
on conflict (id) do nothing;

-- Cautivas (solo van con "su" instructora) + flotantes (van con todas).
insert into socios (id, studio_id, nombre, apellidos, email, activo, fecha_alta)
select 'seed-dep-soc-' || g.grupo || '-' || g.n, :'studio',
       case when g.grupo = 'F' then 'Flotante' else 'Cautiva' end || ' ' || g.grupo || g.n,
       'Demo', 'seed-dep-' || g.grupo || g.n || '@example.com', true, now() - interval '11 days'
from (values ('A',1),('A',2),('A',3),('A',4),('A',5),
             ('B',1),('B',2),('B',3),('B',4),
             ('C',1),('C',2),('C',3),
             ('F',1),('F',2),('F',3),('F',4)) as g(grupo, n)
on conflict (id) do nothing;

-- El gasto por grupo es lo que decide el nivel de riesgo.
insert into recibos (id, studio_id, socio_id, concepto, importe, estado, fecha_vencimiento, fecha_cobro)
select 'seed-dep-rec-' || g.grupo || '-' || g.n, :'studio',
       'seed-dep-soc-' || g.grupo || '-' || g.n, 'Cuota demo',
       case g.grupo when 'A' then 800 when 'B' then 450 when 'C' then 200 else 150 end,
       'COBRADO', current_date - 41, current_date - 41
from (values ('A',1),('A',2),('A',3),('A',4),('A',5),
             ('B',1),('B',2),('B',3),('B',4),
             ('C',1),('C',2),('C',3),
             ('F',1),('F',2),('F',3),('F',4)) as g(grupo, n)
on conflict (id) do nothing;

-- Tres sesiones por instructora, dentro de la ventana de 90 días.
insert into sesiones (id, studio_id, instructor_id, inicio, fin, aforo_maximo, cancelada)
select 'seed-dep-ses-' || i.letra || '-' || d.n, :'studio', 'seed-dep-ins-' || i.letra,
       now() - (d.dias || ' days')::interval,
       now() - (d.dias || ' days')::interval + interval '1 hour', 12, false
from (values ('A'),('B'),('C')) as i(letra),
     (values (0,21),(1,36),(2,51)) as d(n, dias)
on conflict (id) do nothing;

-- Cautivas: solo a las clases de su instructora. Flotantes: a las de todas.
insert into reservas (id, studio_id, socio_id, sesion_id, estado, creado_en)
select 'seed-dep-res-' || g.grupo || '-' || g.n || '-' || d.n, :'studio',
       'seed-dep-soc-' || g.grupo || '-' || g.n,
       'seed-dep-ses-' || g.grupo || '-' || d.n, 'ASISTIDA', now() - interval '11 days'
from (values ('A',1),('A',2),('A',3),('A',4),('A',5),
             ('B',1),('B',2),('B',3),('B',4),
             ('C',1),('C',2),('C',3)) as g(grupo, n),
     (values (0),(1),(2)) as d(n)
on conflict (id) do nothing;

insert into reservas (id, studio_id, socio_id, sesion_id, estado, creado_en)
select 'seed-dep-res-F-' || f.n || '-' || i.letra || '-' || d.n, :'studio',
       'seed-dep-soc-F-' || f.n, 'seed-dep-ses-' || i.letra || '-' || d.n,
       'ASISTIDA', now() - interval '11 days'
from (values (1),(2),(3),(4)) as f(n),
     (values ('A'),('B'),('C')) as i(letra),
     (values (0),(1)) as d(n)
on conflict (id) do nothing;

commit;

-- Para borrarlo todo después (el orden importa por las claves ajenas):
--   delete from instructor_dependency_snapshots where instructor_id like 'seed-dep-ins-%';
--   delete from reservas  where id like 'seed-dep-res-%';
--   delete from recibos   where id like 'seed-dep-rec-%';
--   delete from sesiones  where id like 'seed-dep-ses-%';
--   delete from socios    where id like 'seed-dep-soc-%';
--   delete from instructores where id like 'seed-dep-ins-%';
