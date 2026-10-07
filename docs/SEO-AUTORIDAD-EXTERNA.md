# Autoridad externa y enlaces — plan para ejecutar (7-oct-2026)

Lo que el código no puede arreglar. Este documento no da nada por hecho: dice
qué falta, por qué importa, qué está ya preparado en la web y cuál es el
siguiente paso de una persona. Nada de esto se ha ejecutado.

## Dónde estamos

- **Search Console (3 meses hasta el 7-oct):** unos 110 clics y 2.700
  impresiones. Dos de cada tres clics de la home llegan buscando la marca. Las
  búsquedas comerciales sin marca («software para pilates», «gestión pilates»)
  están entre la posición 9 y la 90: el contenido está, falta autoridad.
- **Perfiles en directorios:** G2, Capterra, GetApp y Software Advice
  publicados (30-sep). G2 tiene una nota pública con muy pocas reseñas.
- **Enlaces entrantes:** no medidos en esta revisión (no había herramienta de
  enlaces conectada). Primer paso: exportar el informe «Enlaces» de Search
  Console y el de Bing Webmaster Tools, que son gratuitos, y guardar la foto de
  partida con fecha.

Lo que no se puede fabricar: reseñas, enlaces, menciones ni cifras. Nada de
comprar enlaces ni de directorios masivos: un perfil de enlaces artificial se
paga con una penalización.

## Activos de la web que ya merecen un enlace

| Activo | URL | Por qué alguien lo enlazaría |
|---|---|---|
| Estudio de precios de 32 estudios | `/recursos/precio-clase-de-pilates` | Dato propio: medianas de reformer, suelo y privada por ciudad. Es lo que piden periodistas y blogs de bienestar |
| Calculadora de plazas vacías | `/soluciones/estudio-de-pilates-reformer` | Herramienta gratuita, sin registro |
| Calculadora de rentabilidad | `/recursos/rentabilidad-estudio-de-pilates` | Herramienta gratuita para quien abre un estudio |
| Cuánto cuesta abrir un estudio | `/recursos/cuanto-cuesta-abrir-un-estudio-de-pilates` | Presupuesto por partidas con precios reales |
| Requisitos para abrir | `/recursos/requisitos-para-abrir-un-estudio-de-pilates` | La guía con más impresiones del sitio |
| Plantilla de asistencia (Excel) | `/recursos/plantilla-control-de-asistencia-pilates` | Descargable gratuito |

## Plan, por orden de impacto

### 1. Reseñas reales en G2 y Capterra (semana 1-4)

Pedir una reseña a cada estudio que use Tentare de verdad, con el enlace
directo al formulario y en el momento bueno (tras su primer mes cobrando con
Tentare). Sin incentivos que incumplan las normas de cada portal. Cuando haya
reseñas suficientes y reales, se puede valorar `aggregateRating` en el JSON-LD
(ver la memoria del proyecto: hoy no se pone).

### 2. Informe anual de precios de Pilates en España (mes 1-2)

Ampliar el estudio de 32 estudios a una muestra mayor y por ciudad, con
metodología y fecha. Search Console ya enseña la demanda: «pilates madrid
precio», «pilates bilbao precio», «pilates sevilla precios», «cuánto cuesta una
clase de pilates». Una sola página con la tabla por ciudad (nunca una página por
ciudad) y una nota de prensa a medios locales y de bienestar: es el tipo de dato
que se cita con enlace.

### 3. Partners del sector (mes 1-3)

Categorías donde un enlace es natural porque hay relación real:

- Escuelas de formación de instructoras de Pilates y yoga (recursos para sus
  alumnas que abren estudio: la guía de requisitos y la de cuánto cuesta abrir).
- Distribuidores de reformers y material (la guía de cuánto cuesta abrir cita
  precios de reformers).
- Gestorías y asesorías de centros deportivos (la guía del IVA de las clases y la
  de Veri*Factu).
- Plataformas que ya se integran con Tentare (Stripe, ClassPass, Urban Sports
  Club, Wellhub): páginas de partners o directorios de integraciones, cuando
  existan.

Para cada categoría: lista de 10-20 candidatos reales, un correo personal con el
activo concreto que les sirve y sin pedir el enlace de entrada.

### 4. Medios y podcasts del sector (mes 2-4)

Medios de negocio del fitness y del bienestar en España, y podcasts para
propietarias de estudios. Lo que se ofrece: los datos del informe de precios y
la experiencia de construir un software de gestión en España (Veri*Factu, SEPA,
sustituciones). Una entrevista con enlace a la página «Sobre Tentare» refuerza
también la entidad de marca.

### 5. Casos de estudio (cuando haya permiso)

Cada caso con estudio real, su permiso por escrito, el problema de partida, qué
cambió y cifras medidas en Tentare (nunca estimadas). El permiso firmado vive
fuera del repo, que es público. Sin permiso no se publica nada.

## Cómo medir

- Mensual: dominios que enlazan (Search Console y Bing), anclas, páginas de
  destino. El objetivo no es el número, es que haya enlaces a páginas internas
  (comparativas, soluciones, guías) y no solo a la home.
- Trimestral: posición media de las búsquedas comerciales sin marca del mapa de
  `docs/SEO-KEYWORD-URL-MAP.md`.
