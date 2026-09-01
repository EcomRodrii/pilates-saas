# HANDOFF — Diseño "Tentare Studio App" → portal real (`app/portal/[slug]`)

> Para Claude Code. El diseño de referencia es el prototipo `Tentare Studio App (standalone).html`
> (ábrelo en un navegador — es funcional). NO es código portable: es un runtime de prototipado.
> Este documento traduce ese diseño a NUESTRO stack: Next.js 16 + Tailwind v4 + shadcn + lucide-react.
> **No crear rutas nuevas**: todas las pantallas ya existen en `app/portal/[slug]/*`. Es un re-estilizado
> + añadir los bloques que falten dentro de las vistas existentes (`components/portal/*`).

## 0. Reglas
- Respetar la lógica y data-fetching existentes (`usar-datos-portal.ts`, vistas `portal-*-view.tsx`). Solo tocar presentación.
- El portal es white-label: donde el prototipo dice "Studio Alma" va el nombre/tema del estudio (`--portal-brand*`).
- Mobile-first: el portal se usa como PWA a 390px. Todo touch target ≥ 44px.
- No añadir librerías nuevas. Animaciones con CSS/`tw-animate-css`.

## 1. Tokens (prototipo → globals.css)
El prototipo usa una paleta cálida propia. Mapear así (NO hardcodear hex en componentes):

| Prototipo | Uso | Token real |
|---|---|---|
| `#FAF9F5` fondo app | fondo de pantalla | `--background` (portal theme) |
| `#fff` cards | superficie | `--card` |
| `#1A1A1A` tinta | texto principal | `--foreground` |
| `#5A5A52` / `#98A093` | secundario / terciario | `--muted-foreground` |
| `#E5E3DA` bordes | bordes card | `--border` |
| `#3E6B4A` / `#2E5A3A` verde | acento, badges plazas | `--portal-brand` (por estudio) |
| `#EAF0E7` verde suave | fondos de badge/éxito | `--portal-brand` al 10% (`/10`) |
| `#12291A` verde noche | card "Tu próxima clase" | `--portal-brand` oscurecido (usar overlay negro sobre foto + tinte brand) |
| `#C99A3C` ámbar | racha 🔥, avisos | `--warning` |
| `#EFEDE4` | pills neutras, barras vacías | `--secondary` |

Tipografía: títulos `font-heading` (Jakarta ya está), peso 800, tracking `-0.03em`.
Etiquetas de sección: `font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground`.
Radios: cards `rounded-2xl` (16px), hero cards `rounded-[20px]`, botones/pills `rounded-full`.

## 2. Sistema de motion (añadir a globals.css si no existen)
Keyframes del prototipo → equivalentes:
- `apUp`: fade + translateY(14px→0), .4–.5s, escalonado por item (`animation-delay: index*55ms`)
- `apPop`: scale .55→1.07→1, para confirmaciones y badges nuevos
- `apToast`: toasts entran desde arriba con spring `cubic-bezier(.34,1.4,.5,1)`
- `apKen`: Ken Burns lento (scale 1→1.09, 18s) SOLO en la foto del hero
- `apPulse`: opacidad 1→.35 en dots de "quedan N plazas"
- Press-scale en todo botón: `active:scale-[.97] transition-transform`
- Respetar `prefers-reduced-motion`.

## 3. Pantalla por pantalla (prototipo → fichero real)

### 3.1 Home — `components/portal/portal-home-view.tsx` (+ `bloques/`)
Orden exacto de bloques (el prototipo es la referencia visual):
1. **Hero fotográfico 314px**: foto del estudio a sangre, gradiente oscuro arriba y fundido al fondo abajo. Encima: marca del estudio (mono, uppercase, brand claro), fecha, "Buenos días, {nombre} 👋", H1 grande "¿Qué te apetece hoy?" (32px/800/-.035em), campana con dot, y buscador pill translúcido (`bg-background/95 backdrop-blur`).
2. **Card "Tu próxima clase"** (solo si hay reserva): foto de fondo + overlay verde-noche al 90%, texto claro; botones: "Ver mi acceso" (pill clara con mini-QR, abre `acceso/` — ya existe `hoja-pase.tsx`), "Cómo llegar", "+ Calendario".
3. **"Tu ritmo"**: card bono (barra de progreso brand, "quedan N" en mono) + card semana (7 dots L-D, asistidos en brand, racha "🔥 N sem." en warning) + par de cards "Mi progreso" (meta 3/sem) y "Reto del mes" (🏅, barra). Ya hay página `progreso/` — estas cards enlazan ahí.
4. **"Invita a una amiga"**: banner foto 112px, overlay izquierdo oscuro, titular italic 800, flecha en círculo claro → `invitar/`.
5. **"Tu estudio"**: carrusel horizontal (scroll-x, sin scrollbar) de cards 236×280 con foto a sangre, gradiente inferior, ★ rating y pill CTA → `clases/` e `instructores/`.
6. **"Huecos de hoy"**: filas hora (mono) + avatar instructora 34px + nombre clase + badge plazas (verde `N plazas` / ámbar `1 plaza`+pulse / gris `completa`).
7. **"Novedades del estudio"**: tablón, filas emoji + título 800 + subtexto muted.

### 3.2 Horario — `portal-clases-view.tsx`
- Cabecera foto 98px con nombre "Horario del estudio".
- Pills de día (Hoy/Mañana/…) con estado activo tinta-invertida; filtros Todo/Reformer/Mat/"Con hueco".
- Fila de clase: hora+duración (mono, columna 46px) | divisor 1px | nombre 800 + avatar 20px + instructora | badge plazas + precio/bono.
- Contador "N clases · día" en mono uppercase.

### 3.3 Reservas — `portal-reservas-view.tsx` + `hoja-reserva.tsx`
- Card reserva confirmada: fondo brand/10, "confirmada ✓", acciones Cómo llegar / +Calendario / Cancelar (destructive/10).
- Lista de espera: card con dot ámbar pulsante "eres la 2ª".
- Sheet de reserva (bottom sheet con handle, drag-para-cerrar): resumen clase + instructora + "Se usará 1 sesión de tu bono (N disponibles)" en brand/10 + política de cancelación + CTA único. Confirmación: check con anillo expandible (`apRing`) + microconfetti (6 partículas CSS) + acciones.
- Plaza fija semanal: bloque pausar/reanudar/baja (existe en `mi-plan/`).

### 3.4 Acceso QR — `components/portal/hoja-pase.tsx` (+ `acceso/`)
Pase a pantalla completa: fondo verde-noche, QR grande en card clara, nombre + clase + hora, "se valida solo" → estado ✓ verde con `apCheck`. Ya existe; alinear estilos.

### 3.5 Bonos y pagos — `portal-bonos-view.tsx`
- Card bono activo con barra y caducidad en mono; "Comprar otro →" en brand.
- Checkout: opciones de pago como cards seleccionables (radio visual), Apple Pay pill negra, recibo en historial.
- Si el bono llega a 0 → las clases muestran precio suelto (el prototipo lo demuestra).

### 3.6 Perfil — `portal-perfil-view.tsx`
Avatar iniciales brand/10, stats (clases mes / bono / favoritos), favoritos como mini-cards foto 96px, lista Cuenta (filas con chevron, `divide-y`): Bonos y pagos / Datos / Notificaciones / Ayuda.

### 3.7 Nav inferior — `portal-nav.tsx`
4 tabs: Hoy / Horario / Reservas / Perfil. Iconos lucide (Home, Search/Calendar, CalendarCheck, User) 21px + label 9.5px/800. Activo = foreground, inactivo = muted-foreground. Badge contador brand en Reservas. Fondo `bg-background/88 backdrop-blur border-t`.

### 3.8 Onboarding/bienvenida — `bienvenida-portal.tsx` + `push-prompt.tsx`
Splash foto full-bleed + logo, H1 editorial ("Muévete. Lo demás, ya está." — adaptar al copy del estudio), CTA clara + "Ya tengo cuenta". Permisos (ubicación/push) como cards centradas con emoji, botón primario + "Ahora no". `push-prompt.tsx` ya existe: darle este tratamiento.

## 4. Toasts y push in-app
- Toast: pill tinta (`bg-foreground text-background`), top-center, spring, autodismiss 2.3s.
- Banner push simulado (plaza liberada, recordatorio): card translúcida top con blur que hace deep-link a la clase.

## 5. Orden de implementación sugerido
1. Tokens/keyframes en `globals.css` (§1–2)
2. `portal-nav.tsx` + `portal-shell.tsx` (marco general)
3. Home (§3.1) — es el 60% del impacto
4. Horario + sheet de reserva (§3.2–3.3)
5. Bonos, perfil, acceso, onboarding

## 6. QA visual
Comparar cada pantalla a 390×844 contra el standalone. Criterios: jerarquía tipográfica idéntica, fotos a sangre (nunca thumbnail en card gris), badges de plazas con los 3 estados, motion presente pero discreto, cero scroll horizontal.
