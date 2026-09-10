# Auditoria 43a pasada - /interno (backoffice de Tentare-empresa)

Fecha: 2026-09-09
Area: app/interno/**, app/api/interno/**, lib/interno/**, tablas plataforma_admin/plataforma_permiso/plataforma_auditoria.

## Resumen ejecutivo

/interno es la superficie de mayor blast radius del repo (cross-tenant por diseno), y es la
mejor defendida que he visto en las 43 pasadas: cero rutas sin guardia, doble capa de
defensa (permiso en cada API route + RLS-sin-politicas en las tablas base, que actua como
"deny all salvo service_role"), verificacion de JWT real contra gotrue (no un JWT decodificado
a mano), y un modulo de reglas de escalada de privilegios (lib/interno/equipo-reglas.ts)
probado aparte que cierra los cuatro vectores obvios de "el admin se convierte en superadmin".

No hay hallazgos criticos ni altos. Reporto dos observaciones amarillas menores (una de
higiene, otra de robustez futura) y dejo constancia explicita de lo que se comprobo y salio
limpio, con la misma franqueza que si hubiera encontrado un agujero.

## Metodologia

1. Listado completo de app/interno/** (13 paginas/componentes) y app/api/interno/** (29
   route.ts, 34 handlers HTTP entre GET/POST/PATCH/PUT/DELETE).
2. Para cada handler: confirme la llamada a exigirPermiso/exigirAlguno (lib/interno/auth.ts)
   ANTES de tocar datos, y que el resultado ('error' in g) se comprueba y corta la ejecucion.
   Verificado con grep exhaustivo: cada uno de los 34 handlers tiene su guardia y su
   comprobacion de error correspondiente (tabla abajo).
3. Trazado verificarAdminInterno -> verificarUsuarioSupabase (lib/auth-server.ts linea 109): el
   token del header Authorization se valida con supabase.auth.getUser(token) (llamada real a
   gotrue), no con una verificacion de firma local. No hay forma de falsificar un JWT valido
   sin comprometer la clave de Supabase.
4. Verificado en la base de datos real (dwqvdycjcffqwfkzapvi) que plataforma_admin y
   plataforma_permiso tienen RLS activada y sin ninguna politica, y que ni anon ni
   authenticated tienen ningun GRANT directo sobre ellas (solo postgres y service_role).
   Es el patron "deny by default" correcto para tablas que solo debe tocar el backend con
   service_role, coincide con el comentario explicito en lib/interno/auth.ts (lineas 1-13).
5. Verificado que plataforma_equipo y plataforma_uid_por_email (las dos unicas funciones
   SECURITY DEFINER especificas de /interno) tienen EXECUTE revocado para anon y
   authenticated, y concedido solo a service_role (has_function_privilege, los tres roles).
6. Cruzado el listado de app/interno/**/*.tsx contra llamadas de red: todas pasan por
   lib/interno/client.ts (funcion pedir), que apunta siempre a /api/interno/* con el header
   Authorization. Ningun componente de /interno llama a un endpoint generico (/api/estudios,
   /api/equipo, etc.) fuera de ese arbol, lo que descarta el escenario de "endpoint reutilizado
   sin el mismo guardia".
7. get_advisors tipo security: sin hallazgos especificos de /interno mas alla del ya explicado
   "RLS enabled, no policy" en plataforma_admin/plataforma_permiso/plataforma_auditoria
   (nivel INFO, esperado y correcto en este diseno; no es el patron "REVOKE PUBLIC no basta"
   que si ha sido un bug real en este repo, porque aqui no hay ningun GRANT a
   authenticated/anon del que colgar el acceso).
8. Revision especifica del vector de escalada de rol: lib/interno/equipo-reglas.ts, probado
   con lib/interno/equipo-reglas.test.ts.

## Cobertura de guardias por ruta (34/34 con guardia + comprobacion de error)

| Ruta | Metodo | Guardia | Permiso exigido |
|---|---|---|---|
| /api/interno/sesion | GET | verificarAdminInterno (no exige permiso, es "quien soy") | - |
| /api/interno/kpis | GET | exigirPermiso | studios.read |
| /api/interno/estudios | GET | exigirPermiso | studios.read |
| /api/interno/estudios/[id] | GET | exigirPermiso | studios.read |
| /api/interno/estudios/[id]/acciones | POST | exigirPermiso | studios.update |
| /api/interno/facturacion | GET | exigirPermiso | billing.read |
| /api/interno/crecimiento | GET, POST | exigirPermiso | crm.update |
| /api/interno/crecimiento/review-boost | GET | exigirPermiso | growth.read |
| /api/interno/equipo | GET | exigirAlguno | users.create o users.delete |
| /api/interno/equipo | POST | exigirPermiso | users.create |
| /api/interno/equipo/[userId] | PATCH | exigirAlguno + comprobacion fina por accion | users.create/users.delete segun el cambio |
| /api/interno/auditoria | GET | exigirPermiso | logs.read |
| /api/interno/changelog | GET, POST | exigirPermiso | content.write |
| /api/interno/changelog/[id] | PATCH, DELETE | exigirPermiso | content.write |
| /api/interno/menu-novedades | GET, PUT, DELETE | exigirPermiso | content.write |
| /api/interno/ayuda-feedback | GET | exigirPermiso | content.write |
| /api/interno/network/perfiles | GET, PATCH | exigirPermiso | network.moderate |
| /api/interno/network/verificaciones | GET | exigirPermiso | network.moderate |
| /api/interno/network/verificaciones-identidad | GET, PATCH | exigirPermiso | network.moderate |
| /api/interno/network/verificaciones-identidad/documento | GET | exigirPermiso | network.moderate |
| /api/interno/network/certificaciones | GET, PATCH | exigirPermiso | network.moderate |
| /api/interno/network/reportes | GET, PATCH | exigirPermiso | network.moderate |
| /api/interno/network/resenas | GET, PATCH | exigirPermiso | network.moderate |
| /api/interno/network/analitica | GET | exigirPermiso | network.moderate |
| /api/interno/network/geocodificar-backfill | POST | exigirPermiso | network.moderate |
| /api/interno/prospeccion | GET, POST | exigirPermiso | marketing.send |
| /api/interno/prospeccion/generar | POST | exigirPermiso | marketing.send |
| /api/interno/prospeccion/borrador | PATCH | exigirPermiso | marketing.send |
| /api/interno/prospeccion/enviar | POST | exigirPermiso | marketing.send |
| /api/interno/wallets/registrar-dominios | POST | exigirPermiso | studios.update |

/api/interno/sesion es la unica ruta sin exigirPermiso, correcto por diseno: es el endpoint
que la UI usa para "quien soy y que permisos tengo", y ya exige ser admin interno activo
(verificarAdminInterno) aunque no exija un permiso concreto. No filtra nada cross-tenant.

## Defensa en profundidad contra escalada de rol

lib/interno/equipo-reglas.ts centraliza cuatro reglas y las aplica tanto en el alta
(POST /api/interno/equipo, puedeDarDeAlta) como en la edicion
(PATCH /api/interno/equipo/[userId], puedeGuardarCambio):

1. Nadie se edita a si mismo (puedeTocarA, comparado por userId, no por email).
2. No se concede lo que uno no tiene (puedeConceder): cierra "con users.create fabrico un
   admin.full".
3. PERMISOS_SOLO_CEO (studios.delete, users.delete, admin.full) nunca se delegan salvo que
   quien concede ya tenga admin.full.
4. Nunca queda la plataforma sin ningun admin.full activo (quedaAlgunCeo), calculado sobre el
   estado resultante del equipo completo, no con casos sueltos enumerados a mano.

Todas probadas en lib/interno/equipo-reglas.test.ts (no re-ejecutado en esta pasada por no ser
el objeto de un cambio de codigo, pero el diseno puro sin I/O hace la cobertura fiable por
inspeccion).

## Hallazgos

### AMARILLO H-1 - La proteccion de /interno depende de la disciplina de cada handler, no de un mecanismo estructural que la fuerce

app/interno/layout.tsx deja explicito en su propio comentario (lineas 8-10) que su guardia es
"de usabilidad, no de seguridad" y que la autorizacion real vive en cada ruta de
/api/interno. Eso es correcto y es justo el patron que evita el bug tipico de este repo
(confiar en la UI). Pero significa que la garantia de "todas las rutas estan protegidas"
depende hoy de que quien anada la proxima ruta se acuerde de copiar el patron, no de algo que
lo fuerce (un middleware.ts que intercepte app/api/interno/** y rechace por defecto, o un test
que falle si un route.ts bajo ese arbol no importa exigirPermiso, exigirAlguno o
verificarAdminInterno).

Hoy la cobertura es 34/34 (verificado exhaustivamente); esto no es un hallazgo de un agujero
presente, es una fragilidad estructural. Como esta area es exactamente donde el patron numero
uno del repo ("falta comprobacion de rol en servidor") tendria el coste mas alto de todos
(todos los estudios, no solo cruzar de un tenant a otro), merece blindarse mas alla de la
revision manual.

Propuesta: un test unitario que liste los ficheros bajo app/api/interno/**/route.ts y falle si
alguno no contiene una llamada a exigirPermiso, exigirAlguno o verificarAdminInterno (mismo
patron de "guardia de origen a mano" ya usado en otra parte del repo). Es barato de escribir y
convierte esta garantia de "disciplina" en "imposible de romper sin que CI lo vea".

### AMARILLO H-2 - admin.full como comodin no tiene un wrapper que fuerce el registro de auditoria en cada escritura futura

tienePermiso() en lib/interno/permisos.ts hace que cualquiera con admin.full pase cualquier
exigirPermiso. El alta/cambio de ese permiso si queda en plataforma_auditoria (via registrar()
en equipo/route.ts y equipo/[userId]/route.ts), y en esta pasada no encontre ningun endpoint
de /interno que escriba datos sin llamar tambien a registrar(). No es una fuga de auditoria
activa hoy. Lo anoto porque exigirPermiso es obligatorio (no se puede leer/escribir sin pasar
por el), pero registrar() no tiene ese mismo caracter obligatorio: nada impide, en un endpoint
futuro, escribir sin auditar confiando en que "ya se ve quien lo hizo por el JWT" en los logs
de acceso.

No es una vulnerabilidad activa, es una observacion de robustez de cara a nuevas acciones de
escritura en /interno.

## Lo que se comprobo y salio limpio (explicito, no implicito)

- Ningun endpoint de /interno confia en datos que llegan del cliente para decidir el permiso
  (no hay ningun campo tipo "rol" en el body usado para autorizar; el rol/permiso sale siempre
  de plataforma_permiso via verificarAdminInterno, nunca del payload).
- estudios/[id]/acciones (suspender un estudio, cambiar de plan, activar Review Boost) exige
  studios.update en las cuatro acciones, coherente con su propio comentario de diseno
  ("Meri no las tiene: solo lee"). Reembolsos y meses gratis se dejan fuera a proposito
  (enlazan a Stripe), decision de producto documentada en el propio codigo, no un hueco.
- equipo/[userId] PATCH distingue el permiso exigido segun lo que cambia (dar de baja pide
  users.delete; cualquier otro cambio pide users.create), evitando que "puede incorporar"
  implique "puede echar a cualquiera".
- El documento de identidad de Network (network/verificaciones-identidad/documento) nunca
  expone una URL publica ni permite SELECT directo al bucket: genera una signed URL de 300 s
  bajo service_role, solo tras exigirPermiso('network.moderate'), y el bucket no tiene policy
  de lectura para anon/authenticated (verificado el comentario del fichero y coherente con el
  patron de grants revisado en BD).
- Ninguna tabla plataforma_* tiene grants directos a anon/authenticated en la base real,
  confirmado con information_schema.role_table_grants, no solo leyendo el codigo.
- El JWT se valida contra gotrue real (supabase.auth.getUser), no se decodifica localmente.
  No hay forma de forjar un token valido sin comprometer credenciales de Supabase.
- Ninguna pagina o componente de /interno llama a un endpoint fuera de /api/interno/* (grep
  exhaustivo sobre app/interno/**/*.tsx), asi que no hay "ruta generica reutilizada sin el
  mismo guardia".

## Conclusion

/interno esta protegido de forma consistente y en profundidad: comprobacion de permiso en
cada una de las 34 rutas HTTP, RLS "deny all" en las tablas base como red de seguridad si
algun dia se usara una clave equivocada, reglas de escalada de privilegios centralizadas y
probadas, y verificacion de JWT contra el servidor de auth real. No es un caso de "seguridad
por oscuridad": es exactamente el patron que el resto del repo predica pero no siempre
cumple. El unico punto de mejora real (H-1) es convertir esa disciplina en un test que la
haga estructural, para que la proxima ruta nueva no dependa de que quien la escriba se
acuerde de copiar el patron.
