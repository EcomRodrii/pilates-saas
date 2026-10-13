# Mensajes del Centro de Control a la alumna: comerciales y avisos de servicio

Fecha: 2026-10-13. **DECIDIDO por el fundador el mismo día: salida A**, R6
(`CONGELAR_MEMBRESIA`) es aviso de servicio y `RECUPERAR_SOCIA` es comercial
también con la cuota activa. Implementado junto a este documento (ver «Cómo
quedó»). Lo de abajo es la propuesta tal como se decidió; se conserva B y su
razonamiento para no reabrirlo sin motivo.

## Qué había antes

Al aprobar una recomendación del Centro de Control (con «Enviarle el mensaje»,
«Enviar email» o el piloto automático), le llega un mensaje a la alumna por uno
de estos dos ejecutores de `lib/inngest/decision.ts`:

- **`ejecutarContactoSocia`** (acción `CONTACTO_MANUAL`). Le manda un WhatsApp
  desde el número de Meta del estudio si la recomendación es de ese canal y el
  estudio lo tiene conectado; si no, o si Meta lo rechaza (fuera de la ventana
  de 24 h, `131047`), le manda un correo con `correoAutomatizacion`.
- **`ejecutarEnvioEmail`** (acción `ENVIAR_EMAIL`). Hoy solo lo usa la
  reactivación con descuento (R2), que crea un código real en
  `codigos_descuento`. **Es el único tipo que el piloto automático puede mandar
  sin que nadie pulse** (`AUTONOMIA_DECLARADA_POR_TIPO`: `ENVIAR_REACTIVACION: 2`).

El texto lo decide `mensajeParaSocia` (`lib/decision/mensajes-socia.ts`) y, si
el estudio la tiene encendida, la IA lo reescribe.

Qué se comprueba antes de mandar:
- **La oposición al perfilado sí** (`socios.excluir_de_perfilado`, art. 21 RGPD):
  `sinSociasOpuestas` quita dentro del motor las candidatas de quien se opuso.
- «No quiere seguir» apuntado en su ficha frena las reglas de captación y de
  retención (`noQuiereSeguir`), pero no las de finanzas ni las de ingresos.

Qué no se comprueba (a diferencia de los envíos comerciales de Automatizaciones,
`procesarCandidato` con `c.comercial`, y de Campañas):
- **El consentimiento de novedades** (`tieneConsentimientoMarketingVigente`, que
  compara con el texto exacto de `textoConsentimientoMarketing`).
- **El enlace de baja** (`unsubscribeUrl` con `firmarBajaMarketing`). Ni en el
  correo ni en el WhatsApp.
- **El correo marcado como roto** (rebote, queja o baja del proveedor). Una queja
  de spam no frena el siguiente envío.

## Qué mensajes salen y de qué clase son

Criterio: el que ya usa el producto (I-5 en `automation-engine.ts`). Un aviso de
servicio habla de algo que la alumna **ya tiene** (una deuda, una clase
reservada, un cobro, lo que ya pagó). Un mensaje comercial la **invita a comprar
o a volver**. El propio texto del consentimiento separa igual «novedades,
promociones y ofertas» de «los avisos necesarios para la prestación del servicio
(reservas, pagos, cambios de horario)».

| Regla | Tipo | Le llega | Clase | ¿Ya es clienta? |
|---|---|---|---|---|
| F1 (`finanzas.ts`), se le acaban las sesiones del bono | `PROPONER_RENOVACION_BONO` | «¿Renovamos tu bono, {nombre}? … ¿Te preparo uno nuevo?» | **Comercial** | Sí |
| R2 (`retencion.ts`), ausencia crítica con renovación cerca | `ENVIAR_REACTIVACION` | «Te echamos de menos… te guardamos un 15 % de descuento: usa el código …» | **Comercial** (oferta) | Sí |
| R1, R3, R4, y R2 sin descuento (`memoria.ts`, «no ofrecer descuentos») | `RECUPERAR_SOCIA` | «Te echamos de menos… te guardo sitio en la próxima clase» | **Comercial**: es el «Te echamos de menos» que I-5 ya trata como comercial | Sí, con plan activo |
| R5, la cuota se acabó y no ha renovado | `RECUPERAR_SOCIA` | El mismo texto | **Comercial**: es recuperar a una antigua clienta | Lo fue |
| C1 (`captacion.ts`), interesada que no ha venido ni comprado | `CONTACTAR_LEAD` | «¿Te animas a probar …? … te reserve una clase» | **Comercial** | **No**: no hay contrato previo |
| C2, hizo la clase de prueba y no ha comprado | `CONVERTIR_PRUEBA` | «¿Seguimos? … te preparo un plan a tu medida» | **Comercial** | Dudoso: depende de si la prueba fue una contratación |
| F3, le caducan clases ya pagadas (≥ 2) | `PROPONER_RENOVACION_BONO` | «Te quedan N clases por usar… caduca …» | Servicio: lo que ya pagó | Sí |
| R6, no viene pero se le sigue cobrando la cuota | `CONGELAR_MEMBRESIA` | «podemos congelarte la cuota… así no pagas de más» | Servicio, **caso gris**: gestiona su contrato y le ahorra dinero, pero es para retenerla | Sí |
| I3 (`ingresos.ts`), recibos vencidos sin tarjeta | `COBRAR_PENDIENTE` | «te quedó un pago pendiente de X €» | Servicio: una deuda | Sí |
| F4, la tarjeta caduca antes del próximo cobro | `COBRAR_PENDIENTE` | El mismo texto de I3 (ver «Aparte») | Servicio | Sí |
| F5, riesgo de que falle el próximo cobro | `COBRAR_PENDIENTE` | El mismo texto de I3 (ver «Aparte») | Servicio | Sí |

`RIESGO_RESERVA_FALLIDA`, `PROPONER_SUSCRIPCION_MENSUAL`, `IMPULSAR_ONBOARDING`
y el resto no tienen mensaje para la alumna: aprobarlos solo los marca.

⚠️ **La clase no se puede decidir por `tipo`**: `PROPONER_RENOVACION_BONO` es
comercial en F1 y de servicio en F3, y es `mensajeParaSocia` quien elige el
texto (`diasParaCaducar` + `sesionesRestantes ≥ 2`). Por eso, sea cual sea la
salida, la clase la tiene que devolver la misma función que escribe el texto.

## Lo que hay que hacer en los dos casos

Esto no depende de elegir A o B:

1. **`MensajeSocia` gana `comercial: boolean`**, decidido en `mensajeParaSocia`
   junto al texto. Un test exige que cada `case` lo declare.
2. **`CONTACTAR_LEAD` y `CONVERTIR_PRUEBA` exigen siempre el consentimiento
   vigente.** El art. 21.2 LSSI pide una relación contractual previa y una
   interesada no la tiene. Ninguna de las dos salidas la ampara.
3. **`ejecutarEnvioEmail` recibe el mismo trato que `ejecutarContactoSocia`.** Es
   el envío más claramente comercial (un descuento) y el único que puede salir
   sin que nadie pulse.
4. **No se le escribe a un correo marcado como roto** cuando el mensaje es
   comercial, como en `procesarCandidato`.
5. **El botón dice la verdad** (#2542). `canalesSocia` (`efecto-aprobar.ts`) y su
   mitad de servidor (`canales-socia.ts`) aplican la misma puerta, así que el
   botón pasa a «Hecho» cuando no se le puede escribir. El enlace `wa.me` para
   escribirle a mano sigue ahí: ese mensaje lo manda el estudio desde su
   teléfono, no Tentare. El ejecutor vuelve a comprobarlo al enviar, porque el
   dato puede cambiar entre el clic y el envío.
6. **WhatsApp igual que el correo.** Para la LSSI, WhatsApp es un «medio de
   comunicación electrónica equivalente» al correo. El motor de marketing ya
   aplica en WhatsApp el mismo consentimiento y añade el enlace de baja al
   final del mensaje, y aquí se haría lo mismo.
7. **La oposición al perfilado se queda como está.**

## Salida A: consentimiento + enlace de baja para lo comercial

El mismo criterio que Automatizaciones (I-5), el motor de marketing y Campañas.

- Un mensaje comercial solo sale si la alumna tiene el consentimiento **vigente**
  (el texto exacto de hoy). Sin él, el botón dice «Hecho» y no se envía nada.
- Todo mensaje comercial lleva el enlace de baja: `unsubscribeUrl` en el correo
  y una línea al final del WhatsApp. Al pulsarlo se retira el consentimiento por
  la puerta de siempre (`/api/marketing/baja`, con su línea en el historial).
- Los avisos de servicio no cambian: sin consentimiento y sin enlace de baja,
  porque ofrecerlo insinuaría que dejar de recibirlos es opcional (mismo
  argumento que I-5).

**Qué cambia para la alumna.** Si no ha dado el consentimiento, deja de recibir
desde el Centro de Control «¿Renovamos tu bono?», «Te echamos de menos», la
oferta con descuento, la invitación a probar y la de seguir tras la prueba. Si lo
ha dado, los sigue recibiendo, ahora con el enlace de baja. Los avisos de deuda,
de tarjeta, de clases por caducar y de congelar la cuota le siguen llegando.

**Qué cambia para la propietaria.** Hoy muy pocas alumnas tienen el
consentimiento marcado (está medido aparte; la cifra no va en el repo). En la
práctica, la mayoría de las recomendaciones comerciales pasan de «Enviarle el
mensaje» a «Hecho» con el WhatsApp a mano al lado. Conviene decírselo en la
tarjeta («No ha aceptado recibir ofertas: escríbele tú»). Para subir esa cifra
ya existe el registro del consentimiento en lote desde Clientas
(`registrar_consentimiento_marketing`).

**Coste.** Unos cinco ficheros (`mensajes-socia.ts`, `efecto-aprobar.ts`,
`canales-socia.ts`, `inngest/decision.ts` y la tarjeta) más sus tests. **Sin
migración**: el dato y la baja ya existen.

## Salida B: art. 21.2 LSSI (ya es clienta y el servicio es parecido) + oposición en cada envío

El art. 21.2 permite escribirle a una clienta sin consentimiento previo si los
datos se obtuvieron de forma lícita al contratar y la oferta es de «productos o
servicios de su propia empresa que sean similares a los que inicialmente fueron
objeto de contratación». Pide a cambio ofrecerle oponerse por un procedimiento
sencillo y gratuito **«tanto en el momento de recogida de los datos como en cada
una de las comunicaciones comerciales»**, y prohíbe mandar un correo sin esa vía.

- Los mensajes comerciales a **clientas** (F1, R1/R3/R4/R5, R2) salen sin
  consentimiento previo, siempre con el enlace para oponerse, y dejan de salir a
  quien se haya opuesto o haya retirado el consentimiento.
- Las interesadas y la alumna en prueba (C1, C2) siguen necesitando el
  consentimiento (punto 2 de arriba).

**Lo que la ley pide y el producto no tiene hoy:**

1. **Ofrecer la oposición al recoger los datos.** Al darse de alta (registro de
   la app, `/reservar`, widget) se ofrece una casilla opcional de consentimiento,
   no un «te enviaremos ofertas de servicios parecidos salvo que te opongas». Y
   el texto legal que acepta (`textoLegalCompleto`) informa de «comunicaciones
   relacionadas con los servicios contratados», con el contrato como base, no
   de ofertas. Las alumnas dadas de alta en el mostrador o importadas de otra
   plataforma no han visto ni lo uno ni lo otro. Hace falta texto legal nuevo en
   todas esas entradas, revisado por la asesoría. Y eso no arregla a las que ya
   están dadas de alta.
2. **Guardar que se ha opuesto.** Hoy la baja pone a `null` el consentimiento;
   si nunca lo dio, no cambia nada y el disparador del historial no apunta nada.
   Su oposición se perdería. Hace falta un estado propio, distinto de «nunca
   consintió»: una migración en `socios` y `consentimientos_marketing_eventos`,
   que `/api/marketing/baja` lo escriba, y que entre en la exportación de datos,
   la anonimización y la restauración de copias. Queda por decidir si «No quiere
   seguir» apuntado en su ficha cuenta como oposición.
3. **La casilla sin marcar.** A quien se le ofreció «Acepto recibir novedades,
   promociones y ofertas» y no la marcó, mandarle ofertas igualmente es difícil
   de defender, aunque la norma lo permitiera. Hoy no se guarda quién la vio y
   no la marcó.
4. **«Similares».** Renovar el mismo bono o volver a sus clases lo es con
   claridad. Si sigue valiendo para una antigua clienta (R5) meses después, que
   lo diga la asesoría.
5. **Dos criterios en el producto.** Automatizaciones y Campañas seguirían
   exigiendo el consentimiento y el Centro de Control no. O se acepta esa
   diferencia, o se extiende B a Automatizaciones, que es otra decisión.

**Qué cambia para la alumna.** Las que ya son clientas siguen recibiendo los
mensajes comerciales del Centro de Control, ahora con el enlace para oponerse
en cada uno. Las interesadas sin consentimiento dejan de recibirlos. Las que se
den de alta después verán el aviso de oposición al registrarse.

**Coste.** Lo de A, más una migración, el endpoint de baja, la exportación, la
anonimización y la restauración, los textos legales de cada entrada de alta y
la revisión legal.

## Recomendación

**A.** Es el criterio que ya rige el resto del producto, no necesita migración,
el texto del consentimiento ya promete exactamente eso, y B se apoya en un aviso
al recoger los datos que hoy no existe para nadie y que no se puede dar a las ya
dadas de alta. El precio de A es el alcance: casi todas las recomendaciones
comerciales pasan a ser «escríbele tú».

## La decisión

> **A.** `CONGELAR_MEMBRESIA` (R6) es aviso de servicio. `RECUPERAR_SOCIA` es
> comercial también con la cuota activa, como el «Te echamos de menos» de
> Automatizaciones.

## Cómo quedó

- **La clase vive en `mensajeParaSocia`** (`MensajeParaSocia.comercial`), en el
  mismo `case` que escribe el texto. Un test exige que cada `return` la declare.
- **Una sola puerta, `canalesSocia`** (`efecto-aprobar.ts`). Una oferta sin
  consentimiento vigente no tiene canal (`sinPermisoOfertas`), y un correo roto
  corta el email de una oferta. La usan el botón (`canalesDeSocias`, que lee el
  permiso solo de las ofertas y, si no puede leerlo, no da nada por bueno), los
  dos ejecutores al enviar (`permisoComercial`) y el piloto automático.
- **Los ejecutores vuelven a mirarlo al enviar** y le ponen a la oferta el
  enlace de baja (`/api/marketing/baja`, el mismo que Automatizaciones y
  Campañas): `unsubscribeUrl` en el correo y una línea al final del WhatsApp,
  añadida después de la IA para que no la toque. La reactivación lo mira antes
  de crear el código de descuento.
- **El piloto automático no aprueba lo que no podría mandar**: se queda para la
  propietaria con su «Hecho», en vez de acabar FALLIDA y contar como no seguida
  para el Umbral.
- **La tarjeta lo dice**: con `sinPermisoOfertas`, debajo del «Hecho», «No ha
  aceptado recibir ofertas del estudio, así que Tentare no le envía este
  mensaje.» El enlace de WhatsApp para escribirle a mano sigue ahí.
- **Los avisos de servicio no cambian**: ni consentimiento ni enlace de baja.
- **Fuera de este cambio**: el texto de F4/F5 (abajo).

## Aparte (otro PR, sin decisión pendiente)

F4 (tarjeta que caduca) y F5 (riesgo de que falle el cobro) emiten
`COBRAR_PENDIENTE` sin `total`, así que la alumna recibiría «te quedó un pago
pendiente en …» cuando no debe nada. Es un texto del producto que no dice la
verdad, así que se arregla sin pedir permiso, en su propio PR.
