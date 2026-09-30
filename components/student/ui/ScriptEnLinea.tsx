/**
 * Un `<script>` que corre MIENTRAS el navegador lee el HTML, antes del primer
 * pintado — para corregir lo que el servidor no puede saber (aquí: si en este
 * dispositivo hay sesión). Patrón de la guía de Next
 * (node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md):
 * `text/javascript` en el servidor y `text/plain` en el cliente, para que en
 * las navegaciones dentro de la app React no lo vuelva a meter ni lo ejecute.
 */
export function ScriptEnLinea({ js }: { js: string }) {
  return (
    <script
      type={typeof window === 'undefined' ? 'text/javascript' : 'text/plain'}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: js }}
    />
  );
}
