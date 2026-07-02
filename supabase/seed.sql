-- ═══════════════════════════════════════════════════════════════════
-- PILATES SAAS — Seed data (pega DESPUÉS de schema.sql)
-- Semana actual: lun 2026-06-29 … sáb 2026-07-04
-- ═══════════════════════════════════════════════════════════════════

-- ─── Studio ──────────────────────────────────────────────────────────────────
insert into studios (id,nombre,nif,razon_social,direccion,ciudad,codigo_postal,email,telefono,color_primario,plan,creado_en) values
('studio-1','Pilates Boutique','B12345678','Pilates Boutique SL','Calle Larios 12, 2º','Málaga','29005','hola@pilatesboutique.es','+34 951 000 000','#6366f1','ESTUDIO','2024-01-15T10:00:00Z');

-- ─── Socios ───────────────────────────────────────────────────────────────────
insert into socios (id,studio_id,nombre,apellidos,email,telefono,nif,fecha_alta,activo,aceptacion_fecha,aceptacion_firma,aceptacion_version) values
('soc-1','studio-1','Laura','Martínez García','laura@email.com','+34 600 111 222','12345678A','2026-01-10T00:00:00Z',true,'2026-01-10T11:32:00Z','Laura Martínez García','v1.0'),
('soc-2','studio-1','Carmen','López Ruiz','carmen@email.com','+34 600 333 444','23456789B','2026-02-03T00:00:00Z',true,'2026-02-03T10:15:00Z','Carmen López Ruiz','v1.0'),
('soc-3','studio-1','Ana','Fernández Torres','ana@email.com',null,null,'2026-02-20T00:00:00Z',true,'2026-02-20T09:50:00Z','Ana Fernández Torres','v1.0'),
('soc-4','studio-1','Isabel','González Díaz','isabel@email.com','+34 600 555 666','45678901D','2026-03-12T00:00:00Z',true,'2026-03-12T18:02:00Z','Isabel González Díaz','v1.1'),
('soc-5','studio-1','Marta','Sánchez Moreno','marta@email.com','+34 600 777 888',null,'2026-03-28T00:00:00Z',true,'2026-03-28T17:45:00Z','Marta Sánchez Moreno','v1.1'),
('soc-6','studio-1','Sofía','Ramírez Castro','sofia@email.com',null,'67890123F','2026-04-14T00:00:00Z',false,'2026-04-14T10:30:00Z','Sofía Ramírez Castro','v1.1'),
('soc-7','studio-1','Elena','Jiménez Navarro','elena@email.com','+34 600 999 000',null,'2026-04-28T00:00:00Z',true,null,null,null),
('soc-8','studio-1','Patricia','Romero Vega','patricia@email.com','+34 600 111 333','89012345H','2026-05-19T00:00:00Z',true,null,null,null);

-- ─── Planes de tarifa ─────────────────────────────────────────────────────────
insert into planes_tarifa (id,studio_id,nombre,descripcion,precio,tipo,sesiones,activo) values
('plan-1','studio-1','Mensual Ilimitado','Clases ilimitadas al mes',85,'MENSUAL',null,true),
('plan-2','studio-1','Bono 8 clases','Válido 3 meses',64,'BONO',8,true),
('plan-3','studio-1','Bono 4 clases','Válido 2 meses',36,'BONO',4,true),
('plan-4','studio-1','Clase suelta',null,12,'PUNTUAL',1,true);

-- ─── Suscripciones ────────────────────────────────────────────────────────────
insert into suscripciones (id,studio_id,socio_id,plan_id,estado,fecha_inicio,fecha_fin,sesiones_restantes) values
('sus-1','studio-1','soc-1','plan-1','ACTIVA','2026-06-01','2026-07-01',null),
('sus-2','studio-1','soc-2','plan-2','ACTIVA','2026-06-01','2026-09-01',5),
('sus-3','studio-1','soc-3','plan-1','ACTIVA','2026-05-01','2026-07-08',null),
('sus-4','studio-1','soc-4','plan-2','ACTIVA','2026-06-15','2026-09-15',3),
('sus-5','studio-1','soc-5','plan-1','ACTIVA','2026-06-01','2026-07-15',null),
('sus-7','studio-1','soc-7','plan-3','ACTIVA','2026-07-01','2026-09-01',2),
('sus-8','studio-1','soc-8','plan-1','ACTIVA','2026-06-10','2026-07-10',null);

-- ─── Salas ───────────────────────────────────────────────────────────────────
insert into salas (id,studio_id,nombre,capacidad,color) values
('sala-1','studio-1','Sala Reformer',8,'#6366f1'),
('sala-2','studio-1','Sala Mat',12,'#10b981');

-- ─── Spots ───────────────────────────────────────────────────────────────────
insert into spots (id,sala_id,studio_id,numero,nombre,fila,columna,tipo,activo) values
('spot-1','sala-1','studio-1',1,'R1',0,0,'REFORMER',true),
('spot-2','sala-1','studio-1',2,'R2',0,1,'REFORMER',true),
('spot-3','sala-1','studio-1',3,'R3',0,2,'REFORMER',true),
('spot-4','sala-1','studio-1',4,'R4',0,3,'REFORMER',true),
('spot-5','sala-1','studio-1',5,'R5',1,0,'REFORMER',true),
('spot-6','sala-1','studio-1',6,'R6',1,1,'REFORMER',true),
('spot-7','sala-1','studio-1',7,'R7',1,2,'REFORMER',true),
('spot-8','sala-1','studio-1',8,'R8',1,3,'REFORMER',true);

-- ─── Tipos de clase ───────────────────────────────────────────────────────────
insert into tipos_clase (id,studio_id,nombre,color,duracion_minutos,descripcion,nivel) values
('tc-1','studio-1','Reformer Fundamental','#1C1C28',55,'Clase base en reformer','PRINCIPIANTE'),
('tc-2','studio-1','Reformer Avanzado','#C3D9B0',55,'Para alumnas con experiencia','AVANZADO'),
('tc-3','studio-1','Pilates Mat','#C8C2E8',60,'Trabajo en colchoneta','TODOS'),
('tc-4','studio-1','Mat + Circuito','#E8D5C2',50,'Combinación mat y accesorios','MEDIO');

-- ─── Instructores ─────────────────────────────────────────────────────────────
insert into instructores (id,studio_id,nombre,email,telefono,color,activo) values
('ins-1','studio-1','María Soler','maria@pilatesboutique.es','+34 611 000 001','#f59e0b',true),
('ins-2','studio-1','Julia Ramos','julia@pilatesboutique.es','+34 611 000 002','#ec4899',true);

-- ─── Sesiones (semana actual: lun 2026-06-29 … sáb 2026-07-04) ───────────────
insert into sesiones (id,studio_id,tipo_clase_id,sala_id,instructor_id,inicio,fin,aforo_maximo,cancelada) values
-- Lunes
('ses-1','studio-1','tc-1','sala-1','ins-1','2026-06-29T09:00:00Z','2026-06-29T09:55:00Z',8,false),
('ses-2','studio-1','tc-3','sala-2','ins-2','2026-06-29T11:00:00Z','2026-06-29T12:00:00Z',12,false),
('ses-3','studio-1','tc-2','sala-1','ins-1','2026-06-29T18:00:00Z','2026-06-29T18:55:00Z',8,false),
-- Martes
('ses-4','studio-1','tc-3','sala-2','ins-2','2026-06-30T10:00:00Z','2026-06-30T11:00:00Z',12,false),
('ses-5','studio-1','tc-1','sala-1','ins-1','2026-06-30T17:30:00Z','2026-06-30T18:25:00Z',8,false),
-- Miércoles
('ses-6','studio-1','tc-1','sala-1','ins-2','2026-07-01T09:00:00Z','2026-07-01T09:55:00Z',8,false),
('ses-7','studio-1','tc-4','sala-2','ins-1','2026-07-01T11:00:00Z','2026-07-01T11:50:00Z',12,false),
('ses-8','studio-1','tc-2','sala-1','ins-1','2026-07-01T19:00:00Z','2026-07-01T19:55:00Z',8,false),
-- Jueves
('ses-9','studio-1','tc-3','sala-2','ins-2','2026-07-02T10:00:00Z','2026-07-02T11:00:00Z',12,false),
('ses-10','studio-1','tc-1','sala-1','ins-1','2026-07-02T18:00:00Z','2026-07-02T18:55:00Z',8,false),
-- Viernes
('ses-11','studio-1','tc-2','sala-1','ins-2','2026-07-03T09:00:00Z','2026-07-03T09:55:00Z',8,false),
('ses-12','studio-1','tc-3','sala-2','ins-1','2026-07-03T11:00:00Z','2026-07-03T12:00:00Z',12,false),
-- Sábado
('ses-13','studio-1','tc-1','sala-1','ins-1','2026-07-04T10:00:00Z','2026-07-04T10:55:00Z',8,false),
-- Sesiones históricas
('ses-h01','studio-1','tc-1','sala-1','ins-1','2026-06-25T09:00:00Z','2026-06-25T09:55:00Z',8,false),
('ses-h02','studio-1','tc-1','sala-1','ins-2','2026-06-17T09:00:00Z','2026-06-17T09:55:00Z',8,false),
('ses-h03','studio-1','tc-1','sala-1','ins-1','2026-06-10T09:00:00Z','2026-06-10T09:55:00Z',8,false),
('ses-h04','studio-1','tc-2','sala-1','ins-1','2026-06-03T18:00:00Z','2026-06-03T18:55:00Z',8,false),
('ses-h05','studio-1','tc-1','sala-1','ins-2','2026-05-27T09:00:00Z','2026-05-27T09:55:00Z',8,false),
('ses-h06','studio-1','tc-1','sala-1','ins-1','2026-05-20T09:00:00Z','2026-05-20T09:55:00Z',8,false),
('ses-h07','studio-1','tc-3','sala-2','ins-2','2026-05-13T10:00:00Z','2026-05-13T11:00:00Z',12,false),
('ses-h08','studio-1','tc-1','sala-1','ins-1','2026-05-06T09:00:00Z','2026-05-06T09:55:00Z',8,false),
('ses-h09','studio-1','tc-2','sala-1','ins-2','2026-04-29T09:00:00Z','2026-04-29T09:55:00Z',8,false),
('ses-h10','studio-1','tc-1','sala-1','ins-1','2026-04-22T09:00:00Z','2026-04-22T09:55:00Z',8,false),
('ses-h11','studio-1','tc-1','sala-1','ins-2','2026-04-15T09:00:00Z','2026-04-15T09:55:00Z',8,false);

-- ─── Reservas ─────────────────────────────────────────────────────────────────
insert into reservas (id,studio_id,sesion_id,socio_id,estado,spot_id,posicion_espera,check_in_en,creado_en) values
-- ses-1 (Lun Reformer Fundamental)
('res-1','studio-1','ses-1','soc-1','CONFIRMADA','spot-1',null,null,'2026-06-20T08:00:00Z'),
('res-2','studio-1','ses-1','soc-2','CONFIRMADA','spot-2',null,null,'2026-06-20T08:05:00Z'),
('res-3','studio-1','ses-1','soc-3','CONFIRMADA','spot-3',null,null,'2026-06-20T08:10:00Z'),
('res-4','studio-1','ses-1','soc-4','CONFIRMADA','spot-5',null,null,'2026-06-20T08:15:00Z'),
('res-5','studio-1','ses-1','soc-5','CONFIRMADA','spot-6',null,null,'2026-06-20T08:20:00Z'),
('res-6','studio-1','ses-1','soc-7','CONFIRMADA','spot-7',null,null,'2026-06-20T08:25:00Z'),
-- ses-3 (Lun Reformer Avanzado, lleno + 1 espera)
('res-7','studio-1','ses-3','soc-1','CONFIRMADA','spot-1',null,null,'2026-06-20T10:00:00Z'),
('res-8','studio-1','ses-3','soc-2','CONFIRMADA','spot-2',null,null,'2026-06-20T10:05:00Z'),
('res-9','studio-1','ses-3','soc-3','CONFIRMADA','spot-3',null,null,'2026-06-20T10:10:00Z'),
('res-10','studio-1','ses-3','soc-4','CONFIRMADA','spot-4',null,null,'2026-06-20T10:15:00Z'),
('res-11','studio-1','ses-3','soc-5','CONFIRMADA','spot-5',null,null,'2026-06-20T10:20:00Z'),
('res-12','studio-1','ses-3','soc-7','CONFIRMADA','spot-6',null,null,'2026-06-20T10:25:00Z'),
('res-13','studio-1','ses-3','soc-8','CONFIRMADA','spot-7',null,null,'2026-06-20T10:30:00Z'),
('res-14','studio-1','ses-3','soc-6','LISTA_ESPERA',null,1,null,'2026-06-20T10:35:00Z'),
-- ses-5 (Mar Reformer)
('res-15','studio-1','ses-5','soc-1','CONFIRMADA','spot-2',null,null,'2026-06-21T09:00:00Z'),
('res-16','studio-1','ses-5','soc-3','CONFIRMADA','spot-4',null,null,'2026-06-21T09:05:00Z'),
('res-17','studio-1','ses-5','soc-5','CONFIRMADA','spot-6',null,null,'2026-06-21T09:10:00Z'),
('res-18','studio-1','ses-5','soc-8','CONFIRMADA','spot-8',null,null,'2026-06-21T09:15:00Z'),
-- ses-2 (Lun Pilates Mat)
('res-19','studio-1','ses-2','soc-1','CONFIRMADA',null,null,null,'2026-06-26T10:00:00Z'),
('res-20','studio-1','ses-2','soc-2','CONFIRMADA',null,null,null,'2026-06-26T10:05:00Z'),
('res-21','studio-1','ses-2','soc-3','CONFIRMADA',null,null,null,'2026-06-26T10:10:00Z'),
('res-22','studio-1','ses-2','soc-4','CONFIRMADA',null,null,null,'2026-06-26T10:15:00Z'),
('res-23','studio-1','ses-2','soc-5','CONFIRMADA',null,null,null,'2026-06-26T10:20:00Z'),
('res-24','studio-1','ses-2','soc-7','CONFIRMADA',null,null,null,'2026-06-26T10:25:00Z'),
('res-25','studio-1','ses-2','soc-8','CONFIRMADA',null,null,null,'2026-06-26T10:30:00Z'),
-- ses-4 (Mar Pilates Mat)
('res-26','studio-1','ses-4','soc-2','CONFIRMADA',null,null,null,'2026-06-27T10:00:00Z'),
('res-27','studio-1','ses-4','soc-3','CONFIRMADA',null,null,null,'2026-06-27T10:05:00Z'),
('res-28','studio-1','ses-4','soc-5','CONFIRMADA',null,null,null,'2026-06-27T10:10:00Z'),
('res-29','studio-1','ses-4','soc-7','CONFIRMADA',null,null,null,'2026-06-27T10:15:00Z'),
('res-30','studio-1','ses-4','soc-8','CONFIRMADA',null,null,null,'2026-06-27T10:20:00Z'),
-- ses-7 (Mié Mat+Circuito)
('res-31','studio-1','ses-7','soc-1','CONFIRMADA',null,null,null,'2026-06-26T11:00:00Z'),
('res-32','studio-1','ses-7','soc-3','CONFIRMADA',null,null,null,'2026-06-26T11:05:00Z'),
('res-33','studio-1','ses-7','soc-4','CONFIRMADA',null,null,null,'2026-06-26T11:10:00Z'),
('res-34','studio-1','ses-7','soc-8','CONFIRMADA',null,null,null,'2026-06-26T11:15:00Z'),
-- ses-9 (Jue Pilates Mat)
('res-35','studio-1','ses-9','soc-1','CONFIRMADA',null,null,null,'2026-06-28T10:00:00Z'),
('res-36','studio-1','ses-9','soc-2','CONFIRMADA',null,null,null,'2026-06-28T10:05:00Z'),
('res-37','studio-1','ses-9','soc-3','CONFIRMADA',null,null,null,'2026-06-28T10:10:00Z'),
('res-38','studio-1','ses-9','soc-5','CONFIRMADA',null,null,null,'2026-06-28T10:15:00Z'),
('res-39','studio-1','ses-9','soc-7','CONFIRMADA',null,null,null,'2026-06-28T10:20:00Z'),
('res-40','studio-1','ses-9','soc-8','CONFIRMADA',null,null,null,'2026-06-28T10:25:00Z'),
-- ses-12 (Vie Pilates Mat)
('res-41','studio-1','ses-12','soc-2','CONFIRMADA',null,null,null,'2026-06-28T11:00:00Z'),
('res-42','studio-1','ses-12','soc-4','CONFIRMADA',null,null,null,'2026-06-28T11:05:00Z'),
('res-43','studio-1','ses-12','soc-5','CONFIRMADA',null,null,null,'2026-06-28T11:10:00Z'),
('res-44','studio-1','ses-12','soc-8','CONFIRMADA',null,null,null,'2026-06-28T11:15:00Z'),
-- ses-6 (Mié Reformer Fundamental)
('res-45','studio-1','ses-6','soc-2','CONFIRMADA','spot-2',null,null,'2026-06-26T09:00:00Z'),
('res-46','studio-1','ses-6','soc-3','CONFIRMADA','spot-3',null,null,'2026-06-26T09:05:00Z'),
('res-47','studio-1','ses-6','soc-4','CONFIRMADA','spot-4',null,null,'2026-06-26T09:10:00Z'),
('res-48','studio-1','ses-6','soc-5','CONFIRMADA','spot-5',null,null,'2026-06-26T09:15:00Z'),
('res-49','studio-1','ses-6','soc-8','CONFIRMADA','spot-6',null,null,'2026-06-26T09:20:00Z'),
-- ses-10 (Jue Reformer Fundamental)
('res-50','studio-1','ses-10','soc-1','CONFIRMADA','spot-1',null,null,'2026-06-27T09:00:00Z'),
('res-51','studio-1','ses-10','soc-3','CONFIRMADA','spot-3',null,null,'2026-06-27T09:05:00Z'),
('res-52','studio-1','ses-10','soc-5','CONFIRMADA','spot-5',null,null,'2026-06-27T09:10:00Z'),
('res-53','studio-1','ses-10','soc-7','CONFIRMADA','spot-7',null,null,'2026-06-27T09:15:00Z'),
-- Históricas
('res-h01','studio-1','ses-h01','soc-1','ASISTIDA','spot-1',null,'2026-06-25T08:58:00Z','2026-06-22T10:00:00Z'),
('res-h02','studio-1','ses-h01','soc-2','ASISTIDA','spot-2',null,'2026-06-25T08:59:00Z','2026-06-22T10:05:00Z'),
('res-h03','studio-1','ses-h01','soc-5','ASISTIDA','spot-3',null,'2026-06-25T09:02:00Z','2026-06-22T10:10:00Z'),
('res-h04','studio-1','ses-h01','soc-8','ASISTIDA','spot-4',null,'2026-06-25T09:01:00Z','2026-06-22T10:15:00Z'),
('res-h05','studio-1','ses-h02','soc-1','ASISTIDA','spot-1',null,'2026-06-17T08:57:00Z','2026-06-14T09:00:00Z'),
('res-h06','studio-1','ses-h02','soc-3','ASISTIDA','spot-2',null,'2026-06-17T09:00:00Z','2026-06-14T09:05:00Z'),
('res-h07','studio-1','ses-h02','soc-5','ASISTIDA','spot-3',null,'2026-06-17T09:03:00Z','2026-06-14T09:10:00Z'),
('res-h08','studio-1','ses-h02','soc-2','ASISTIDA','spot-4',null,'2026-06-17T08:55:00Z','2026-06-14T09:15:00Z'),
('res-h09','studio-1','ses-h03','soc-1','ASISTIDA','spot-1',null,'2026-06-10T08:59:00Z','2026-06-07T09:00:00Z'),
('res-h10','studio-1','ses-h03','soc-2','ASISTIDA','spot-2',null,'2026-06-10T09:01:00Z','2026-06-07T09:05:00Z'),
('res-h11','studio-1','ses-h03','soc-5','ASISTIDA','spot-3',null,'2026-06-10T09:00:00Z','2026-06-07T09:10:00Z'),
('res-h12','studio-1','ses-h03','soc-8','ASISTIDA','spot-4',null,'2026-06-10T09:04:00Z','2026-06-07T09:15:00Z'),
('res-h13','studio-1','ses-h04','soc-3','ASISTIDA','spot-1',null,'2026-06-03T17:59:00Z','2026-05-31T09:00:00Z'),
('res-h14','studio-1','ses-h04','soc-5','ASISTIDA','spot-2',null,'2026-06-03T18:01:00Z','2026-05-31T09:05:00Z'),
('res-h15','studio-1','ses-h04','soc-2','ASISTIDA','spot-3',null,'2026-06-03T18:00:00Z','2026-05-31T09:10:00Z'),
('res-h15b','studio-1','ses-h04','soc-1','NO_ASISTIO','spot-4',null,null,'2026-05-31T09:15:00Z'),
('res-h16','studio-1','ses-h05','soc-1','ASISTIDA','spot-1',null,'2026-05-27T08:58:00Z','2026-05-24T09:00:00Z'),
('res-h17','studio-1','ses-h05','soc-3','ASISTIDA','spot-2',null,'2026-05-27T09:00:00Z','2026-05-24T09:05:00Z'),
('res-h18','studio-1','ses-h05','soc-8','ASISTIDA','spot-3',null,'2026-05-27T09:02:00Z','2026-05-24T09:10:00Z'),
('res-h19','studio-1','ses-h06','soc-1','ASISTIDA','spot-1',null,'2026-05-20T08:55:00Z','2026-05-17T09:00:00Z'),
('res-h20','studio-1','ses-h06','soc-2','ASISTIDA','spot-2',null,'2026-05-20T09:00:00Z','2026-05-17T09:05:00Z'),
('res-h21','studio-1','ses-h06','soc-5','ASISTIDA','spot-3',null,'2026-05-20T09:01:00Z','2026-05-17T09:10:00Z'),
('res-h22','studio-1','ses-h07','soc-1','ASISTIDA','spot-1',null,'2026-05-13T09:58:00Z','2026-05-10T09:00:00Z'),
('res-h23','studio-1','ses-h07','soc-3','ASISTIDA','spot-2',null,'2026-05-13T10:00:00Z','2026-05-10T09:05:00Z'),
('res-h24','studio-1','ses-h07','soc-8','ASISTIDA','spot-3',null,'2026-05-13T10:02:00Z','2026-05-10T09:10:00Z'),
('res-h25','studio-1','ses-h08','soc-1','ASISTIDA','spot-1',null,'2026-05-06T08:59:00Z','2026-05-03T09:00:00Z'),
('res-h26','studio-1','ses-h08','soc-2','ASISTIDA','spot-2',null,'2026-05-06T09:01:00Z','2026-05-03T09:05:00Z'),
('res-h27','studio-1','ses-h08','soc-5','ASISTIDA','spot-3',null,'2026-05-06T09:00:00Z','2026-05-03T09:10:00Z'),
('res-h28','studio-1','ses-h09','soc-1','ASISTIDA','spot-1',null,'2026-04-29T08:57:00Z','2026-04-26T09:00:00Z'),
('res-h29','studio-1','ses-h09','soc-3','ASISTIDA','spot-2',null,'2026-04-29T09:00:00Z','2026-04-26T09:05:00Z'),
('res-h30','studio-1','ses-h09','soc-2','ASISTIDA','spot-3',null,'2026-04-29T08:58:00Z','2026-04-26T09:10:00Z'),
('res-h31','studio-1','ses-h10','soc-1','ASISTIDA','spot-1',null,'2026-04-22T08:55:00Z','2026-04-19T09:00:00Z'),
('res-h32','studio-1','ses-h10','soc-5','ASISTIDA','spot-2',null,'2026-04-22T09:01:00Z','2026-04-19T09:05:00Z'),
('res-h33','studio-1','ses-h10','soc-8','ASISTIDA','spot-3',null,'2026-04-22T09:03:00Z','2026-04-19T09:10:00Z'),
('res-h34','studio-1','ses-h11','soc-1','ASISTIDA','spot-1',null,'2026-04-15T08:59:00Z','2026-04-12T09:00:00Z'),
('res-h35','studio-1','ses-h11','soc-2','ASISTIDA','spot-2',null,'2026-04-15T09:00:00Z','2026-04-12T09:05:00Z'),
('res-h36','studio-1','ses-h11','soc-3','ASISTIDA','spot-3',null,'2026-04-15T09:02:00Z','2026-04-12T09:10:00Z'),
('res-h37','studio-1','ses-h11','soc-5','ASISTIDA','spot-4',null,'2026-04-15T08:58:00Z','2026-04-12T09:15:00Z'),
('res-h38','studio-1','ses-h01','soc-4','ASISTIDA','spot-5',null,'2026-06-25T09:05:00Z','2026-06-22T10:20:00Z'),
('res-h39','studio-1','ses-h03','soc-4','ASISTIDA','spot-5',null,'2026-06-10T09:10:00Z','2026-06-07T09:20:00Z'),
('res-h40','studio-1','ses-h05','soc-4','ASISTIDA','spot-5',null,'2026-05-27T09:05:00Z','2026-05-24T09:20:00Z'),
('res-h41','studio-1','ses-h07','soc-4','ASISTIDA','spot-5',null,'2026-05-13T10:05:00Z','2026-05-10T09:20:00Z'),
('res-h42','studio-1','ses-h09','soc-4','ASISTIDA','spot-5',null,'2026-04-29T09:05:00Z','2026-04-26T09:20:00Z'),
('res-h43','studio-1','ses-h02','soc-7','ASISTIDA','spot-6',null,'2026-06-17T09:10:00Z','2026-06-14T09:25:00Z'),
('res-h44','studio-1','ses-h06','soc-7','ASISTIDA','spot-6',null,'2026-05-20T09:08:00Z','2026-05-17T09:25:00Z');

-- ─── Recibos ──────────────────────────────────────────────────────────────────
insert into recibos (id,studio_id,socio_id,suscripcion_id,concepto,importe,estado,fecha_vencimiento,fecha_cobro,fecha_devolucion,intentos_reintento) values
('rec-1','studio-1','soc-1','sus-1','Mensual Ilimitado — Jul 2026',85,'COBRADO','2026-07-01','2026-07-01',null,0),
('rec-2','studio-1','soc-2','sus-2','Bono 8 clases — Jul 2026',64,'COBRADO','2026-07-01','2026-07-01',null,0),
('rec-3','studio-1','soc-3','sus-3','Mensual Ilimitado — Jul 2026',85,'COBRADO','2026-07-01','2026-07-03',null,0),
('rec-4','studio-1','soc-4','sus-4','Bono 8 clases — Jul 2026',64,'PENDIENTE','2026-07-15',null,null,0),
('rec-5','studio-1','soc-5','sus-5','Mensual Ilimitado — Jul 2026',85,'COBRADO','2026-07-01','2026-07-01',null,0),
('rec-6','studio-1','soc-7','sus-7','Bono 4 clases — Jul 2026',36,'DEVUELTO','2026-07-10','2026-07-10','2026-07-12',0),
('rec-7','studio-1','soc-8','sus-8','Mensual Ilimitado — Jul 2026',85,'PENDIENTE','2026-07-10',null,null,0);

-- ─── Facturas ─────────────────────────────────────────────────────────────────
insert into facturas (id,studio_id,recibo_id,numero_completo,fecha_emision,receptor_nombre,receptor_nif,base_imponible,tipo_iva,cuota_iva,total) values
('fac-1','studio-1','rec-1','A-2026-0021','2026-07-01','Laura Martínez García','12345678A',70.25,21,14.75,85),
('fac-2','studio-1','rec-2','A-2026-0022','2026-07-01','Carmen López Ruiz','23456789B',52.89,21,11.11,64),
('fac-3','studio-1','rec-3','A-2026-0023','2026-07-03','Ana Fernández Torres',null,70.25,21,14.75,85),
('fac-4','studio-1','rec-5','A-2026-0024','2026-07-01','Marta Sánchez Moreno',null,70.25,21,14.75,85);

-- ─── Citas ────────────────────────────────────────────────────────────────────
insert into citas (id,studio_id,socio_id,instructor_id,tipo,inicio,fin,notas,estado,precio,creado_en) values
('cita-1','studio-1','soc-1','ins-1','PRIVADA','2026-06-28T10:00:00Z','2026-06-28T11:00:00Z','Enfocada en lumbar','CONFIRMADA',60,'2026-06-20T09:00:00Z'),
('cita-2','studio-1','soc-2','ins-2','EVALUACION','2026-06-29T11:00:00Z','2026-06-29T12:00:00Z',null,'PENDIENTE',45,'2026-06-21T10:00:00Z'),
('cita-3','studio-1','soc-4','ins-1','PRIVADA','2026-06-30T09:00:00Z','2026-06-30T10:00:00Z','Rehabilitación rodilla','CONFIRMADA',60,'2026-06-22T08:00:00Z'),
('cita-4','studio-1','soc-3','ins-2','ONLINE','2026-07-01T18:00:00Z','2026-07-01T19:00:00Z',null,'PENDIENTE',40,'2026-06-23T11:00:00Z'),
('cita-5','studio-1','soc-5','ins-1','PRIVADA','2026-06-25T10:00:00Z','2026-06-25T11:00:00Z',null,'COMPLETADA',60,'2026-06-18T09:00:00Z'),
('cita-6','studio-1','soc-7','ins-1','FISIOTERAPIA','2026-07-03T10:00:00Z','2026-07-03T11:30:00Z','Primera sesión fisio','PENDIENTE',75,'2026-06-24T09:00:00Z'),
('cita-7','studio-1','soc-8','ins-2','EVALUACION','2026-06-20T09:00:00Z','2026-06-20T10:00:00Z',null,'COMPLETADA',45,'2026-06-15T09:00:00Z'),
('cita-8','studio-1','soc-6','ins-1','PRIVADA','2026-06-15T11:00:00Z','2026-06-15T12:00:00Z',null,'CANCELADA',60,'2026-06-10T09:00:00Z');

-- ─── Productos POS ────────────────────────────────────────────────────────────
insert into productos_pos (id,studio_id,nombre,categoria,precio,activo) values
('prod-1','studio-1','Clase suelta Reformer','SESION',22,true),
('prod-2','studio-1','Clase suelta Mat','SESION',15,true),
('prod-3','studio-1','Bono 5 clases Reformer','PACK',95,true),
('prod-4','studio-1','Bono 10 clases Reformer','PACK',175,true),
('prod-5','studio-1','Mensual ilimitado','PACK',85,true),
('prod-6','studio-1','Calcetines antideslizantes','PRODUCTO',12,true),
('prod-7','studio-1','Botella de agua studio','PRODUCTO',8,true),
('prod-8','studio-1','Cita privada 1h','SESION',60,true),
('prod-9','studio-1','Evaluación inicial','SESION',45,true),
('prod-10','studio-1','Toalla studio','PRODUCTO',5,true);

-- ─── Ventas POS ───────────────────────────────────────────────────────────────
insert into ventas_pos (id,studio_id,socio_id,items,subtotal,descuento,total,metodo_pago,notas,realizada_en) values
('vpos-1','studio-1','soc-1','[{"productoId":"prod-5","nombre":"Mensual ilimitado","precio":85,"cantidad":1}]',85,0,85,'TARJETA',null,'2026-06-28T09:30:00Z'),
('vpos-2','studio-1','soc-3','[{"productoId":"prod-3","nombre":"Bono 5 clases Reformer","precio":95,"cantidad":1},{"productoId":"prod-6","nombre":"Calcetines","precio":12,"cantidad":1}]',107,0,107,'EFECTIVO',null,'2026-06-27T11:15:00Z'),
('vpos-3','studio-1',null,'[{"productoId":"prod-1","nombre":"Clase suelta Reformer","precio":22,"cantidad":1}]',22,0,22,'BIZUM','Cliente nuevo','2026-06-27T10:00:00Z'),
('vpos-4','studio-1','soc-7','[{"productoId":"prod-4","nombre":"Bono 10 clases Reformer","precio":175,"cantidad":1}]',175,17.5,157.5,'TRANSFERENCIA','10% descuento fidelidad','2026-06-26T16:00:00Z'),
('vpos-5','studio-1','soc-2','[{"productoId":"prod-7","nombre":"Botella studio","precio":8,"cantidad":2},{"productoId":"prod-10","nombre":"Toalla studio","precio":5,"cantidad":1}]',21,0,21,'EFECTIVO',null,'2026-06-25T09:45:00Z');

-- ─── Campañas ─────────────────────────────────────────────────────────────────
insert into campanas (id,studio_id,nombre,tipo,asunto,contenido,estado,destinatarios,enviados,abiertos,clics,creada_en,enviada_en,programada_en) values
('camp-1','studio-1','Promo julio — Bono verano','EMAIL','☀️ Aprovecha nuestro bono especial de verano','Este julio te ofrecemos un bono de 10 clases con un 15% de descuento. ¡Solo hasta el 31 de julio!','BORRADOR','ACTIVAS',0,0,0,'2026-06-25T10:00:00Z',null,'2026-07-01T09:00:00Z'),
('camp-2','studio-1','Newsletter junio','EMAIL','Novedades de junio en Pilates Boutique','Este mes hemos añadido nuevas clases de Barre y ampliado el horario de Reformer avanzado.','ENVIADA','TODAS',8,6,3,'2026-06-01T09:00:00Z','2026-06-05T10:00:00Z',null),
('camp-3','studio-1','Recuperación clientas inactivas','EMAIL','Te echamos de menos 💙','¡Hola! Hemos notado que llevas tiempo sin venir. Te regalamos una clase de prueba gratuita para que vuelvas a empezar.','ENVIADA','INACTIVAS',1,1,1,'2026-05-15T10:00:00Z','2026-05-20T10:00:00Z',null),
('camp-4','studio-1','WhatsApp bienvenida','WHATSAPP','Bienvenida al estudio','Hola {nombre} 👋 Bienvenida a Pilates Boutique. Tu primera clase es el {fecha}. Cualquier duda, estamos aquí.','ACTIVA','TODAS',8,8,0,'2026-01-01T10:00:00Z',null,null);

-- ─── Automatizaciones ─────────────────────────────────────────────────────────
insert into automatizaciones (id,studio_id,nombre,trigger,accion,asunto,mensaje,activa,ejecutadas,creada_en) values
('auto-1','studio-1','Recordatorio renovación','SUSCRIPCION_EXPIRA_7D','EMAIL','Tu suscripción caduca en 7 días','Hola {nombre}, tu suscripción a {plan} caduca el {fecha}. Renuévala ahora para no perder tu plaza.',true,12,'2026-01-10T09:00:00Z'),
('auto-2','studio-1','Último aviso renovación','SUSCRIPCION_EXPIRA_1D','WHATSAPP','Tu suscripción caduca mañana','Hola {nombre} ⚠️ Tu suscripción caduca mañana. Renuévala en el estudio o responde a este mensaje.',true,8,'2026-01-10T09:00:00Z'),
('auto-3','studio-1','Feliz cumpleaños','CUMPLEANOS','EMAIL','🎂 Feliz cumpleaños, {nombre}!','Muchas felicidades! Como regalo, te regalamos una clase gratis este mes. ¡Úsala cuando quieras!',true,5,'2026-01-15T09:00:00Z'),
('auto-4','studio-1','Bienvenida nueva socia','NUEVA_ALTA','EMAIL','Bienvenida a Pilates Boutique 🎉','Hola {nombre}, ¡bienvenida! Estamos muy contentas de tenerte con nosotras. Tu primera clase está confirmada para {fecha}.',true,8,'2026-01-20T09:00:00Z'),
('auto-5','studio-1','Inactividad 30 días','INACTIVIDAD_30D','WHATSAPP','Te echamos de menos','¡Hola {nombre}! Llevamos 30 días sin verte por el estudio. ¿Todo bien? Te esperamos 💙',false,3,'2026-02-01T09:00:00Z');

-- ─── Automation Rules ─────────────────────────────────────────────────────────
insert into automation_rules (id,studio_id,nombre,descripcion,icono,trigger,condicion,pasos,activa,ejecutada_veces,ultima_ejecucion,creada_en) values
('rule-1','studio-1','Socia ausente','Detecta socias que llevan días sin venir y actúa automáticamente','👤','AUSENCIA_DIAS','{"dias":7}','[{"accion":"ENVIAR_WHATSAPP","parametros":{"mensaje":"Hola {nombre}, te echamos de menos en Pilates Boutique 💙 ¿Cómo estás? ¿Te apetece volver esta semana?"},"esperarHoras":48,"condicion":"SIN_RESPUESTA"},{"accion":"OFRECER_CLASE_GRATIS","parametros":{"mensaje":"Hola {nombre}, llevamos tiempo sin verte. Te regalamos una clase de vuelta 🎁 ¿La agendamos?"},"esperarHoras":72,"condicion":"SIN_RESPUESTA"},{"accion":"NOTIFICAR_ADMIN","parametros":{"mensaje":"{nombre} lleva {dias} días sin venir y no ha respondido. ¿Quieres hacer seguimiento manual?"}}]',true,14,'2026-07-01T07:15:00Z','2026-01-01T00:00:00Z'),
('rule-2','studio-1','Pago pendiente','Persigue pagos vencidos sin que tengas que hacer nada','💳','PAGO_PENDIENTE_DIAS','{"dias":3}','[{"accion":"ENVIAR_EMAIL","parametros":{"asunto":"Recordatorio de pago","mensaje":"Hola {nombre}, tienes un pago de {importe}€ pendiente. Puedes pagarlo aquí: {link}"}},{"accion":"ENVIAR_WHATSAPP","parametros":{"mensaje":"Hola {nombre} 👋 ¿has podido revisar el pago de {importe}€? Te mando el enlace directo: {link}"},"esperarHoras":72,"condicion":"SIN_RESPUESTA"},{"accion":"NOTIFICAR_ADMIN","parametros":{"mensaje":"{nombre} tiene {importe}€ pendiente desde hace {dias} días. Requiere atención manual."}}]',true,9,'2026-07-01T07:30:00Z','2026-01-01T00:00:00Z'),
('rule-3','studio-1','Renovación automática','Avisa y cobra la renovación sin intervención humana','🔄','SUSCRIPCION_EXPIRA_DIAS','{"dias":7}','[{"accion":"ENVIAR_EMAIL","parametros":{"asunto":"Tu suscripción vence pronto","mensaje":"Hola {nombre}, tu plan {plan} vence el {fecha}. ¿Lo renovamos? {link_pago}"}},{"accion":"COBRAR_RECIBO","parametros":{"concepto":"Renovación automática {plan}"},"condicion":"SIEMPRE"},{"accion":"ENVIAR_WHATSAPP","parametros":{"mensaje":"¡Tu plan {plan} se ha renovado! ✅ Todo listo para seguir."}}]',true,22,'2026-06-30T06:00:00Z','2026-01-01T00:00:00Z'),
('rule-4','studio-1','Bono casi agotado','Sugiere renovar cuando quedan pocas sesiones en el bono','🎟️','BONO_SESIONES_BAJAS','{"sesiones":2}','[{"accion":"ENVIAR_WHATSAPP","parametros":{"mensaje":"Hola {nombre} 👋 Solo te quedan {sesiones} clases en tu bono. ¿Renovamos antes de que se acaben? Te dejo el enlace: {link}"}},{"accion":"PROPONER_PLAN","parametros":{"planSugerido":"plan-2","descuento":0}}]',true,7,'2026-06-28T09:00:00Z','2026-01-01T00:00:00Z'),
('rule-5','studio-1','Bienvenida nueva socia','Onboarding completo automático al darse de alta','🌟','NUEVA_SOCIA','{"horasDesdeAlta":1}','[{"accion":"ENVIAR_EMAIL","parametros":{"asunto":"¡Bienvenida a Pilates Boutique!","mensaje":"Hola {nombre}, estamos encantadas de tenerte con nosotras. Aquí tienes toda la info que necesitas..."}},{"accion":"ENVIAR_WHATSAPP","parametros":{"mensaje":"Hola {nombre} 🌸 Bienvenida a Pilates Boutique. Soy María, tu instructora. Cualquier duda, aquí estoy."}}]',true,8,'2026-05-19T11:00:00Z','2026-01-01T00:00:00Z'),
('rule-6','studio-1','Recordatorio de clase','Recuerda a cada socia su clase del día siguiente','📅','CLASE_MANANA','{"horasAntes":20}','[{"accion":"ENVIAR_WHATSAPP","parametros":{"mensaje":"¡Hola {nombre}! Mañana tienes {clase} a las {hora} con {instructora} 🧘‍♀️ ¡Te esperamos!"}}]',true,98,'2026-07-01T09:00:00Z','2026-01-01T00:00:00Z');

-- ─── Automation Logs ──────────────────────────────────────────────────────────
insert into automation_logs (id,studio_id,rule_id,rule_name,socio_id,socio_nombre,paso_index,accion,resultado,detalle,ejecutado_en,proxima_accion_en) values
('log-1','studio-1','rule-6','Recordatorio de clase','soc-1','Laura Martínez',0,'ENVIAR_WHATSAPP','EJECUTADO','Recordatorio Reformer Fundamental mañana 09:00 → enviado','2026-07-01T09:00:00Z',null),
('log-2','studio-1','rule-6','Recordatorio de clase','soc-3','Ana Fernández',0,'ENVIAR_WHATSAPP','EJECUTADO','Recordatorio Reformer Fundamental mañana 09:00 → enviado','2026-07-01T09:00:00Z',null),
('log-3','studio-1','rule-6','Recordatorio de clase','soc-5','Marta Sánchez',0,'ENVIAR_WHATSAPP','EJECUTADO','Recordatorio Reformer Fundamental mañana 09:00 → enviado','2026-07-01T09:00:00Z',null),
('log-4','studio-1','rule-2','Pago pendiente','soc-2','Carmen López',0,'ENVIAR_EMAIL','EJECUTADO','Recordatorio pago 64€ (Bono 8 clases) → email enviado','2026-07-01T07:30:00Z','2026-07-04T07:30:00Z'),
('log-5','studio-1','rule-1','Socia ausente','soc-7','Elena Jiménez',0,'ENVIAR_WHATSAPP','ESPERANDO','Sin venir 14 días → WhatsApp enviado. Esperando respuesta (48h)','2026-07-01T07:15:00Z','2026-07-03T07:15:00Z'),
('log-6','studio-1','rule-3','Renovación automática','soc-5','Marta Sánchez',1,'COBRAR_RECIBO','EJECUTADO','Mensual Ilimitado Jul 2026 — 85€ cobrados automáticamente ✓','2026-06-30T06:00:00Z',null),
('log-7','studio-1','rule-3','Renovación automática','soc-5','Marta Sánchez',2,'ENVIAR_WHATSAPP','EJECUTADO','WhatsApp confirmación renovación → enviado','2026-06-30T06:01:00Z',null),
('log-8','studio-1','rule-4','Bono casi agotado','soc-4','Isabel González',0,'ENVIAR_WHATSAPP','EJECUTADO','Bono 8 clases — quedan 3 sesiones. Propuesta renovación enviada','2026-06-28T09:00:00Z',null),
('log-9','studio-1','rule-1','Socia ausente','soc-8','Patricia Romero',2,'NOTIFICAR_ADMIN','PENDIENTE_ADMIN','Patricia lleva 12 días sin venir. No respondió WhatsApp ni a la clase gratis. ¿Actuamos?','2026-06-29T07:15:00Z',null);

-- ─── Códigos de descuento ─────────────────────────────────────────────────────
insert into codigos_descuento (id,studio_id,codigo,descripcion,tipo,valor,usos,usos_max,expira,activo,creado_en) values
('disc-1','studio-1','BIENVENIDA20','Descuento bienvenida nuevas socias','PORCENTAJE',20,3,50,'2026-12-31',true,'2026-01-01T00:00:00Z'),
('disc-2','studio-1','VERANO15','Promo verano 2026','PORCENTAJE',15,1,30,'2026-08-31',true,'2026-06-01T00:00:00Z'),
('disc-3','studio-1','AMIGA10','10€ por referir a una amiga','IMPORTE_FIJO',10,5,null,null,true,'2026-03-01T00:00:00Z'),
('disc-4','studio-1','PRIMAVERA','Descuento primavera (expirado)','PORCENTAJE',10,8,20,'2026-05-31',false,'2026-04-01T00:00:00Z');

-- ─── Actividad reciente ───────────────────────────────────────────────────────
insert into actividad_reciente (id,studio_id,tipo,texto,socio_id,enlace,creado_en) values
('act-1','studio-1','PAGO_COBRADO','Laura Martínez pagó Mensual Ilimitado — 85 €','soc-1','/socios/soc-1','2026-06-28T09:30:00Z'),
('act-2','studio-1','NUEVA_RESERVA','Carmen López reservó Reformer Avanzado (lun 10:00)','soc-2','/calendario','2026-06-28T08:45:00Z'),
('act-3','studio-1','CITA_CREADA','Nueva cita privada — Laura Martínez con María Soler','soc-1','/citas','2026-06-28T08:00:00Z'),
('act-4','studio-1','VENTA_POS','Venta POS — Bono 5 clases + Calcetines — 107 €','soc-3','/pos','2026-06-27T11:15:00Z'),
('act-5','studio-1','CANCELACION','Isabel González canceló su reserva en Mat Beginners','soc-4','/calendario','2026-06-27T10:30:00Z'),
('act-6','studio-1','NUEVA_SOCIA','Nueva socia registrada: Patricia Romero','soc-8','/socios/soc-8','2026-06-26T16:00:00Z'),
('act-7','studio-1','PAGO_COBRADO','Elena Jiménez pagó Bono 4 clases — 65 €','soc-7','/socios/soc-7','2026-06-26T11:00:00Z'),
('act-8','studio-1','NUEVA_SUSCRIPCION','Marta Sánchez renovó Mensual Ilimitado','soc-5','/socios/soc-5','2026-06-25T09:00:00Z'),
('act-9','studio-1','CITA_COMPLETADA','Cita privada completada — Marta Sánchez','soc-5','/citas','2026-06-25T11:00:00Z'),
('act-10','studio-1','PAGO_PENDIENTE','Pago pendiente — Carmen López — Bono 8 clases','soc-2','/pagos','2026-06-24T10:00:00Z');

-- ─── Notificaciones ───────────────────────────────────────────────────────────
insert into notificaciones (id,studio_id,titulo,texto,leida,tipo,enlace,creada_en) values
('noti-1','studio-1','Suscripción por vencer','La suscripción de Carmen López vence en 3 días.',false,'AVISO','/socios/soc-2','2026-06-28T08:00:00Z'),
('noti-2','studio-1','Pago pendiente','Isabel González tiene un pago de 65 € pendiente desde hace 5 días.',false,'AVISO','/pagos','2026-06-27T09:00:00Z'),
('noti-3','studio-1','Nueva reserva','Patricia Romero ha reservado Reformer Principiante para el martes.',true,'INFO','/calendario','2026-06-27T08:30:00Z'),
('noti-4','studio-1','Clase con aforo lleno','Reformer Avanzado del lunes 10:00 está completo. 2 en lista de espera.',false,'INFO','/calendario','2026-06-26T18:00:00Z'),
('noti-5','studio-1','Automatización ejecutada','Se enviaron 3 recordatorios de renovación automáticamente.',true,'EXITO','/marketing','2026-06-25T10:00:00Z'),
('noti-6','studio-1','Socia sin plan asignado','Sofía Ramírez lleva 15 días sin suscripción activa.',false,'AVISO','/socios/soc-6','2026-06-24T09:00:00Z');

-- ─── Videos on demand ─────────────────────────────────────────────────────────
insert into videos_on_demand (id,studio_id,titulo,descripcion,categoria,duracion_minutos,nivel,instructor_id,vistas,likes,activo,creado_en) values
('vid-1','studio-1','Reformer para principiantes — Sesión 1','Introducción a las posiciones básicas del Reformer. Ideal para quienes empiezan.','REFORMER',45,'PRINCIPIANTE','ins-1',127,34,true,'2026-04-01T10:00:00Z'),
('vid-2','studio-1','Core Power — Mat intensivo','Sesión intensa de trabajo de core sobre esterilla. Sin equipo necesario.','MAT',30,'MEDIO','ins-2',89,21,true,'2026-04-15T10:00:00Z'),
('vid-3','studio-1','Barre Clásico — Lower Body','Trabajo de piernas y glúteos con técnica Barre. Cardio de bajo impacto.','BARRE',40,'TODOS','ins-1',73,18,true,'2026-05-01T10:00:00Z'),
('vid-4','studio-1','Meditación y respiración consciente','20 minutos de meditación guiada para reducir el estrés y mejorar la concentración.','MEDITACION',20,'TODOS','ins-2',156,52,true,'2026-05-10T10:00:00Z'),
('vid-5','studio-1','Reformer Avanzado — Full Body','Sesión avanzada que trabaja todo el cuerpo en el Reformer. Requiere experiencia previa.','REFORMER',55,'AVANZADO','ins-1',44,12,true,'2026-05-20T10:00:00Z'),
('vid-6','studio-1','Estiramiento post-clase completo','Rutina de 15 minutos de estiramientos para hacer después de cualquier clase.','ESTIRAMIENTO',15,'TODOS','ins-2',201,67,true,'2026-06-01T10:00:00Z');

-- ─── Posts comunidad ──────────────────────────────────────────────────────────
insert into posts_comunidad (id,studio_id,autor_id,autor_nombre,autor_inicial,texto,likes,comentarios_count,fijado,creado_en) values
('post-1','studio-1',null,'Pilates Boutique','PB','🌟 ¡Felicidades a todas las socias que completaron el reto de junio! 30 días, 30 clases. Vuestra constancia es inspiradora. Resultado final: 6 socias lo completaron. ¡Enhorabuena!',12,4,true,'2026-06-27T10:00:00Z'),
('post-2','studio-1','soc-1','Laura M.','LM','Llevo 3 meses viniendo y noto un cambio brutal en mi postura. Nunca pensé que el pilates fuera tan efectivo. ¡Gracias María! 💙',8,2,false,'2026-06-25T14:30:00Z'),
('post-3','studio-1',null,'Pilates Boutique','PB','📢 Novedad: a partir de julio añadimos una clase de Barre los miércoles a las 19:00. ¡Plazas limitadas! Reservad ya desde el calendario.',15,6,false,'2026-06-23T09:00:00Z'),
('post-4','studio-1','soc-5','Marta S.','MS','¿Alguien más ha probado la clase de Mat Avanzado del viernes? Es durísima pero merece mucho la pena 😅',5,3,false,'2026-06-22T11:00:00Z');

-- ─── Notas de progreso ────────────────────────────────────────────────────────
insert into notas_progreso (id,studio_id,socio_id,instructor_id,sesion_id,texto_libre,progreso,alertas,plan_proxima_sesion,ejercicios_casa,creada_en) values
('nota-prog-1','studio-1','soc-1','ins-1','ses-h01','Laura ha mejorado mucho la estabilidad en plancha. Sigue con molestias leves cervicales al hacer roll-up. La semana que viene enfocar movilidad torácica.','Mejora notable en estabilidad de cadera y control de powerhouse. Patrón respiratorio más consciente.','Molestias cervicales en flexión. Evitar roll-up completo por ahora.','Movilidad torácica, cadena posterior. Reducir intensidad en flexión cervical.','1. Cat-cow 10 rep × 3
2. Chest opener sentada 30s × 4
3. Rotación torácica con foam roller 8 rep cada lado','2026-06-25T10:15:00Z');
