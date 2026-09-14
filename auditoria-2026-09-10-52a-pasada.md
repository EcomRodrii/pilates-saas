# Auditoria 52a pasada - Piloto Automatico / ejecutor del Decision OS

Fecha: 2026-09-10. Area: lib/decision/autonomia.ts, lib/inngest/decision.ts (F2/F3),
app/api/decisiones/autonomia/route.ts, app/api/decisiones/[id]/aprobar y rechazar/route.ts,
app/api/decisiones/analizar/route.ts.

## Resumen ejecutivo

El ejecutor del piloto automatico esta construido con bastante cuidado y varias de las
preguntas de la consigna ya tienen guardas explicitas y con test dedicado:

- La config de autonomia se lee fresca de BD en cada ejecucion del cron
  (dbGetAutonomiaConfig dentro de step.run), nunca cacheada entre pasadas. Un
  estudio que apaga el piloto hoy no lo arrastra al analisis de manana.
- Hay una doble guardia explicita contra ejecutar COBRAR_RECIBOS en automatico:
  la allowlist global TIPOS_AUTONOMIA_PERMITIDOS (ENVIAR_EMAIL, CONTACTO_MANUAL)
  y la allowlist del estudio, y existe un test (autonomia.test.ts linea 73) que fuerza una
  config maliciosa con COBRAR_RECIBOS y comprueba que sigue sin ser elegible.
- La transicion PENDIENTE a APROBADA es un compare-and-set atomico en BD
  (WHERE estado = desde), no un lock en memoria. Dos ejecuciones concurrentes sobre
  la MISMA recomendacion no pueden aprobarla o ejecutarla dos veces.
- Quien aprueba queda registrado sin ambiguedad: resuelto_por = AUTONOMIA en el
  camino automatico vs resuelto_por = sesion.userId (un UUID real) en el manual. No
  hay forma de confundir una ejecucion sola con una aprobacion humana en el historico.
- Un especialista nuevo no queda auto-ejecutable por accidente: resolverNivelAutonomiaPorTipo
  hace fallback a nivel 1 para cualquier tipo que no este en AUTONOMIA_DECLARADA_POR_TIPO
  (confianza.ts linea 399), y elegibleParaAutonomia exige nivelAutonomia mayor o igual a 2.
  Hace falta una edicion explicita en DOS sitios (esa tabla mas TIPOS_AUTONOMIA_PERMITIDOS)
  para que algo nuevo se auto-ejecute. Es el patron inverso al resto del repo, y aqui esta
  bien resuelto por diseno (fail-closed por omision, no fail-open).

Los hallazgos reales son de severidad baja/media: una arquitectura que depende de un unico
array (TIPOS_AUTONOMIA_PERMITIDOS) como ultima barrera para que RECUPERAR_PAGOS no
cobre solo pese a declarar autonomia 2, y una ventana de carrera estrecha entre el analisis
manual y el cron que podria hacer que el tope diario de auto-ejecuciones se sobrepase (no
que una recomendacion se ejecute dos veces, eso si esta cerrado).

## Hallazgos

### AMARILLO H1 - RECUPERAR_PAGOS declara autonomia 2 y confianza siempre ALTA pese a mover dinero; la unica barrera es un array

Archivos: lib/decision/confianza.ts lineas 389 a 395 (AUTONOMIA_DECLARADA_POR_TIPO),
lib/decision/especialistas/ingresos.ts lineas 130 a 160 (regla I2), lib/decision/autonomia.ts
linea 27 (TIPOS_AUTONOMIA_PERMITIDOS).

AUTONOMIA_DECLARADA_POR_TIPO de RECUPERAR_PAGOS vale 2, y su confianza se calcula llamando a
confianzaRecuperarPagos con los tres criterios (tarjetaValida, vencidoMenos30d, socioActivo)
puestos a true siempre (ingresos.ts linea 139). O sea: cuando la regla I2 emite una
candidata, su confianza es siempre ALTA por construccion, nunca MEDIA ni BAJA. Combinado con
nivelAutonomia = min(2, autonomiaMaxima=2) = 2, esta recomendacion pasa las cuatro primeras
comprobaciones de elegibleParaAutonomia (config.activa, PENDIENTE, confianza ALTA,
nivelAutonomia >= 2) sin excepcion. Lo unico que la bloquea es la quinta linea:
TIPOS_AUTONOMIA_PERMITIDOS.includes(accion.tipo), y accion.tipo para RECUPERAR_PAGOS es
COBRAR_RECIBOS (ingresos.ts linea 154), que no esta en esa lista.

Es decir: una sola constante, en un solo fichero, es lo unico que impide que el piloto
automatico cargue tarjetas de socias reales sin aprobacion humana. El comentario de cabecera
de autonomia.ts ya lo advierte (COBRAR_RECIBOS queda fuera de la allowlist pase lo que pase)
y hay test que lo cubre, asi que HOY no es explotable. El riesgo es de proceso, no de codigo
vivo: si alguien simplifica en el futuro fusionando las dos allowlists (global + estudio) en
una sola, o anade COBRAR_RECIBOS a TIPOS_AUTONOMIA_PERMITIDOS pensando que ya esta cubierto
por el chequeo de confianza (que, como se ve arriba, siempre da ALTA para este tipo), el
piloto empezaria a cobrar tarjetas solo. La causa raiz es que el "nunca cobra" vive como un
dato dentro de un array de strings, no como una propiedad del tipo de accion (por ejemplo un
campo mueveOtroDinero:boolean en el contrato de AccionDecision, chequeado con un assert que
rompa la build si COBRAR_RECIBOS entra en la lista).

Propuesta de fix: mover la exclusion de COBRAR_RECIBOS de "esta en un array que hay que
recordar no tocar" a un invariante de tipos, por ejemplo tipando TIPOS_AUTONOMIA_PERMITIDOS
como Exclude de AccionDecision tipo sin COBRAR_RECIBOS, de forma que anadirlo ahi sea un
error de compilacion, no solo un test que hay que acordarse de no romper. El test ya existe y
sigue siendo la ultima linea de defensa en runtime, esto es una capa adicional en build-time,
no un reemplazo.

### AMARILLO H2 - Carrera entre Analizar Ahora manual y el cron diario: el tope diario de auto-ejecuciones se lee una vez por ejecucion

Archivos: lib/inngest/decision.ts lineas 180 a 187 (paso seleccionar-autonomas),
lib/decision/db.ts lineas 725 a 735 (dbCountAutonomasHoy), app/api/decisiones/analizar/route.ts
lineas 20 a 30 (rate-limit de 5 minutos).

Dentro de una misma ejecucion de analizarEstudio, dbCountAutonomasHoy se lee UNA vez y
seleccionarAutonomas corta con slice(0, cupo), correcto para esa ejecucion. Pero si el cron
diario (14:30 UTC) y un Analizar Ahora manual (rol PROPIETARIO) caen para el MISMO estudio
con menos de un instante de diferencia, cada ejecucion lee yaHoy de forma independiente ANTES
de que la otra haya aprobado nada, asi que las dos pueden seleccionar hasta maxDiario
recomendaciones cada una. El tope diario (hasta MAX_DIARIO_TOPE=50) se podria superar hasta
el doble en el peor caso.

El endpoint manual si tiene un guardia (analizar/route.ts lineas 20 a 30): rechaza un segundo
analisis si hay una decision_session iniciada en los ultimos 5 minutos para ese estudio. Pero
ese guardia consulta decision_sessions, y dbInsertDecisionSession (el primer paso de
analizarEstudio) se ejecuta DESPUES de que la peticion HTTP ya paso el guardia. Dos clics casi
simultaneos (o un clic manual justo cuando el cron ya ha arrancado pero aun no ha insertado su
sesion) pueden colarse los dos. Ademas, el guardia del endpoint manual no protege en absoluto
contra la superposicion con el CRON en si, que no pasa por ese endpoint.

No es una ejecucion doble de la MISMA recomendacion (eso sigue protegido por el
compare-and-set de dbTransicionarRecomendacion). Es un posible exceso del cupo diario
configurado por la propietaria, acotado en ultima instancia por MAX_DIARIO_TOPE=50 y por el
numero de recomendaciones PENDIENTE de ALTA confianza realmente elegibles ese dia (en la
practica, "2-3 autonomias por dia" segun el propio comentario del codigo). Impacto bajo, pero
es un caso real de "el freno es best-effort, no una garantia a nivel de BD".

Propuesta de fix: si se quiere una garantia dura, mover el conteo y el tope a una
comprobacion atomica en BD (por ejemplo un UPDATE condicionado a un count menor que
max_diario dentro de la misma transicion, o un contador con FOR UPDATE por estudio-dia) en
vez de "leer conteo, luego actuar". Dado que el propio comentario del codigo ya trata el tope
como salvaguarda de volumen y no un limite fiscal, esto puede quedarse como esta si se
documenta el limite conocido (igual que otros limites ya documentados en
.claude/tentare-os.md), pero merece la nota explicita porque hoy no esta.

### AMARILLO H3 - Copy interno de ENVIAR_REACTIVACION ("la apruebas tu") queda desmentido cuando el piloto automatico esta activo

Archivo: lib/decision/especialistas/retencion.ts linea 106.

El motivoMotor de la regla R2 (ENVIAR_REACTIVACION) dice literalmente: "Puedo enviarle una
oferta del 15% - la apruebas tu." Esa frase es el texto que ve la propietaria en el Centro de
Control para ESTA recomendacion en concreto. Pero ENVIAR_REACTIVACION es uno de los dos tipos
con autonomia declarada en 2 (confianza.ts linea 391) y su accion es ENVIAR_EMAIL, que SI
esta en la allowlist por defecto del piloto automatico (AUTONOMIA_CONFIG_DEFAULT.tiposPermitidos
= ENVIAR_EMAIL, autonomia.ts linea 34). Si el estudio tiene el piloto activo con "Emails de
reactivacion y recordatorio" marcado, opcion que existe y esta correctamente etiquetada en
piloto-automatico.tsx linea 15, esta recomendacion en concreto NUNCA llega a mostrarse a la
propietaria como pendiente: se aprueba y envia sola en el mismo ciclo del cron, con un
descuento real del 15% ya prometido a la socia por email antes de que exista ninguna
oportunidad de leer "la apruebas tu".

No es un fallo de seguridad (la propietaria SI dio consentimiento informado al activar esa
casilla, y el envio queda en el feed de Actividad). Es una inconsistencia de contenido entre
lo que el motor "piensa" que va a pasar (texto interno que asume revision humana) y lo que
realmente puede pasar (autoaprobacion). Confunde a cualquiera que lea el motivo en el feed de
Actividad despues del hecho, y es facil de arrastrar a un especialista nuevo si se copia este
patron de redaccion sin caer en que el tipo puede ser autonomo.

Propuesta de fix: generar el motivoMotor de los tipos con autonomia declarada 2 o mas sin dar
por sentado que un humano decide (por ejemplo condicionar la frase a si ese tipo puede
auto-ejecutarse, o quitar la promesa de aprobacion de los tipos que estan en
AUTONOMIA_DECLARADA_POR_TIPO). Bajo impacto, cosmetico y de confianza del producto, no de
datos.

## Lo que se verifico y esta correcto (sin hallazgo)

- Config de autonomia por estudio: lectura fresca de BD por ejecucion
  (lib/inngest/decision.ts linea 181), sin cache. Confirma que la nota de
  .claude/tentare-os.md sobre "Las reglas de dinero avisan, nunca cobran" sigue siendo
  cierta hoy para el piloto automatico: COBRAR_RECIBOS no es alcanzable por
  seleccionarAutonomas (ver H1 para el matiz de por que, no de si).
- Rol y tenant del endpoint de configuracion (app/api/decisiones/autonomia/route.ts):
  exige sesion.rol === PROPIETARIO, exige plan con la feature decisiones, y studioId sale
  siempre de la sesion, nunca del body. Sin forma de configurar el piloto de otro estudio.
- Rol y tenant de aprobar y rechazar (app/api/decisiones/[id]/aprobar y rechazar/route.ts):
  chequeo explicito de que recomendacion.studioId coincide con sesion.studioId ademas de
  RLS, defensa en profundidad correcta (mismo criterio que ya exige el comentario de
  dbTransicionarRecomendacion sobre "un futuro caller que no la repitiera").
- RLS de decision_autonomia_config y recomendaciones (verificado con pg_policies contra
  dwqvdycjcffqwfkzapvi): ambas exigen current_rol() = PROPIETARIO AND studio_id =
  current_studio_id(). Sin fuga cross-tenant.
- Idempotencia de la ejecucion real (F3): resend.emails.send con idempotencyKey = r.id
  en los dos caminos de email (ejecutarEnvioEmail y ejecutarContactoSocia), cobro Stripe con
  idempotencyKey derivada del reciboId (nota A-10 en el propio codigo), e insercion del
  outcome GATEADA por la transicion real APROBADA a EJECUTADA (nota A-17: sin este guard,
  un segundo run insertaba un outcome duplicado sin unicidad en la tabla). Todo esto ya
  estaba resuelto de pasadas de auditoria anteriores (A-10 y A-17 referenciadas en
  comentarios) y se confirma que sigue en pie.
- Tope global: MAX_DIARIO_TOPE = 50 acota el maximo que cualquier estudio puede configurar,
  y el cron corre una sola vez al dia. El "blast radius" de un especialista mal calibrado
  esta acotado en la practica a ese numero por estudio por dia, salvo el matiz de H2
  (carrera manual mas cron).

## Que NO se re-audito (ya cerrado en pasadas anteriores, confirmado de pasada)

- Diseno de especialistas y priorizacion (P2-5, El Umbral): no tocado.
- Flujo completo de penalizaciones y Fase 3 de reserva-cancelacion: no tocado, solo se
  confirmo el invariante de que RECUPERAR_PAGOS y COBRAR_RECIBOS nunca estan en la allowlist
  de autonomia.
