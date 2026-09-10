# Auditoria 48a pasada - Recuperaciones y Plazas Fijas (2026-09-10)

## Resumen ejecutivo

Area revisada: sistema de recuperaciones self-service (creditos de "clase a
recuperar") y plazas fijas semanales recurrentes: modelo, RPCs, RLS, cron
semanal de otorgamiento automatico, autoservicio de portal, e importadores CSV.

El sistema esta, en general, muy maduro y bien defendido: cuatro carreras
de concurrencia ya detectadas y cerradas en pasadas anteriores (advisory lock
en crear_recuperacion, for update en reservar_plaza/cancelar_reserva_plaza),
el "doble beneficio" de #1620/D-1 sigue cerrado en el codigo actual (verificado
en vivo contra dwqvdycjcffqwfkzapvi), la RLS de plazas_fijas/recuperaciones
ya distingue rol desde 0122/20260907004718, y el movimiento de plazas fijas al
editar una serie (editar_serie_desde) esta resuelto con detalle notable
(particion de vigencia, slot ajeno, spot que no viaja).

Sin embargo, se ha encontrado un hallazgo real de severidad alta: la RPC
crear_recuperacion (la unica via para CONCEDER una recuperacion) no comprueba
el rol del que llama cuando se invoca directo desde el navegador (como hace
dbCrearRecuperacion, en el camino real del panel). La RLS de la tabla
recuperaciones (migr 0122) solo protege los INSERT hechos via PostgREST
directo contra la tabla; un SECURITY DEFINER invocado como RPC la salta por
completo. El propio codigo del panel asume lo contrario ("desde la 0122 lo
rechaza la base de datos a quien no gestiona clientas", comentario en
ficha-recuperaciones.tsx) - es exactamente el patron que esta auditoria busca
en primer lugar, y la comparacion con ampliar_caducidades (que SI hace este
chequeo dentro de la funcion, para el mismo tipo de llamada directa) muestra
que es una omision, no una decision.

El resto de la superficie (autoservicio de plaza fija via /api/public/plaza-fija,
importadores CSV, materializacion semanal, grants de las RPCs con firma nueva)
esta correctamente cerrado.

---

## Hallazgo Alto (naranja) H-1: crear_recuperacion no comprueba el rol de quien llama

Cualquier INSTRUCTOR puede conceder clases gratis.

Archivos:
- lib/supabase-data.ts:2619-2637 (dbCrearRecuperacion, llama a supabase.rpc('crear_recuperacion', ...) con el cliente authenticated del navegador, NO con service-role)
- supabase/migrations/0122_rls_mandatos_y_recuperaciones.sql:56-77 (RLS de la tabla, que es lo unico que de verdad se cierra)
- Funcion viva en produccion crear_recuperacion(text,text,text,text,text,date) (verificado con execute_sql contra dwqvdycjcffqwfkzapvi)
- components/socios/ficha-recuperaciones.tsx:42-46 (el comentario que asume que la BD ya lo rechaza)

El hecho: crear_recuperacion es SECURITY DEFINER. Su cuerpo actual
(6 argumentos, con la fecha a medida de 20260904215616) comprueba:
1. STUDIO_MISMATCH (que el estudio del payload coincide con current_studio_id())
2. Que la fecha de caducidad a medida no sea pasada
3. El advisory lock por (studio_id, socio_id) (anti-carrera, correcto)
4. YA_EXISTE por origen_reserva_id (anti-farming, correcto)
5. El tope de 4 vivas

Lo que NO comprueba en ningun punto: el rol de quien la invoca. No hay
ningun "if not public.puede_gestionar_clientas() then raise 'NO_AUTORIZADO'"
como si tiene, para el mismo patron de llamada directa desde cliente,
ampliar_caducidades (verificado con execute_sql: esa funcion SI hace
"if auth.uid() is not null and not public.puede_mover_dinero() then raise
'NO_AUTORIZADO'").

Como la RLS de recuperaciones_escritura_insert (0122) es una policy sobre
la TABLA, y la funcion se ejecuta como su dueno (bypassa RLS por definicion
de SECURITY DEFINER), esa policy no protege nada en el camino que de
verdad usa el panel: dar() -> darRecuperacion()
(lib/studio-context.tsx:1618-1624) -> dbCrearRecuperacion()
(lib/supabase-data.ts:2619) -> supabase.rpc('crear_recuperacion', ...) con
la sesion de quien este logueada, sea cual sea su rol.

Escenario de explotacion concreto: una instructora (rol INSTRUCTOR,
que 0122 documenta explicitamente que debe quedar FUERA de "conceder o
anular una recuperacion") abre las herramientas de red del navegador o hace
un fetch directo al endpoint RPC de Supabase (rest/v1/rpc/crear_recuperacion)
con su propio JWT y la anon key (ambos ya expuestos en cualquier pestana del
panel), y un payload con: su propio estudio como p_studio_id, cualquier
socia del estudio como p_socio_id, y p_origen_reserva_id en null.

Esto crea una recuperacion (clase gratis) para cualquier socia de su propio
estudio, hasta 4 vivas por socia, repetible en cuanto caduquen o se
consuman. No hace falta ni siquiera tocar el frontend: el boton "Dar
recuperacion" esta oculto para su rol en la UI (puedeTocar en
ficha-recuperaciones.tsx:46), pero eso es exactamente la ilusion de
seguridad que esta auditoria busca: la UI escondio el boton, la BD no
cerro la puerta.

Impacto real: valor economico directo y silencioso (clases gratis para
socias elegidas por el personal, sin registro de quien las autorizo mas alla
del motivo de texto libre) contradiciendo una decision de producto ya
tomada y documentada explicitamente (0122: "cerrar solo la base de datos
dejaria un boton que falla" - aqui es al reves: se cerro el boton y no la
base de datos). No es cross-tenant (el STUDIO_MISMATCH sigue vivo) ni
explotable sin cuenta - requiere una sesion de staff valida en ese estudio,
asi que el techo de severidad es Alto y no Critico.

Propuesta de fix: anadir dentro de crear_recuperacion (mismo patron que
ampliar_caducidades), justo despues de validar_studio_mismatch/
validar_socio_del_studio y antes del advisory lock:

  if auth.uid() is not null and not public.puede_gestionar_clientas() then
    raise exception 'NO_AUTORIZADO';
  end if;

Los llamadores legitimos con auth.uid() is null (service-role: el cron
semanal otorgar-semanales.ts, otorgarRecuperacionPlazaFijaSiAplica al
cancelar una plaza fija, y el importador CSV) deben seguir funcionando sin
tocar nada - la guarda auth.uid() is not null ya lo garantiza, mismo criterio
que usa el resto de RPCs de este repo (reservar_plaza, cancelar_reserva_plaza,
ampliar_caducidades). El cambio no toca la firma, pero conviene un test
manual con execute_sql+ROLLBACK simulando auth.uid() de una instructora antes
de desplegar, y actualizar el comentario de ficha-recuperaciones.tsx:42-46
para que deje de decir que "ya lo rechaza la base de datos" sin que fuera
cierto hasta ahora.

---

## Verificado y CERRADO (no reabrir)

- Doble beneficio (nota de memoria recuperaciones-autoservicio-y-doble-beneficio.md):
  confirmado en vivo. ejecutarCancelacionReserva (lib/db/supabase-data-admin.ts:3014-3019)
  excluye explicitamente res-pf- del retorno de bono ("cancelar una plaza
  fija regalaba una sesion de bono + una recuperacion"), y crear_recuperacion
  dedupea por origen_reserva_id con advisory lock desde
  20260729173000_crear_recuperacion_lock_cubre_ya_existe.sql - verificado
  que el cuerpo VIVO en produccion sigue teniendo el lock ANTES de la
  comprobacion YA_EXISTE y del conteo del tope.
- Carreras de concurrencia: reservar_plaza (8 args, vivo en prod) usa
  pg_advisory_xact_lock por socia + for update sobre sesion/spot/recuperacion
  candidata; cancelar_reserva_plaza usa for update sobre la reserva y la
  sesion. No hay ventana de doble-reserva sobre el mismo hueco.
- Consumo de bono en recuperacion: confirmado que usar una recuperacion
  NUNCA consume bono (es una via alternativa al limite semanal, no una
  reserva mas) y que las plazas fijas materializadas por el cron tampoco
  consumen bono al confirmarse - su compensacion al cancelarlas es
  exclusivamente la recuperacion, con guardia explicita en codigo
  (esPlazaFija en supabase-data-admin.ts:3019) para no duplicar.
- RLS multi-tenant de recuperaciones/plazas_fijas: ambas exigen
  studio_id = current_studio_id() en las cuatro policies (lectura y las
  tres de escritura), y las escrituras ademas exigen puede_gestionar_clientas()
  desde 0122/20260907004718 - la unica grieta encontrada es H-1, no un fallo
  de la RLS en si.
- Cross-socia en autoservicio de plaza fija: /api/public/plaza-fija
  resuelve socioId del JWT (nunca del body) y cambiarEstadoPlazaFijaPublica
  filtra el UPDATE con .eq('socio_id', params.socioId) en la propia
  escritura, no solo en un SELECT previo - no hay forma de pausar/dar de
  baja la plaza fija de otra socia adivinando su id.
- Plaza fija + serie: fuera del hallazgo ya cerrado de #1620, el resto
  del flujo de editar_serie_desde (20260904230204) esta resuelto con
  cuidado explicito para slots ajenos, particion de vigencia y spot que no
  viaja de sala. materializar_plazas_fijas/plazas_fijas_sin_materializar
  respetan la cancelacion puntual de una ocurrencia (20260812130000) con el
  mismo criterio en los dos sitios (escritura y aviso de solo lectura).
- Grants: crear_recuperacion (ambas firmas), reservar_plaza,
  cancelar_reserva_plaza, editar_serie_desde y materializar_plazas_fijas
  tienen anon:false / authenticated correcto para cada caso (false en
  cancelar_reserva_plaza y materializar_plazas_fijas, true en el resto
  porque los llama el cliente legitimamente) - verificado con
  has_function_privilege contra los tres roles en dwqvdycjcffqwfkzapvi.
- Importadores CSV (app/api/recuperaciones/import, app/api/plazas-fijas/import):
  ambos exigen verificarSesionStaff + puedeGestionarClientas(sesion.rol),
  acotan todas las consultas a sesion.studioId, y el de recuperaciones pasa
  por la RPC (no INSERT directo) precisamente para no reimplementar el tope/
  caducidad/validacion de estudio en dos sitios.

## Que NO se ha podido verificar

- No se ha reproducido la explotacion de H-1 con una llamada REST real
  (requeriria credenciales de una instructora de prueba con JWT valido en
  este entorno) - el hallazgo se apoya en lectura de codigo + verificacion
  en vivo del cuerpo de la funcion en dwqvdycjcffqwfkzapvi (sin rol check)
  contrastada con ampliar_caducidades (con rol check, mismo patron de
  llamada), no en un exploit end-to-end.
