// Qué ha tocado de verdad quien edita una ficha de equipo.
//
// El formulario de Equipo mandaba la ficha ENTERA al guardar, rol incluido. Una
// pantalla abierta desde antes —otra pestaña, el móvil— que guardara, por
// ejemplo, un teléfono, volvía a escribir el rol que ELLA tenía cargado, y pisaba
// sin avisar el cambio que se hubiera hecho mientras en otro sitio. El caso que lo
// destapó (15-sep-2026): una ficha que se «había cambiado» a instructora seguía en
// recepción después de guardarle el correo.
//
// Ahora solo viaja lo que cambia respecto a cómo estaba la ficha AL ABRIRLA. Lo
// que no se ha tocado no se escribe, así que no puede deshacer lo de nadie.
//
// Se compara normalizado: espacios alrededor y vacío = sin valor. Borrar y volver
// a escribir lo mismo no es un cambio.

import type { Rol } from '../types';

export interface CamposFicha {
  nombre: string;
  email: string | null;
  telefono: string | null;
  color: string;
  avatar: string | null;
  fotoUrl: string | null;
  activo: boolean;
  rol: Rol;
  bio: string | null;
}

const texto = (v: string | null | undefined) => (v ?? '').trim();

function igual(clave: keyof CamposFicha, a: CamposFicha[keyof CamposFicha], b: CamposFicha[keyof CamposFicha]): boolean {
  if (clave === 'activo') return Boolean(a) === Boolean(b);
  return texto(a as string | null) === texto(b as string | null);
}

export function cambiosDeFicha(antes: CamposFicha, ahora: CamposFicha): Partial<CamposFicha> {
  const cambios: Partial<CamposFicha> = {};
  for (const clave of Object.keys(ahora) as (keyof CamposFicha)[]) {
    if (!igual(clave, antes[clave], ahora[clave])) {
      (cambios as Record<string, unknown>)[clave] = ahora[clave];
    }
  }
  return cambios;
}
