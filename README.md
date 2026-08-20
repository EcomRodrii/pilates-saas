# Tentare

**Tentare** es un SaaS de gestión para estudios de Pilates.

La aplicación centraliza la gestión de estudios, alumnos, clases, reservas, pagos, equipo y automatizaciones en una única plataforma.

Este repositorio contiene la aplicación web de Tentare.

---

## Stack tecnológico

* **Next.js**
* **React**
* **TypeScript**
* **Supabase**

  * PostgreSQL
  * Authentication
  * Row Level Security (RLS)
  * Edge Functions
  * Cron
* **Stripe**
* **Vercel**
* **Cloudflare Turnstile**
* **Resend**
* **Supabase CLI**
* **Docker / Colima** para desarrollo local

---

# Requisitos

Para ejecutar Tentare localmente necesitas:

* Node.js
* npm
* Git
* Docker

En macOS se puede utilizar **Colima** como alternativa ligera a Docker Desktop:

```bash
brew install colima docker
colima start
```

Comprueba que Docker está funcionando:

```bash
docker ps
```

---

# Instalación

Clona el repositorio e instala las dependencias:

```bash
npm install
```

Inicia el servidor de desarrollo:

```bash
npm run dev
```

La aplicación estará disponible en:

```text
http://localhost:3000
```

---

# Variables de entorno

Crea un archivo:

```text
.env.local
```

**Nunca subas `.env.local` a Git.**

Las variables exactas necesarias pueden variar según el entorno.

Ejemplo para desarrollo local:

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<LOCAL_SUPABASE_ANON_KEY>

# No configurar Turnstile en Supabase local
# NEXT_PUBLIC_TURNSTILE_SITE_KEY=<TURNSTILE_SITE_KEY>

# Opcional en local
# TURNSTILE_SECRET_KEY=<TURNSTILE_SECRET_KEY>
```

## Variables públicas

Las variables con prefijo:

```text
NEXT_PUBLIC_
```

pueden ser utilizadas por el navegador.

Por ejemplo:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_TURNSTILE_SITE_KEY
```

Que una variable sea pública **no significa que todas las variables de configuración sean seguras para publicar**.

## Variables privadas

Nunca deben exponerse en el cliente ni almacenarse en el repositorio:

```text
TURNSTILE_SECRET_KEY
SUPABASE_SERVICE_ROLE_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
RESEND_API_KEY
DATABASE_PASSWORD
```

Los valores reales deben configurarse mediante las variables de entorno del proveedor correspondiente.

---

# Desarrollo local con Supabase

## ⚠️ Importante

El registro y el login **no deben ejecutarse contra la Supabase de producción durante el desarrollo normal**.

Supabase Auth puede exigir Cloudflare Turnstile a nivel de proyecto.

Cuando Supabase recibe una petición sin un token válido, puede devolver:

```text
captcha protection: request disallowed (no captcha_token found)
```

Esto afecta tanto al:

* Registro
* Login

La configuración recomendada es utilizar una instancia local de Supabase.

---

# Supabase local — configuración recomendada

La configuración de Supabase local se encuentra en:

```text
supabase/config.toml
```

En el entorno local:

* El captcha de Supabase está desactivado.
* Las confirmaciones de email están desactivadas.
* Los emails se interceptan mediante Mailpit.
* Los datos permanecen fuera de producción.

La configuración utiliza:

```toml
enable_confirmations = false
```

y el captcha local permanece desactivado.

---

## Iniciar Supabase

Asegúrate de que Docker o Colima están funcionando.

Después:

```bash
npx supabase start
```

Este comando inicia el stack local de Supabase y aplica las migraciones y el seed del proyecto.

Las migraciones se encuentran en:

```text
supabase/migrations/
```

El seed se encuentra en:

```text
supabase/seed.sql
```

Supabase mostrará en la terminal las credenciales locales necesarias.

Utiliza esas credenciales en `.env.local`.

---

# ⚠️ Turnstile en desarrollo local

Cuando se utiliza Supabase local, **no configures**:

```env
NEXT_PUBLIC_TURNSTILE_SITE_KEY=...
```

La variable debe permanecer ausente o comentada:

```env
# NEXT_PUBLIC_TURNSTILE_SITE_KEY=...
```

Esto es importante.

La Supabase local no requiere captcha, pero si la aplicación detecta `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, puede montar el widget de Turnstile.

El formulario intentará entonces obtener un token que no corresponde al entorno local.

El resultado puede ser:

```text
Enviando…
```

durante aproximadamente 30 segundos, seguido de:

```text
No hemos podido comprobar que no eres un robot
```

Por tanto:

> **Desarrollo local + Supabase local = Turnstile desactivado en el frontend.**

---

# TURNSTILE_SECRET_KEY

Tentare dispone de un mecanismo server-side para validar tokens de Cloudflare Turnstile.

La implementación se encuentra en:

```text
lib/auth/captcha-servidor.ts
```

⚠️ **Hoy ningún endpoint propio la usa.** Su único consumidor era
`/api/public/interes-lanzamiento` (el formulario de lista de espera), que se
borró al abrir Tentare al público. El alta nueva (`/crear-estudio`) no pasa por
un endpoint propio: va directa a gotrue, que verifica el token de Turnstile a
nivel de PROYECTO en Supabase. La utilidad se conserva para el próximo endpoint
público que haga falta — pero si se pinta un captcha en un formulario nuevo,
hay que acordarse de llamarla desde el servidor, o el token será decoración
(fue exactamente el bug de #847).

Cuando se usa, el servidor valida el token con el mecanismo `siteverify` de Cloudflare.

La variable:

```text
TURNSTILE_SECRET_KEY
```

es **privada**.

Nunca debe:

* Tener prefijo `NEXT_PUBLIC_`.
* Aparecer en código cliente.
* Subirse a Git.
* Incluirse directamente en el README.
* Compartirse públicamente.

---

## TURNSTILE_SECRET_KEY en local

En desarrollo local puede dejarse sin configurar.

Cuando no existe el secreto, el verificador local no realiza la validación externa contra Cloudflare.

Esto permite desarrollar sin depender de Turnstile.

---

## Relación entre Site Key y Secret Key

Cuando se utiliza Turnstile en un entorno real deben existir las dos partes:

```text
Site Key
    ↓
Navegador
    ↓
Token
    ↓
Servidor
    ↓
Secret Key
    ↓
Cloudflare
```

La Site Key puede ser pública.

La Secret Key debe permanecer privada.

Si se configura:

```text
TURNSTILE_SECRET_KEY
```

pero no existe:

```text
NEXT_PUBLIC_TURNSTILE_SITE_KEY
```

el navegador no podrá generar correctamente el token.

---

# Emails en desarrollo

Los emails enviados durante el desarrollo no se envían a destinatarios reales.

Se interceptan mediante **Mailpit**.

La interfaz local de Mailpit está disponible normalmente en:

```text
http://127.0.0.1:54324
```

Desde ahí se pueden consultar:

* Emails de confirmación.
* Enlaces de autenticación.
* Avisos generados por la aplicación.
* Otros emails enviados durante el desarrollo.

Esto permite probar los flujos de email sin enviar mensajes reales.

---

# Desarrollo contra Supabase de producción

Puede ser necesario utilizar Supabase de producción para determinadas tareas que requieren datos reales.

Esto **no es el flujo recomendado para el desarrollo diario**.

Cuando se utiliza producción desde `localhost`, el navegador debe poder generar un token válido de Cloudflare Turnstile.

La variable debe configurarse como:

```env
NEXT_PUBLIC_TURNSTILE_SITE_KEY=<TURNSTILE_PRODUCTION_SITE_KEY>
```

La Site Key es pública y puede aparecer en el bundle del navegador.

**No debe confundirse con el Secret Key.**

La clave de prueba de Cloudflare Turnstile no debe utilizarse cuando Supabase está configurado para validar contra el secreto real del proyecto.

---

# Configuración de localhost en Cloudflare Turnstile

Para utilizar Turnstile desde:

```text
http://localhost:3000
```

es necesario añadir `localhost` al apartado de hostnames del widget correspondiente en Cloudflare Turnstile.

Sin esta configuración pueden aparecer errores de Turnstile o el botón de envío puede permanecer deshabilitado.

### Consideración de seguridad

Añadir `localhost` al widget utilizado para producción permite que se generen tokens desde el entorno local.

Aunque Turnstile sigue realizando su desafío, no se recomienda utilizar este método como configuración habitual de desarrollo.

Siempre que sea posible, utiliza Supabase local.

---

# Vercel Preview

Las Preview Deployments de Vercel utilizan dominios dinámicos similares a:

```text
*.vercel.app
```

Cloudflare Turnstile no permite resolver este escenario simplemente utilizando un wildcard de subdominio.

Por tanto, no se recomienda utilizar el login real de producción con Turnstile para probar las previews.

Para probar las pantallas autenticadas se utiliza la suite E2E.

La suite se encuentra en:

```text
e2e/
```

Los tests pueden:

* Crear o sembrar sesiones.
* Mockear determinados servicios.
* Evitar depender del captcha real.
* Probar pantallas autenticadas de forma reproducible.

---

# Base de datos

Tentare utiliza PostgreSQL a través de Supabase.

Los cambios de esquema deben realizarse mediante migraciones.

Ubicación:

```text
supabase/migrations/
```

Los datos iniciales para desarrollo se encuentran en:

```text
supabase/seed.sql
```

Al iniciar Supabase local:

```bash
npx supabase start
```

se aplican las migraciones y el seed correspondientes.

---

# Row Level Security

La base de datos utiliza **Row Level Security (RLS)** para controlar el acceso a los datos.

Los cambios en tablas, políticas o permisos deben revisarse cuidadosamente.

Especialmente:

* No desactivar RLS para solucionar problemas de desarrollo.
* No utilizar claves de servicio en el cliente.
* No exponer `SUPABASE_SERVICE_ROLE_KEY`.
* Validar siempre los permisos en el servidor y/o mediante las políticas correspondientes.

---

# Autenticación

Tentare utiliza Supabase Auth.

El sistema de autenticación puede estar protegido mediante Cloudflare Turnstile dependiendo del entorno.

Arquitectura general:

```text
Usuario
   ↓
Frontend Tentare
   ↓
Supabase Auth
   ↓
Cloudflare Turnstile
   ↓
Sesión autenticada
```

En local:

```text
Usuario
   ↓
Frontend Tentare
   ↓
Supabase local
   ↓
Sesión local
```

El objetivo es que el desarrollo local no dependa de servicios de producción.

---

# Estructura principal

La estructura del proyecto sigue la arquitectura de Next.js App Router.

```text
app/
├── page.tsx
├── api/
└── ...

lib/
├── auth/
│   └── captcha-servidor.ts
└── ...

supabase/
├── config.toml
├── migrations/
└── seed.sql

e2e/
```

La estructura puede evolucionar a medida que crece el proyecto.

---

# Testing

Los flujos críticos deben probarse de forma reproducible.

Los tests E2E están ubicados en:

```text
e2e/
```

La suite E2E está especialmente pensada para escenarios donde no resulta apropiado depender de:

* Captcha real.
* Credenciales de producción.
* Usuarios reales.
* Datos de producción.
* Servicios externos.

Siempre que sea posible, los tests deben utilizar datos controlados y entornos aislados.

---

# Entornos

Tentare utiliza diferentes configuraciones según el entorno.

## Local

```text
Next.js
+
Supabase local
+
PostgreSQL local
+
Mailpit
+
Turnstile desactivado
```

## Preview

```text
Vercel Preview
+
Configuración de Preview
+
Tests E2E
```

## Producción

```text
Vercel Production
+
Supabase Production
+
Cloudflare Turnstile
+
Servicios externos de producción
```

Cada entorno debe utilizar sus propias variables de configuración.

---

# Comandos útiles

## Next.js

Instalar dependencias:

```bash
npm install
```

Iniciar desarrollo:

```bash
npm run dev
```

---

## Supabase

Iniciar Supabase local:

```bash
npx supabase start
```

Detener Supabase local:

```bash
npx supabase stop
```

---

## Colima

Iniciar:

```bash
colima start
```

Detener:

```bash
colima stop
```

---

# Troubleshooting

## `captcha protection: request disallowed`

Si aparece:

```text
captcha protection: request disallowed (no captcha_token found)
```

comprueba:

1. Que la aplicación no esté intentando autenticarse contra una Supabase de producción desde un entorno local sin Turnstile correctamente configurado.
2. Si utilizas Supabase local, comprueba que `NEXT_PUBLIC_TURNSTILE_SITE_KEY` no esté configurada.
3. Comprueba que `NEXT_PUBLIC_SUPABASE_URL` apunta a la instancia local.
4. Reinicia el servidor después de modificar `.env.local`.

---

## El formulario permanece en "Enviando..."

Si el formulario permanece aproximadamente 30 segundos en:

```text
Enviando…
```

y posteriormente muestra:

```text
No hemos podido comprobar que no eres un robot
```

comprueba si has configurado accidentalmente:

```env
NEXT_PUBLIC_TURNSTILE_SITE_KEY=...
```

mientras utilizas Supabase local.

En Supabase local, la variable debe estar ausente o comentada.

---

## Turnstile no funciona en localhost

Si necesitas trabajar contra producción desde `localhost`:

1. Comprueba que existe la Site Key correcta.
2. Comprueba que `localhost` está autorizado en Cloudflare Turnstile.
3. Comprueba que la Site Key corresponde al widget correcto.
4. Comprueba que el Secret Key correspondiente está configurado en el entorno servidor.
5. Comprueba que no estás utilizando una clave de prueba incompatible con la configuración de Supabase.

---

## Turnstile no funciona en Vercel Preview

No intentes solucionar el problema añadiendo:

```text
*.vercel.app
```

como wildcard.

Para probar funcionalidades autenticadas utiliza:

```text
e2e/
```

y los mecanismos de sesión/mock definidos por la suite de tests.

---

# Seguridad

## Nunca subir secretos a Git

Antes de hacer commit, asegúrate de que no existen secretos en los archivos modificados.

Nunca subas:

```text
.env
.env.local
.env.production
```

si contienen credenciales reales.

Tampoco subas:

```text
SUPABASE_SERVICE_ROLE_KEY
TURNSTILE_SECRET_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
RESEND_API_KEY
DATABASE_PASSWORD
```

ni ninguna otra credencial privada.

---

## Si un secreto llega a Git

Eliminarlo del archivo **no es suficiente**.

Si una clave privada ha sido subida alguna vez al repositorio, debe considerarse comprometida.

La acción correcta es:

1. Revocar la clave.
2. Generar una nueva.
3. Actualizar las variables de entorno.
4. Revisar el historial del repositorio.
5. Limpiar el historial si resulta necesario.

---

# Deploy

Tentare se despliega en Vercel.

Las variables de entorno deben configurarse directamente en la configuración del proyecto correspondiente.

Nunca dependas de `.env.local` para producción.

Antes de realizar un deploy de producción:

* Verifica las variables de entorno.
* Comprueba Supabase.
* Comprueba Turnstile.
* Comprueba Stripe.
* Comprueba los servicios de email.
* Ejecuta los tests correspondientes.
* Verifica que no existen secretos en el repositorio.

---

# Principio de desarrollo

Tentare prioriza la **fiabilidad y estabilidad**.

Los cambios en autenticación, base de datos, pagos, reservas o cualquier flujo crítico deben realizarse siguiendo este orden:

1. Desarrollar en local.
2. Utilizar Supabase local siempre que sea posible.
3. Ejecutar tests.
4. Revisar migraciones.
5. Verificar permisos y RLS.
6. Probar los flujos críticos.
7. Utilizar Preview cuando corresponda.
8. Trabajar contra producción únicamente cuando sea necesario.

> **Producción no es un entorno de desarrollo.**

---

# Checklist antes de hacer push

Antes de subir cambios al repositorio:

```text
[ ] No hay archivos .env con secretos
[ ] No hay API keys privadas
[ ] No hay Supabase Service Role Key
[ ] No hay Stripe Secret Keys
[ ] No hay Turnstile Secret Keys
[ ] No hay contraseñas
[ ] No hay credenciales de producción
[ ] Los tests relevantes pasan
[ ] Las migraciones están revisadas
[ ] RLS no ha sido desactivado accidentalmente
[ ] No se han introducido datos reales en seeds
```

---

# Licencia

Tentare es software propietario.

Todos los derechos reservados.
