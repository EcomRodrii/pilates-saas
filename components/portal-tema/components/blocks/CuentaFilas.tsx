"use client";

import { Icon } from "@/components/portal-tema/components/ui/Icon";
import { useActions } from "@/components/portal-tema/store/PortalStore";
import type { ViewModel } from "@/components/portal-tema/store/useViewModel";

/**
 * El SUELO del perfil: lo que toda socia tiene que poder hacer, tenga su
 * estudio el tema que tenga.
 *
 * ⚠️ Existe porque los tres «perfiles» del kit no eran variantes de estilo:
 * eran TRES PANTALLAS DISTINTAS, con opciones distintas.
 *
 *   · Oliva/Bloom/Noir → un bono, unos interruptores, unas cifras y una tabla
 *     de historial. SIN «Mis datos», SIN método de pago y SIN cerrar sesión.
 *   · Tentada → mis datos, pagos, avisos, privacidad, invitar, aspecto…
 *   · Sereno → datos, bonos, historial, pago, avisos, cerrar sesión.
 *
 * O sea que lo que una socia podía hacer con su cuenta dependía del tema que
 * hubiera publicado su estudio. Una con Oliva no podía llegar a sus datos, ni
 * a su método de pago, ni cerrar sesión desde su perfil.
 *
 * La forma sigue siendo de cada tema —cabecera, fichas, filas—; lo que ya no
 * puede divergir es el CONTENIDO. Por eso esto es una lista de destinos, no una
 * pantalla: cada perfil la coloca donde le toca.
 */
export interface FilaDeCuenta {
  clave: string;
  label: string;
  /** Coletilla a la derecha (créditos, estado SEPA…). Vacía = no se pinta. */
  valor: string | null;
  ir: () => void;
}

export function filasDeCuenta(vm: ViewModel, actions: ReturnType<typeof useActions>): FilaDeCuenta[] {
  return [
    { clave: "datos", label: "Datos personales", valor: null, ir: actions.goMisDatos },
    {
      clave: "bonos",
      label: "Mis bonos",
      valor: vm.pass.total ? `${vm.pass.left} ${vm.pass.left === 1 ? "crédito" : "créditos"}` : null,
      ir: actions.goPasses,
    },
    {
      clave: "historial",
      label: "Historial de clases",
      // `null` = todavía no ha llegado; se calla en vez de decir «0 clases»,
      // que es una afirmación distinta.
      valor: vm.agenda.completadas ? `${vm.agenda.completadas.length} clases` : null,
      ir: () => actions.goto("historial"),
    },
    { clave: "favoritas", label: "Favoritas", valor: null, ir: actions.showFavourites },
    {
      clave: "pago",
      label: "Método de pago",
      // El estado SEPA que ya enseñaba el perfil de siempre. `null` = no está
      // domiciliada, y la fila va sin coletilla en vez de con un «No
      // domiciliado» que nadie ha pedido saber.
      valor: vm.profile.metodoPago,
      ir: () => actions.abrirHoja({ tipo: "pago" }),
    },
  ];
}

/** Las mismas filas, ya pintadas con el estilo de lista del kit. */
export function CuentaFilas({ vm }: { vm: ViewModel }) {
  const actions = useActions();
  return (
    <>
      {filasDeCuenta(vm, actions).map((f) => (
        <button key={f.clave} className="fila is-pressable" onClick={f.ir}>
          <span className="fila__label">{f.label}</span>
          {f.valor ? <span className="fila__valor">{f.valor}</span> : null}
          <Icon name="forward" size={12} stroke={1.8} />
        </button>
      ))}
    </>
  );
}
