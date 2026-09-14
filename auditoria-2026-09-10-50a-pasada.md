# Auditoria 50a pasada - VeriFactu / envio de facturas a la AEAT (Fiskaly)

Fecha: 2026-09-10. Area: sistema de facturacion electronica obligatoria espanola
(VeriFactu), motor de huella, cola de transmision a la AEAT y el modulo Fiskaly.

## Resumen ejecutivo

El sistema VeriFactu de Tentare esta implementado con una disciplina de dinero/
idempotencia notablemente por encima de la media del repo - el sellado
(lib/billing/sellar-factura-server.ts) usa una RPC con advisory lock por
estudio, UNIQUE(studio_id, verifactu_seq), un guardia de "reserva incompleta"
para retomar tras un crash, y un UPDATE ... WHERE verifactu_hash IS NULL para
no pisar un sellado concurrente ya completado. Los grants de
reservar_numero_factura estan correctamente cerrados a service_role (verificado
en vivo). La RLS de facturas es de solo lectura, acotada a puede_ver_finanzas()
+ studio_id, sin ninguna via de escritura desde cliente.

Dos hallazgos reales, ambos en la pieza que SI mueve el registro fuera de
Tentare (lib/verifactu/transmitir.ts, el cron que habla con la AEAT):

1. [ALTO/NARANJA] Ninguna proteccion contra dos ejecuciones concurrentes de
   transmitirPendientes() - puede reenviar la misma factura dos veces a la
   AEAT y, peor, una respuesta tardia de la segunda puede sobrescribir el
   estado REGISTRADA de la primera con RECHAZADA, congelando en falso toda la
   transmision futura del estudio y disparando un aviso falso a la propietaria.
2. [ALTO/NARANJA] El control de flujo obligatorio de la AEAT (TiempoEsperaEnvio,
   minimo 60s entre envios) se documenta pero no se aplica: dentro de una misma
   pasada del cron, el bucle manda un sobre SOAP por cada estudio con facturas
   pendientes, uno tras otro, sin ninguna espera.

Ademas, un hallazgo informativo (no bug, pero relevante para responder las
preguntas del encargo): el modulo Fiskaly (lib/billing/fiskaly.ts) es codigo
muerto - no lo llama nadie - mientras que comentarios en el codigo activo
(sellar-factura-server.ts, app/api/facturas/rectificar/route.ts) siguen
hablando de "Fiskaly" como si fuera la via de transmision pendiente de activar.
La via real y activa es el cliente SOAP propio (lib/verifactu/), no Fiskaly.

No se ha probado nunca contra la AEAT real (sin certificado configurado en
ningun entorno - confirmado tambien en BD: 9 facturas en PENDIENTE, 0
REGISTRADA/RECHAZADA/ACEPTADA_CON_ERRORES en produccion). Los dos hallazgos de
abajo son de codigo, verificables por lectura + logica, no reproducidos contra
la AEAT (no hay forma de hacerlo sin certificado real).

---

## Hallazgo 1 - Sin idempotencia real entre ejecuciones concurrentes del cron de transmision (severidad ALTA)

Archivo: lib/verifactu/transmitir.ts:73-249 (lee PENDIENTE, envia, y
actualiza verifactu_estado sin ninguna condicion de carrera).
Migracion relacionada: supabase/migrations/20260905030122_verifactu_cola_de_transmision.sql
(no crea ningun estado intermedio tipo ENVIANDO/EN_CURSO, solo
PENDIENTE -> REGISTRADA/ACEPTADA_CON_ERRORES/RECHAZADA).

### El problema

transmitirPendientes() hace: SELECT ... WHERE verifactu_estado IN
('PENDIENTE') -> construye el sobre SOAP -> enviarSobreAeat() -> por cada
factura del lote, admin.from('facturas').update({ verifactu_estado: estado
}).eq('id', factura.id) (linea 229), sin .eq('verifactu_estado', 'PENDIENTE')
ni ningun lock que impida a otra ejecucion leer las mismas filas mientras la
primera todavia esta esperando la respuesta de la AEAT.

No hay ningun mecanismo (advisory lock, SELECT ... FOR UPDATE SKIP LOCKED,
marcar la fila como "en transito" antes de la llamada de red) que impida que
dos invocaciones de transmitirPendientes() solapen.

### Como puede pasar en la practica

El cron esta en vercel.json cada 10 minutos con maxDuration = 300 (5 min), asi
que en condiciones normales no deberia solaparse. Pero:
- Vercel Cron puede reintentar/disparar una ejecucion si la anterior tarda o
  falla de forma ambigua. enviarSobreAeat tiene su propio timeout de 30s por
  sobre (lib/verifactu/envio.ts:98), pero eso es por peticion, no acota el
  tiempo total del cron si hay varios estudios - no hay ninguna garantia de
  que Vercel no dispare la siguiente invocacion mientras la actual sigue en
  curso.
- Nada impide invocarlo manualmente dos veces con CRON_SECRET (uso interno,
  pero un doble despliegue/debug real lo dispararia igual).

### Impacto concreto

1. Envio duplicado del mismo RegistroAlta a la AEAT. La AEAT puede rechazar el
   segundo por duplicado (segun su propia logica de negocio, no verificable
   sin sandbox real) o aceptarlo con una marca de error - cualquiera de las
   dos cosas es un registro fiscal anomalo sobre una factura que ya estaba
   correctamente registrada.
2. Sobrescritura de estado sin condicion de carrera (esto es lo grave, no el
   duplicado en si): si la respuesta de la ejecucion B llega DESPUES que la de
   la ejecucion A, el UPDATE de B pisa el de A sin comprobar nada. Si A
   recibio Correcto (-> REGISTRADA) y B recibe, por el envio duplicado,
   Incorrecto (-> RECHAZADA), la factura queda marcada RECHAZADA en la BD de
   Tentare aunque la AEAT la tenga correctamente registrada.
3. Efecto en cadena, no solo un dato erroneo puntual: hayHuecoAntesDe()
   (lib/verifactu/pendientes.ts:70-79) calcula la "ultima secuencia
   registrada" filtrando verifactu_estado IN ('REGISTRADA',
   'ACEPTADA_CON_ERRORES'). Si la factura seq N queda marcada RECHAZADA por
   este efecto, TODA factura posterior del estudio (seq > N) deja de poder
   transmitirse, porque el cron ve un "hueco en la cadena" que en realidad no
   existe - la N si esta registrada en la AEAT, solo que la BD de Tentare no
   lo refleja. Es el mismo escenario que la 34a pasada de auditoria (citada en
   el propio codigo, lineas 239-243) identifico como el mas grave de este
   sistema: "congela para siempre la transmision de toda factura posterior".
4. Ademas, dispara emitirFacturaRechazadaAeat (lib/verifactu/transmitir.ts:244-247)
   - un aviso PUSH + EMAIL de prioridad ALTA a la propietaria diciendole que
   la AEAT rechazo una factura que en realidad acepto.

### Propuesta de fix

- Advisory lock a nivel de aplicacion (mismo patron que ya usa
  reservar_numero_factura, un pg_try_advisory_lock con una clave fija tipo
  hashtext('verifactu-transmitir')) tomado al inicio de transmitirPendientes()
  y liberado al final; si no se consigue, la ejecucion sale inmediatamente sin
  tocar nada. Es la forma mas barata: no exige tocar el esquema.
- Complementar con un UPDATE ... WHERE verifactu_estado = 'PENDIENTE' (no solo
  .eq('id', ...)) en la actualizacion final, para que una escritura tardia de
  una ejecucion "perdedora" no pueda sobrescribir un estado ya resuelto por
  otra.
- Opcional pero mas robusto: marcar las filas como 'ENVIANDO' (ampliar el
  CHECK de verifactu_estado) justo antes de construir el sobre y filtrar solo
  PENDIENTE en el SELECT, liberando a PENDIENTE de nuevo si el envio falla.

---

## Hallazgo 2 - Control de flujo TiempoEsperaEnvio de la AEAT documentado pero no implementado entre estudios de la misma pasada (severidad ALTA)

Archivo: lib/verifactu/transmitir.ts:98-250 (bucle for (const [studioId,
suyas] of porEstudio)); lib/verifactu/respuesta.ts:41,94 (el campo se parsea);
lib/verifactu/endpoints.ts:48-55 (la constante ESPERA_INICIAL_SEGUNDOS = 60
esta definida pero nunca importada por nadie).

### El problema

El propio codigo documenta, en tres sitios distintos
(lib/verifactu/pendientes.ts:7-11, lib/verifactu/envio.ts:44-47,
lib/verifactu/endpoints.ts:48-55), que la AEAT impone un control de flujo
obligatorio entre envios via TiempoEsperaEnvio (arranca en 60s) - y que por
eso la transmision se saco del sellado y se movio a un cron por lotes.

Pero dentro de una sola ejecucion del cron, si hay mas de un estudio con
facturas PENDIENTE a la vez, el bucle for (const [studioId, suyas] of
porEstudio) construye un sobre SOAP por estudio y llama a enviarSobreAeat()
para cada uno en secuencia, sin ninguna espera entre llamadas. La respuesta de
la AEAT trae tiempoEsperaSegundos (parseado en respuesta.ts:94), pero ese
campo no se lee en ningun sitio de transmitir.ts - se descarta.

### Impacto concreto

En cuanto haya 2+ estudios con facturas pendientes en la misma pasada de cron
(algo esperable en produccion normal con varios estudios activos cobrando el
mismo dia), Tentare estaria incumpliendo el control de flujo que la propia
AEAT exige, arriesgandose a que la AEAT rechace o penalice envios por
frecuencia excesiva - exactamente el escenario que el diseno (mover la
transmision fuera del sellado, a un cron por lotes) se proposo evitar, solo
que a nivel inter-estudio en vez de intra-estudio.

### Propuesta de fix

Antes de pasar al siguiente estudio del bucle, esperar como minimo
ESPERA_INICIAL_SEGUNDOS (o el tiempoEsperaSegundos que devolvio la AEAT en la
respuesta anterior, si vino). Dado que maxDuration es 300s y la espera es de
60s minimo, esto limita a ~4-5 estudios por pasada de cron con este enfoque
ingenuo - si el numero de estudios con facturas pendientes puede superar eso,
hace falta repartir en varias pasadas (seguir procesando el resto en la
siguiente invocacion de los 10 min) en vez de intentar vaciar la cola entera
en una sola ejecucion.

---

## Hallazgo informativo (no bug) - Fiskaly es codigo muerto; la documentacion en el codigo activo no lo refleja

Archivos: lib/billing/fiskaly.ts (0 callers fuera de si mismo, confirmado por
grep en app/ y lib/), vs. comentarios en
lib/billing/sellar-factura-server.ts:362-375 y
app/api/facturas/rectificar/route.ts:16 que siguen hablando de "activar la
transmision externa una vez validado el payload de Fiskaly" / "la transmision
a Fiskaly/AEAT no se ha activado todavia".

La via de transmision real y activa hoy es el cliente SOAP propio construido
en lib/verifactu/ (endpoints oficiales de la AEAT, XML propio, sin
intermediario). lib/billing/fiskaly.ts es una implementacion completa y
correcta de un cliente REST para Fiskaly SIGN ES (auth, alta de emisor, firma
de factura), pero nadie la invoca - es una via alternativa que se dejo de usar
sin que los comentarios del codigo activo se actualizaran para reflejarlo.
Responde directamente a la pregunta 4 del encargo: las credenciales de
Fiskaly (FISKALY_API_KEY/FISKALY_API_SECRET) no se usan en ningun flujo activo
hoy, asi que no hay superficie de fuga real por ahi, pero si alguien reactiva
ese modulo sin revisar esto, convivirian dos sistemas de transmision con
numeracion/cadena de huella independientes sobre las mismas facturas - un
riesgo de diseno a vigilar, no algo que arreglar ahora. Sugerido: o bien
borrar lib/billing/fiskaly.ts si Fiskaly ya no es el plan, o bien actualizar
los comentarios que lo mencionan como "la via pendiente de activar" para que
no desoriente a la proxima persona que toque este codigo.

---

## Verificaciones realizadas (no solo lectura de codigo)

- has_function_privilege sobre reservar_numero_factura: anon/authenticated ->
  false, service_role -> true. Grants correctos.
- RLS de facturas en produccion: unica politica es facturas_lectura (SELECT,
  studio_id = current_studio_id() AND puede_ver_finanzas()) - sin politica de
  escritura para roles de cliente.
- Estado real en produccion (dwqvdycjcffqwfkzapvi): 27 facturas con
  verifactu_estado IS NULL (historico, anterior a la cola - comportamiento
  esperado y documentado en la propia migracion), 9 en PENDIENTE, 0 en
  REGISTRADA/ACEPTADA_CON_ERRORES/RECHAZADA - consistente con que no hay
  certificado (VERIFACTU_CERT_PFX_BASE64) configurado todavia y nada se ha
  transmitido nunca de verdad, tal y como advierte el propio codigo en
  lib/verifactu/envio.ts:17-19.
- Confirmado por grep que lib/billing/fiskaly.ts no tiene ningun caller en
  app/ ni lib/ (aparte de sus propios tests).
- Confirmado por grep que ESPERA_INICIAL_SEGUNDOS y tiempoEsperaSegundos no se
  leen en transmitir.ts (el unico consumidor real del envio por lotes).

## Fuera de alcance de esta pasada (confirmado, no repetido)

- El bug ya cerrado de #1794 (huella/entorno de pruebas filtrandose al papel
  de la clienta) - no se ha tocado ni revisitado.
- Auditoria sistematica de las 89 funciones SECURITY DEFINER - cubierta por la
  49a pasada (otra sesion). La unica funcion VeriFactu relevante
  (reservar_numero_factura) se verifico igualmente aqui porque cae dentro del
  area encargada, y sus grants estan correctos.
