/**
 * Tema Noir. Es la única fuente de verdad del tema: colores y radios
 * viven en tokens.css, y todo lo que decide comportamiento o composición
 * (bloques del Inicio, estilo de barra, cabecera del detalle) vive aquí.
 */
import type { ThemeConfig } from "../../components/portal-tema/tipos-tema";

export const THEME: ThemeConfig = {
  "id": "noir",
  "name": "Noir",
  "version": "1.0.0",
  "studio": "Estudio Noir",
  "tagline": "Premium y medido. Verde profundo con dorado que nunca rellena, anillo de progreso y accesos en círculo.",
  "features": {
    "welcome_style": "dark",
    "welcome_curves": false,
    "welcome_seal": true,
    "welcome_cta_circle": false,
    "greeting_style": "micro-first",
    "hero_badge": false,
    "quick_links_style": "bare",
    "tab_bar_style": "classic",
    "tab_icon_fill": false,
    "detail_style": "bleed"
  },
  "home_blocks": [
    "greeting",
    "next-class",
    "weekly-progress",
    "quick-links"
  ],
  "member_name": "Clara",
  "member_initial": "C",
  "welcome": {
    "line1": "Muévete mejor,",
    "line2": "siéntete fuerte.",
    "text": "Pilates para todos los cuerpos,\ntodos los niveles, todas las metas.",
    "cta": "Empezar"
  },
  "fonts": {
    "families": [
      "Instrument+Sans:wght@400;500;600;700",
      "Plus+Jakarta+Sans:wght@400;500;600;700"
    ],
    "display": "Instrument Sans",
    "body": "Plus Jakarta Sans"
  },
  "designSystem": {
    "palette": [
      {
        "name": "Marca",
        "value": "#1E2B22",
        "role": "Botones principales, día activo, relleno del anillo.",
        "ratio": 13.5
      },
      {
        "name": "Sobre marca",
        "value": "#F6F5F0",
        "role": "Texto e iconos encima de la marca.",
        "ratio": 13.5
      },
      {
        "name": "Apoyo",
        "value": "#A9B79B",
        "role": "Superficie suave: avatar, estado reservada, barras.",
        "ratio": 7.9
      },
      {
        "name": "Acento",
        "value": "#D9B166",
        "role": "Solo trazo: icono activo, flecha, punto de aviso.",
        "ratio": 1.8
      },
      {
        "name": "Fondo",
        "value": "#F6F5F0",
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
        "value": "#E9E7DD",
        "role": "Un solo borde de 1px para todo.",
        "ratio": 0
      },
      {
        "name": "Tinta",
        "value": "#17201A",
        "role": "Titulares y texto principal.",
        "ratio": 15.3
      },
      {
        "name": "Apoyo de texto",
        "value": "#6E7668",
        "role": "Metadatos, notas y estados en reposo.",
        "ratio": 4.3
      },
      {
        "name": "Bisel",
        "value": "#2B2F2A",
        "role": "Marco del teléfono en el editor.",
        "ratio": 0
      },
      {
        "name": "Éxito",
        "value": "#2F6B4F",
        "role": "Asistida, pago confirmado.",
        "ratio": 5.8
      },
      {
        "name": "Error",
        "value": "#A33B3B",
        "role": "Campo inválido, pago rechazado.",
        "ratio": 5.9
      }
    ],
    "type": [
      {
        "token": "welcome",
        "family": "display",
        "size": 40,
        "leading": 1.06,
        "weight": 700,
        "tracking": "-.03em",
        "sample": "Muévete mejor, siéntete fuerte."
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
        "size": 26,
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
        "value": 24
      },
      {
        "name": "Botón",
        "value": 18
      },
      {
        "name": "Campo",
        "value": 14
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
        "value": "0 12px 30px -24px rgba(23,32,26,.5)"
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
    "colorNote": "El dorado nunca rellena: es icono activo, flecha, punto de aviso y borde de reservada. Como fondo con texto claro da 1,9:1 y rompe el tema."
  }
};

export default THEME;
