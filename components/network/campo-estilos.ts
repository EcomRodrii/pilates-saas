// Tokens de formulario para el autoservicio de Tentare Network
// (app/network/*, fuera de (dashboard)) — copia deliberada de los mismos
// valores que `app/(dashboard)/configuracion/page.tsx` exporta, NO un
// re-export de ese módulo.
//
// Antes estas 5 pantallas de autoservicio (`mi-perfil`, `inicio`,
// `oportunidades`, `mis-candidaturas`, `solicitudes`) y 4 componentes
// compartidos importaban `inputCls`/`labelCls`/`cardCls` directamente desde
// la página de configuración del panel de gestión — acoplando el
// autoservicio de la instructora (sin sidebar/topbar de gestión, layout
// propio en app/network/layout.tsx) al módulo de UNA pantalla del panel de
// la propietaria, que además arrastra sus ~8 `dynamic()` de tabs al grafo de
// imports de cada página pública que tocara esto. Mismo aspecto visual (los
// valores no cambian: `text-foreground`/`text-brand`/`border-border` ya son
// los tokens que Network reutiliza a propósito de Studio, ver
// components/network-v2/tokens.ts NW_TINTA/NW_PRODUCTO), sin la dependencia
// cruzada ni el peso extra en el bundle.
export const inputCls =
  'rounded-lg border border-border px-3 py-2 text-[13px] w-full focus:outline-none focus:ring-2 focus:ring-black/10';
export const labelCls = 'text-[12px] font-medium text-foreground block mb-1';
export const cardCls = 'bg-card border border-border rounded-xl';
