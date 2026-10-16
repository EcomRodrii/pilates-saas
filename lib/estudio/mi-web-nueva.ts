// «Mi app y mi web» v2 (15-oct-2026, las decisiones 10–13 que el fundador aprobó
// «todas si»): «Contenido de tu app» rehecho y el mensaje destacado arriba del
// inicio de la app de la alumna. Va tras su PROPIO interruptor por estudio,
// `MI_WEB_NUEVA` (#2750): PANEL_NUEVO ya está encendido para todos y no sirve para
// esconder nada.
//
// Este es el ÚNICO sitio donde el SERVIDOR lo pregunta para Contenido (hoy: si su
// app enseña el mensaje destacado). El panel lo pregunta en `useMiWebNueva`
// (mi-web-nueva-cliente.ts). Los dos leen la misma variable: si el panel enseña el
// editor nuevo («sale arriba del todo en el inicio de su app») y la app no pinta la
// franja, la pantalla miente.
// Puro, sin `@/`.

import { interruptoresDe } from './interruptores.ts';

export function miWebNuevaPara(studioId: string, entorno: Record<string, string | undefined>): boolean {
  return interruptoresDe(studioId, entorno).miWebNueva;
}
