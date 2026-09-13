-- ═══════════════════════════════════════════════════════════════════════════
-- Verificación — fase 2 RGPD (Network + Storage). EN RAMA O STAGING, NUNCA PROD.
-- ═══════════════════════════════════════════════════════════════════════════
-- Cada bloque va en su propia transacción y termina en ROLLBACK. Las pruebas de
-- INSERT sobre storage.objects crean la fila de metadatos (no suben bytes) y se
-- deshacen; aun así, no se ejecutan contra producción.
--
-- Sustituye los marcadores <…> por ids de la rama. Necesitas, en un estudio A:
-- una PROPIETARIA, una MANAGER, una RECEPCION, una INSTRUCTORA (con su ficha y
-- la de otra compañera), una SOCIA con cuenta, un tipo de clase y un producto;
-- y la PROPIETARIA de otro estudio B. Para Network: una cuenta con perfil y
-- otra (la socia) sin perfil.
-- ═══════════════════════════════════════════════════════════════════════════

-- 0) Catálogo. Esperado: authenticated=true y anon=false en las dos funciones
--    nuevas; la RPC de experiencia solo service_role; avatars sin SVG.
select p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE')          as anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
       has_function_privilege('service_role', p.oid, 'EXECUTE')  as service_role
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('avatars_path_escribible', 'avatars_path_autorizado', 'red_tiene_perfil_propio', 'red_resolver_verificacion_experiencia')
order by 1;

select 'image/svg+xml' <> all(allowed_mime_types) as avatars_sin_svg from storage.buckets where id = 'avatars';

select policyname, cmd, coalesce(qual, with_check) as condicion
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and (policyname like 'avatars_%' or policyname like 'red_documentos_identidad_%')
order by policyname;

-- 1) Tabla de verdad de escritura en avatars, por rol. Repite el bloque
--    cambiando <UID_…> y la columna `esperado` según la tabla de abajo.
--
--    ruta                         PROP  MAN   RECEP INSTR SOCIA PROP-B
--    logo-<A>                     t     t     f     f     f     f
--    favicon-borrador-<A>         t     t     f     f     f     f
--    portal-<A>-hero              t     t     f     f     f     f
--    admin-<A>                    t     f     f     f     f     f
--    clase-<TIPO_A>               t     t     f     f     f     f
--    producto-<PRODUCTO_A>        t     f     t     f     f     f
--    instructor-<SU_FICHA>        t     t*    f     t     f     f    (*si su ficha es INSTRUCTOR/RECEPCION)
--    instructor-<OTRA_FICHA>      t     t*    f     f     f     f
--    <SOCIO_A>                    t     t     t     f     t**   f    (**solo si es ella)
begin;
select set_config('request.jwt.claims', json_build_object('sub', '<UID_INSTRUCTORA>', 'role', 'authenticated')::text, true);
set local role authenticated;
select r.ruta,
       public.avatars_path_escribible(r.ruta) as escribe,
       public.avatars_path_autorizado(r.ruta) as lee,
       r.esperado,
       public.avatars_path_escribible(r.ruta) = r.esperado as correcto
from (values
  ('logo-<STUDIO_A>', false),
  ('favicon-borrador-<STUDIO_A>', false),
  ('portal-<STUDIO_A>-hero', false),
  ('admin-<STUDIO_A>', false),
  ('clase-<TIPO_A>', false),
  ('producto-<PRODUCTO_A>', false),
  ('instructor-<SU_FICHA>', true),
  ('instructor-<OTRA_FICHA>', false),
  ('<SOCIO_A>', false)
) as r(ruta, esperado);
rollback;

-- 2) La policy de verdad (no solo la función): como INSTRUCTORA, sustituir el
--    logo debe fallar con «new row violates row-level security policy».
begin;
select set_config('request.jwt.claims', json_build_object('sub', '<UID_INSTRUCTORA>', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into storage.objects (bucket_id, name) values ('avatars', 'logo-<STUDIO_A>');  -- esperado: ERROR 42501
rollback;

--    Y su propia foto sí (esperado: INSERT 0 1).
begin;
select set_config('request.jwt.claims', json_build_object('sub', '<UID_INSTRUCTORA>', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into storage.objects (bucket_id, name) values ('avatars', 'instructor-<SU_FICHA>-prueba-verificacion');  -- ⚠️ usa un id de ficha REAL: la rama busca la fila
rollback;

-- 3) red-documentos-identidad: sin perfil de Network no se sube (esperado: ERROR 42501)…
begin;
select set_config('request.jwt.claims', json_build_object('sub', '<UID_SOCIA_SIN_PERFIL>', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into storage.objects (bucket_id, name) values ('red-documentos-identidad', '<UID_SOCIA_SIN_PERFIL>/identidad-anverso-0.jpg');
rollback;

--    …con perfil, en su carpeta, sí (esperado: INSERT 0 1), y en carpeta ajena no.
begin;
select set_config('request.jwt.claims', json_build_object('sub', '<UID_CON_PERFIL>', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.red_tiene_perfil_propio() as tiene_perfil;  -- true
insert into storage.objects (bucket_id, name) values ('red-documentos-identidad', '<UID_CON_PERFIL>/identidad-anverso-0.jpg');
rollback;

-- 4) Autoverificación de experiencia (como service_role, igual que la ruta).
--    Prepara en la rama una experiencia de <UID_CON_PERFIL> con solicitud
--    'pendiente' dirigida a un estudio cuya owner_auth_user_id sea esa misma
--    cuenta. Esperado: ERROR «AUTOVERIFICACION» al aprobar; rechazar funciona.
begin;
set local role service_role;
select * from public.red_resolver_verificacion_experiencia('<VERIFICACION_ID>', '<STUDIO_PROPIO>', true, '<UID_CON_PERFIL>');
rollback;

-- 5) El documento resuelto: tras aprobar/rechazar desde /interno, la fila debe
--    quedar con documento_path NULL y documento_borrado_en con fecha, y el
--    objeto ya no debe existir.
select v.id, v.estado, v.documento_path is null as sin_path, v.documento_borrado_en,
       exists (select 1 from storage.objects o where o.bucket_id = 'red-documentos-identidad'
               and o.name in (v.documento_path, v.documento_path_reverso)) as objeto_sigue
from public.red_verificaciones_identidad v
where v.id = '<VERIFICACION_IDENTIDAD_RESUELTA>';

-- 6) Supresión de perfil: tras DELETE /api/network/perfil, nada de esa cuenta.
select (select count(*) from public.red_perfiles where auth_user_id = '<UID_SUPRIMIDA>') as perfiles,
       (select count(*) from storage.objects where bucket_id = 'red-documentos-identidad' and name like '<UID_SUPRIMIDA>/%') as documentos,
       (select count(*) from storage.objects where bucket_id = 'avatars' and name = 'network-<PERFIL_ID_SUPRIMIDO>') as foto,
       (select count(*) from public.plataforma_auditoria where accion = 'network.perfil.suprimido' and objetivo_id = '<PERFIL_ID_SUPRIMIDO>') as registro;
-- Esperado: 0, 0, 0, 1.
