# 42a pasada - Canjes de codigo (PR 1806)

Fecha: 2026-09-09.

Alcance: feat(canjes): el canje pasa a ser un objeto real - codigo, entrega y
una sola transaccion (#1806), mergeado hoy en main (6e8a900e). Migracion:
supabase/migrations/20260909154359_canjes_codigo_y_entrega.sql.

## Aclaracion de alcance previa a los hallazgos

"Canjes" no es un sistema nuevo: es el mismo motor de gamificacion de
creditos/recompensas (reward_redemptions, reward_catalog) que ya se audito y
cerro en la 27a pasada (ajustar_creditos/ajustar_stock/cancelar_canje ganaron
el chequeo de rol que les faltaba, 8-sep). Lo genuinamente nuevo del PR #1806
es la capa de identificacion y entrega: columna codigo (unica por estudio,
TNT-XXXXXX), entregado_en/entregado_por, recuperacion_id, y sobre todo la
fusion de tres llamadas TS sueltas (reservar stock, descontar creditos,
INSERT) en una sola funcion PL/pgSQL transaccional (canjear_recompensa) mas
una funcion de entrega idempotente (entregar_canje). El encargo original de
encargo-canjes-flujo-completo.md ("codigo unico + validacion en mostrador +
clase gratis consumible") queda cubierto por esto.

## Resumen ejecutivo

El PR esta bien construido y ya endurecido antes de mi revision: el propio
autor documento en el commit y en la migracion exactamente los riesgos que un
auditor de seguridad de este repo buscaria (idempotencia, gen_random_bytes vs
random(), grants de firma nueva, RLS sin rol) y los resolvio con el mismo
patron que ya usa el resto del codigo (candado FOR UPDATE,
validar_studio_mismatch/validar_socio_del_studio, puede_gestionar_clientas()).
Verifique en produccion (dwqvdycjcffqwfkzapvi) que las politicas RLS y los
grants de las tres funciones nuevas coinciden exactamente con lo que la
migracion pretende - no hay divergencia migracion-vs-prod como ha pasado
otras veces en este repo.

No hay hallazgos criticos ni de severidad alta. Un hallazgo medio (RPC
huerfana con el riesgo de atomicidad que este mismo PR se propuso cerrar,
sigue viva y ejecutable) y una observacion menor sobre superficie de ataque
por fuerza bruta, ya mitigada por el diseno.

---

## HALLAZGO MEDIO (severidad amarilla) - H-1: reservar_recompensa queda
huerfana pero sigue ejecutable, y reintroduce el fallo de atomicidad que
#1806 corrigio

Archivo: supabase/migrations/20260909090000_recompensa_limite_y_vigencia.sql
lineas 55-141 (migracion del mismo dia, previa a #1806) - sin DROP FUNCTION,
ni en esta migracion ni en la de #1806.

Que pasa: canjear_recompensa (la RPC nueva de #1806) sustituye por completo
el proposito de negocio de reservar_recompensa - el propio commit lo dice
("Sustituye a reservar_recompensa + ajustar_creditos + INSERT desde TS").
Confirmado con grep: ningun fichero de lib/ o app/ llama ya a
reservar_recompensa (lib/supabase-data.ts:3360 solo la menciona en un
comentario). Pero la funcion sigue en el catalogo, con grants intactos -
verificado en vivo con has_function_privilege contra dwqvdycjcffqwfkzapvi:
anon_exec=false, auth_exec=true, service_exec=true.

reservar_recompensa solo hace el FOR UPDATE mas comprobacion de
limite/vigencia/stock y decrementa el stock - no descuenta creditos, no
inserta en reward_redemptions, no genera codigo. Es exactamente la primera
mitad del "canje en tres llamadas sueltas" que el propio PR #1806 identifico
como el agujero que dejaba "sin creditos y sin canje": aqui el resultado
simetrico es "sin canje y con el stock ya gastado".

Escenario de explotacion concreto: cualquier usuario con rol de mostrador
(PROPIETARIO/MANAGER/RECEPCION, el mismo guardian puede_gestionar_clientas()
que ya protege canjear_recompensa) puede invocar
POST /rest/v1/rpc/reservar_recompensa directamente con su sesion, sin pasar
por ninguna pantalla del panel, y decrementar el stock de una recompensa sin
que exista ninguna fila en reward_redemptions ni descuento de credito.
Repetido, vacia el stock de la recompensa sin dejar ningun rastro de a quien
se le dio ni por que - el "canje fantasma" al reves. No es explotable por
una alumna ni por alguien sin sesion (bloqueado por puede_gestionar_clientas()
y sin EXECUTE para anon), asi que el impacto real es bajo (requiere ya tener
acceso de mostrador, y el "beneficio" para un atacante interno es nulo, solo
rompe datos, no obtiene nada), pero es exactamente el tipo de deuda que este
repo ya ha visto convertirse en incidente real: es la MISMA tabla, el MISMO
stock, y la leccion de #1806 es literalmente "una funcion vieja invocable en
paralelo rompe la atomicidad".

Por que no es severidad naranja: no hay ningun caller vivo que la use (ni
panel ni portal), asi que en el camino normal del producto esto no ocurre
nunca; y alcanzarla exige ya ser mostrador autenticado del estudio, el mismo
nivel de confianza que ya tiene acceso de escritura a
reward_catalog/reward_redemptions por RLS.

Propuesta de fix: drop function if exists public.reservar_recompensa(text,
text, text); en la proxima migracion de limpieza (mismo criterio que
cualquier RPC sustituida - no dejar dos caminos vivos para el mismo
proposito de negocio). Verificar antes con grep que sigue sin callers (ya lo
esta a fecha de este informe).

---

## Observacion (sin accion requerida) - codigos y fuerza bruta

entregar_canje acepta p_codigo sin limite de intentos a nivel de RPC. En
teoria, un miembro de mostrador malicioso podria intentar codigos al azar
para "entregar" (y asi cerrar como ENTREGADO, sin fraude de credito porque no
hay reintegro) canjes de otras socias. En la practica esto no es una via de
ataque real:

- Requiere ya tener sesion de mostrador (puede_gestionar_clientas()), el
  mismo nivel de acceso que ya permite leer codigo en claro desde
  dbListarCanjesPendientes() (RLS reward_redemptions_lectura, todo el
  estudio). Quien puede intentar codigos al azar ya puede simplemente mirar
  la lista de pendientes y ver el codigo real.
- El espacio es 32 elevado a 6, aprox. 1070 millones por estudio, generado
  con gen_random_bytes (no sembrable) - fuerza bruta practica descartada.
- No hay entrega de dinero ni fuga de datos de salud en juego: "entregar" un
  canje ajeno solo marca ENTREGADO sin devolver nada - el dano es que la
  socia legitima llegue y su recompensa ya conste como entregada, un
  problema operativo, no de seguridad de datos.

No se propone rate-limiting: el endpoint no es publico (no hay superficie
anon), y el patron coincide con el resto de RPCs de mostrador de este repo
(resolver_reserva_pendiente, cancelar_canje), que tampoco lo llevan.

---

## Lo que se comprobo y esta BIEN (para que quede constancia, no solo lo que falla)

1. Idempotencia/carrera del canje (canjear_recompensa,
   supabase/migrations/20260909154359_canjes_codigo_y_entrega.sql lineas
   107-198): SELECT ... FOR UPDATE sobre la fila de reward_catalog serializa
   dos canjes concurrentes del MISMO item - el conteo de v_usadas (limite
   por socia) que antes tenia ventana de carrera ahora es fiable porque el
   segundo canje no puede leer el conteo hasta que el primero confirma. Es
   el mismo mecanismo que ya usa
   reservar_recompensa/reservar_plaza/cancelar_reserva_plaza en el resto del
   repo - patron consistente, no una solucion ad-hoc.
2. Entrega, idempotente y con memoria (entregar_canje, lineas 206-257):
   FOR UPDATE sobre la fila del canje (por id o por codigo), rechaza
   YA_ENTREGADO/CANJE_CANCELADO explicitamente en vez de sobrescribir en
   silencio - exactamente lo que impide que "la misma botella salga dos
   veces", que es el bug original que motivo el PR.
3. Rol comprobado en servidor, no solo en UI: las tres funciones
   (canjear_recompensa, entregar_canje, y la ya existente cancelar_canje)
   hacen "if auth.uid() is not null and not puede_gestionar_clientas() then
   raise exception NO_AUTORIZADO" - el mismo guardian que la UI
   (app/(dashboard)/dashboard/page.tsx linea 777, gestionaClientas &&
   CanjesPendientes), pero la comprobacion real esta en la funcion, no en el
   if de React. El comentario del propio codigo lo deja explicito: "la UI
   no es el limite, pero tampoco debe ofrecer un boton que va a rebotar."
4. RLS de reward_redemptions corregida y verificada en prod: antes habia UNA
   politica ALL sin rol (una instructora podia cancelar un canje ajeno y
   recuperar creditos/stock de otra persona). Ahora son 4 politicas (lectura
   abierta al estudio, insert/update/delete exigen
   puede_gestionar_clientas()). Confirmado con pg_policy en vivo contra
   dwqvdycjcffqwfkzapvi: coincide exactamente con la migracion.
5. Cross-tenant: codigo es unico POR ESTUDIO (UNIQUE(studio_id, codigo), no
   global) - dos estudios pueden compartir codigo sin colision, y
   entregar_canje/canjear_recompensa siempre filtran por p_studio_id
   explicito en el WHERE, incluso en el camino de service-role donde
   validar_studio_mismatch es un no-op (auth.uid() nulo). No encontre
   ninguna via de canjear/entregar el codigo de un estudio desde la sesion
   de otro.
6. Grants de la firma nueva, verificados en vivo (no solo leidos en la
   migracion): has_function_privilege contra dwqvdycjcffqwfkzapvi confirma
   anon=false en las tres RPCs de escritura y en generar_codigo_canje (esta
   ultima ni siquiera authenticated=true, solo service_role - es interna,
   invocada desde dentro de canjear_recompensa, nunca desde el cliente).
   Coincide con el gotcha de grants ya documentado 4+ veces en este repo
   (.claude/tentare-os.md) - esta vez se aplico correctamente desde el
   primer commit.
7. Generacion del codigo: gen_random_bytes(6) (no random()), alfabeto de 32
   simbolos sin O/0/I/1 para dictado en voz alta, mapeo con AND 31 sin sesgo
   (256 es multiplo de 32), y un tope de 20 colisiones antes de fallar
   explicito en vez de bucle infinito. 32 elevado a 6 combinaciones por
   estudio hacen la enumeracion impracticable.
8. Gemelo comparado - cancelar_canje: ya tenia el mismo nivel de proteccion
   desde la 27a pasada (puede_gestionar_clientas() + FOR UPDATE + devuelve
   creditos/stock de forma idempotente si el estado ya no es PENDIENTE). No
   hay asimetria entre "cancelar" y "canjear"/"entregar".
9. Camino del portal (canjearRecompensaPublica,
   lib/db/supabase-data-admin.ts lineas 4073-4174): sigue pasando por
   service-role con validarSociaPublica (cruza socio_id + studio_id +
   auth_user_id del JWT antes de nada) - mismo patron cross-tenant-safe que
   el resto de endpoints publicos de este repo, sin cambios de este PR que
   lo debiliten. El caso CLASE_GRATIS deshace el canje entero
   (cancelar_canje) si crear_recuperacion falla o devuelve TOPE - no hay
   ventana donde la socia pague creditos y no reciba nada.
10. Tests de invariantes (lib/canje-invariantes.test.ts): en vez de (o
    ademas de) probar el comportamiento en caliente, hay un test que lee el
    SQL de la migracion y falla si alguien reintroduce random(), si el
    alfabeto vuelve a tener caracteres ambiguos, o si las funciones
    desaparecen - protege contra una regresion silenciosa en el propio
    texto de la migracion, no solo en tiempo de ejecucion.

## Conclusion

El PR #1806 hace exactamente lo que su propio mensaje de commit promete y
cierra el bug real que lo motivo (doble canje del fundador). El unico
hallazgo con accion recomendada es de limpieza (H-1: borrar la RPC
sustituida, no una vulnerabilidad alcanzable por un atacante externo o por
una alumna) - no bloquea nada y puede resolverse en un PR de una linea.
