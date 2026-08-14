// esbuild's `text` loader (scripts/build-widget-bundle.mjs) turns a .css
// import into its raw content as a default-exported string — this file only
// exists so tsc (which doesn't know about esbuild's loader config) agrees.
declare module '*.css' {
  const contenido: string;
  export default contenido;
}
