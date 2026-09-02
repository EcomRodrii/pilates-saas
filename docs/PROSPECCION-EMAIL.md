# Prospección en frío (`/interno/crecimiento` → Prospección)

Outreach de Tentare-empresa a estudios que todavía no son clientes: importar una
lista, generar un correo personalizado por estudio, **revisarlo a mano**, y
enviarlo por lotes.

No confundir con **Marketing** (`/marketing`), que es la herramienta con la que
un estudio cliente escribe a SUS socias. Son dos cosas distintas, en dos tablas
distintas, por dos canales de envío distintos, y a propósito.

## Configuración (una vez)

El envío sale por el buzón de Spacemail de Tentare, **no por Resend**. Hacen
falta dos variables de entorno en Vercel (Production):

| Variable | Qué es |
|---|---|
| `SPACEMAIL_USER` | El buzón completo, p. ej. `marcos@tentare.app` |
| `SPACEMAIL_PASSWORD` | La contraseña de ese buzón (Spacemail Manager → el buzón → contraseña) |
| `SPACEMAIL_FROM` | Opcional. Remitente con nombre: `Marcos · Tentare <marcos@tentare.app>`. Si no está, se construye a partir de `SPACEMAIL_USER`. |

Sin ellas la pantalla funciona entera (importar, generar, revisar, aprobar) pero
avisa arriba y el botón de enviar queda deshabilitado — se prefiere eso a dejar
diez filas marcadas como fallidas por un problema de configuración que no tiene
nada que ver con los destinatarios.

⚠️ **Una variable nueva en Vercel no se aplica hasta que hay un build**, y un
merge que solo toca `docs/**` o `**/*.md` **no construye** (`vercel.json`,
`ignoreCommand`): el check sale verde con "Canceled by Ignored Build Step". Para
que producción recoja estas variables hace falta un cambio que toque código.

Datos de Spacemail (SMTP estándar, no tiene API propia): `mail.spacemail.com`,
puerto `465` con SSL, usuario = dirección completa.

### Cómo se ponen en Vercel

Las pone Marcos, nunca Claude: una contraseña que pasa por un chat o por un log
es una contraseña que hay que cambiar.

1. [vercel.com](https://vercel.com) → proyecto **pilates-saas** → **Settings** →
   **Environment Variables**.
2. Añadir las dos (y `SPACEMAIL_FROM` si se quiere el nombre en el remitente),
   marcando el entorno **Production**. Marcar también Preview solo si se va a
   probar desde un deploy de rama — cuidado, ahí el correo sale de verdad.
3. **Redesplegar.** Una variable nueva no entra en un despliegue ya hecho:
   Deployments → el último → `···` → Redeploy. O mergear cualquier PR que toque
   código (⚠️ uno de solo `docs/**` NO construye: `ignoreCommand` de
   `vercel.json` lo cancela y el check sale verde igualmente).

La contraseña es la **del buzón** (Spacemail Manager → el buzón → contraseña),
no la de la cuenta de Spaceship. Es el fallo más común y da un `535
authentication failed` idéntico al de una contraseña mal escrita.

### Antes del primer envío real: `npm run spacemail:check`

Entre "las variables están puestas" y "el correo llega" hay cuatro cosas que
fallan por separado y ninguna avisa sola: credenciales mal, el puerto 465
bloqueado por la red, el buzón sin SMTP saliente habilitado, y el correo que sale
pero aterriza en spam. Descubrirlo con el primer lote de 10 estudios reales
delante significa quemar diez direcciones que no se pueden volver a usar.

Con `SPACEMAIL_USER` y `SPACEMAIL_PASSWORD` en `.env.local`:

```bash
npm run spacemail:check
```

Comprueba las credenciales y la conexión contra `mail.spacemail.com:465`. No
envía nada. Nunca imprime la contraseña, solo cuánto mide.

```bash
npm run spacemail:check -- --enviar
```

Manda **un** correo de prueba **a tu propio buzón** — el script no acepta
destinatario, así que no puede escribir a un estudio real ni por accidente. Usa
el módulo de envío de verdad (`enviarProspeccion`), no una copia, así que prueba
el pie de baja y las cabeceras que van a salir.

⚠️ **Que salga sin error no significa que llegue a la bandeja de entrada.** Al
recibirlo, mirar tres cosas:

- **¿Está en spam?** Si sí, no enviar el primer lote todavía. Con un dominio que
  nunca ha mandado correo comercial es lo más probable, y se arregla antes de
  escribir a nadie (SPF, DKIM y DMARC del dominio en Spaceship, y empezar por
  volúmenes bajos).
- **El remitente**, que tiene que leerse como una persona y coincidir con quien
  firma el correo.
- **El pie**: identidad completa y la vía de baja.

Y responder `BAJA` al propio correo de prueba, para comprobar que esa respuesta
llega de verdad al buzón donde se va a leer.

## Por qué NO va por Resend

Resend manda el correo transaccional de los estudios a sus socias: recibos,
recordatorios, confirmaciones. Ese tráfico lo espera quien lo recibe y casi nunca
se marca como spam — de esa reputación depende que a una socia le llegue su
factura.

El outreach en frío es lo contrario: mensajes que nadie ha pedido, con tasa de
queja potencialmente alta por muy bien escritos que estén. Mezclarlos significa
que unas cuantas quejas de la prospección degradan la entrega de los recibos de
clientes que pagan. Por eso `lib/marketing/prospeccion-smtp.ts` no importa nada
de `lib/emails/`.

## El flujo

1. **Importar CSV.** Mínimo una columna de email y una de nombre de estudio; las
   cabeceras se reconocen solas en español (`Correo`, `Página web`, `Software
   actual`…). Opcionales pero muy recomendables: `web`, `instagram`, `ciudad`,
   `software_actual` — cuanto más haya, más concreto es el correo.

   Reimportar el mismo CSV no duplica ni pisa el pipeline: los que ya existían
   solo actualizan sus datos informativos, nunca su `estado` ni su `origen`. Si
   alguien entró hace un mes por el concierge y va por DEMO, sigue en DEMO.

2. **Generar borradores.** Uno por estudio, uno por llamada — así un estudio que
   haga fallar al modelo no se lleva por delante a los otros 99.

3. **Revisar.** Es el paso que justifica todo lo demás. Cada tarjeta pone el dato
   real del estudio (web, Instagram, software) pegado al texto que la IA escribió
   sobre él.

   `revisarBorrador` (`lib/interno/prospeccion.ts`) marca en rojo lo que no
   cuadra: un software que no es el suyo, un Instagram que no consta, un precio
   que no está en el catálogo, un `[NOMBRE]` sin rellenar. **Avisa, no bloquea** —
   quien revisa decide. Editar un correo ya aprobado lo devuelve a la cola: lo que
   se aprobó era ese texto, no el siguiente.

4. **Enviar por lotes de 10.** El tamaño es de reputación, no de rendimiento: un
   dominio que nunca ha mandado correo y suelta 100 mensajes casi idénticos en un
   minuto es el patrón exacto que buscan los filtros. Se pulsa el botón otra vez
   para el siguiente lote.

   El envío va por Inngest (`PROSPECCION_ENVIAR_LOTE`), no dentro de la petición
   HTTP: diez envíos SMTP en serie dentro de una API route es cómo se queda un
   lote a medias sin que nadie sepa cuáles salieron.

Al enviarse, el lead pasa a `CONTACTADO` y entra en el mismo radar de seguimiento
que el resto (`loQueQuemaHoy`): si no contesta en dos días, aparece solo en la
bandeja diaria.

## Qué impide enviar dos veces al mismo estudio

Dos capas, no una:

- **En la base de datos**: `uq_prospeccion_lead_enviado`, índice único parcial
  sobre `lead_id WHERE estado = 'ENVIADO'`. Un doble clic, un reintento de
  Inngest tras enviar pero antes de memoizar, o un bug futuro en la cola no
  pueden saltárselo.
- **En el código**: generar un borrador para un lead que ya tiene un `ENVIADO`
  devuelve 409, así que ni siquiera se ofrece el botón.

## Cumplimiento (LSSI / RGPD, B2B)

- Remitente identificable con nombre real, no un alias de empresa.
- Pie con identidad completa y vía de baja: responder `BAJA` a un buzón que una
  persona lee.
- Cabecera `List-Unsubscribe` para que el cliente de correo ofrezca la baja en su
  propia interfaz.

Deliberadamente **sin** el sistema de tokens firmados de
`lib/marketing/unsubscribe-token.ts`: ese existe para envíos recurrentes a
consumidoras. Para un envío puntual B2B de este tamaño, "responde BAJA" ya es la
vía sencilla y gratuita que pide la LSSI; construir más no protegería a nadie
mejor.

⚠️ Una baja hay que **respetarla a mano**: hoy no hay lista de supresión
automática. Quien responda BAJA se marca `PERDIDO` con el motivo en su ficha, y
como no se le puede volver a generar un borrador sin que aparezca en la cola de
revisión, no se le vuelve a escribir por accidente. Si esto se convierte en un
canal recurrente, la lista de supresión deja de ser opcional.

## Permiso

`marketing.send`. Este es su **primer consumidor real** — estaba declarado en
`lib/interno/permisos.ts` desde que se montó el panel sin cerrar ninguna puerta,
igual que le pasaba a `crm.update` antes de que existiera Crecimiento.

Se exige `marketing.send` y no `crm.update` también para *generar*: un borrador
ya contiene el texto que va a salir hacia un tercero, así que la barrera está en
quien puede iniciar el contacto, no solo en quien edita el CRM.
