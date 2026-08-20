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
// P2 de la auditoría, punto 2 — listeners deduplicados: antes, cada widget
// pegado en la misma página anfitriona (p. ej. clases + citas, o dos "Reserva
// esta clase" de un newsletter) sumaba su PROPIO `addEventListener` de
// scroll/resize/message — con N widgets, un scroll disparaba N handlers, cada
// uno filtrando el mensaje del resto sin usarlo. `window.__tentareEmbeds` es
// un registro compartido (una entrada por widget pegado); los tres listeners
// se enganchan UNA sola vez por página (`window.__tentareEmbedListeners`) y
// recorren el registro. El filtro por `slug`+`e.source===st.f.contentWindow`
// es EXACTAMENTE el mismo de antes, por entrada — ningún widget ve ni actúa
// sobre el mensaje de otro.
//
// ⚠️ El snippet ya pegado en webs existentes NO se actualiza solo: el widget
// debe funcionar sin estos mensajes (fallback: overlays anclados al top del
// iframe) y mejorar cuando lleguen. No romper nunca esa retrocompatibilidad.
export function scriptSnippetIframe({ origen, slug, iframeId }: {
  origen: string;
  slug: string;
  iframeId: string;
}): string {
  return `<script>(function(){var w=window;var reg=w.__tentareEmbeds||(w.__tentareEmbeds=[]);var st={o:'${origen}',s:'${slug}',f:document.getElementById('${iframeId}'),raf:null};reg.push(st);function vp(e){e.raf=null;if(!e.f||!e.f.contentWindow)return;var r=e.f.getBoundingClientRect();var h=Math.min(r.bottom,w.innerHeight)-Math.max(r.top,0);e.f.contentWindow.postMessage({tentareHostViewport:{top:Math.max(0,-r.top),height:Math.max(0,h)}},e.o);}function pv(e){if(!e.raf)e.raf=requestAnimationFrame(function(){vp(e);});}st.pv=function(){pv(st);};if(!w.__tentareEmbedListeners){w.__tentareEmbedListeners=true;w.addEventListener('scroll',function(){reg.forEach(function(e){pv(e);});},true);w.addEventListener('resize',function(){reg.forEach(function(e){pv(e);});});w.addEventListener('message',function(e){for(var i=0;i<reg.length;i++){var st2=reg[i];if(e.origin!==st2.o||!e.data||e.data.tentareSlug!==st2.s||!st2.f||e.source!==st2.f.contentWindow)continue;if(e.data.tentareEmbedAltura){st2.f.style.height=e.data.tentareEmbedAltura+'px';pv(st2);}if(e.data.tentareScrollTo){st2.f.scrollIntoView({block:'start',behavior:'smooth'});}}});}st.pv();})();</script>`;
}
