/**
 * Tema Oliva. Es la única fuente de verdad del tema: colores y radios
 * viven en tokens.css, y todo lo que decide comportamiento o composición
 * (bloques del Inicio, estilo de barra, cabecera del detalle) vive aquí.
 */
import type { ThemeConfig } from "../../components/portal-tema/tipos-tema";

export const THEME: ThemeConfig = {
  "id": "oliva",
  "name": "Oliva",
  "version": "1.0.0",
  "studio": "Estudio Oliva",
  "tagline": "Sereno y boutique. Verde oliva sobre crema, mucho aire y la clase de hoy por delante de todo.",
  "features": {
    "welcome_style": "photo",
    "welcome_curves": false,
    "welcome_seal": false,
    "welcome_cta_circle": false,
    "greeting_style": "display-first",
    "hero_badge": true,
    "quick_links_style": "cards",
    "tab_bar_style": "classic",
    "tab_icon_fill": true,
    "detail_style": "card"
  },
  "home_blocks": [
    "greeting",
    "next-class",
    "quick-links",
    "week-strip"
  ],
  "member_name": "Laura Ortega",
  "member_initial": "L",
  "welcome": {
    "line1": "Muévete",
    "line2": "con propósito",
    "text": "Fuerza. Equilibrio. Mente.\nTodo en un sitio.",
    "cta": "Empezar"
  },
  "fonts": {
    "families": [
      "Outfit:wght@400;500;600;700",
      "Plus+Jakarta+Sans:wght@400;500;600;700"
    ],
    "display": "Outfit",
    "body": "Plus Jakarta Sans"
  },
  "designSystem": {
    "palette": [
      {
        "name": "Marca",
        "value": "#3D4A2F",
        "role": "Botones principales, día activo, relleno del anillo.",
        "ratio": 8.5
      },
      {
        "name": "Sobre marca",
        "value": "#F5F3ED",
        "role": "Texto e iconos encima de la marca.",
        "ratio": 8.5
      },
      {
        "name": "Apoyo",
        "value": "#A8B394",
        "role": "Superficie suave: avatar, estado reservada, barras.",
        "ratio": 6.3
      },
      {
        "name": "Acento",
        "value": "#3D4A2F",
        "role": "Coincide con la marca: Oliva no tiene tercer color.",
        "ratio": 8.5
      },
      {
        "name": "Fondo",
        "value": "#F5F3ED",
        "role": "Lienzo del portal y de la web pública.",
        "ratio": 0
      },
      {
        "name": "Superficie",
        "value": "#FFFFFF",
        "role": "Tarjetas, hojas y campos.",
        "ratio": 0
      },
      {
        "name": "Borde",
        "value": "#E6E3D9",
        "role": "Un solo borde de 1px para todo.",
        "ratio": 0
      },
      {
        "name": "Tinta",
        "value": "#2A2E22",
        "role": "Titulares y texto principal.",
        "ratio": 12.5
      },
      {
        "name": "Apoyo de texto",
        "value": "#7C8070",
        "role": "Metadatos, notas y estados en reposo.",
        "ratio": 3.7
      },
      {
        "name": "Bisel",
        "value": "#DEDCD4",
        "role": "Marco del teléfono en el editor.",
        "ratio": 0
      },
      {
        "name": "Éxito",
        "value": "#2F6B4F",
        "role": "Asistida, pago confirmado.",
        "ratio": 5.7
      },
      {
        "name": "Error",
        "value": "#A33B3B",
        "role": "Campo inválido, pago rechazado.",
        "ratio": 5.8
      }
    ],
    "type": [
      {
        "token": "welcome",
        "family": "display",
        "size": 46,
        "leading": 1.06,
        "weight": 700,
        "tracking": "-.03em",
        "sample": "Muévete con propósito"
      },
      {
        "token": "screen-title",
        "family": "display",
        "size": 30,
        "leading": 1.1,
        "weight": 700,
        "sample": "Mis reservas"
      },
      {
        "token": "hero-title",
        "family": "display",
        "size": 25,
        "leading": 1.08,
        "weight": 700,
        "sample": "Pilates Reformer"
      },
      {
        "token": "section",
        "family": "display",
        "size": 17,
        "leading": 1.2,
        "weight": 700,
        "sample": "Accesos rápidos"
      },
      {
        "token": "pass-number",
        "family": "display",
        "size": 60,
        "leading": 0.85,
        "weight": 700,
        "sample": "7"
      },
      {
        "token": "timer",
        "family": "display",
        "size": 40,
        "leading": 1,
        "weight": 700,
        "tracking": "-.03em",
        "sample": "00:45"
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
        "sample": "Sala 2 · Intermedio"
      },
      {
        "token": "micro",
        "family": "body",
        "size": 10.5,
        "leading": 1.3,
        "weight": 600,
        "tracking": ".06em",
        "sample": "RESERVADA"
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
        "value": 26
      },
      {
        "name": "Botón",
        "value": 20
      },
      {
        "name": "Campo",
        "value": 16
      },
      {
        "name": "Acceso rápido",
        "value": 20
      },
      {
        "name": "Hoja",
        "value": 34
      },
      {
        "name": "Teléfono",
        "value": 46
      }
    ],
    "shadows": [
      {
        "name": "Tarjeta",
        "value": "0 0 0 0 transparent"
      },
      {
        "name": "Tarjeta al pasar",
        "value": "0 18px 40px -26px rgba(20,28,22,.45)"
      },
      {
        "name": "Flotante",
        "value": "0 16px 40px -18px rgba(20,28,22,.4)"
      }
    ],
    "colorNote": "Oliva no tiene tercer color: su carácter es el contraste oliva sobre crema y el aire entre piezas. El acento coincide con la marca a propósito."
  }
};

export default THEME;
