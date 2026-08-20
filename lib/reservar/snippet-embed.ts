// Script que acompaña al <iframe> del widget de Modo A (el snippet que la
// propietaria copia desde Estudio → API/Widgets, components/configuracion/
// tab-api.tsx). Vive aquí, como función pura, para que el e2e
// (e2e/reservar-embed-overlays-visibles.spec.ts) monte una página anfitriona
// con EL MISMO script que se copia de verdad — replicarlo a mano en el test
// habría dejado que los dos divergieran en silencio.
//
// Qué hace (P0-3, mobile UX del checkout embebido):
//  1. Auto-resize de siempre: la página embebida avisa su altura real
//     (`tentareEmbedAltura`) y el snippet ajusta el iframe.
//  2. NUEVO — informa al iframe de qué franja de él está visible en la
//     pantalla real (`tentareHostViewport`, en scroll/resize del host con
//     throttle por rAF): el widget ancla ahí sus overlays (hoja de clase,
//     «Tus datos») en vez de al fondo del iframe entero, que medido en
//     producción quedaba a ~1000px de la vista del usuario.
//  3. NUEVO — atiende `tentareScrollTo` (scrollIntoView del iframe), el
//     fallback que el widget pide cuando el iframe está casi fuera de
//     pantalla al abrir un overlay.
//
// Validación en ambos sentidos (P2 de la auditoría — el listener viejo no
// validaba origen): solo se atienden mensajes cuyo `e.origin` sea el de
// Tentare Y cuyo `e.source` sea ESTE iframe (dos widgets del mismo estudio en
// la misma página no se pisan entre sí).
//
// ⚠️ El snippet ya pegado en webs existentes NO se actualiza solo: el widget
// debe funcionar sin estos mensajes (fallback: overlays anclados al top del
// iframe) y mejorar cuando lleguen. No romper nunca esa retrocompatibilidad.
export function scriptSnippetIframe({ origen, slug, iframeId }: {
  origen: string;
  slug: string;
  iframeId: string;
}): string {
  return `<script>(function(){var o='${origen}';var f=document.getElementById('${iframeId}');var raf=null;function vp(){raf=null;if(!f||!f.contentWindow)return;var r=f.getBoundingClientRect();var h=Math.min(r.bottom,window.innerHeight)-Math.max(r.top,0);f.contentWindow.postMessage({tentareHostViewport:{top:Math.max(0,-r.top),height:Math.max(0,h)}},o);}function pv(){if(!raf)raf=requestAnimationFrame(vp);}window.addEventListener('scroll',pv,true);window.addEventListener('resize',pv);window.addEventListener('message',function(e){if(e.origin!==o||!e.data||e.data.tentareSlug!=='${slug}'||!f||e.source!==f.contentWindow)return;if(e.data.tentareEmbedAltura){f.style.height=e.data.tentareEmbedAltura+'px';pv();}if(e.data.tentareScrollTo){f.scrollIntoView({block:'start',behavior:'smooth'});}});pv();})();</script>`;
}
