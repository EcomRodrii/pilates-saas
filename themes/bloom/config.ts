/**
 * Tema Bloom. Es la única fuente de verdad del tema: colores y radios
 * viven en tokens.css, y todo lo que decide comportamiento o composición
 * (bloques del Inicio, estilo de barra, cabecera del detalle) vive aquí.
 */
import type { ThemeConfig } from "../../components/portal-tema/tipos-tema";

export const THEME: ThemeConfig = {
  "id": "bloom",
  "name": "Bloom",
  "version": "1.0.0",
  "studio": "Estudio Bloom",
  "tagline": "Vivo y cercano. Violeta y rosa, todo en píldora, barra flotante y retos que empujan a volver.",
  "features": {
    "welcome_style": "soft",
    "welcome_curves": true,
    "welcome_seal": false,
    "welcome_cta_circle": true,
    "greeting_style": "micro-first",
    "hero_badge": false,
    "quick_links_style": "cards",
    "tab_bar_style": "floating",
    "tab_icon_fill": false,
    "detail_style": "bleed",
    // La tarjeta con foto y velo de siempre. El billete troquelado es de
    // Tentada (ver `NextClassStyle` en tipos-tema.ts).
    "next_class_style": "hero",
    // La tarjeta «Esta semana» de siempre. La fila desnuda es de Tentada.
    "week_strip_style": "card",
    // Las cuatro de siempre. La barra de cinco con «Mi centro» es de Tentada.
    "tab_set": "basico"
  },
  "home_blocks": [
    "greeting",
    "headline",
    "next-class",
    "challenges",
    "quick-links"
  ],
  "member_name": "Laura Ortega",
  "member_initial": "L",
  "welcome": {
    "line1": "Empieza tu camino",
    "line2": "a la fuerza",
    "text": "Gana fuerza, mejora tu flexibilidad y siéntete con energía cada día.",
    "cta": "Siguiente"
  },
  "fonts": {
    "families": [
      "Poppins:wght@400;500;600;700"
    ],
    "display": "Poppins",
    "body": "Poppins"
  },
  "designSystem": {
    "palette": [
      {
        "name": "Marca",
        "value": "#7C5CFC",
        "role": "Botones principales, día activo, relleno del anillo.",
        "ratio": 4.4
      },
      {
        "name": "Sobre marca",
        "value": "#FFFFFF",
        "role": "Texto e iconos encima de la marca.",
        "ratio": 4.4
      },
      {
        "name": "Apoyo",
        "value": "#EFEAFF",
        "role": "Superficie suave: avatar, estado reservada, barras.",
        "ratio": 15
      },
      {
        "name": "Acento",
        "value": "#FF8FB1",
        "role": "Favoritas y un reto. Nunca rellena botones.",
        "ratio": 2.1
      },
      {
        "name": "Fondo",
        "value": "#FFFFFF",
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
        "value": "#EEEAFB",
        "role": "Un solo borde de 1px para todo.",
        "ratio": 0
      },
      {
        "name": "Tinta",
        "value": "#1B1430",
        "role": "Titulares y texto principal.",
        "ratio": 17.7
      },
      {
        "name": "Apoyo de texto",
        "value": "#6F6785",
        "role": "Metadatos, notas y estados en reposo.",
        "ratio": 5.3
      },
      {
        "name": "Bisel",
        "value": "#F0A87E",
        "role": "Marco del teléfono en el editor.",
        "ratio": 0
      },
      {
        "name": "Éxito",
        "value": "#2F6B4F",
        "role": "Asistida, pago confirmado.",
        "ratio": 6.3
      },
      {
        "name": "Error",
        "value": "#A33B3B",
        "role": "Campo inválido, pago rechazado.",
        "ratio": 6.5
      }
    ],
    "type": [
      {
        "token": "welcome",
        "family": "display",
        "size": 33,
        "leading": 1.18,
        "weight": 700,
        "tracking": "-.03em",
        "sample": "Empieza tu camino a la fuerza"
      },
      {
        "token": "screen-title",
        "family": "display",
        "size": 28,
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
        "size": 20,
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
        "value": 30
      },
      {
        "name": "Botón",
        "value": 999
      },
      {
        "name": "Campo",
        "value": 999
      },
      {
        "name": "Acceso rápido",
        "value": 22
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
        "value": "0 12px 30px -22px rgba(60,40,90,.4)"
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
    "colorNote": "El rosa es acento, no marca: aparece en el corazón de favoritas y en un reto. Si rellena botones, Bloom deja de leerse."
  },
  "headline": "Bienvenida a tu sesión"
};

export default THEME;
