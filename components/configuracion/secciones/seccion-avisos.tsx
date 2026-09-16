'use client';

import { useEffect, useState } from 'react';
import { authHeader } from '@/lib/api-client';
import { useRol } from '@/lib/permisos';
import { CATEGORIAS_POR_ROL } from '@/lib/notifications/catalog';
import { fetchPreferencias } from '@/lib/notifications/client';
import { estadoPermiso } from '@/lib/notifications/push-client';
import { resumenHerramienta } from '@/lib/configuracion/resumenes';
import { FilaHerramienta } from '@/components/configuracion/shell/fila-herramienta';
import { GrupoFilas } from '@/components/configuracion/shell/fila-ajuste';

// Mis avisos: los que te llegan a ti. Era /configuracion/notificaciones, una
// pantalla que no enlazaba nadie (hoy redirige aquí).
//
// 16-sep (v2): la sección ERA el componente de preferencias entero, sin una sola
// línea que dijera cómo están. Ahora es una fila con su valor —«Los 8 tipos ·
// push activado»— y la tabla se abre en su pantalla (`?abrir=tus-avisos`), como
// el resto de herramientas (#2061). El componente no se ha tocado: ahí cada
// interruptor sigue guardando al pulsarlo y volviendo atrás si el servidor dice
// que no, sin mezclarse con el «Guardar» de ningún cajón.
//
// Cada rol ve SOLO sus categorías (`CATEGORIAS_POR_ROL`). «Mis avisos» sigue
// siendo solo de la propietaria, aunque la gerencia ya entre en Configuración
// para la operación de su sede: abrirle esta sección es otra revisión (servidor
// y RLS), no un efecto de aquella.
export function SeccionAvisos() {
  const rol = useRol();
  const categorias = CATEGORIAS_POR_ROL[rol];
  // Sin respuesta la fila no cuenta nada —«los 8 tipos» sin haberlos leído sería
  // inventarlo— y enseña qué hay dentro.
  const [encendidos, setEncendidos] = useState<number | null>(null);
  // El permiso de push es de ESTE navegador y solo existe en cliente.
  const [push, setPush] = useState<ReturnType<typeof estadoPermiso> | null>(null);

  // `Notification.permission` solo existe en cliente → se lee tras montar, igual
  // que en el propio componente de preferencias.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setPush(estadoPermiso()); }, []);

  useEffect(() => {
    let vivo = true;
    void fetchPreferencias(authHeader).then(prefs => {
      if (!vivo) return;
      // Sin fila, el aviso llega por los dos sitios (el mismo defecto que aplica
      // el componente y el servidor).
      setEncendidos(categorias.filter(c => {
        const p = prefs[c];
        return !p || p.inapp || p.push;
      }).length);
    });
    return () => { vivo = false; };
  }, [categorias]);

  return (
    <GrupoFilas titulo="Lo que te avisamos a ti">
      <FilaHerramienta
        id="tus-avisos"
        valor={resumenHerramienta('tus-avisos', {
          avisos: encendidos === null ? null : { total: categorias.length, encendidos, push },
        })}
      />
    </GrupoFilas>
  );
}
