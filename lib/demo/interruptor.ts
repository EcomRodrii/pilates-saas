// El interruptor de la demo personalizada (`DEMO_PERSONALIZADA`), puro para
// poder probarlo.
//
//   DEMO_PERSONALIZADA=on       → pública: el botón de la home y /demo para todos
//   DEMO_PERSONALIZADA=prueba   → solo quien conozca `/demo?prueba=1` (el botón
//                                 de la home NO se enseña): se prueba en
//                                 producción antes de abrirla
//   cualquier otra cosa         → apagada: /demo y sus rutas dan 404
//
// Se lee en cada petición del servidor. Ojo: una variable nueva de Vercel solo
// llega a producción con el siguiente despliegue de CÓDIGO (ver «Un merge de
// solo documentación NO despliega» en .claude/tentare-os.md), y la home se
// regenera cada hora, así que el botón puede tardar hasta una hora en salir.

export interface EstadoDemo {
  /** ¿Se puede abrir /demo (con el parámetro, si hace falta)? */
  pagina: boolean;
  /** ¿Se enseña el botón de la home? */
  boton: boolean;
  /** ¿Responden las rutas de la API? */
  api: boolean;
}

export function estadoDemo(valor: string | undefined, conParametroPrueba = false): EstadoDemo {
  const v = (valor ?? '').trim().toLowerCase();
  if (v === 'on') return { pagina: true, boton: true, api: true };
  if (v === 'prueba') return { pagina: conParametroPrueba, boton: false, api: true };
  return { pagina: false, boton: false, api: false };
}
