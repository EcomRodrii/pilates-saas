# AUDITORÍA TENTARE — 21ª pasada (2 sep 2026)

**Base auditada:** `origin/main` @ `d41e2679` (no el árbol local, que estaba 197 commits por detrás en la rama `claude/theme-builder-imagen-rota` del 25-ago).
**Rama de trabajo:** `audit/2026-09-02`, commit `650bd21c`. Parche: `audit-02sep.patch`.
**Superficie:** 2.012 ficheros TS/TSX, ~298.000 líneas. 50 commits nuevos desde el 1-sep.

---

## ESTADO REAL DE TENTARE

| Dimensión | Estado |
|---|---|
| **Estado general** | Sólido en lo estructural. La BD está alineada con el repo, el despliegue ya no atasca, y las áreas que más han sangrado en pasadas anteriores (RLS, aislamiento entre tenants, sellos de confianza de Network) resistieron la auditoría. |
| **Riesgo técnico** | Medio. Concentrado en el código de menos de 48 h de vida. |
| **Riesgo de seguridad** | **Bajo** — el más bajo de todas las pasadas. 0 hallazgos 🔴. La fuga de PII de Network sigue cerrada, verificada empíricamente con `SET LOCAL ROLE` contra producción. |
| **Riesgo de datos** | Medio-bajo. Dos fugas de saldo de bono (F-7, F-11), ambas latentes hoy. |
| **Riesgo de negocio** | **Alto en un punto concreto**: toda factura rectificativa estaba rota desde el 2-sep (F-1). Ya corregido. |
| **Deuda técnica** | Estable, no creciente. 36 `any` en producción, 0 `@ts-ignore`, 0 `catch` literalmente vacíos, 3 ficheros por encima de 4.000 líneas. |
| **Áreas más problemáticas** | Facturación fiscal (F-1, F-14), el camino de PANEL de reservas/bonos frente a su gemelo de servidor (F-7, F-8, F-10, F-11), y la mensajería del portal (F-2). |

### El hallazgo de método más importante

**El árbol local llevaba 8 días y 197 commits por detrás de `origin/main`.** Auditar ahí habría sido auditar código que ya no existe — el mismo error que costó la pasada del 19-ago. Toda esta auditoría se hizo sobre un worktree de `origin/main`, y las funciones de Postgres se leyeron de `pg_proc.prosrc` en producción, nunca de los ficheros de migración.

### La clase de fallo dominante no se ha reducido

De los 16 hallazgos, **9 son gemelos divergentes**: dos caminos que hacen lo mismo, uno recibe el arreglo y el otro se queda roto. Lo notable de esta pasada es que **los dos 🔴 los introdujeron commits cuyo mensaje era precisamente cerrar esa clase de fallo**:

- `F-16` unificó el mensaje de confirmación en «las 3 pantallas de reserva». Había cuatro (F-9).
- `F-15` añadió `mostrador_leido_hasta` al endpoint de staff. No al gemelo público (F-2).
- La migración de `venta_pos_id` escribió un CHECK que su único llamador viola (F-1).

Esto ya no es descuido puntual: es que **no existe ningún mecanismo que obligue a tocar los dos lados**. Recomendación de fondo al final.

---

# 🔴 CRÍTICOS

### [F-1] El CHECK `facturas_entidad_unica` rompía TODA factura rectificativa

**Severidad:** 🔴 · **Área:** Facturación fiscal (Veri*Factu) · **Estado:** ✅ SOLUCIONADO

**Archivos:** `supabase/migrations/20260902001721_facturas_venta_pos_id.sql:8-10`, `lib/billing/sellar-factura-server.ts:471`

**Evidencia (leída de producción, no del fichero):**
```
pg_get_constraintdef → CHECK (((recibo_id IS NOT NULL) <> (venta_pos_id IS NOT NULL)))
prosrc de reservar_numero_factura → insert into facturas (... recibo_id ...) values (... p_recibo_id ...)
                                     ← nunca escribe venta_pos_id
sellar-factura-server.ts:471       → p_recibo_id: null   (una rectificativa no cuelga de un recibo)
```

**Qué ocurre:** una rectificativa llega con `recibo_id = NULL` y `venta_pos_id = NULL`. El XOR evalúa `false <> false` = `false` → violación 23514. `POST /api/facturas/rectificar` devolvía siempre *«No se ha podido reservar el número de la rectificativa»*.

**Por qué ocurre:** la migración quiso expresar «una factura cuelga de una entidad» y escribió *exactamente una* en vez de *como mucho una*. Pasó el despliegue limpio porque en producción hay 24 facturas, todas de serie A y todas con `recibo_id`: **0 rectificativas**. El constraint se validó sobre datos que nunca ejercitan el caso roto.

**Impacto:** la rectificativa es el único camino para corregir fiscalmente una factura ya sellada tras un reembolso o un chargeback. La primera devolución que necesitara una habría fallado, con obligación fiscal de por medio.

**Solución aplicada:** `check (num_nonnulls(recibo_id, venta_pos_id) <= 1)`. Ninguna fila existente queda fuera (comprobado: 0 con las dos, 0 sin ninguna). Migración `20260902120000` escrita en el repo **y aplicada a producción**, con la definición releída después para confirmar que no fue un no-op.

---

### [F-2] El punto rojo de «Mensajes» quedaba encendido para siempre en el portal de la socia

**Severidad:** 🔴 · **Área:** Mensajería / portal · **Estado:** ✅ SOLUCIONADO

**Archivos:** `lib/mensajeria/presentacion.ts:176-181`, `app/api/public/mensajeria/conversaciones/route.ts:104`

**Evidencia:**
```ts
// ANTES — la rama era incondicional, daba igual quién preguntara
const leidoHasta = c.tipo === 'ALUMNA_MOSTRADOR' ? c.mostrador_leido_hasta : c.leido_hasta;
if (!leidoHasta) return c.tipo === 'ALUMNA_MOSTRADOR' ? true : false;
```
El endpoint de staff selecciona `mostrador_leido_hasta` (`app/api/mensajeria/conversaciones/route.ts:156`). **El público no** — su `select` no la nombra, y `resumirConversaciones` hace `...c` sin añadirla. El cast `as RowConversaciones[]` la da por presente, así que TypeScript no lo cazaba.

**Qué ocurre:** para la socia, `mostrador_leido_hasta` llega `undefined` → `!leidoHasta` → devuelve `true` siempre que el último mensaje no sea suyo. Punto rojo permanente en la lista de Mensajes y contador `useMensajesSinLeer` que **no baja nunca**, haga lo que haga.

**Por qué ocurre:** `mostrador_leido_hasta` es la marca **compartida del lado estudio** (el mostrador no tiene fila propia en `conversacion_participantes`). La socia **sí** tiene fila propia, así que su marca buena es la personal. F-15 aplicó la lección a un gemelo y no al otro.

**Solución aplicada:** `tieneSinLeer` recibe una `perspectiva: 'staff' | 'socia'` (por defecto `'staff'`, así ningún llamante existente cambia de comportamiento) y solo usa la marca compartida cuando pregunta el estudio. **+7 tests**, incluido uno que reproduce el payload real del endpoint público (sin esa columna).

---

# 🟠 IMPORTANTES

### [F-3] La rama POS del webhook de Stripe no comprobaba el tenant ✅ SOLUCIONADO

`app/api/stripe/webhook/route.ts:632` · Gemelo divergente **dentro del mismo manejador**: la rama `pos_terminal`/`pos_bizum` se fiaba de `pi.metadata.studioId` a pelo, mientras 30 líneas más abajo la rama `plan_web_embebido` resuelve el tenant desde la cuenta Connect que firma (`studioDeCuentaConnect` + `tenantAutorizado`). Las tres ramas de `checkout.session.completed` se arreglaron en la 19ª pasada; esta se quedó fuera.

**Impacto:** un estudio con su propia cuenta Connect podía crear un PaymentIntent con `metadata.studioId` de OTRO estudio y meterle una fila en sus «cobros sin registrar» con importe y concepto arbitrarios, que el mostrador ajeno puede convertir en venta. **Escritura cross-tenant.**

**Solución:** el `studioId` sale ahora de la cuenta Connect, igual que su gemela; 403 + Sentry si no cuadran.

---

### [F-4] Dos UPDATE del webhook de billing daban por sincronizada una suscripción que no escribió nada ✅ SOLUCIONADO

`app/api/billing/webhook/route.ts:167,174` · Un UPDATE que no matchea ninguna fila **no da error** en Supabase. El camino de *fallback* de esa misma función ya lo sabía y usaba `.select('id')`, con un comentario que explica exactamente el riesgo. Sus dos gemelos de 20 líneas antes, no.

**Impacto:** con una metadata que apunta a un estudio/cadena que ya no existe, el UPDATE toca 0 filas, el evento se marca como procesado, el webhook responde 200 y **Stripe no reintenta nunca**. `subscription_status` congelado en silencio — el mismo síntoma del incidente del 18→21-ago que documenta la cabecera del propio archivo.

**Solución:** `.select('id')` en las dos ramas y en el fallback final, con `Sentry.captureMessage` si no se tocó nada.

---

### [F-5] `registrarDevolucion` devolvía éxito aunque no actualizara el acumulado ✅ SOLUCIONADO

`lib/billing/registrar-devolucion.ts:234` · Solo `console.error`, sin Sentry, y devolvía objeto no-null → quien la llama notifica como si todo hubiera ido bien. `recibos.importe_devuelto` / `ventas_pos.devuelta_en` son el espejo que leen el panel y la exportación: el reembolso quedaba invisible ahí. El commit `87fe8897` llevó a Sentry los 25 `console.error` del webhook pero no los de `lib/billing/**`.

---

### [F-6] «Ver documento» en el panel se lo comía el bloqueador de pop-ups ✅ SOLUCIONADO

`components/socios/ficha-documentos.tsx:96` · `await` y **después** `window.open`: el gesto de usuario ya se perdió. El gemelo de la socia (`app/portal/[slug]/documentos/page.tsx:81`) abre `about:blank` **antes** del await y luego navega esa pestaña — con un comentario explicando por qué. En el iPad del mostrador, «Ver» no hacía nada y no daba error. Es justo el hueco que F-14 decía cerrar.

---

### [F-7] Cancelar una CLASE devolvía sesión de bono a las plazas fijas ✅ SOLUCIONADO

`lib/studio-context.tsx:2552,2606`, `lib/db/supabase-data-admin.ts:1019` · `materializar_plazas_fijas` (leído de `prosrc`) inserta `res-pf-…` en CONFIRMADA **sin tocar el bono** — esa plaza se paga por otra vía. El guard existía en 2 de 5 caminos (cancelar UNA reserva); faltaba en los 3 de cancelar la CLASE entera.

**Impacto:** saldo de bono regalado de la nada. **Dinero.** Latente hoy: verificado en producción, `count(*) where id like 'res-pf-%'` = **0**. Se activa en cuanto se use la funcionalidad.

**Solución:** el guard entra en `devolverBonosPorCancelacionClase`, que es por donde pasan los dos caminos de servidor, más los dos del panel. Y (F-16) el prefijo pasa a ser una función pura con test.

---

### [F-8] El resultado de esa devolución se tiraba con `void` ✅ SOLUCIONADO

`lib/studio-context.tsx:2552,2606` · `devolverSesionBono` se cambió expresamente (P2) para devolver `boolean`, con este comentario: *«antes era `void` en las tres llamadas y un fallo aquí solo llegaba a Sentry, nadie del estudio se enteraba»*. `cancelarReserva` sí lo consume; **estos dos llamantes lo tiraban**. Además el `forEach` no esperaba nada: la función devolvía `ok: true` con las devoluciones aún en vuelo.

**Solución:** `await Promise.all(...)` y el aviso llega al toast del calendario.

---

### [F-9] La hoja del widget era la CUARTA pantalla de reserva y quedó fuera de F-16 ✅ SOLUCIONADO

`components/reserva/reserva-calendario.tsx:1830` · Tenía sus propios textos a mano. **Sin rama para `PENDIENTE_APROBACION`**: una reserva que queda pendiente de aprobar salía en **silencio absoluto**. Tampoco distinguía «el sitio que elegiste lo cogieron antes».

El docstring de `lib/reserva-confirmacion-mensaje.ts` dice literalmente *«Tres implementaciones = tres formas de volver a divergir»*. Eran cuatro.

**Solución:** usa `mensajeConfirmarReserva`, la misma función que las otras tres.

---

### [F-10] El panel podía reservar en una clase CANCELADA y gastar bono en ella ✅ SOLUCIONADO

`lib/studio-context.tsx:2908` · La RPC `reservar_plaza` **no mira `sesiones.cancelada`** (verificado en `prosrc`: solo `SESION_NO_ENCONTRADA`). La guarda vive únicamente en TS y solo en el camino público. Por el panel, el mostrador apuntaba a una socia a una clase cancelada y acto seguido `consumirSesionBono` le gastaba una sesión en una clase que no existe.

**Solución:** mismo rechazo que ya da el servidor a la socia, ahora también en el panel. *(La corrección de fondo —meterlo en la RPC— queda pendiente, ver abajo.)*

---

### [F-11] «Clase servida sin cobrar» se perdía mudo en el panel ✅ SOLUCIONADO

`lib/studio-context.tsx:2777` · `if (!('ok' in res)) return;` — reserva CONFIRMADA sin descontar bono, sin rastro en ningún sitio. El gemelo servidor (`consumirBonoServidor`) lo reporta explícitamente a Sentry desde el arreglo I-5.

---

### [F-12] Conectar/desconectar una integración era una escritura optimista muda ✅ SOLUCIONADO

`components/configuracion/tab-integraciones.tsx:726`, `lib/stores/use-integrations-store.ts:51` · `upsertIntegracion` devolvía `void` y llamaba a `dbUpsertIntegracion` **sin `await`**; el toast era incondicional. **Familia §1** (escritura optimista sin revertir), la misma clase de fallo del 10-ago.

**Impacto:** el botón nuevo del modal de Embedded Signup usa esta función. Si la escritura fallaba, la propietaria leía «WhatsApp desconectado» y el número **seguía activo mandando recordatorios**.

**Solución:** la cadena entera (`dbUpsertIntegracion` → store → componente) devuelve `ResultadoEscritura`, se revierte el pintado si falla y el toast solo aparece si la escritura fue de verdad.

---

### [F-14] `factura_pendiente_sellar` solo lo marcaba 1 de los 3 caminos de cobro ✅ SOLUCIONADO

`lib/billing/stripe-cobros.ts:221`, `lib/billing/dunning-server.ts:210` · Solo `confirmar-cobro.ts` (Checkout) ponía la bandera, así que `reintentarFacturasPendientesDeSellar` (cron horario) **solo podía recuperar facturas de Checkout**. El cobro recurrente automático —el que más facturas genera— no tenía red: un fallo de Fiskaly dejaba la factura sin sellar y sin tarea que la recuperase.

---

# 🟡 MEJORAS

### [F-13] Alerta de sustitución vencida silenciada ✅ SOLUCIONADO
`lib/sustituciones/cerrar-vencidas.ts:78` · `.catch(() => {})`. P0-2 existía justo para que una sustitución no se cerrara sin avisar a nadie; con ese catch mudo podía volver a pasar sin que nadie lo supiera.

### [F-15] Grants vestigiales a `authenticated` ✅ SOLUCIONADO (aplicado en producción)
`red_resenas`, `notification_delivery` y `review_boost_recompensas` tenían RLS activado con **0 policies** (o sea, hoy deniegan todo) pero conservaban `GRANT SELECT/INSERT/UPDATE/DELETE` a `authenticated`. Todo su acceso real pasa por service-role — verificado con grep: ni un `.from('red_resenas')` con el cliente de navegador.

No es una fuga hoy. Es un **arma cargada**: el día que alguien añada una sola policy permisiva «para que funcione una cosita», el radio de explosión ya es CRUD completo, incluido `update red_resenas.estado` (auto-publicarse una reseña en moderación). El patrón correcto ya existe al lado: `socio_companeras` no tiene ningún grant.

También se activó RLS en `webhook_disputas` y `webhook_reembolsos` (estaban sin ella; inocuo porque tampoco tienen grants, pero ensuciaba los advisors).

### [F-16] El prefijo `res-pf-` estaba escrito a mano en 8 sitios ✅ SOLUCIONADO
Una regla de negocio copiada a mano se arregla en un sitio y se queda rota en el resto — que es exactamente lo que pasó en F-7. Ahora es `esReservaDePlazaFija()` en `lib/bono-logic.ts`, una vez, con nombre y con test de mutación.

---

# ⏳ PENDIENTES (con motivo)

| ID | Problema | Sev. | Por qué NO lo he tocado | Próximo paso |
|---|---|---|---|---|
| **P-1** | **Las 3 vías de cancelación del PANEL no avisan a nadie.** `studio-context.tsx:3030,1598,2921` llaman a la RPC **directo desde el navegador** y no pasan por el Notification Engine. El gemelo servidor `ejecutarCancelacionReserva` sí emite `emitirReservaCancelada`, `emitirPlazaLiberada` y `emitirOfertaListaEspera`. Peor caso: `bajaConRecuperacion` recibe `res.ofertaSocioId` y **lo ignora entero** — la BD abre una oferta de lista de espera con plazo, nadie se lo dice a la socia, y el cron se la quita al caducar. Pierde la plaza sin haberse enterado de que la tuvo. | 🔴 | Es un **cambio arquitectónico**: mover tres caminos de cliente-directo a un endpoint de servidor. No es un parche localizado y tocarlo a ciegas puede romper la cancelación, que funciona. | Enrutar las tres por un endpoint que llame a `ejecutarCancelacionReserva` (ya existe y es el camino común). Es la deuda más cara que queda abierta. |
| **P-2** | **Overbooking en `promocionar_siguiente_espera`.** El `prosrc` real comprueba que la clase esté viva y **nada más**. Su gemela `aceptar_oferta_lista_espera` sí comprueba aforo (arreglo C-4). Camino: se ofrece plaza a A (sigue en LISTA_ESPERA, no cuenta en el aforo) → B reserva ese hueco → A rechaza → se promociona a C **por encima del aforo**. | 🔴 | Cambiar una función de Postgres en producción con concurrencia de por medio, sin poder reproducir la carrera, es más arriesgado que el bug latente. Verificado: **0 sesiones sobrevendidas hoy**. | Mover la comprobación DENTRO de la función (ya tiene el `for update`), y quitar la de `ofrecerPlazaLibre`, que hoy la hace fuera de la transacción (TOCTOU). |
| **P-3** | **`devolver_sesion_bono` / `consumir_sesion_bono`: SECURITY DEFINER con GRANT a `authenticated` y sin comprobar rol.** La única guarda es `STUDIO_MISMATCH`; no miran permisos. La policy de `suscripciones` exige `puede_mover_dinero()` para UPDATE y la RPC, al ser definer, **la salta**. Una instructora podría inflar `sesiones_restantes`. | 🟠 | Añadir `puede_mover_dinero()` podría **romper el check-in del mostrador** si la recepción legítimamente consume bono sin ese permiso. Necesita una decisión de producto sobre qué rol puede gastar y devolver saldo. | Decidir el rol mínimo y, o bien añadir la comprobación, o revocar de `authenticated` y pasar las dos por servidor. |
| **P-4** | **`crear_reserva_atomica` sigue viva en producción**, ejecutable por `authenticated`, sin llamantes en el código. Usa `aforo_maximo` crudo (ignora máquinas averiadas), no valida estudio, no aplica límite semanal. | 🟠 | Borrar una función de producción sin poder descartar llamadas externas (Zapier/OAuth) no es seguro a ciegas. | Revocar de `authenticated` primero, observar una semana, borrar después. |
| **P-5** | **`expirar_oferta_lista_espera` tira la promoción directa**: captura `v_promo_socio` y no lo devuelve (`returns table` no lo incluye). Con plazo 0, la siguiente queda CONFIRMADA **sin consumir bono y sin ninguna notificación**. | 🟠 | Cambio de firma de función + TS; conviene hacerlo junto con P-2, que toca la misma familia. | Añadir `promovida_socio_id` al `returns table`. El TS ya sabe tratarlo. |
| **P-6** | **La compra de plan web nace fuera del ciclo de conciliación** que introdujo F-12/F-13. Verificado en producción: **11 de 13 compras web sin ninguna factura**, y 100 % de los recibos COBRADO con `conciliado_en IS NULL`. Además, `grep` de `conciliado_en` devuelve **solo escrituras**: ninguna consulta, panel ni alerta las lee. | 🟠 | Sellar factura en el camino de compra web es un cambio de comportamiento fiscal; y decidir qué hace la señal de conciliación es producto, no código. | Escribir `conciliado_en` en `entregar-plan-comprado` y sellar la factura como hace `confirmar-cobro`. Y decidir quién LEE esa señal, o retirarla. |
| **P-7** | **`ventas_pos.conciliado_en`/`conciliado_por` son columnas muertas**: creadas el 2-sep, cero escrituras en todo el repo. | 🟡 | Igual que P-6: escribirlas o retirarlas es una decisión de diseño. | — |
| **P-8** | **`refund.failed` no cubre POS**, aunque F-13 sí añadió POS a `charge.refunded` y al cron. Si un reembolso de venta POS falla días después (SEPA), `ventas_pos.devuelta_en` sigue diciendo que el dinero se devolvió. | 🟠 | Requiere entender el ciclo de reembolso POS end-to-end, que se rediseñó ayer. | Añadir la rama POS a `ORIGENES_CON_RECIBO` o su equivalente. |
| **P-9** | **`fecha_cobro` se escribe con hora UTC en una columna `date`**: un cobro a la 01:30 de Madrid se fecha el día anterior, mientras `facturas.fecha_emision` usa el huso de Madrid. Recibo y factura en días distintos; en cierre de trimestre, en periodos fiscales distintos. | 🟡 | Es un cambio de semántica de dato con histórico ya escrito; conviene decidir si se corrige hacia atrás. | `fechaHoraHusoMadrid(...).slice(0,10)`, y decidir qué hacer con lo ya guardado. |
| **P-10** | **`ModalCuenta.tsx` nace ya como gemelo divergente** de `tab-perfil.tsx`: copia casi carácter por carácter de `cambiarEmail`, `cambiarPassword` (con captcha y reauth) y `conectarGoogle`. Hoy son idénticos. | 🟠 | Extraer un componente compartido de credenciales es refactor, no corrección de bug. | `<SeccionCredenciales>` o un hook `useCuenta()`. **El próximo fix de auth llegará a uno solo.** |
| **P-11** | **`/portal-prototipo` es público y sin auth** en el build de producción. | 🟡 | Riesgo de datos **cero** (verificado: `StudioApp.jsx` no tiene ni un `fetch`, ni `supabase`, ni `process.env`; 1.864 líneas de datos literales). No indexable. | `if (NODE_ENV === 'production' && !PROTOTIPO_ABIERTO) notFound()`. |
| **P-12** | **`components/prototipo/StudioApp.jsx` está fuera del typecheck** (`tsconfig.include` no lleva `**/*.jsx`) pero sí entra en el build. | 🟡 | — | Añadir `**/*.jsx` al `include`, o excluirlo explícitamente y documentarlo. |

---

# 🔎 REFUTADOS CON PRUEBA (para que no se vuelvan a levantar)

- **`socio_companeras` NO está muerta.** RLS + 0 policies + **cero grants** = postura correcta «solo service-role». Las 4 rutas verificadas una a una: auth + `socioAutenticado`, destinataria validada al mismo estudio, `aceptar` exige ser la destinataria, `bloquear` exige ser una de las dos partes.
- **`red_resenas` tampoco.** Todo pasa por service-role. El grant era vestigial (→ F-15).
- **La fuga de PII de Network (14/17-ago) sigue cerrada.** `count(email_contacto)` como `authenticated` → `42501 permission denied`.
- **Los sellos de confianza (25/26-ago) están genuinamente cerrados.** Cuatro triggers `BEFORE` reponen los campos de verificación cuando `auth.role() <> 'service_role'`, y esta vez **sí cubren INSERT y UPDATE**.
- **A-9 (WhatsApp: desconectar dejaba el número secuestrado):** ya estaba arreglado. `dbUpsertIntegracion` pone `phone_number_id = null` en cualquier escritura del camino, con comentario explicándolo.
- **WhatsApp Embedded Signup** (`575661b6`): `studioId` siempre de la sesión, rol PROPIETARIO obligatorio, `code` intercambiado en servidor, IDs del navegador revalidados contra Graph API con el App Secret. Webhook fail-closed sin `META_APP_SECRET`, firma HMAC en tiempo constante, idempotencia por `wamid:status`.
- **Secretos en el cliente: cero.** Ningún `META_APP_SECRET`, `STRIPE_SECRET_KEY` ni service-role en `.tsx`. Los `NEXT_PUBLIC_*` nuevos son `META_APP_ID` y `META_CONFIG_ID`, públicos por diseño de Meta. *(La clave secreta de Stripe del 20-ago ya no aparece.)*
- **`/api/interno/**`:** las 25 rutas pasan por `exigirPermiso`/`exigirAlguno`; `plataforma_admin` no tiene grants ni policies.
- **F-16 (83661021) está bien resuelto en lo que abarca:** las 3 pantallas self-service llaman las tres a `crearReservaPublica`, así que aforo, ventana, plan requerido y máximas simultáneas se validan en un solo sitio en servidor. La divergencia real estaba entre ese bloque y el panel (F-10, F-11) y con la 4ª pantalla (F-9).
- **Sentry:** 0 incidencias de dinero en 7 días. Las abiertas son `42501` de RLS en `/login` y `/network`.
- **Migraciones:** el repo y producción están **alineados** (última en ambos: `20260902001721`). Esa fuente de fallo, cerrada.

---

# MAPA DE DEUDA TÉCNICA

| Área | Estado | Riesgo | Prioridad |
|---|---|---|---|
| Arquitectura | Buena en servidor; el **panel sigue escribiendo directo a la BD desde el navegador** | Medio-alto (P-1) | Alta |
| Frontend | 3 ficheros >4.000 líneas (`supabase-data.ts` 5.181, `studio-context.tsx` 4.975) | Medio | Media |
| Backend | Sólido; gemelos divergentes como fallo recurrente | Medio | Alta |
| Base de datos | Alineada con el repo, migraciones limpias | Bajo | Baja |
| RLS | **Buena.** 0 hallazgos 🔴; grants vestigiales ya revocados | Bajo | Baja |
| Auth | Correcta; duplicación naciente en credenciales (P-10) | Bajo-medio | Media |
| Pagos | **El área más frágil.** F-1 roto, F-3/F-4/F-14 arreglados, P-6/P-8/P-9 abiertos | Medio-alto | **Máxima** |
| Reservas | Servidor bien unificado; el **panel es el gemelo pobre** | Medio | Alta |
| Calendario | F-10 cerrado; P-2/P-5 latentes | Medio | Alta |
| Automatizaciones | Crons vivos y con dedup; alertas ya no mudas (F-13) | Bajo | Baja |
| UX | F-2/F-6/F-9 eran fallos de UX con causa técnica | Bajo | Media |
| Rendimiento | Sin hallazgos nuevos; N+1 del widget cerrado el 1-sep | Bajo | Baja |
| Seguridad | **El mejor estado de todas las pasadas** | Bajo | Baja |
| Tests | 3.401, 0 fallos. Buena cobertura de lógica pura; **nula de RPC de Postgres** | Medio | Media |
| Infraestructura | Despliegue ya no es cuello de botella | Bajo | Baja |

---

# PLAN DE LIMPIEZA

**FASE 1 — Crítico** · P-1 (cancelación del panel sin avisos) y P-2 (overbooking). Los dos únicos 🔴 abiertos.
**FASE 2 — Estabilización** · P-3 (permisos de bono), P-5, P-8, P-6. Todo dinero y saldo.
**FASE 3 — Refactor** · P-10 (credenciales duplicadas), P-4, y partir `studio-context.tsx`.
**FASE 4 — Calidad** · Tests de las RPC de Postgres (hoy 0). Que alguien LEA `conciliado_en`.
**FASE 5 — Mejoras** · P-7, P-9, P-11, P-12.

---

# RECOMENDACIÓN DE FONDO

Llevamos **cinco pasadas seguidas** con «gemelos divergentes» como causa dominante y **ninguna la ha reducido**. Arreglarlos de uno en uno no funciona: esta vez los dos 🔴 los introdujeron commits cuyo objetivo declarado era cerrar esa misma clase de fallo.

Lo que sí lo reduciría, por orden de coste:

1. **Convertir cada regla de negocio duplicada en una función pura con test** — como F-16 con `esReservaDePlazaFija`. Barato, y el test de mutación demuestra que protege.
2. **Que el panel deje de escribir directo a la BD.** Es la raíz de F-7, F-8, F-10, F-11 y P-1: mientras existan dos implementaciones (navegador y servidor) de reservar, cancelar y consumir bono, van a seguir divergiendo. **Un solo camino de escritura, en servidor.**
3. **Un test de contrato por par de gemelos que quede**: dado el mismo input, los dos caminos devuelven lo mismo y escriben lo mismo.

La 2 es la que de verdad cierra la familia. Es cara, pero es la única que ataca la causa en vez del síntoma.

---

# RESUMEN FINAL

**Problemas encontrados:** 🔴 4 · 🟠 15 · 🟡 9 · **28 en total**

- **✅ Solucionados y verificados:** **16** (F-1 a F-16)
- **⚠️ Parcialmente solucionados:** **1** — F-10: el guard de clase cancelada está en el panel, pero la RPC `reservar_plaza` **sigue sin mirar `sesiones.cancelada`**; cualquier camino futuro que la llame vuelve a tener el agujero.
- **⏳ Pendientes:** **12** (P-1 a P-12), todos con motivo explícito arriba
- **🔎 Refutados con prueba:** **11**

**Archivos modificados:** 24 (22 de código + 2 migraciones nuevas)
**Migraciones aplicadas a producción:** 2, ambas releídas después para confirmar que no fueron no-op
**Tests:** 3.401 ejecutados · **0 fallos** · **+10 nuevos** · comprobados **por mutación** (fallan si se reintroduce el bug)

| Check | Resultado |
|---|---|
| **Tests** | ✅ PASS — 3.401/3.401 |
| **Typecheck** | ✅ PASS — `tsc --noEmit` limpio |
| **Lint** | ✅ PASS — `eslint`, 0 problemas |
| **Build** | ⚠️ **NO VERIFICADO** — falla al descargar fuentes de Google Fonts desde el entorno de auditoría, que no tiene salida a `fonts.googleapis.com`. **Comprobado que el baseline intacto de `origin/main` falla exactamente igual**, así que es del entorno y no de estos cambios. No puedo afirmar que el build pase. |
| **E2E** | ⚠️ **NO EJECUTADO** — Playwright necesita navegadores y servidor levantado. |

### ESTADO REAL POST-AUDITORÍA

**Cómo estaba al empezar.** Mejor de lo que ha estado nunca en lo estructural: BD alineada, despliegue desatascado, seguridad y aislamiento entre estudios sólidos y verificados empíricamente contra producción. Pero con **una funcionalidad fiscal completamente rota desde hacía horas** (F-1) y un badge que ninguna socia podía apagar (F-2), ambos introducidos por commits del día anterior.

**Riesgos mayores encontrados.** El fiscal (F-1) y la escritura cross-tenant del webhook POS (F-3). Los dos cerrados y verificados.

**Qué sigue abierto.** Dos 🔴: la cancelación desde el panel que no avisa a nadie (P-1) y el overbooking latente de la lista de espera (P-2). Ninguno se manifiesta hoy en producción —0 sesiones sobrevendidas, 0 reservas de plaza fija— pero los dos son reales y los dos exigen decisiones que no se pueden tomar solo desde el código.

**Nivel de confianza.** **Alto** en lo que he tocado: cada fix está verificado con typecheck, lint y 3.401 tests, y los dos cambios en producción se releyeron de `pg_catalog` después de aplicarlos. **Medio** en el conjunto: no he podido ejecutar el build ni los E2E, no he probado nada en un navegador real, y la cobertura de tests sobre las RPC de Postgres —donde vive la lógica de dinero y aforo— **sigue siendo cero**.

**Antes de ponerlo delante de cientos de estudios**, en este orden: cerrar P-1 y P-2; unificar el camino de escritura del panel con el de servidor (que es lo que genera la familia entera); y poner tests sobre `reservar_plaza`, `cancelar_reserva_plaza` y `promocionar_siguiente_espera`. Mientras la lógica de aforo y bono viva en funciones de Postgres sin un solo test, cada cambio ahí es una apuesta.

**No confundir «no encontré un problema» con «no hay problema».** Todo lo de arriba se apoya en evidencia citada; lo que no pude comprobar está marcado como no verificado.
