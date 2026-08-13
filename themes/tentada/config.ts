/**
 * Tema Tentada — el PREDETERMINADO de la app de la alumna.
 *
 * Sale del prototipo "Balance App" de Claude Design (proyecto f706a211), leído
 * con el MCP y medido sobre su HTML. Como el resto de temas, es solo datos: el
 * color y el radio viven en `tokens.css`, y aquí vive lo que decide
 * composición y comportamiento.
 *
 * Lo que hace a Tentada distinta de Oliva/Bloom/Noir son tres cosas, y las
 * tres son bloques o banderas, no código propio:
 *
 *  1. La cabecera del Inicio es una FOTO a sangre con el saludo encima en
 *     serif grande (`home-header`), en vez de la fila avatar + nombre.
 *  2. La próxima clase es un BILLETE troquelado, no una tarjeta con foto
 *     (`next_class_style: "ticket"`).
 *  3. Debajo van tres bloques que el kit no tenía: el horario de hoy
 *     (`today-timeline`), el bono con una semilla por sesión (`pass-card`) y
 *     las reservas de la socia (`bookings-list`).
 *
 * ⚠️ La racha y el pie firmado SÍ están, pero CALCULADOS, no copiados. En el
 * prototipo «6 semanas seguidas — tu mejor racha» y «DESDE 2019» son texto
 * fijo; aquí la racha sale de `rachaDe()` (semanas seguidas con al menos una
 * ASISTIDA) y el año de `studios.anio_fundacion`. Los dos bloques se callan
 * cuando no hay dato: sin dos semanas seguidas no hay píldora, y sin año la
 * firma va sin año. Pintar una racha que nadie calcula es el patrón que ya
 * costó quitar el «Compatibilidad 87 %» de sustituciones.
 */
import type { ThemeConfig } from "../../components/portal-tema/tipos-tema";

export const THEME: ThemeConfig = {
  "id": "tentada",
  "name": "Tentada",
  "version": "1.0.0",
  "studio": "Estudio Tentada",
  "tagline": "Verde profundo sobre crema y titulares en Garamond. El tema de casa: cálido, editorial y con la clase de hoy siempre por delante.",
  "features": {
    "welcome_style": "photo",
    "welcome_curves": false,
    "welcome_seal": false,
    "welcome_cta_circle": false,
    // La cabecera con foto ya trae el saludo, así que el bloque `greeting`
    // (avatar + micro + nombre) no se instala. `greeting_style` se queda en el
    // valor que no invierte la jerarquía por si alguien reactiva ese bloque.
    "greeting_style": "micro-first",
    "hero_badge": false,
    "quick_links_style": "cards",
    "tab_bar_style": "classic",
    "tab_icon_fill": false,
    "detail_style": "card",
    "next_class_style": "ticket",
    "week_strip_style": "bare",
    "tab_set": "centro"
  },
  "home_blocks": [
    "home-header",
    "next-class",
    "streak-pill",
    "today-timeline",
    "pass-card",
    "week-strip",
    "bookings-list",
    "videos-cta",
    "studio-quote"
  ],
  "member_name": "Laura Gómez",
  "member_initial": "L",
  "greeting_note": "hoy toca cuidarte",
  "closing_quote": "Respira. Estás justo donde tienes que estar.",
  "welcome": {
    "line1": "Tu espacio",
    "line2": "para sentirte bien",
    "text": "Reserva en segundos y lleva tus bonos,\ntu progreso y los avisos del estudio contigo.",
    "cta": "Empezar"
  },
  "fonts": {
    "families": [
      "Cormorant+Garamond:ital,wght@0,500;0,600;1,400;1,500;1,600",
      "Plus+Jakarta+Sans:wght@400;500;600;700;800"
    ],
    "display": "Cormorant Garamond",
    "body": "Plus Jakarta Sans"
  },
  "designSystem": {
    "palette": [
      {
        "name": "Marca",
        "value": "#333B24",
        "role": "Botones principales, día activo, semillas del bono, clase reservada.",
        "ratio": 10.7
      },
      {
        "name": "Sobre marca",
        "value": "#F6F3EB",
        "role": "Texto e iconos encima de la marca.",
        "ratio": 10.7
      },
      {
        "name": "Apoyo",
        "value": "#ECDFD2",
        "role": "Arena cálida: el bloque de vídeos para casa y los estados hechos.",
        "ratio": 0
      },
      {
        "name": "Acento",
        "value": "#333B24",
        "role": "Coincide con la marca: Tentada no tiene tercer color.",
        "ratio": 10.7
      },
      {
        "name": "Fondo",
        "value": "#F6F3EB",
        "role": "Lienzo del portal y de la web pública.",
        "ratio": 0
      },
      {
        "name": "Superficie",
        "value": "#FFFFFF",
        "role": "Tarjetas, billete, hojas y campos.",
        "ratio": 0
      },
      {
        "name": "Borde",
        "value": "#E8E4D7",
        "role": "Un solo borde de 1px para todo.",
        "ratio": 0
      },
      {
        "name": "Tinta",
        "value": "#22261B",
        "role": "Titulares y texto principal.",
        "ratio": 14.2
      },
      {
        "name": "Apoyo de texto",
        "value": "#8A8C7E",
        "role": "Metadatos, rótulos de sección y estados en reposo.",
        "ratio": 3.3
      },
      {
        "name": "Bisel",
        "value": "#3A3A34",
        "role": "Marco del teléfono en el editor.",
        "ratio": 0
      },
      {
        "name": "Éxito",
        "value": "#3F6B4A",
        "role": "Asistida, pago confirmado.",
        "ratio": 5.4
      },
      {
        "name": "Error",
        "value": "#B4452F",
        "role": "Cancelar reserva, campo inválido, pago rechazado.",
        "ratio": 5.1
      }
    ],
    "type": [
      {
        "token": "welcome",
        "family": "body",
        "size": 25,
        "leading": 1.28,
        "weight": 700,
        "tracking": "-.01em",
        "sample": "Tu espacio para sentirte bien"
      },
      {
        "token": "screen-title",
        "family": "body",
        "size": 26,
        "leading": 1.1,
        "weight": 800,
        "tracking": "-.02em",
        "sample": "Mis reservas"
      },
      {
        "token": "greeting",
        "family": "display",
        "size": 44,
        "leading": 0.98,
        "weight": 500,
        "tracking": ".005em",
        "sample": "Hola, Laura"
      },
      {
        "token": "hero-title",
        "family": "display",
        "size": 25,
        "leading": 1.05,
        "weight": 500,
        "sample": "Reformer Intermedio"
      },
      {
        "token": "section",
        "family": "body",
        "size": 20,
        "leading": 1.2,
        "weight": 700,
        "sample": "Hoy en el estudio"
      },
      {
        "token": "pass-number",
        "family": "display",
        "size": 18,
        "leading": 1.1,
        "weight": 600,
        "sample": "quedan 8 clases"
      },
      {
        "token": "body",
        "family": "body",
        "size": 13,
        "leading": 1.6,
        "weight": 400,
        "tracking": "0",
        "sample": "Clase dinámica para trabajar fuerza, flexibilidad y control."
      },
      {
        "token": "meta",
        "family": "body",
        "size": 11.5,
        "leading": 1.5,
        "weight": 500,
        "tracking": "0",
        "sample": "con Marta · Sala 1 · 50 min"
      },
      {
        "token": "micro",
        "family": "body",
        "size": 9.5,
        "leading": 1.3,
        "weight": 700,
        "tracking": ".18em",
        "sample": "TU PRÓXIMA CLASE"
      }
    ],
    "spacing": [
      4,
      8,
      12,
      16,
      20,
      24,
      32,
      40,
      56
    ],
    "radii": [
      {
        "name": "Tarjeta",
        "value": 20
      },
      {
        "name": "Botón",
        "value": 16
      },
      {
        "name": "Campo",
        "value": 14
      },
      {
        "name": "Acceso rápido",
        "value": 18
      },
      {
        "name": "Hoja",
        "value": 28
      },
      {
        "name": "Teléfono",
        "value": 56
      }
    ],
    "shadows": [
      {
        "name": "Tarjeta",
        "value": "0 0 0 0 transparent"
      },
      {
        "name": "Tarjeta al pasar",
        "value": "0 20px 44px -24px rgba(24,27,15,.42)"
      },
      {
        "name": "Flotante",
        "value": "0 22px 48px -22px rgba(24,27,15,.5)"
      }
    ],
    "colorNote": "Tentada no tiene tercer color: su carácter es el verde profundo sobre crema y la Garamond en los titulares. El arena (#ECDFD2) es superficie —el bloque de vídeos para casa—, no un acento con el que pintar texto."
  }
};

export default THEME;
