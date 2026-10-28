# Demo personalizada con Tenti (`/demo`)

La propietaria que aún no es clienta cuenta su duda; Tenti la entiende y le prepara un recorrido con
datos de ejemplo que usa las **mismas reglas** que el producto. Al terminar se le pregunta si ha
quedado resuelta y, solo si lo dice ella, se le lleva al alta de siempre.

Estado: construida y probada en local; **apagada de serie** (`DEMO_PERSONALIZADA`). Nada de esto
sale a producción hasta que el interruptor se ponga a `on` (o a `prueba`).

## Interruptor

| `DEMO_PERSONALIZADA` | Botón de la home | `/demo` | API |
| --- | --- | --- | --- |
| sin poner / cualquier otro | no | 404 | 404 |
| `prueba` | no | solo con `/demo?prueba=1` | sí |
| `on` | sí | sí | sí |

Una variable nueva de Vercel solo llega a producción con el siguiente despliegue **de código**, y la
home se regenera cada hora (`revalidate = 3600`): el botón puede tardar hasta una hora en salir.
Para encenderla: primero `prueba`, recorrerla en producción, después `on`.

## Recorrido y piezas

```
home (DemoCta) ─▶ /demo
  1 centro  ─▶ 2 datos ─▶ POST /iniciar ─▶ lead + sesión firmada
  3 Tenti   ─▶ POST /tenti (turnos) ─▶ pregunta | demo | no_soportado | degradado
  4 demo    ─▶ POST /ejecutar (retomar / volver a ejecutar / elegir del catálogo)
  5 valorar ─▶ POST /evaluar ─▶ «Sí» ─▶ borrador del alta ─▶ /crear-estudio
```

| Capa | Dónde | Qué hace |
| --- | --- | --- |
| Datos y consentimiento | `lib/demo/lead.ts`, `lead-escritura.ts` | Valida y normaliza; el permiso comercial nace desmarcado y pendiente |
| Sesión | `lib/demo/sesion.ts` | Token firmado (HMAC, 24 h), sin tabla |
| Conversación | `lib/demo/tenti.ts`, `tenti-servidor.ts` | Haiku 5.5, `tool_choice: any`, tres herramientas |
| Validación | `lib/demo/catalogo.ts` | Única puerta entre el modelo y lo que se ejecuta |
| Motor | `lib/demo/escenarios/*` | Funciones puras sobre las reglas reales del producto |
| Presentación | `components/demo/*` | Pantalla, chat, recorrido, bloques simulados |
| Rutas | `app/api/public/demo/*` | `iniciar`, `tenti`, `ejecutar`, `evaluar` |

### Lo que demuestra (y de dónde sale cada resultado)

| Escenario | Reglas reales que usa |
| --- | --- |
| `caducidad_bono` | `bonoConsumible`, `bonoDevolvible`, `tieneEntitlementActivo`, `esCancelacionTardia`, `debeDevolverBono` |
| `ausencia_recuperacion` | `canceladasCompensables`, `derechoDeRecuperaciones`, `semanaCerrada`, `esCancelacionTardia` |
| `orden_consumo_bonos` | `bonoConsumible` (el gemelo TS de `elegir_bono_consumible`) |

⚠️ **No existe un proceso que «caduque los bonos cada domingo».** Un bono caduca en SU fecha de fin
(`validezDias` desde la compra) y vale todo ese último día. Avisar de una ausencia es cancelar: no
cambia la fecha de fin, solo decide si la sesión vuelve al bono. La demo lo dice así y Tenti lo sabe
(está en su prompt, y `aclaracion` lo recoge cuando la duda parte de otra idea).

Un escenario nuevo = una carpeta en `lib/demo/escenarios/` con su esquema estricto, su `generar` y
sus comprobaciones, y una entrada en `CATALOGO`. Si el escenario no es verificable con funciones
puras del producto, no entra.

## Seguridad

- **El modelo propone `{escenario, parametros}` y nada más.** Pasos, módulos, reglas y comprobaciones
  los saca el catálogo. Esquemas `z.strictObject`: una clave de más o un valor fuera de rango se
  rechaza entero, no se corrige.
- **Nada de SQL, código ni herramientas.** `lib/demo/aislamiento.test.ts` falla si el motor importa
  base de datos, Stripe, correo o red, o si `ejecutar` toca una tabla. La demo es una función pura de
  sus parámetros: no puede tocar datos reales, cobrar ni enviar.
- **La IA, solo en servidor.** La clave sale de `ANTHROPIC_API_KEY` (`lib/ai/cliente.ts`). El modelo es
  `MODELO_ASISTENTE` y **no se sustituye en silencio** (el asistente tiene respaldo a Haiku 4.5; aquí
  no): si falla, la persona recibe los escenarios del catálogo y Sentry un aviso sin texto suyo.
- **IDOR / sesión**: sin token firmado por nosotros, 401 con la misma respuesta para «falso»,
  «caducado» o «manipulado». El prefijo firmado (`demo-sesion.`) impide reutilizar un token de otro
  sitio del producto.
- **Topes** (`rate_limit_hit`, fail-open como el resto): iniciar 6/min y 30/día por IP, 8/día por
  buzón (con `+` y puntos de Gmail colapsados), 400/día global; Tenti 40/h por IP, 12/h por sesión y
  2.500/día global, con salida `degradado` (nunca un error) al pasarlos. 700 tokens de salida por turno.
- **Datos personales**: el navegador solo recuerda token, centro, conversación y propuesta (sin
  nombre, correo ni teléfono, sin la casilla comercial). Los logs y Sentry no llevan texto de la
  persona. A Tenti no le llega ni el nombre ni el correo.
- **Leads**: igual que `/descargas`. Un lead que ya existe **no se toca** (el correo no está
  verificado); la evaluación solo se anota en el que creó esa misma sesión, y solo claves cerradas.
  Origen `ALTA` y estado `DEMO`: el CHECK de `origen` no admite un valor propio sin migración (una
  línea aditiva, a decidir).
- **Sin captcha de servidor no se cierra** (a diferencia de `/descargas`, esta ruta no manda correo): se
  quedan trampa, topes por IP, buzón y global. Sin `TURNSTILE_SECRET_KEY` el veredicto es «ok».

## Conversión al alta

«Crear mi estudio» escribe `{estudio, correo}` en el **borrador del alta nueva**
(`guardarBorradorAltaNueva`, con su validación y su caducidad de 7 días) y navega a `/crear-estudio`.
No se crea ningún estudio, ni se salta el correo verificado ni el captcha del alta. La contraseña
nunca se guarda.

## Pendiente (a propósito, nada de esto está hecho)

- **La «intención de configuración» no viaja al alta.** El alta no tiene dónde recibirla; hoy queda
  solo la línea `[demo] centro=… escenario=… respuesta=…` en las notas del lead.
- **No se vincula el lead con el estudio que luego se cree** (el alta tampoco lo hace con ningún lead).
- **El permiso comercial no llega a estar activo**: se registra la solicitud, pero no hay correo de
  doble confirmación para esta vía (sí lo hay para las descargas).
- **Origen `DEMO` propio** en `plataforma_lead` (migración aditiva).
- **Las pantallas son simuladas**, no las reales del panel (necesitan un estudio y sesión detrás).
- **Sin medir en WebKit**: la spec corre solo en Chromium; añadirla a `SPECS_WEBKIT` exige medir lo que
  cuesta (ver `playwright.config.ts`).
- **El modelo real no está probado desde aquí** (sin clave): los tests de Tenti usan un modelo
  simulado. Hay que recorrer `/demo?prueba=1` con la clave puesta antes de abrirla.

## Variables de entorno

| Variable | Para qué | Nueva |
| --- | --- | --- |
| `DEMO_PERSONALIZADA` | El interruptor (`on` / `prueba` / apagada) | sí |
| `ANTHROPIC_API_KEY` | Tenti (ya existe) | no |
| `SUSTITUCION_TOKEN_SECRET` u `OAUTH_STATE_SECRET` | Firmar la sesión (ya existen) | no |
| `TURNSTILE_SECRET_KEY` / `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Captcha (ya existen) | no |

## Probarla en local

```bash
DEMO_PERSONALIZADA=on npm run dev          # con las variables de tu entorno
# o, sin servicios externos:
npx playwright test e2e/demo-personalizada.spec.ts --project=chromium
node --import ./scripts/register-test-hooks.mjs --test --experimental-strip-types "lib/demo/*.test.ts"
```
