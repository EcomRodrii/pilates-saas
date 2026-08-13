"use client";

import { Icon } from "@/components/portal-tema/components/ui/Icon";
import { Avatar, Button } from "@/components/portal-tema/components/ui/primitives";
import { useActions, usePortal } from "@/components/portal-tema/store/PortalStore";
import type { ViewModel } from "@/components/portal-tema/store/useViewModel";

/**
 * Las hojas inferiores del prototipo.
 *
 * Una sola pieza y no siete ficheros: todas son el mismo cascarón —velo,
 * panel que sube, asa— y lo único que cambia es el contenido. Se pintan al
 * final del árbol de la pantalla, así que tapan también la barra.
 */
function Hoja({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="hoja">
      {/* El velo cierra al tocar, como el prototipo. Es un `button` y no un
          `div` con `onClick` para que también responda al teclado. */}
      <button className="hoja__velo" onClick={onClose} aria-label="Cerrar" />
      <div className="hoja__panel" role="dialog" aria-modal="true">
        <span className="hoja__asa" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}

export function Hojas({ vm }: { vm: ViewModel }) {
  const actions = useActions();
  const { hoja } = usePortal();
  if (!hoja) return null;

  if (hoja.tipo === "cancelar") {
    return (
      <Hoja onClose={actions.cerrarHoja}>
        <p className="hoja__titulo">¿Cancelar esta reserva?</p>
        {/* ⚠️ El prototipo escribe «Es gratis hasta 6 horas antes». Ese 6 es
            suyo: aquí sale de la política del estudio, con el override del tipo
            de clase por delante. Prometerle una ventana que no es la de su
            estudio la deja pagando una cancelación que creía gratis — y si el
            estudio no fija ninguna, no se promete nada. */}
        <p className="hoja__texto">
          {vm.cancelSheet.aviso}
          {vm.pass.total ? <><br />La clase vuelve a tu bono.</> : null}
        </p>
        <Button block variant="ghost" className="hoja__peligro" loading={vm.detail?.loading}
          onClick={() => actions.cancel(hoja.classId, hoja.reservaId)}>
          Sí, cancelar reserva
        </Button>
        <Button block variant="ghost" style={{ marginTop: 9 }} onClick={actions.cerrarHoja}>
          Mantener reserva
        </Button>
      </Hoja>
    );
  }

  const profe = vm.teachers.find((t) => t.id === hoja.id);
  if (!profe) return null;
  return (
    <Hoja onClose={actions.cerrarHoja}>
      <div className="hoja__profe">
        <Avatar>{profe.inicial}</Avatar>
        <div>
          <p className="hoja__titulo" style={{ marginBottom: 0 }}>{profe.nombre}</p>
        </div>
      </div>
      {/* Sin bio no se pinta un párrafo vacío: `instructores.bio` es nullable
          de verdad y el prototipo inventa una biografía por profesora. */}
      {profe.bio ? <p className="hoja__texto">{profe.bio}</p> : null}
      <Button block variant="ghost" style={{ marginTop: 16 }} onClick={actions.cerrarHoja}>
        Cerrar
      </Button>
    </Hoja>
  );
}

/** El botón de cerrar que llevan las cabeceras. Aparte para no repetirlo. */
export function CerrarHoja() {
  const actions = useActions();
  return (
    <button className="icon-btn is-pressable" onClick={actions.cerrarHoja} aria-label="Cerrar">
      <Icon name="close" stroke={1.9} />
    </button>
  );
}
