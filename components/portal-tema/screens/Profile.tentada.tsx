"use client";

import { Icon } from "@/components/portal-tema/components/ui/Icon";
import { Button } from "@/components/portal-tema/components/ui/primitives";
import { StatusBar } from "@/components/portal-tema/components/layout/chrome";
import { useActions, useAspecto } from "@/components/portal-tema/store/PortalStore";
import { PORTAL_VIDEOS_CONGELADO } from "@/lib/frozen-features";
import { filasDeCuenta } from "@/components/portal-tema/components/blocks/CuentaFilas";
import type { ViewModel } from "@/components/portal-tema/store/useViewModel";

/**
 * Mi perfil, con la cabecera verde del diseño.
 *
 * ⚠️ Esta pantalla NO copia el prototipo tal cual, y la diferencia importa: el
 * prototipo tiene cinco filas y el perfil que ya usa la socia tiene además
 * **«Aspecto» (día/noche)** y el **estado SEPA** en Métodos de pago. Copiarlo
 * le habría quitado las dos. Aquí va el aspecto del diseño sobre lo que ya
 * funciona — decisión explícita del fundador al ver la comparación medida.
 *
 * Y «Vídeos para casa» no se pinta con VOD congelado, por lo mismo que el
 * bloque del Inicio: la ruta hace `router.replace(.../home)` y sería una fila
 * que rebota.
 */
export function ProfileTentada({ vm }: { vm: ViewModel }) {
  const actions = useActions();
  const aspecto = useAspecto();
  const p = vm.profile;

  const fila = (label: string, valor: string | null, onClick?: () => void) => (
    <button key={label} className="perfil__row is-pressable" onClick={onClick} disabled={!onClick}>
      <span className="perfil__row-label">{label}</span>
      <span className="perfil__row-side">
        {valor ? <span className="perfil__row-val">{valor}</span> : null}
        {onClick ? <Icon name="forward" size={15} stroke={1.6} /> : null}
      </span>
    </button>
  );

  return (
    <>
      <StatusBar over />
      <div className="canvas canvas--flush no-scrollbar">
        <header className="perfil__head">
          <div className="perfil__head-top">
            <p className="perfil__head-title">Mi perfil</p>
            <button className="icon-btn icon-btn--glass is-pressable" onClick={actions.goMisDatos} aria-label="Mis datos">
              <Icon name="user" stroke={1.6} size={19} />
            </button>
          </div>
          <div className="perfil__id">
            <span className="perfil__avatar">{p.initial}</span>
            <p className="perfil__name">{p.name}</p>
            {p.email ? <p className="perfil__meta">{p.email}</p> : null}
            {p.telefono ? <p className="perfil__meta">{p.telefono}</p> : null}
          </div>
        </header>

        <div className="perfil__body">
          <div className="perfil__rows">
            {/* ⚠️ La MISMA lista que los otros temas (`filasDeCuenta`), pintada
                con las filas de ESTE: lo que una socia puede hacer con su
                cuenta no puede depender del tema que publicó su estudio.
                Antes aquí faltaban «Mis bonos», «Historial» y «Favoritas», y
                en el tema clásico faltaba casi todo. */}
            {filasDeCuenta(vm, actions).map((f) => fila(f.label, f.valor, f.ir))}
            {fila("Avisos", null, actions.goPrefs)}
            {fila("Privacidad", null, () => actions.goInfo("privacidad"))}
            {/* El prototipo abre aquí una hoja con un código inventado. El
                portal ya tiene la pantalla de invitación de verdad, con su
                enlace personal y las amigas que ya se unieron. */}
            {fila("Invitar a una amiga", null, actions.goInvitar)}
            {/* «Aspecto» solo cuando hay dónde guardarlo. No está en el
                prototipo y sí en el portal de la socia: quitarlo habría sido
                que el rediseño le costara un ajuste que ya usa. */}
            {aspecto
              ? fila("Aspecto", aspecto.noche ? "Noche" : "Día", aspecto.toggle)
              : null}
          </div>

          <p className="perfil__group">Mi actividad</p>
          <div className="perfil__rows">
            {fila("Mi progreso", null, actions.goProgress)}
            {PORTAL_VIDEOS_CONGELADO ? null : fila("Vídeos para casa", null, actions.goVideos)}
          </div>

          <Button block variant="ghost" className="perfil__salir" onClick={actions.logout}>
            Cerrar sesión
          </Button>
          <p className="perfil__pie">App de {p.estudio} · con Tentare</p>
          <div style={{ height: 8 }}></div>
        </div>
      </div>
    </>
  );
}
