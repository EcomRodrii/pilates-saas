'use client';

import { useCore } from '@/lib/core-context';

import { useDatosPortal } from './usar-datos-portal';
import { PortalApp } from '@/components/portal-tema/PortalApp';
import type { ScreenId } from '@/components/portal-tema/store/PortalStore';
import { TEMAS_PORTAL, esTemaPortal } from '@/themes/registro';
import '@/components/portal-tema/portal-tema.css';

/**
 * La vista previa del editor, cuando el tema que se está mirando es del kit.
 *
 * ⚠️ Hasta ahora las seis pantallas de `/portal-preview/[slug]` montaban
 * SIEMPRE el portal de siempre. Con un tema del kit eso convertía la vista
 * previa en una promesa falsa: la propietaria elegía Tentada, la veía montada
 * sobre el portal que sus socias ya no usan, y lo que publicaba no se parecía
 * a lo que había mirado. Encima ahí los colores del borrador SÍ se aplicaban,
 * porque el portal viejo lee justo las variables que el editor manda — o sea
 * que la pantalla que menos se parecía al resultado era la más convincente.
 *
 * `themeIdPublicado` ya trae el BORRADOR mientras el editor lo está mandando
 * (`temaJs.temaKit`, ver `lib/theme-preview-puente.ts`), así que cambiar de
 * tema en la biblioteca cambia el portal previsualizado al momento.
 *
 * ⚠️ NO se mira `studios.portal_react`. Aquí se enseña cómo queda el TEMA, y
 * esa bandera es una decisión de despliegue del estudio, no del tema. Con ella
 * apagada el portal real sigue siendo el de siempre — pero eso lo dice la
 * propia pantalla de Apariencia, no hace falta que una vista previa enseñe un
 * diseño distinto del que se está eligiendo.
 *
 * Devuelve `null` cuando el tema no es del kit: quien lo llame sigue con su
 * vista de siempre.
 *
 * ⚠️ Límite conocido: la pantalla la fija el editor por su sub-ruta
 * (`/portal-preview/<slug>/bonos` → Bonos), así que tocar una pestaña DENTRO
 * del iframe no cambia de pantalla — el `pantalla` de fuera la vuelve a poner
 * en el mismo render. Es coherente con cómo se conduce esta vista previa (el
 * editor decide qué se mira, y en modo edición el clic sirve para SELECCIONAR
 * un bloque, no para navegar), pero se distingue del portal de siempre, que
 * ahí sí deja navegar.
 */
export function useVistaPreviaKit(pantalla: ScreenId): React.ReactElement | null {
  // Auditoría integral 2026-08-21 (rendimiento, P0-2): useCore(), no useStudio() — solo campos de tema/nav ya publicados.
  const { themeIdPublicado } = useCore();
  // `null` = sin socia identificada. La vista previa corre a propósito sin
  // sesión: comparte origen con el portal real, así que un token suyo guardado
  // en este navegador enseñaría avisos de verdad dentro del editor.
  const { datos } = useDatosPortal(null);
  if (!esTemaPortal(themeIdPublicado)) return null;
  // `bare`: el marco de teléfono lo pone el editor alrededor del iframe. Dos
  // marcos anidados dejarían el portal dentro de un teléfono dentro de otro.
  // ⚠️ Con `datos`, no con los de muestra. Sin ellos la propietaria mira su
  // tema sobre las clases inventadas del kit («Laura Gómez», «Pilates
  // Reformer»…) en vez de sobre su horario, sus tarifas y sus instructoras —
  // que es justo lo que hacía la vista previa de siempre y lo que hace que
  // reconozca su portal. Los arma `useDatosPortal`, el MISMO hook que el
  // portal real, para que las dos pantallas no puedan volver a separarse.
  return <PortalApp tema={TEMAS_PORTAL[themeIdPublicado]} datos={datos} bare pantalla={pantalla} />;
}
