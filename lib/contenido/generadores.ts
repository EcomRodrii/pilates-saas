// Generadores locales de respaldo. Si la API de IA no está disponible
// (p. ej. sin ANTHROPIC_API_KEY en el entorno), estas funciones producen un
// borrador con plantillas para que el módulo siga siendo usable en modo demo.

import type { Plataforma, TipoSlide } from './types';

export interface GuionGenerado {
  titulo: string;
  gancho: string;
  desarrollo: string;
  cta: string;
  descripcion: string;
  hashtags: string[];
  duracionSegundos: number;
  plataforma: Plataforma;
}

export interface SlideGenerada { tipo: TipoSlide; titulo: string; cuerpo: string }

function slug(tema: string): string {
  return tema.trim().toLowerCase().replace(/[^a-z0-9áéíóúñ ]/gi, '').split(/\s+/).slice(0, 2).join('');
}

export function generarGuionLocal(tema: string, plataforma: Plataforma = 'instagram'): GuionGenerado {
  const t = tema.trim();
  return {
    titulo: `${t}: lo que deberías saber`,
    gancho: `Si te interesa ${t.toLowerCase()}, para el scroll: esto te va a servir.`,
    desarrollo: `Te cuento las claves de ${t.toLowerCase()} en pocos segundos. Primero, por qué importa. Segundo, el error más común que casi todo el mundo comete. Y tercero, cómo aplicarlo hoy mismo sin complicarte.`,
    cta: 'Guarda este vídeo y compártelo con alguien que lo necesite. Y si quieres que lo trabajemos juntos, escríbenos.',
    descripcion: `${t} explicado fácil. Dale a guardar para tenerlo a mano 💪`,
    hashtags: ['#fitness', '#bienestar', `#${slug(t) || 'salud'}`, '#rutina', '#motivacion'],
    duracionSegundos: 45,
    plataforma,
  };
}

export function generarCarruselLocal(tema: string, nContenido = 4): SlideGenerada[] {
  const t = tema.trim();
  const slides: SlideGenerada[] = [
    { tipo: 'portada', titulo: `${t}`, cuerpo: `La guía rápida que necesitabas sobre ${t.toLowerCase()}` },
  ];
  for (let i = 1; i <= nContenido; i++) {
    slides.push({
      tipo: 'contenido',
      titulo: `${i}. Clave nº ${i}`,
      cuerpo: `Un punto concreto y accionable sobre ${t.toLowerCase()}. Explícalo con un ejemplo real y un consejo aplicable hoy.`,
    });
  }
  slides.push({ tipo: 'cta', titulo: '¿Te ha servido?', cuerpo: 'Guarda el carrusel y síguenos para más contenido como este 👉' });
  return slides;
}
