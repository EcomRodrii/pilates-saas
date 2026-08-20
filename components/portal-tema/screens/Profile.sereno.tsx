"use client";

import { useEffect } from "react";
import { Button, Card, SectionTitle, Switch } from "@/components/portal-tema/components/ui/primitives";
import { Icon } from "@/components/portal-tema/components/ui/Icon";
import { Island, StatusBar } from "@/components/portal-tema/components/layout/chrome";
import { useActions } from "@/components/portal-tema/store/PortalStore";
import { CuentaFilas } from "@/components/portal-tema/components/blocks/CuentaFilas";
import type { ViewModel } from "@/components/portal-tema/store/useViewModel";

/**
 * El perfil de Sereno.
 *
 * Fichero propio por el mismo motivo que `Profile.tentada.tsx`: no es la misma
 * pantalla con otro color, es otra composición —cabecera con avatar y correo,
 * tres cifras y las opciones agrupadas en fichas— y meterla en el componente
 * compartido lo habría dejado con tres árboles distintos dentro.
 *
 * ⚠️ Conserva lo que la socia YA tenía y el prototipo no dibuja: el estado del
 * método de pago. Un rediseño no puede costarle a nadie un dato que ya usaba.
 */
export function ProfileSereno({ vm }: { vm: ViewModel }) {
  const actions = useActions();
  // «Clases este mes» se cuenta del historial, así que hay que pedirlo también
  // aquí — la agenda no es el único sitio que lo enseña. Es idempotente.
  useEffect(() => { actions.cargarHistorial(); }, [actions]);

  return (
    <>
      <Island />
      <StatusBar />
      <div className="canvas no-scrollbar">
        <header className="perfil-cab">
          <button className="perfil-cab__avatar is-pressable" onClick={actions.goMisDatos} aria-label="Mis datos">
            <span>{vm.profile.initial}</span>
            <span className="perfil-cab__editar" aria-hidden="true">
              <Icon name="user" size={10} stroke={1.6} />
            </span>
          </button>
          <div className="perfil-cab__body">
            <p className="perfil-cab__nombre">{vm.profile.name}</p>
            <p className="perfil-cab__meta">
              {[vm.profile.email, vm.profile.estudio].filter(Boolean).join(" · ")}
            </p>
          </div>
        </header>

        {/* Solo las cifras que existen de verdad: sin racha de dos semanas, o
            sin historial cargado, esa tarjeta no aparece en vez de enseñar un
            cero que no significa nada. */}
        {vm.cifrasPerfil.length ? (
          <div className="perfil-cifras">
            {vm.cifrasPerfil.map((c) => (
              <div className="perfil-cifra" key={c.label}>
                <p className="perfil-cifra__valor">{c.valor}</p>
                <p className="perfil-cifra__label">{c.label}</p>
              </div>
            ))}
          </div>
        ) : null}

        <section>
          <SectionTitle>Cuenta</SectionTitle>
          <Card className="filas">
            {/* ⚠️ La MISMA lista que los otros temas (`CuentaFilas`): lo que
                una socia puede hacer con su cuenta no puede depender del tema
                que publicó su estudio. La forma sí es de cada uno. */}
            <CuentaFilas vm={vm} />
          </Card>
        </section>

        <section>
          <SectionTitle>Avisos</SectionTitle>
          <Card className="filas">
            {vm.notifications.map((item) => (
              <button className="fila is-pressable" key={item.key} onClick={() => actions.toggleNotification(item.key)}>
                <span className="fila__body">
                  <span className="fila__label">{item.label}</span>
                  <span className="fila__nota">{item.note}</span>
                </span>
                <Switch on={item.on} />
              </button>
            ))}
          </Card>
        </section>

        <Button block variant="ghost" className="perfil-salir" style={{ marginTop: 22 }} onClick={actions.logout}>
          Cerrar sesión
        </Button>
        <p className="perfil-firma">Con la tecnología de Tentare</p>
      </div>
    </>
  );
}
