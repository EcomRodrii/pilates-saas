"use client";

import { useState } from "react";
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
 *
 * El prototipo tiene SIETE. Aquí van cinco, y las dos que faltan no son un
 * tramo pendiente:
 *  - **Invitar a una amiga** es una hoja con un código inventado
 *    («LAURA-2026») que no canjea nada. El portal ya tiene una pantalla de
 *    invitación de verdad —enlace personal, amigas que ya se unieron, los
 *    créditos que da la regla de recompensas del estudio—, así que la fila del
 *    perfil lleva ahí (`goInvitar`) en vez de a una hoja más pobre.
 *  - **Vídeo** reproduce una sesión guiada, y el VOD está congelado
 *    (`PORTAL_VIDEOS_CONGELADO`): la ruta rebota al inicio. Una hoja con un
 *    play que no reproduce nada es peor que no ofrecerla.
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
  const { hoja, loading } = usePortal();
  // ⚠️ Los hooks van ANTES del `if (!hoja) return null`: llamarlos después
  // rompería la regla de orden de hooks en cuanto la hoja se cierre.
  //
  // Quitar la tarjeta pide confirmación, y el estado vive aquí y no en el store
  // porque es de ESTA hoja: al cerrarla se desmonta y se olvida, que es justo lo
  // que tiene que pasar — abrirla otra vez no debe encontrar el «¿seguro?» a
  // medio contestar.
  const [confirmandoQuitar, setConfirmandoQuitar] = useState(false);
  if (!hoja) return null;

  if (hoja.tipo === "cancelar") {
    // La política de LA CLASE QUE SE CANCELA. Desde «Mis reservas» la hoja se
    // abre sin tocar la clase abierta en el detalle — ver `cancelSheetDe`.
    const politica = vm.cancelSheetDe(hoja.classId);
    return (
      <Hoja onClose={actions.cerrarHoja}>
        <p className="hoja__titulo">¿Cancelar esta reserva?</p>
        {/* ⚠️ El prototipo escribe «Es gratis hasta 6 horas antes». Ese 6 es
            suyo: aquí sale de la política del estudio, con el override del tipo
            de clase por delante. Prometerle una ventana que no es la de su
            estudio la deja pagando una cancelación que creía gratis — y si el
            estudio no fija ninguna, no se promete nada. */}
        <p className="hoja__texto">{politica.aviso}</p>
        {/* ⚠️ Aquí ponía «La clase vuelve a tu bono» siempre que tuviera bono,
            sin mirar la hora. Cancelando dentro de la ventana eso es falso, y
            la socia se enteraba al ver el saldo. Ahora son dos avisos
            distintos y el de perder la sesión va en ámbar, que es lo que pide
            la spec del tema — y lo que se merece una acción irreversible que
            además cuesta dinero. `devuelve` sale del mismo helper que ejecuta
            el servidor, no de una regla escrita otra vez aquí. */}
        {vm.pass.total ? (
          politica.devuelve ? (
            <p className="hoja__nota">La clase vuelve a tu bono.</p>
          ) : (
            <p className="hoja__nota hoja__nota--aviso" role="status">
              Ya estás dentro del plazo: esta clase <strong>no vuelve a tu bono</strong>.
            </p>
          )
        ) : null}
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

  if (hoja.tipo === "sinCreditos") {
    return (
      <Hoja onClose={actions.cerrarHoja}>
        <p className="hoja__titulo">Te quedaste sin créditos</p>
        <p className="hoja__texto">
          Para reservar esta clase necesitas un bono activo. Puedes activar uno
          desde aquí y volver a intentarlo.
        </p>
        {/* Cerrar ANTES de navegar: `ir()` no toca `hoja` (a propósito — el
            detalle de clase se abre con la hoja puesta), así que un `goBuy` a
            secas dejaba la hoja encima de la pantalla de compra. */}
        <Button block style={{ marginTop: 14 }}
          onClick={() => { actions.cerrarHoja(); actions.goBuy(); }}>
          Ver bonos
        </Button>
        <Button block variant="ghost" style={{ marginTop: 9 }} onClick={actions.cerrarHoja}>Ahora no</Button>
      </Hoja>
    );
  }

  if (hoja.tipo === "errorReserva") {
    return (
      <Hoja onClose={actions.cerrarHoja}>
        <p className="hoja__titulo">No hemos podido reservar</p>
        {/* El motivo lo escribe el SERVIDOR, no esta pantalla: son seis
            rechazos legítimos distintos (sin bono, bono que no cubre el tipo,
            clase empezada, cancelada, tope de simultáneas, límite semanal) y
            resumirlos todos en «ha fallado» le quitaría lo único accionable. */}
        <p className="hoja__texto">{hoja.mensaje}</p>
        {/* Verdad en los dos casos: la reserva es transaccional y el bono solo
            se consume cuando la RPC confirma, así que un intento fallido nunca
            le ha descontado nada. Decirlo es la mitad del alivio. */}
        <p className="hoja__nota">No se ha usado ningún crédito.</p>
        {hoja.reintentable ? (
          <Button block loading={vm.detail?.loading} style={{ marginTop: 14 }}
            onClick={() => actions.reserve(hoja.classId)}>
            Reintentar
          </Button>
        ) : null}
        <Button block variant="ghost" style={{ marginTop: 9 }} onClick={actions.cerrarHoja}>
          {hoja.reintentable ? "Ahora no" : "Entendido"}
        </Button>
      </Hoja>
    );
  }

  if (hoja.tipo === "espera") {
    return (
      <Hoja onClose={actions.cerrarHoja}>
        <p className="hoja__titulo">Clase completa</p>
        {/* ⚠️ El prototipo remata con «Serías la 2ª». Aquí NO se dice: la
            posición la asigna el servidor al apuntarse (`decidirReservaNueva`),
            y entre que se abre la hoja y se pulsa el botón puede apuntarse
            alguien más. Prometer un puesto que no es el que le va a tocar es
            el mismo error que anunciar una reserva que el servidor rechazó.
            Su posición real sale después, en Reservas y en el detalle. */}
        <p className="hoja__texto">
          Apúntate a la lista de espera y te avisamos<br />
          en cuanto se libere una plaza.
        </p>
        <Button block loading={vm.detail?.loading} onClick={() => actions.reserve(hoja.classId)}>
          Unirme a la lista
        </Button>
        <Button block variant="ghost" style={{ marginTop: 9 }} onClick={actions.cerrarHoja}>
          Ahora no
        </Button>
      </Hoja>
    );
  }

  if (hoja.tipo === "bono") {
    const bono = vm.wallet.find((b) => b.id === hoja.bonoId);
    if (!bono) return null;
    return (
      <Hoja onClose={actions.cerrarHoja}>
        <p className="hoja__titulo">{bono.name}</p>
        {/* Las condiciones REALES del plan (`validez_dias`, `limite_semanal`,
            los tipos de clase que cubre), no las tres frases escritas a mano
            del prototipo. `condicionesDe` las arma en el adaptador. */}
        <ul className="hoja__terminos">
          {bono.terminos.map((termino) => (
            <li key={termino} className="hoja__termino">
              <span className="hoja__tick"><Icon name="check" size={11} stroke={2.2} /></span>
              <span>{termino}</span>
            </li>
          ))}
        </ul>
        <Button block variant="ghost" style={{ marginTop: 18 }} onClick={actions.cerrarHoja}>
          Cerrar
        </Button>
      </Hoja>
    );
  }

  if (hoja.tipo === "pago") {
    const { tarjeta, domiciliado } = vm.profile;
    return (
      <Hoja onClose={actions.cerrarHoja}>
        <p className="hoja__titulo">Métodos de pago</p>
        {tarjeta ? (
          <div className="hoja__medio">
            <span className="hoja__marca">{tarjeta.marca.slice(0, 4).toUpperCase()}</span>
            <div className="hoja__medio-txt">
              <p className="hoja__medio-nombre">{tarjeta.marca} ···· {tarjeta.ultimos4}</p>
              {/* Sin caducidad no se inventa una: `tarjeta_exp_*` en blanco
                  significa que Stripe todavía no la ha dicho. */}
              {tarjeta.caduca ? <p className="hoja__medio-pie">Caduca {tarjeta.caduca}</p> : null}
            </div>
          </div>
        ) : null}
        {domiciliado ? (
          <div className="hoja__medio">
            <span className="hoja__marca">SEPA</span>
            <div className="hoja__medio-txt">
              <p className="hoja__medio-nombre">Recibo domiciliado</p>
              <p className="hoja__medio-pie">Tus cuotas se cargan en tu cuenta</p>
            </div>
          </div>
        ) : null}
        {/* ⚠️ Aquí NO había botón de añadir, y un comentario lo justificaba
            diciendo que la tarjeta «se guarda sola al pagar». Eso dejó de ser
            cierto: `/api/stripe/setup-tarjeta` existe y es semipúblico a
            propósito, justo para la socia que pagó por Bizum, en mostrador o
            viene importada de otra plataforma — que hasta ahora no tenía
            NINGUNA forma de dejar una tarjeta autorizada. */}
        <p className="hoja__texto" style={{ marginTop: tarjeta || domiciliado ? 14 : 8 }}>
          {/* Se dice PARA QUÉ se usa, que es lo que faltaba. Sin inventar
              comportamiento: son los cobros que este repo hace de verdad. */}
          Tu método de pago se usa para cobrar los bonos y las cuotas que
          contrates con el estudio, y las renovaciones automáticas si tu plan las
          tiene. Nunca guardamos el número de tu tarjeta: lo custodia Stripe.
        </p>

        <Button block style={{ marginTop: 16 }} loading={loading} onClick={actions.anadirTarjeta}>
          {tarjeta ? "Cambiar de tarjeta" : "Añadir tarjeta"}
        </Button>

        {tarjeta ? (
          /* ⚠️ Dos toques para quitarla, no uno. Es una acción irreversible con
             consecuencias que la socia no tiene por qué anticipar — de ahí que
             el aviso diga cuáles ANTES de confirmar, no después. */
          confirmandoQuitar ? (
            <>
              <p className="hoja__texto" style={{ marginTop: 14 }}>
                Si la quitas, tendrás que pagar a mano cada bono o cuota, y las
                renovaciones automáticas dejarán de cobrarse.
              </p>
              <Button block variant="ghost" style={{ marginTop: 10 }} loading={loading}
                onClick={actions.quitarTarjeta}>
                Sí, quitar la tarjeta
              </Button>
              <Button block variant="ghost" style={{ marginTop: 6 }} onClick={() => setConfirmandoQuitar(false)}>
                Mejor no
              </Button>
            </>
          ) : (
            <Button block variant="ghost" style={{ marginTop: 8 }} onClick={() => setConfirmandoQuitar(true)}>
              Quitar esta tarjeta
            </Button>
          )
        ) : null}

        <Button block variant="ghost" style={{ marginTop: 16 }} onClick={actions.cerrarHoja}>
          Cerrar
        </Button>
      </Hoja>
    );
  }

  const profe = vm.teachers.find((t) => t.id === hoja.id);
  if (!profe) return null;
  return (
    <Hoja onClose={actions.cerrarHoja}>
      <div className="hoja__profe">
        <Avatar foto={profe.foto}>{profe.inicial}</Avatar>
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
