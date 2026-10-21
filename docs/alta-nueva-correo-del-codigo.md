# El correo del código del alta nueva: cómo aplicarlo en Supabase

Correo 1 del alta nueva (maqueta aprobada el 21-oct-2026, «09 · Correos»): la
bienvenida **es** el código. Asunto «482913 es tu código · Te damos la
bienvenida a Tentare», cuerpo nuevo, sin botón ni enlace (decisión 1: los
escáneres de correo abren los enlaces y gastan el acceso).

Lo aplica **el fundador**, a mano, con este documento. Ninguna sesión lo hace
sola.

## Por qué así y no con un despliegue

- Lo que se envía **no** es `supabase/templates/confirmation.html`: es la
  plantilla guardada en el proyecto de Supabase (Management API,
  `mailer_subjects_confirmation` y `mailer_templates_confirmation_content`). El
  fichero del repo y el asunto de `supabase/config.toml` son la **referencia**.
- **Nunca `supabase config push`**: sube `config.toml` entero (límites,
  URLs, proveedores…), no solo esta plantilla.
- La plantilla es **una para todas las altas del proyecto**: equipo, alumnas
  (su primer código en el portal también es esta plantilla), Network y el alta
  de siempre. Por eso va con un condicional: solo quien se da de alta con
  `alta_nueva: true` en la metadata (`app/crear-estudio/alta-nueva.tsx`) recibe
  el correo nuevo; el resto recibe **exactamente** el de hoy.
- La rama «de siempre» **no sale del repo**, sale de lo que hay hoy en
  producción (la copia del paso 1). Si alguien la retocó en el panel de
  Supabase, el repo no lo sabe; pisarla cambiaría el correo de todas las altas.

El orden con el despliegue del código da igual: sin el código, nadie lleva
`alta_nueva` y todo el mundo recibe el de siempre; sin la plantilla, el alta
nueva recibe el de siempre (que también lleva el código, solo cambia el texto).

## Lo que hace falta

- Un token personal de Supabase (Account → Access Tokens) en la variable
  `SUPABASE_ACCESS_TOKEN`, y la referencia del proyecto en `PROJECT_REF`.
  **Ninguno de los dos se escribe en el repo ni en un PR.**
- `curl`, `jq` y Node (el del repo).
- Una carpeta FUERA del repo para las copias, por ejemplo `~/tentare-copias/`.

## 1. Guardar lo que hay hoy (para poder volver atrás)

```sh
mkdir -p ~/tentare-copias
curl -sS -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth" \
  | jq '{mailer_subjects_confirmation, mailer_templates_confirmation_content}' \
  > ~/tentare-copias/plantilla-confirmacion-$(date +%F).json
```

Abre el fichero y comprueba que los dos campos traen texto. Si
`mailer_templates_confirmation_content` está vacío o es `null`, el proyecto usa
la plantilla por defecto de Supabase: **para aquí** (el paso 2 se niega a seguir).

## 2. Componer el PATCH

Desde la raíz del repo, con la rama del PR (o `main` ya fusionado):

```sh
node --experimental-strip-types scripts/alta-nueva-plantilla-codigo.ts \
  ~/tentare-copias/plantilla-confirmacion-AAAA-MM-DD.json \
  ~/tentare-copias/patch-plantilla-confirmacion.json
```

Lee lo que dice:

- «La plantilla de hoy en producción es la del repo»: perfecto, la rama de
  siempre queda igual byte a byte.
- «⚠️ … NO es la del repo»: la rama de siempre sigue siendo la de producción (no
  se pisa nada), pero mira la diferencia antes de seguir, por si el repo llevaba
  algo que producción no tiene.
- «Producción YA lleva el alta nueva»: ya está aplicado; no repitas.

El script no habla con nadie: solo lee la copia y el fichero del repo
(`lib/alta/plantilla-codigo.ts` es quien compone, y su test lo vigila).

## 3. Aplicarlo

```sh
curl -sS -X PATCH \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth" \
  --data @"$HOME/tentare-copias/patch-plantilla-confirmacion.json" \
  | jq '{mailer_subjects_confirmation}'
```

Tiene que contestar con el asunto condicional (empieza por
`{{ if .Data.alta_nueva }}`).

## 4. Tres envíos de control

Con un correo tuyo de pruebas para cada uno (un alias `+` vale), en ventanas
privadas:

1. **Alta nueva** — con `ALTA_NUEVA_REGISTRO=prueba` desplegado, abre
   `/crear-estudio?alta=nueva` y crea un estudio de pruebas. Tiene que llegar:
   asunto «NNNNNN es tu código · Te damos la bienvenida a Tentare»; titular «Te
   damos la bienvenida a Tentare»; el nombre del estudio; el código, que
   funciona en la pantalla; **ningún enlace**.
2. **Alta de siempre** — `/crear-estudio` sin parámetro, otro correo. Tiene que
   llegar el de siempre: asunto «Tu código de verificación de Tentare» (o el que
   tuviera la copia) y titular «Verifica tu correo».
3. **Una alumna** — en el portal de un estudio de pruebas, crea una cuenta de
   alumna con otro correo. Tiene que llegar el de siempre, igual que en el 2.

Si el 2 o el 3 no llegan, o llegan con el texto nuevo: **vuelve atrás ya**
(abajo). Las cuentas de prueba del 1 quedan marcadas `v2_prueba` en
`altas_estudio` y no entran en las cohortes del embudo.

## Volver atrás

La copia del paso 1 ya tiene la forma del PATCH:

```sh
curl -sS -X PATCH \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth" \
  --data @"$HOME/tentare-copias/plantilla-confirmacion-AAAA-MM-DD.json" \
  | jq '{mailer_subjects_confirmation}'
```

## Lo que ya se comprobó en el PR

- La plantilla se ejecutó con `html/template` de Go (lo que usa gotrue) y los
  datos con la forma que les da gotrue (`.Data` es la metadata del usuario, que
  puede faltar): sin metadata, con metadata vacía, alumna, Network, alta de
  siempre y `alta_nueva: false`, la rama de siempre sale **igual** que la
  plantilla de hoy, y el asunto también. Con `alta_nueva: true` sale el correo
  nuevo, con el nombre del estudio escapado, sin un solo `href`, y con «tu
  estudio» si faltara el nombre.
- La rama de siempre del fichero del repo es, byte a byte, el
  `confirmation.html` que había antes del PR.
- Lo que **no** se puede comprobar desde el repo: que la plantilla de
  producción sea la del repo. Para eso está el aviso del paso 2.
