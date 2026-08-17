/**
 * Tema Sereno — la nueva app de alumna (neutro-premium wellness).
 *
 * MISMO CONTRATO que los cuatro temas existentes: rellena `ThemeConfig` de
 * `components/portal-tema/tipos-tema.ts` y se da de alta en
 * `themes/registro.ts` (import + entrada en TEMAS_PORTAL + id en el union).
 * Solo datos: el color y el radio viven en `tokens.css`; aquí lo que decide
 * composición y comportamiento.
 *
 * Fuentes: Libre Caslon Text (titulares) y Figtree (cuerpo) son familias
 * NUEVAS para el repo — registradas con next/font en app/layout.tsx (mismo
 * camino que Cormorant Garamond para Tentada) y expuestas como
 * --font-libre-caslon / --font-figtree, que es lo que tokens.css consume.
 *
 * La spec visual/interactiva de cada pantalla es el prototipo
 * `Tentare App Alumna.dc.html` que entregó Claude Design con este tema.
 *
 * ⚠️ `member_name`/`member_initial`/`greeting_note` son datos de MUESTRA para
 * la previsualización, igual que en los otros cuatro temas: en el portal real
 * los pisa la socia de verdad (ver `profile` en `useViewModel`, que solo cae
 * al valor del tema si el dato viene vacío). `closing_quote` y `welcome` sí
 * son COPY del tema.
 */
import type { ThemeConfig } from "../../components/portal-tema/tipos-tema";

export const THEME: ThemeConfig = {
  "id": "sereno",
  "name": "Sereno",
  "version": "1.0.0",
  "studio": "Aura Pilates",
  "tagline": "Porcelana cálida, tinta y un acento malva. Titulares en Libre Caslon: calma editorial con la próxima clase siempre a un toque.",
  "features": {
    "welcome_style": "photo",
    "welcome_curves": false,
    "welcome_seal": false,
    "welcome_cta_circle": false,
    "greeting_style": "date-first",
    "hero_badge": false,
    "hero_chip": true,
    "quick_links_style": "cards",
    "tab_bar_style": "floating",
    "tab_icon_fill": false,
    "tab_labels": "todas",
    "detail_style": "bleed",
    "next_class_style": "hero",
    "week_strip_style": "card",
    // ⚠️ `agenda`, no el `basico` que traía el paquete: con `basico` la tercera
    // pestaña se rotula «Reservas» y el prototipo la llama «Agenda» (lo señala
    // el propio README, §9.4). Ver `TabSet` para por qué no se hace por
    // `lib/portal-nav.ts` como sugería.
    "tab_set": "agenda",
    "schedule_style": "chips",
    "passes_style": "plan",
    "profile_style": "card"
  },
  "home_blocks": [
    "greeting",
    "waitlist-banner",
    "next-class",
    "pass-card",
    "quick-links",
    "bookings-list",
    "studio-quote"
  ],
  "member_name": "Laura Gómez",
  "member_initial": "L",
  "greeting_note": "hoy toca cuidarte",
  "closing_quote": "Respira hondo. El resto puede esperar.",
  "welcome": {
    "line1": "Tu espacio",
    "line2": "para sentirte bien",
    // Sin salto de línea a mano: `.welcome__text` es `pre-line` y ya tiene su
    // medida (32ch), así que el `\n` del paquete partía la frase por un sitio
    // que no era el suyo — «…lleva tus bonos» / «y los avisos…». Medido en el
    // navegador; el prototipo tampoco lo lleva.
    "text": "Reserva tus clases en segundos y lleva tus bonos y los avisos de tu estudio contigo.",
    "cta": "Empezar"
  },
  "fonts": {
    "families": [
      "Libre+Caslon+Text:ital,wght@0,400;0,700;1,400",
      "Figtree:wght@300;400;500;600;700"
    ],
    "display": "var(--font-libre-caslon), Georgia, serif",
    "body": "var(--font-figtree), system-ui, sans-serif"
  },
  "designSystem": {
    "palette": [
      { "name": "Tinta", "value": "#221F1C", "role": "texto / marca / CTA", "ratio": 14.8 },
      { "name": "Porcelana", "value": "#F6F4F1", "role": "fondo", "ratio": 0 },
      { "name": "Blanco", "value": "#FFFFFF", "role": "superficie", "ratio": 0 },
      { "name": "Línea", "value": "#E7E3DC", "role": "bordes", "ratio": 0 },
      { "name": "Apagado", "value": "#85807A", "role": "texto secundario", "ratio": 3.5 },
      { "name": "Malva", "value": "#8A6478", "role": "acento: badges, dots, enlaces (nunca fondo de texto largo)", "ratio": 4.7 },
      { "name": "Éxito", "value": "#47694F", "role": "confirmaciones, plazas libres", "ratio": 5.3 },
      { "name": "Aviso", "value": "#97722F", "role": "últimas plazas, sin devolución", "ratio": 3.6 },
      { "name": "Peligro", "value": "#A34242", "role": "cancelar, errores", "ratio": 4.6 }
    ],
    "type": [
      { "token": "welcome", "family": "display", "size": 34, "leading": 1.12, "weight": 400, "sample": "Tu espacio para sentirte bien" },
      { "token": "screen-title", "family": "display", "size": 30, "leading": 1.1, "weight": 400, "sample": "Hola, Laura" },
      { "token": "hero-title", "family": "display", "size": 22, "leading": 1.15, "weight": 400, "sample": "Pilates Reformer" },
      { "token": "pass-number", "family": "display", "size": 60, "leading": 0.9, "weight": 400, "sample": "8" },
      { "token": "section", "family": "body", "size": 11, "leading": 1.2, "weight": 600, "tracking": ".14em", "sample": "TU PRÓXIMA CLASE" },
      { "token": "body", "family": "body", "size": 14, "leading": 1.5, "weight": 400, "sample": "Con Marta · Sala 2" },
      { "token": "caption", "family": "body", "size": 12, "leading": 1.4, "weight": 500, "sample": "Caduca el 30 de septiembre" }
    ],
    "spacing": [4, 8, 12, 16, 20, 24, 32, 40, 56],
    "radii": [
      { "name": "card", "value": 22 },
      { "name": "card-sm", "value": 16 },
      { "name": "button", "value": 16 },
      { "name": "chip", "value": 999 },
      { "name": "input", "value": 13 },
      { "name": "quick-link", "value": 18 },
      { "name": "sheet", "value": 26 },
      { "name": "tabbar", "value": 22 }
    ],
    "shadows": [
      { "name": "card", "value": "0 18px 40px -30px rgba(34,31,28,.35)" },
      { "name": "control", "value": "0 14px 30px -14px rgba(34,31,28,.5)" },
      { "name": "float", "value": "0 20px 44px -20px rgba(34,31,28,.35)" }
    ],
    "colorNote": "La tinta hace de marca: los CTA son oscuros, no de acento. El malva señala estado y foco (badges, dots, lista de espera) y jamás rellena superficies con texto largo. Semánticos reservados a su significado."
  }
};

export default THEME;
