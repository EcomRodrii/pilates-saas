# Auditoria de seguridad -- 54a pasada (2026-09-10)

## Area elegida y por que

**Tentare Network** (app/api/network/**, app/api/interno/network/**, lib/network/**) --
el marketplace bidireccional estudio-instructora (buscar, contactar, mensajeria,
candidaturas a vacantes, formalizacion de contratacion, resenas, verificacion de
identidad/experiencia/referencias), mas su moderacion desde /interno.

No estaba en la lista de "ya auditadas a fondo" de esta ronda concreta, no maneja
dinero pero si PII sensible (documentos de identidad, contacto, mensajeria privada,
datos de reclutamiento) y cruza DOS mecanismos de autenticacion distintos en el mismo
endpoint en varios sitios (verificarSesionStaff vs verificarUsuarioSupabase), que es
exactamente el terreno donde este repo ha tenido bugs de "rol no comprobado" antes.

**Hallazgo metodologico, no de seguridad**: al leer el codigo descubri que esta area
ya ha sido objeto de varias rondas de endurecimiento previas y documentadas dentro del
propio codigo (comentarios que citan "35a pasada de auditoria" -- confirmado real:
auditoria-2026-09-09-35a-pasada.md existe en este mismo repo --, docs/NETWORK-AUDIT-2.md,
docs/NETWORK-IMPLEMENTATION-PLAN.md, migraciones red_confianza_no_autootorgable*,
red_perfiles_revoke_columnas_contacto, etc.). El nivel de disciplina es notablemente
mas alto que la media del repo: casi cada endpoint deja un comentario explicando POR QUE
existe el guard que tiene, y que se colaria sin el. Esto redujo mucho la superficie de
hallazgos nuevos -- se documenta explicitamente en vez de forzar un hallazgo falso.

Se revisaron los 39 endpoints de app/api/network/**, los 24 de
app/api/interno/network/** + app/api/interno/equipo/** (alta/gestion de personal
interno de Tentare, con sus reglas de escalada en lib/interno/equipo-reglas.ts), y se
verifico contra get_advisors (security) del proyecto dwqvdycjcffqwfkzapvi -- todos los
avisos abiertos ya estan documentados como intencionales en tentare-os.md (funciones
SECURITY DEFINER ejecutables por anon/authenticated que son o bien RPCs legitimas
del cliente, o bien helpers de RLS/triggers de proteccion; tablas con RLS habilitada sin
policy son "deny-all" deliberado, incluidas plataforma_admin/plataforma_permiso/
red_resenas, todas leidas solo por rutas con service_role).

## Hallazgos

### Menor (amarillo) -- GET /api/network/vacantes no exige puedeGestionarEquipo (gap ya documentado en el propio codigo, sin cerrar)

**Archivo**: app/api/network/vacantes/route.ts:23-38

El GET (listado de "mis vacantes" del estudio, con contador de candidaturas) solo
comprueba verificarSesionStaff -- cualquier rol del panel, incluida RECEPCION, puede
leerlo. El POST de la misma ruta, y los demas endpoints de reclutamiento
(vacantes/[id] PATCH, vacantes/[id]/estado PATCH, vacantes/[id]/candidaturas GET,
candidaturas/[id] PATCH) si exigen puedeGestionarEquipo(sesion.rol).

El propio fichero vacantes/[id]/candidaturas/route.ts:26-31 ya deja constancia de esto:

> "PENDIENTE, y no es un olvido: GET /api/network/vacantes (el listado) sigue SIN
> este gate pese a que su cabecera afirma tenerlo. [...] No se cierra en la misma tanda
> porque /network no esta en BLOQUEADO_RECEPCION (lib/permisos-reglas.ts): quitarle
> el listado es una decision de producto, no un arreglo de seguridad evidente."

**Impacto real**: una RECEPCIONISTA (rol con acceso legitimo al panel del estudio, pero
sin permiso de gestion de equipo) puede ver el titulo, estado y numero de candidaturas
de cada vacante publicada -- no ve nombres/fotos/mensajes de las candidatas (eso si esta
cerrado en vacantes/[id]/candidaturas), asi que la fuga real es minima: metadatos de
reclutamiento, no PII de las candidatas. Confirmado leyendo el codigo directamente, el
gate ausente es visible en el handler.

**Por que no se cierra aqui**: el propio repo ya lo marca como decision de producto
pendiente de confirmar (anadir /network a BLOQUEADO_RECEPCION), no un descuido -- se
reporta para que quede trazado en esta pasada tambien, no para aplicar el fix sin que se
pida.

### Menor (amarillo) -- formalizacion/route.ts: cualquier staff (no solo puedeGestionarEquipo) puede proponer/confirmar el tipo de contrato

**Archivo**: app/api/network/formalizacion/route.ts:29-61 (resolverParticipante, lado 'estudio')

Para el lado "estudio" del hilo de formalizacion, resolverParticipante solo exige
sesionStaff.studioId === solicitud.studio_id -- no hay chequeo de rol. Esto significa
que un rol sin puedeGestionarEquipo (p. ej. RECEPCION) puede:
- Proponer si el contrato es temporal o indefinido (POST inicial).
- Confirmar la propuesta de la instructora.

La ejecucion real del alta en instructores (intentarEjecutarAlta, linea 76) si
exige puedeGestionarEquipo(participante.sesionStaff.rol), asi que el alta de equipo
en si no se puede colar por esta via -- pero la decision de negocio "temporal o
indefinido" queda en manos de cualquier persona con sesion de staff del estudio, no
solo de quien gestiona el equipo, contradiciendo la intencion explicita del propio
comentario de cabecera del fichero ("esa ejecucion exige ademas puedeGestionarEquipo,
igual que app/api/equipo/route.ts: que el chat tenga consenso no sustituye el control
de roles de quien puede escribir en el equipo" -- la propuesta/confirmacion en si queda
fuera de esa frase).

**Impacto real**: bajo. No mueve dinero ni crea una ficha de equipo por si sola; en el
peor caso, una RECEPCION sin autoridad de contratacion deja "propuesto/confirmado
indefinido" en un hilo que luego alguien con permiso real tendra que revisar al abrir el
GET (que si acaso ejecuta el alta). Es una inconsistencia de diseno, no una via de
escalada de privilegios ni de fuga de datos.

## Checklist de lo verificado

- Los 39 route.ts de app/api/network/**: auth (verificarSesionStaff vs
  verificarUsuarioSupabase) presente en TODOS; ninguno sin autenticacion.
- candidaturas/route.ts, candidaturas/[id]/route.ts,
  candidaturas/[id]/retirar/route.ts: maquina de estados server-side, sin politica
  INSERT/UPDATE directa para authenticated en red_candidaturas (confirmado por
  comentario de migracion 20260814050000).
- vacantes/[id]/candidaturas/route.ts: verifica vacante.studio_id ===
  sesion.studioId ANTES de leer candidaturas -- sin cruce entre estudios.
- mensajes/route.ts + mensajes/hilos/route.ts: resuelve correctamente los DOS
  mecanismos de auth (instructora dueña del perfil vs. staff del estudio de la
  solicitud), tope de mensajes en pendiente aplicado via RPC con FOR UPDATE (cierra
  una carrera ya encontrada en la 35a pasada).
- formalizacion/route.ts: doble confirmacion real (ninguna parte puede cambiar el
  tipo de contrato ya propuesto por la otra), autoridad del studio_id siempre del lado
  servidor -- hallazgo amarillo de rol documentado arriba.
- resenas/route.ts + alumna/resenas/route.ts: gate de "clase completada" real
  (consulta contra sesiones/reservas, no un flag manipulable), indices unicos
  parciales correctos tras la migracion 20260825004019; el POST repite la
  comprobacion de "ya resenado" que el GET ya hacia (fix de la 35a pasada, confirmado
  presente).
- perfil/[id]/route.ts, buscar/route.ts, estudios/buscar/route.ts,
  lib/network/publico.ts: lista blanca de columnas explicita, nunca select *;
  contacto (email_contacto/telefono_contacto/auth_user_id) fuera de la proyeccion
  publica en todos los casos revisados.
- app/api/interno/** (24 rutas): todas pasan por exigirPermiso/exigirAlguno
  (lib/interno/auth.ts) con permisos granulares correctos por seccion; ninguna ruta
  sin guard.
- app/api/interno/equipo/route.ts (alta de personal interno de Tentare) +
  lib/interno/equipo-reglas.ts: las 4 reglas de escalada (nadie se edita a si mismo,
  solo se concede lo que uno ya tiene, PERMISOS_SOLO_CEO no delegables, nunca queda la
  plataforma sin admin.full) estan implementadas y se aplican tanto en alta como en
  edicion -- sin via de auto-ascenso encontrada.
- app/api/interno/network/verificaciones-identidad/documento/route.ts: el bucket
  red-documentos-identidad no tiene policy de SELECT para anon/authenticated
  (confirmado en comentario + coherente con RLS deny-all de get_advisors); la unica
  via de lectura es esta ruta con exigirPermiso('network.moderate') + URL firmada de
  5 minutos.
- get_advisors (security, proyecto dwqvdycjcffqwfkzapvi): 31 tablas RLS-sin-policy
  (deny-all intencional, incluidas plataforma_admin/plataforma_permiso/red_resenas),
  15+48 funciones SECURITY DEFINER ejecutables por anon/authenticated -- todas ya
  documentadas como intencionales en tentare-os.md (RPCs de cliente o helpers de RLS/
  triggers), sin ningun caso nuevo tipo reservar_numero_factura.
- Descartado como ya cerrado, no un hallazgo nuevo: el resto de RPCs SECURITY
  DEFINER con nombres de Network (red_experiencias_proteger_verificacion,
  red_perfiles_proteger_verificacion, red_referencias_proteger_estado,
  red_verificaciones_proteger_estado) son triggers de proteccion de columnas contra
  auto-otorgamiento (migraciones red_confianza_no_autootorgable*), no endpoints de
  escritura -- su ejecutabilidad por authenticated es la via normal por la que Postgres
  invoca un trigger, no una puerta abierta.
- No se toco ni se aplico ningun fix -- solo lectura de codigo y verificacion
  read-only (get_advisors); no se ejecuto ningun execute_sql de escritura.

## Conclusion

Tentare Network resulto ser un area ya considerablemente endurecida por rondas previas
(documentadas dentro del propio codigo, no solo en el historial de PRs), a diferencia de
lo que sugeria su ausencia de la lista de "ya auditadas". No se encontro ningun patron
critico (rojo) ni importante (naranja) de "rol no comprobado en servidor", cross-tenant,
ni fuga de secretos en los 39+24 endpoints revisados. Los dos hallazgos amarillos son de
severidad baja: uno es un gap de rol ya autodocumentado por el propio equipo como
decision de producto pendiente (RECEPCION viendo metadatos de vacantes, sin PII de
candidatas), y el otro es una inconsistencia de diseno menor en quien puede proponer un
tipo de contrato dentro de un hilo de formalizacion (sin poder ejecutar el alta real,
que sigue protegida).

**Nada requiere accion inmediata.** Ambos hallazgos son candidatos razonables para una
tanda de limpieza menor, no para un hotfix.
