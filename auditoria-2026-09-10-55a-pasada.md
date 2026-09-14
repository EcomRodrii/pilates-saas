# Auditoria de seguridad -- 55a pasada (2026-09-10)

## Area elegida y por que

Se retoma el punto M-1 dejado explicitamente pendiente por la 49a pasada
(auditoria-2026-09-10-49a-pasada.md): "ALL + solo tenant es el patron por
defecto de muchas tablas de configuracion... una pasada dedicada que decida el
predicado por tabla". La 49a cerro 4 tablas de catalogo de gamificacion
(C-1/C-2) pero dejo dicho, textualmente, que el resto quedaba "reportado".

No coincide con el area de la 54a (Tentare Network) ni con ninguna de la lista
de areas ya cerradas.

Metodologia: inventario completo en vivo (pg_policies) de toda tabla con
policy FOR ALL cuyo predicado sea SOLO studio_id = current_studio_id() sin
ningun chequeo de rol (ni literal current_rol() ni una funcion helper tipo
puede_...()), cruzado contra quien llama a esa tabla en el codigo
(lib/supabase-data.ts, rutas app/api/**) para decidir si el hueco de RLS es
solo teorico (nadie escribe ahi desde el cliente) o real (hay un camino de
escritura directa desde el navegador que la API o el propio flujo de negocio
no vigila).

## Hallazgos

### CRITICO (rojo) -- otorgar_credito_disparador: LOGRO y RETO conceden creditos sin comprobar que se cumplieron

Archivos: funcion public.otorgar_credito_disparador (rama LOGRO lineas ~157-164
y rama RETO lineas ~165-172 de
supabase/migrations/20260910140000_gamificacion_catalogo_solo_propietaria.sql,
sin cambios respecto a la version original); llamadores en
lib/studio-context.tsx:4774 (evaluarLogrosSocio) y
lib/studio-context.tsx:4895 (evaluarRetosSocio); wrapper cliente
dbOtorgarCreditoDisparador en lib/supabase-data.ts:3321.

De los 7 disparadores que reconoce la RPC, 5 vuelven a comprobar la condicion
real contra la base de datos (ASISTENCIA_CLASE exige una
reservas.estado='ASISTIDA' real, REFERIDO_AMIGO exige una reserva asistida del
referido, RENOVACION_PLAN exige un recibo de renovacion real,
PRIMERA_RESERVA exige que exista al menos una reserva, SEMANA_COMPLETA exige
una reserva asistida dentro de la semana). Pero LOGRO y RETO NO comprueban
nada de eso: la rama LOGRO solo verifica que achievement_definitions tenga esa
fila activa en ese estudio, y la rama RETO solo verifica lo mismo contra
challenge_definitions. Ninguna de las dos consulta
achievement_progress.completado / challenge_progress.completado, que es donde
vive la condicion real de si la socia llego al umbral.

El comentario de cabecera de la propia funcion dice "el importe de creditos
NUNCA lo decide el cliente: la RPC lo recalcula desde la regla/logro/reto
activo del propio estudio, y para ASISTENCIA_CLASE/REFERIDO_AMIGO exige que la
condicion exista de verdad en la BD... antes de conceder nada" -- la frase es
literalmente cierta para el IMPORTE (ya blindado por la propia 49a, D-2, que
impide que la instructora fabrique un logro de 9999 creditos), pero es FALSA
para la CONDICION de LOGRO/RETO: nadie la revisa en servidor.

evaluarLogrosSocio/evaluarRetosSocio (lib/studio-context.tsx) calculan
progreso_actual y completado ENTERAMENTE en el navegador
(calcularMetrica/calcularProgresoReto sobre reservas/sesiones ya cargados en
memoria) y, si el calculo cliente dice completadoAhora = true, llaman a
dbOtorgarCreditoDisparador(socioId, studioId, 'LOGRO', ...) pasando el
socioId y achievementId/challengeId que ella misma decide. La RPC no repite
ese calculo -- confia en que quien la llama solo la invoca cuando de verdad se
cumplio.

Explotacion real, verificada en vivo (execute_sql + ROLLBACK, sin dejar
cambios): se llamo a la RPC para el socio real
078bc212-7492-4b94-b18e-6a1118261659 del studio-1 y el logro real
"100 clases" (300 creditos), confirmando primero que ese socio NO tenia
achievement_progress.completado = true para ese logro. La RPC concedio los
300 creditos igualmente:

  select * from otorgar_credito_disparador(
    'studio-1', '078bc212-7492-4b94-b18e-6a1118261659', 'LOGRO',
    '078bc212-7492-4b94-b18e-6a1118261659:ach-1783434951033-plc5i',
    'ach-1783434951033-plc5i');
  -- resultado: saldo 310, otorgado true, creditos 300,
  --   descripcion "Logro desbloqueado: 100 clases"

Quien puede hacerlo: la RPC tiene EXECUTE para authenticated (verificado con
has_function_privilege), y validar_studio_mismatch solo exige que
p_studio_id coincida con el current_studio_id() del que llama -- o sea,
cualquier miembro de PLANTILLA del propio estudio (INSTRUCTOR, RECEPCION,
MANAGER, no solo PROPIETARIO), porque no hay ninguna comprobacion de rol en la
RPC ni se exige que el socio_id objetivo sea "uno mismo". validar_socio_del_studio
solo comprueba que el socio_id pertenezca al mismo estudio, no quien es el
llamante respecto a ese socio.

Impacto real: cualquier cuenta de plantilla (incluida INSTRUCTOR, el rol de
menor privilegio del panel) puede, desde la consola del navegador con su
propia sesion ya autenticada, conceder a CUALQUIER socia de su estudio TODOS
los logros y retos activos configurados por la propietaria de golpe -- sin
que la socia haya asistido nunca a una clase --, y esos creditos son
canjeables por premios reales de reward_catalog (columnas stock,
limite_por_socia, efecto: hay valor de negocio real detras, no solo un
contador cosmetico). A diferencia del hallazgo C-1 de la 49a (que ya se
cerro: el importe por logro/reto ya no lo puede inflar quien llama), este es
un bypass distinto de la MISMA funcion que sigue abierto: no hace falta
manipular el catalogo, basta con invocar la RPC saltandose la evaluacion de
progreso.

Por que la 49a no lo vio: su verificacion se centro en el vector que la
revision independiente habia encontrado (catalogo editable -> importe
arbitrario) y en cerrar exactamente ese hueco (D-2); no re-audito la ausencia
de comprobacion de progreso en las ramas LOGRO/RETO, que es un defecto
preexistente a esa migracion y no se toco por ella.

Correccion recomendada (no aplicada en esta pasada, solo diagnostico): las
ramas LOGRO/RETO deberian exigir
exists (select 1 from achievement_progress where socio_id=p_socio_id and
achievement_id=p_config_id and completado) (y analogo para
challenge_progress), igual que las otras 5 ramas comprueban su propia tabla
de hechos.

### IMPORTANTE (naranja) -- ingresos_manuales: la RLS no exige puedeMoverDinero, solo la API lo hace

Archivos: policy admin_ingresos_manuales (ALL, predicado
studio_id = current_studio_id(), sin rol) vs.
app/api/ingresos-manuales/route.ts (GET/POST/PATCH/DELETE, las 4 exigen
puedeMoverDinero(sesion.rol) correctamente, usan service_role y acotan
studio_id desde el JWT).

El endpoint esta bien hecho -- es exactamente el patron "chequeo de rol en
servidor" que pide esta auditoria. El problema es que, al usar service_role,
la ruta SE SALTA la RLS entera (como su propio comentario reconoce: "el rol
hay que mirarlo aqui o no lo mira nadie"), y la RLS que queda para cualquier
OTRA via de acceso (el cliente PostgREST con el JWT del usuario,
supabase.from('ingresos_manuales')...) no exige rol ninguno -- solo
pertenencia al estudio. No se encontro ningun dbInsertIngresoManual /
equivalente en lib/supabase-data.ts que use ese camino directo (la pantalla
app/(dashboard)/cierre/page.tsx solo hace fetch('/api/ingresos-manuales')),
asi que HOY no hay un boton de la UI que dispare el bypass. Pero la RLS por
si sola no impediria que una cuenta INSTRUCTOR (que puedeMoverDinero excluye
a proposito) insertara/editara/borrara directamente una fila de
ingresos_manuales desde la consola del navegador con su propia sesion --
incluyendo nif, total, base_imponible, cuota_iva fabricados a mano.

Impacto real: ingresos_manuales alimenta computeCierreAnual
(lib/fiscal/cierre-engine.ts) y el cierre fiscal que se envia a gestoria
(lib/fiscal/cierre-envio-server.ts) -- es decir, una fila fabricada por una
cuenta no autorizada podria llegar a un documento fiscal real si nadie la
revisa a mano antes de enviarlo. Es "solo" defensa en profundidad rota (la API
ya protege el camino previsto), no una via activamente usada hoy -- de ahi
naranja y no rojo.

### MENOR (amarillo) -- usuarios: GRANT a anon + RLS sin rol sobre una tabla que ya no tiene consumidores reales

Archivo: policy admin_usuarios (ALL, studio_id = current_studio_id(), sin
rol); grants de tabla: anon y authenticated tienen SELECT/INSERT/UPDATE/DELETE
completos (confirmado en information_schema.role_table_grants).

usuarios tiene una columna rol propia, lo que en un primer vistazo parece una
via de auto-escalada de rol clasica. Verificado que NO lo es: current_rol()/
current_studio_id() (las dos funciones que deciden permisos en TODO el resto
del esquema) se resuelven exclusivamente contra instructores/studios, nunca
contra usuarios -- confirmado leyendo pg_get_functiondef de ambas. Y usuarios
no tiene NINGUN escritor en todo el arbol (grep de from('usuarios') solo
encuentra una lectura en lib/supabase-data.ts:5201, cuyo resultado
(mapUsuario) no lo consume ninguna pantalla ni logica de permisos: es una
tabla heredada, viva en el esquema pero sin rol funcional en la app actual).

El GRANT a anon tampoco es explotable en la practica: para anon, auth.uid()
es NULL, asi que current_studio_id() resuelve NULL, y studio_id = NULL nunca
es verdadero en SQL -- la RLS bloquea a anon por construccion aunque el GRANT
de tabla exista. Para authenticated si se podria escribir/borrar filas de
este vestigio dentro de su propio estudio, pero al no alimentar ninguna
decision de permisos ni pantalla, el efecto practico es cosmetico (limpieza
de higiene, no fuga ni escalada).

## Checklist de lo verificado

- Inventario completo via pg_policies de las ~68 policies FOR ALL del esquema
  public; ~31 tablas usan el predicado exacto
  studio_id = current_studio_id() sin ninguna funcion de rol.
- De esas 31, 4 ya estaban cerradas por la 49a (achievement_definitions,
  challenge_definitions, reward_rules, reward_catalog -- verificado que la
  migracion 20260910140000... esta aplicada tal cual: lectura abierta,
  escritura exige puede_configurar_negocio() = current_rol() = 'PROPIETARIO').
- current_rol()/current_studio_id(): leidas ambas definiciones completas
  (pg_get_functiondef) -- confirman que el rol se deriva SIEMPRE de
  instructores/studios, nunca de usuarios ni de ninguna otra tabla de la
  lista de 31.
- otorgar_credito_disparador: leida la funcion completa (7 ramas), verificado
  has_function_privilege para anon/authenticated/service_role, y reproducido
  en vivo (transaccion con ROLLBACK) que concede creditos de un logro real a
  un socio real que no lo habia completado -- hallazgo critico confirmado,
  no teorico.
- validar_studio_mismatch/validar_socio_del_studio: leidas completas --
  confirman que ninguna de las dos comprueba que el llamante sea el propio
  socio ni que tenga un rol concreto, solo pertenencia al mismo estudio.
- dbOtorgarCreditoDisparador (lib/supabase-data.ts:3321) y sus dos
  llamadores de gamificacion (lib/studio-context.tsx:4774/4895): leidos
  completos -- confirman que el calculo de completado es 100% cliente y que
  el servidor no lo repite para LOGRO/RETO.
- ingresos_manuales: comparada la RLS (sin rol) contra
  app/api/ingresos-manuales/route.ts (con rol, puedeMoverDinero,
  service-role) -- confirmado que la API esta bien hecha y que hoy no hay
  ningun camino de escritura directa desde el cliente en lib/supabase-data.ts
  hacia esa tabla; el hueco es de defensa en profundidad, no un bug explotado
  hoy por la propia UI.
- congelaciones: sin escritor directo desde el cliente (grep negativo); las
  unicas escrituras pasan por congelar_suscripcion/descongelar_suscripcion
  (RPCs, ya protegidas por puede_mover_dinero() segun la 49a, C-3). El hueco
  de RLS existe en el papel pero no hay ruta de explotacion encontrada hoy.
- instructor_tarifas/liquidaciones_instructoras: aunque el filtro inicial las
  marco como "sin mencion literal de rol", al leer el qual completo si usan
  puede_gestionar_ficha_instructor(instructor_id) -- correctamente
  protegidas, falso positivo del filtro por substring, descartadas.
  actividad_reciente/cierres_estudio/post_likes: mismo caso, protegidas por
  current_rol() = 'PROPIETARIO' o puede_gestionar_calendario()/
  user_id = auth.uid() respectivamente -- descartadas.
- salas/tipos_clase: confirmado que siguen exactamente como los describe la
  nota M-1 original (INSTRUCTOR puede editarlas) -- es un riesgo de producto
  ya documentado y aceptado, no se repite el hallazgo aqui.
- sustituciones/sustitucion_contactos, citas_disponibilidad/
  citas_servicios, spots, campos_personalizados, canales_equipo,
  dashboard_charts, notificaciones, preferencias_socio, socio_excepciones,
  favoritos_clase, red_favoritos, soporte_solicitudes, videos_on_demand,
  plan_tipos_clase, bloqueos_maquina, instructor_dependency_snapshots,
  instructora_disponibilidad_excepciones, reto_participaciones,
  level_definitions: mismo patron "ALL + solo tenant, sin rol", pero no se
  encontro en ellas ni dinero real, ni escalada de rol, ni PII de salud --
  quedan en la misma categoria que salas/tipos_clase (riesgo de producto de
  bajo impacto, ya conocido en su forma general por M-1), no se investigo
  cada una en profundidad por limite de alcance de esta pasada.
- get_advisors (security, dwqvdycjcffqwfkzapvi): sin avisos nuevos mas alla
  de los ya documentados como intencionales en tentare-os.md.
- No se aplico ningun fix ni se dejo ningun cambio real en la base de datos
  -- todas las verificaciones en vivo se hicieron dentro de BEGIN...ROLLBACK.

## Conclusion

El punto M-1 pendiente de la 49a pasada si escondia un hallazgo real y grave,
pero no en la forma en que M-1 lo planteaba (tablas de configuracion
editables por cualquier rol): el hallazgo mas serio de esta pasada esta en
una funcion SECURITY DEFINER contigua al mismo area (gamificacion/creditos)
que ya se habia "cerrado" esta misma manana -- otorgar_credito_disparador
sigue permitiendo fabricar creditos reales a traves de LOGRO/RETO, un bypass
distinto del que arreglo la 49a y confirmado con una concesion real de 300
creditos a un logro no completado. Requiere accion inmediata: cualquier
cuenta de plantilla, incluida la de menor privilegio (INSTRUCTOR), puede
ejecutarlo hoy mismo contra produccion sin dejar rastro mas que el propio
credit_transactions.

El segundo hallazgo (ingresos_manuales) es defensa en profundidad rota, no
explotado hoy por la propia UI, pero relevante porque alimenta un documento
fiscal real. El tercero (usuarios) es higiene de esquema sin impacto
practico verificado.

Accion inmediata recomendada: cerrar las ramas LOGRO/RETO de
otorgar_credito_disparador exigiendo achievement_progress.completado/
challenge_progress.completado antes de conceder, con el mismo criterio que ya
usan las otras 5 ramas -- no se aplica en esta pasada por ser solo fase de
auditoria, pero es el unico hallazgo critico de este informe y no deberia
esperar a la siguiente ronda.
