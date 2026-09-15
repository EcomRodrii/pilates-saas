'use client';

import { faltaDisponibilidadInstructora } from '@/lib/student/datos-instructora';

// Sus horarios, sí o sí (decisión del fundador, 15-sep-2026).
//
// Una instructora sin ninguna franja de disponibilidad no puede usar la app
// hasta marcarla: `GuardiaInstructora` la lleva a «Tus horarios» desde cualquier
// pantalla de su parte. Sin franjas el motor de sustituciones no la propone
// nunca, y el estudio no sabe cuándo contar con ella.
//
// Es de USABILIDAD, no de seguridad: las rutas de la app no se cierran por esto.
//
// ⚠️ COSTE. La guardia monta en cada pantalla; preguntar cada vez sería una
// petición por navegación. Lo sabido se guarda en memoria, y el «ya tiene» también
// en `localStorage` por (estudio, ficha): se pregunta una vez por dispositivo.
// El precio: si alguien le vacía la disponibilidad desde el panel, en ese
// dispositivo no se le vuelve a exigir. Aceptable: la pantalla se la sigue
// enseñando vacía y con el aviso.

const enMemoria = new Map<string, boolean>();
const clave = (slug: string, instructorId: string) => `${slug}:${instructorId}`;
const claveGuardada = (slug: string, instructorId: string) => `st_horarios_ok:${slug}:${instructorId}`;

/** Lo que ya se sabe, sin preguntar: `true` falta, `false` tiene, `null` no se sabe. */
export function faltaDisponibilidadSabida(slug: string, instructorId: string): boolean | null {
  const memo = enMemoria.get(clave(slug, instructorId));
  if (memo !== undefined) return memo;
  try {
    if (localStorage.getItem(claveGuardada(slug, instructorId)) != null) return false;
  } catch { /* sin almacenamiento: se pregunta */ }
  return null;
}

export async function comprobarFaltaDisponibilidad(slug: string, instructorId: string): Promise<boolean> {
  const sabida = faltaDisponibilidadSabida(slug, instructorId);
  if (sabida !== null) return sabida;
  const falta = await faltaDisponibilidadInstructora(slug);
  recordar(slug, instructorId, falta);
  return falta;
}

/** Tras guardar: con al menos una franja deja de exigirse. */
export function recordarDisponibilidad(slug: string, instructorId: string, franjas: number): void {
  recordar(slug, instructorId, franjas === 0);
}

function recordar(slug: string, instructorId: string, falta: boolean): void {
  enMemoria.set(clave(slug, instructorId), falta);
  try {
    if (falta) localStorage.removeItem(claveGuardada(slug, instructorId));
    else localStorage.setItem(claveGuardada(slug, instructorId), String(Date.now()));
  } catch { /* modo privado */ }
}
