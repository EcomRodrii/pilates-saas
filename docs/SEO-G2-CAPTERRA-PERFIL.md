# Perfil de Tentare para G2 y Capterra — borrador para copiar/pegar

Fecha: 2026-08-13. Esto NO crea ninguna cuenta ni envía ningún formulario — no
puedo hacer eso por ti (crear cuentas es una acción que me está vetada, incluso
si me lo pides directamente). Lo que sí puedo hacer es dejarte el proceso y el
texto listos para que lo pegues tú en 10-15 minutos.

Todo el contenido de abajo sale de código verificado del repo (`lib/legal-info.ts`,
`lib/billing/entitlements.ts`, `docs/SEO-ARQUITECTURA-PLAN.md §1`) — nada
inventado. Los campos que necesitan un dato tuyo llevan `⚠️ TU DATO`.

---

## 1. Antes de nada: dónde y en qué orden

**G2 y Capterra son empresas distintas** (G2 Inc. vs. Gartner Digital Markets),
pero Capterra, GetApp y Software Advice **son la misma empresa (Gartner)** — al
listar en Capterra, normalmente el mismo perfil aparece replicado en GetApp y
Software Advice sin trabajo extra. Empieza por Capterra por eso: un envío, tres
directorios.

1. **Capterra** → `https://www.capterra.com/vendors/` — crea la cuenta de
   vendedor, rellena el formulario de producto.
2. **G2** → `https://sell.g2.com/create-free-profile` (o el formulario de
   envío de producto en `g2.com`) — el equipo de G2 verifica en 3-5 días
   laborables antes de publicarlo, y tú reclamas el perfil después.

**Restricción real de G2 a tener en cuenta**: no acepta productos B2C ni en
fase alpha/beta. Tentare es B2B (vendes a la propietaria del estudio, no a la
alumna) y está en producción con clientas reales — cumple el requisito, pero
confírmalo tú al rellenar el formulario tal cual: "SaaS B2B en producción,
lanzado en 2026".

---

## 2. Identidad — campos que van igual en los dos

| Campo | Valor |
|---|---|
| Nombre del producto | Tentare |
| Nombre de la empresa/vendedor | ⚠️ TU DATO — legalmente hoy Tentare opera como autónomo (`Marcos Roca Rodríguez`, NIF `27361301H`, domicilio Barcelona — `lib/legal-info.ts`). Algunos formularios piden razón social de empresa; decide si pones tu nombre de autónomo o si prefieres esperar a tener una S.L. antes de publicar el perfil — es una decisión de negocio, no técnica, y no la tomo por ti. |
| Web | https://www.tentare.app |
| Email de contacto | hola@tentare.app |
| País | España |
| Idioma del producto | Español |
| Año de lanzamiento | ⚠️ TU DATO (no está en el repo — cuándo empezó a operar Tentare con clientas reales) |
| Logo | `docs/marca/` tiene el kit oficial — usa el PNG cuadrado, no el horizontal, la mayoría de estos formularios piden logo 1:1 |
| Categoría principal | **Gym Management Software** (G2) / **Gym Management Software** (Capterra) |
| Categorías secundarias | Scheduling Software, Class Booking / Fitness Studio Software |

---

## 3. Tagline / frase corta (≤100 caracteres)

> Software de gestión para estudios de Pilates en España — reservas, cobros y
> sustituciones de instructoras.

(Si el campo es más corto, recorta a: "Software para estudios de Pilates: reservas, cobros y sustituciones.")

---

## 4. Descripción larga (500-1000 caracteres, formato Capterra)

> Tentare es el software de gestión para estudios de Pilates en España. Cubre
> reservas online con lista de espera automática, calendario con capacidad por
> reformer, gestión de instructoras (disponibilidad, tarifas, liquidaciones),
> bonos y cuotas, cobro recurrente con SEPA y recuperación de impagos, y
> facturación con Veri*Factu nativo (firma y envío a la AEAT). Su diferencial
> es el motor de sustituciones: cuando una instructora avisa de que no puede
> dar su clase, el sistema busca candidatas por afinidad, las contacta, escala
> si no responden y avisa a las alumnas — con cuatro niveles de autonomía que
> decide el estudio. Precio público desde 29€/mes, sin permanencia, con 14
> días de prueba.

(1,020 caracteres aprox. — si el límite es 1000 exactos, corta la última
frase a "Precio público desde 29€/mes, sin permanencia.")

---

## 5. Lista de funcionalidades (marca las casillas que ofrezca cada formulario)

Solo lo verificado en código — no marques nada de esta lista que no aparezca
aquí, aunque el formulario lo sugiera como casilla habitual del sector:

- Reservas online / booking
- Lista de espera automática
- Calendario y gestión de salas
- Control de aforo / capacidad por puesto
- Gestión de disponibilidad de instructoras
- Sustitución automática de instructoras *(diferencial — pocos competidores lo marcan)*
- Control de asistencia / check-in (QR, código corto, automático)
- Bonos, cuotas y membresías
- Cobro recurrente / pagos automáticos
- Domiciliación bancaria SEPA
- Facturación electrónica (Veri*Factu, España)
- CRM / ficha de cliente
- Notas de salud / condiciones de alumna *(describir como "ayuda operativa", nunca como "historia clínica" — ver `docs/FICHA-CLINICA.md`)*
- Automatizaciones y avisos (email, WhatsApp, push, SMS)
- Informes de ocupación y rentabilidad
- App de marca instalable (PWA) — **no marcar "app nativa iOS/Android"**, no la hay
- Multi-sede / cadena de centros

**No marcar** (no existen o están congeladas, `lib/frozen-features.ts`): POS/TPV,
kiosko de check-in en tablet, vídeo bajo demanda, comunidad/foro, marketplace de
clientas nuevas, integración con básculas o wearables.

---

## 6. Precios (formato tabla de Capterra)

| Plan | Precio | Qué incluye (`lib/billing/entitlements.ts`, `PLAN_INFO`) |
|---|---|---|
| Base | 29€/mes | Reservas, cobros y check-in. Hasta 150 socias. |
| Estudio | 59€/mes | Socias ilimitadas + gamificación, marketing e IA. |
| Cadena | 149€/mes | Multi-centro y todo incluido. |

Sin permanencia. Prueba gratuita: **14 días** (`TRIAL_DIAS`, `lib/billing/entitlements.ts`).

---

## 7. Preguntas típicas del formulario que necesitan tu respuesta directa

Estas no las puedo rellenar por ti porque son decisiones de negocio, no hechos
del código:

1. **Tamaño de empresa objetivo** (ambos piden "small/medium/enterprise") —
   probablemente "Self-employed" y "Small business (2-50 employees)" dado el
   ICP de un estudio de Pilates.
2. **Número de clientes actuales** — si lo piden, usa una cifra real que
   puedas defender (la memoria del proyecto apunta a datos sembrados de
   `studio-1` como referencia interna, no como cifra de marketing pública —
   no inventes un número).
3. **Capturas de pantalla** (Capterra pide mínimo 3-5) — necesitas capturas
   reales del panel, anonimizadas. Esto ya estaba señalado como pendiente en
   `docs/SEO-ARQUITECTURA-PLAN.md §11.5` — sin credenciales de sesión de
   prueba en este entorno no puedo generarlas por ti.
4. **Vídeo demo** (opcional en ambos, mejora el ranking en Capterra) — mismo
   bloqueo que las capturas.
5. **Verificación de propiedad** — ambos piden confirmar que gestionas el
   dominio tentare.app (por email al dominio o meta tag) — solo tú puedes
   completar ese paso.

---

## 8. Después de publicar

- Guarda el enlace del perfil de G2 y Capterra aquí o donde prefieras — hace
  falta para la siguiente pieza del plan (pedir reseñas reales, §18 de
  `SEO-AI-MASTERPLAN.md`), que no se hace hasta que el perfil esté aprobado y
  en vivo.
- No pidas reseñas todavía — eso es el siguiente paso del plan, después de que
  el perfil esté aprobado.
