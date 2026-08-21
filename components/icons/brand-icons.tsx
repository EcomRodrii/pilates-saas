'use client';

import { useId } from 'react';

// Logos oficiales de marca (colores fijos de cada empresa, no siguen el
// theming de la app) — trazados tomados de Simple Icons (CC0), la única
// fuente que pudimos usar sin necesitar una cuenta/API key. Brandfetch
// exige un client ID de pago/registro para servir sus logos (su CDN
// redirige a las guías de hotlinking sin uno), así que no se pudo usar
// directamente para descargar estos SVGs.

type IconProps = { size?: number; className?: string };

// Stripe, Resend y WhatsApp se pintan como ICONO DE APLICACIÓN (placa de marca
// + glifo blanco), que es como los publica cada marca. El glifo suelto sobre la
// placa gris quedaba desvaído al lado de Zoom/Zapier/Mailchimp, que sí traen
// fondo propio: la rejilla se leía como dos familias distintas de icono.
export function StripeIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect width="24" height="24" rx="5.5" fill="#635BFF" />
      <g transform="translate(5 5) scale(0.5833)"><path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.594-7.305h.003z" fill="#fff" /></g>
    </svg>
  );
}

export function WhatsAppIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#25D366" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}


export function GoogleCalendarIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#4285F4" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M18.316 5.684H24v12.632h-5.684V5.684zM5.684 24h12.632v-5.684H5.684V24zM18.316 5.684V0H1.895A1.894 1.894 0 0 0 0 1.895v16.421h5.684V5.684h12.632zm-7.207 6.25v-.065c.272-.144.5-.349.687-.617s.279-.595.279-.982c0-.379-.099-.72-.3-1.025a2.05 2.05 0 0 0-.832-.714 2.703 2.703 0 0 0-1.197-.257c-.6 0-1.094.156-1.481.467-.386.311-.65.671-.793 1.078l1.085.452c.086-.249.224-.461.413-.633.189-.172.445-.257.767-.257.33 0 .602.088.816.264a.86.86 0 0 1 .322.703c0 .33-.12.589-.36.778-.24.19-.535.284-.886.284h-.567v1.085h.633c.407 0 .748.109 1.02.327.272.218.407.499.407.843 0 .336-.129.614-.387.832s-.565.327-.924.327c-.351 0-.651-.103-.897-.311-.248-.208-.422-.502-.521-.881l-1.096.452c.178.616.505 1.082.977 1.401.472.319.984.478 1.538.477a2.84 2.84 0 0 0 1.293-.291c.382-.193.684-.458.902-.794.218-.336.327-.72.327-1.149 0-.429-.115-.797-.344-1.105a2.067 2.067 0 0 0-.881-.689zm2.093-1.931l.602.913L15 10.045v5.744h1.187V8.446h-.827l-2.158 1.557zM22.105 0h-3.289v5.184H24V1.895A1.894 1.894 0 0 0 22.105 0zm-3.289 23.5l4.684-4.684h-4.684V23.5zM0 22.105C0 23.152.848 24 1.895 24h3.289v-5.184H0v3.289z" />
    </svg>
  );
}

export function ResendIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect width="24" height="24" rx="5.5" fill="#0A0A0A" />
      <g transform="translate(4.5 4.5) scale(0.008333)"><path d="M1000.46 450C1174.77 450 1278.43 553.669 1278.43 691.282C1278.43 828.896 1174.77 932.563 1000.46 932.563H912.382L1350 1350H1040.82L707.794 1033.48C683.944 1011.47 672.936 985.781 672.935 963.765C672.935 932.572 694.959 905.049 737.161 893.122L908.712 847.244C973.85 829.812 1018.81 779.353 1018.81 713.298C1018.8 632.567 952.745 585.78 871.095 585.78H450V450H1000.46Z" fill="#fff" /></g>
    </svg>
  );
}

// El "G" de cuatro colores de Google, según sus guías de marca para el botón
// "Continuar con Google" — colores fijos de Google a propósito, nunca teñidos
// con el tema del estudio (sus condiciones de uso lo exigen). Única copia del
// repo: la usan /login, Tentare Network, el portal de la socia y Configuración.
export function GoogleIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true" className={className}>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.87 2.69-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.96 10.71A5.4 5.4 0 0 1 3.68 9c0-.59.1-1.17.28-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}

// Gmail — la "M" de la identidad 2026 (dos degradados). Los ids del degradado
// se derivan de useId(): la tarjeta de la integración y el diálogo de ajustes
// pueden estar montados a la vez, y con un id fijo el segundo url(#a) resolvería
// siempre al primero. Mismo motivo que <LogoTentare>.
export function GmailIcon({ size = 20, className }: IconProps) {
  const uid = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 192 192" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path fill={`url(#${uid}-a)`} d="M146 44h38v110c0 6.627-5.373 12-12 12h-20a6 6 0 0 1-6-6z" />
      <path fill="#fc413d" d="M46 44H8v110c0 6.627 5.373 12 12 12h20a6 6 0 0 0 6-6z" />
      <path fill={`url(#${uid}-b)`} d="M39.226 30.456c-8.033-6.752-20.018-5.714-26.77 2.319-6.752 8.032-5.714 20.017 2.319 26.77l76.078 63.949a8 8 0 0 0 10.295 0l76.078-63.95c8.032-6.752 9.07-18.737 2.318-26.77-6.752-8.032-18.737-9.07-26.769-2.318L96 78.18z" />
      <defs>
        <linearGradient id={`${uid}-a`} x1="165" x2="165" y1="44" y2="166" gradientUnits="userSpaceOnUse"><stop stopColor="#60d673"/><stop offset=".17" stopColor="#42c868"/><stop offset=".39" stopColor="#0ebc5f"/><stop offset=".62" stopColor="#00a9bb"/><stop offset=".86" stopColor="#3c90ff"/><stop offset="1" stopColor="#3186ff"/></linearGradient>
        <linearGradient id={`${uid}-b`} x1="8" x2="184" y1="46.13" y2="46.13" gradientUnits="userSpaceOnUse"><stop offset=".08" stopColor="#ff63a0"/><stop offset=".3" stopColor="#fc413d"/><stop offset=".5" stopColor="#fc413d"/><stop offset=".65" stopColor="#fc413d"/><stop offset=".72" stopColor="#fc5c30"/><stop offset=".86" stopColor="#feb10c"/><stop offset=".91" stopColor="#fec700"/><stop offset=".96" stopColor="#ffdb0f"/></linearGradient>
      </defs>
    </svg>
  );
}

// Mailchimp — Freddie NEGRO sobre placa amarilla, que es su icono de
// aplicación real. El archivo de marca venía como silueta amarilla, y el
// amarillo Cavendish (#FFE01B) sobre la placa gris de la tarjeta se veía casi
// blanco: el logo desaparecía. Invertirlo es además lo que hace Mailchimp.
export function MailchimpIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="-3 -3 30 30" fill="#241C15" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect x="-3" y="-3" width="30" height="30" rx="6.9" fill="#FFE01B" />
      <path d="M11.267 0C6.791-.015-1.82 10.246 1.397 12.964l.79.669a3.88 3.88 0 0 0-.22 1.792c.084.84.518 1.644 1.22 2.266.666.59 1.542.964 2.392.964 1.406 3.24 4.62 5.228 8.386 5.34 4.04.12 7.433-1.776 8.854-5.182.093-.24.488-1.316.488-2.267 0-.956-.54-1.352-.885-1.352-.01-.037-.078-.286-.172-.586-.093-.3-.19-.51-.19-.51.375-.563.382-1.065.332-1.35-.053-.353-.2-.653-.496-.964-.296-.311-.902-.63-1.753-.868l-.446-.124c-.002-.019-.024-1.053-.043-1.497-.014-.32-.042-.822-.197-1.315-.186-.668-.508-1.253-.911-1.627 1.112-1.152 1.806-2.422 1.804-3.511-.003-2.095-2.576-2.729-5.746-1.416l-.672.285A678.22 678.22 0 0 0 12.7.504C12.304.159 11.817.002 11.267 0zm.073.873c.166 0 .322.019.465.058.297.084 1.28 1.224 1.28 1.224s-1.826 1.013-3.52 2.426c-2.28 1.757-4.005 4.311-5.037 7.082-.811.158-1.526.618-1.963 1.253-.261-.218-.748-.64-.834-.804-.698-1.326.761-3.902 1.781-5.357C5.834 3.44 9.37.867 11.34.873zm3.286 3.273c.04-.002.06.05.028.074-.143.11-.299.26-.413.414a.04.04 0 0 0 .031.064c.659.004 1.587.235 2.192.574.041.023.012.103-.034.092-.915-.21-2.414-.369-3.97.01-1.39.34-2.45.863-3.224 1.426-.04.028-.086-.023-.055-.06.896-1.035 1.999-1.935 2.987-2.44.034-.018.07.019.052.052-.079.143-.23.447-.278.678-.007.035.032.063.062.042.615-.42 1.684-.868 2.622-.926zm3.023 3.205l.056.001a.896.896 0 0 1 .456.146c.534.355.61 1.216.638 1.845.015.36.059 1.229.074 1.478.034.571.184.651.487.751.17.057.33.098.563.164.706.198 1.125.4 1.39.658.157.162.23.333.253.497.083.608-.472 1.36-1.942 2.041-1.607.746-3.557.935-4.904.785l-.471-.053c-1.078-.145-1.693 1.247-1.046 2.201.417.615 1.552 1.015 2.688 1.015 2.604 0 4.605-1.111 5.35-2.072a.987.987 0 0 0 .06-.085c.036-.055.006-.085-.04-.054-.608.416-3.31 2.069-6.2 1.571 0 0-.351-.057-.672-.182-.255-.1-.788-.344-.853-.891 2.333.72 3.801.039 3.801.039a.072.072 0 0 0 .042-.072.067.067 0 0 0-.074-.06s-1.911.283-3.718-.378c.197-.64.72-.408 1.51-.345a11.045 11.045 0 0 0 3.647-.394c.818-.234 1.892-.697 2.727-1.356.281.618.38 1.299.38 1.299s.219-.04.4.073c.173.106.299.326.213.895-.176 1.063-.628 1.926-1.387 2.72a5.714 5.714 0 0 1-1.666 1.244c-.34.18-.704.334-1.087.46-2.863.935-5.794-.093-6.739-2.3a3.545 3.545 0 0 1-.189-.522c-.403-1.455-.06-3.2 1.008-4.299.065-.07.132-.153.132-.256 0-.087-.055-.179-.102-.243-.374-.543-1.669-1.466-1.409-3.254.187-1.284 1.31-2.189 2.357-2.135.089.004.177.01.266.015.453.027.85.085 1.223.1.625.028 1.187-.063 1.853-.618.225-.187.405-.35.71-.401.028-.005.092-.028.215-.028zm.022 2.18a.42.42 0 0 0-.06.005c-.335.054-.347.468-.228 1.04.068.32.187.595.32.765.175-.02.343-.022.498 0 .089-.205.104-.557.024-.942-.112-.535-.261-.872-.554-.868zm-3.66 1.546a1.724 1.724 0 0 0-1.016.326c-.16.117-.311.28-.29.378.008.032.031.056.088.063.131.015.592-.217 1.122-.25.374-.023.684.094.923.2.239.104.386.173.443.113.037-.038.026-.11-.031-.204-.118-.192-.36-.387-.618-.497a1.601 1.601 0 0 0-.621-.129zm4.082.81c-.171-.003-.313.186-.317.42-.004.236.131.43.303.432.172.003.314-.185.318-.42.004-.236-.132-.429-.304-.432zm-3.58.172c-.05 0-.102.002-.155.008-.311.05-.483.152-.593.247-.094.082-.152.173-.152.237a.075.075 0 0 0 .075.076c.07 0 .228-.063.228-.063a1.98 1.98 0 0 1 1.001-.104c.157.018.23.027.265-.026.01-.016.022-.049-.01-.1-.063-.103-.311-.269-.66-.275zm2.26.4c-.127 0-.235.051-.283.148-.075.154.035.363.246.466.21.104.443.063.52-.09.075-.155-.035-.364-.246-.467a.542.542 0 0 0-.237-.058zm-11.635.024c.048 0 .098 0 .149.003.73.04 1.806.6 2.052 2.19.217 1.41-.128 2.843-1.449 3.069-.123.02-.248.029-.374.026-1.22-.033-2.539-1.132-2.67-2.435-.145-1.44.591-2.548 1.894-2.811.117-.024.252-.04.398-.042zm-.07.927a1.144 1.144 0 0 0-.847.364c-.38.418-.439.988-.366 1.19.027.073.07.094.1.098.064.008.16-.039.22-.2a1.2 1.2 0 0 0 .017-.052 1.58 1.58 0 0 1 .157-.37.689.689 0 0 1 .955-.199c.266.174.369.5.255.81-.058.161-.154.469-.133.721.043.511.357.717.64.738.274.01.466-.143.515-.256.029-.067.005-.107-.011-.125-.043-.053-.113-.037-.18-.021a.638.638 0 0 1-.16.022.347.347 0 0 1-.294-.148c-.078-.12-.073-.3.013-.504.011-.028.025-.058.04-.092.138-.308.368-.825.11-1.317-.195-.37-.513-.602-.894-.65a1.135 1.135 0 0 0-.138-.01z" />
    </svg>
  );
}

// Zapier: su icono de aplicación (cuadrado naranja con la palabra calada), no
// un glifo suelto — por eso se pinta a tamaño completo sin la placa gris.
export function ZapierIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#FF4F00" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M4.157 0A4.151 4.151 0 0 0 0 4.161v15.678A4.151 4.151 0 0 0 4.157 24h15.682A4.152 4.152 0 0 0 24 19.839V4.161A4.152 4.152 0 0 0 19.839 0H4.157Zm10.61 8.761h.03a.577.577 0 0 1 .23.038.585.585 0 0 1 .201.124.63.63 0 0 1 .162.431.612.612 0 0 1-.162.435.58.58 0 0 1-.201.128.58.58 0 0 1-.23.042.529.529 0 0 1-.235-.042.585.585 0 0 1-.332-.328.559.559 0 0 1-.038-.235.613.613 0 0 1 .17-.431.59.59 0 0 1 .405-.162Zm2.853 1.572c.03.004.061.004.095.004.325-.011.646.064.937.219.238.144.431.355.552.609.128.279.189.582.185.888v.193a2 2 0 0 1 0 .219h-2.498c.003.227.075.45.204.642a.78.78 0 0 0 .646.265.714.714 0 0 0 .484-.136.642.642 0 0 0 .23-.318l.915.257a1.398 1.398 0 0 1-.28.537c-.14.159-.321.284-.521.355a2.234 2.234 0 0 1-.836.136 1.923 1.923 0 0 1-1.001-.245 1.618 1.618 0 0 1-.665-.703 2.221 2.221 0 0 1-.227-1.036 1.95 1.95 0 0 1 .48-1.398 1.9 1.9 0 0 1 1.3-.488Zm-9.607.023c.162.004.325.026.48.079.207.065.4.174.563.314.26.302.393.692.366 1.088v2.276H8.53l-.109-.711h-.065c-.064.163-.155.31-.272.439a1.122 1.122 0 0 1-.374.264 1.023 1.023 0 0 1-.453.083 1.334 1.334 0 0 1-.866-.264.965.965 0 0 1-.329-.801.993.993 0 0 1 .076-.431 1.02 1.02 0 0 1 .242-.363 1.478 1.478 0 0 1 1.043-.303h.952v-.181a.696.696 0 0 0-.136-.454.553.553 0 0 0-.438-.154.695.695 0 0 0-.378.086.48.48 0 0 0-.193.254l-.99-.144a1.26 1.26 0 0 1 .257-.563c.14-.174.321-.302.533-.378.261-.091.54-.136.82-.129.053-.003.106-.007.163-.007Zm4.384.007c.174 0 .347.038.506.114.182.083.34.211.458.374.257.423.377.911.351 1.406a2.53 2.53 0 0 1-.355 1.448 1.148 1.148 0 0 1-1.009.517c-.204 0-.401-.045-.582-.136a1.052 1.052 0 0 1-.48-.457 1.298 1.298 0 0 1-.114-.234h-.045l.004 1.784h-1.059v-4.713h.904l.117.805h.057c.068-.208.177-.401.328-.56a1.129 1.129 0 0 1 .843-.344h.076v-.004Zm7.559.084h.903l.113.805h.053a1.37 1.37 0 0 1 .235-.484.813.813 0 0 1 .313-.242.82.82 0 0 1 .39-.076h.234v1.051h-.401a.662.662 0 0 0-.313.008.623.623 0 0 0-.272.155.663.663 0 0 0-.174.26.683.683 0 0 0-.027.314v1.875h-1.054v-3.666Zm-17.515.003h3.262v.896L3.73 13.104l.034.113h1.973l.042.9H2.4v-.9l1.931-1.754-.045-.117H2.441v-.896Zm11.815 0h1.055v3.659h-1.055V10.45Zm3.443.684.019.016a.69.69 0 0 0-.351.045.756.756 0 0 0-.287.204c-.11.155-.174.336-.189.522h1.545c-.034-.526-.257-.787-.74-.787h.003Zm-5.718.163c-.026 0-.057 0-.083.004a.78.78 0 0 0-.31.053.746.746 0 0 0-.257.189 1.016 1.016 0 0 0-.204.695v.064c-.015.257.057.507.204.711a.634.634 0 0 0 .253.196.638.638 0 0 0 .314.061.644.644 0 0 0 .578-.265c.14-.223.204-.48.189-.74a1.216 1.216 0 0 0-.181-.711.677.677 0 0 0-.503-.257Zm-4.509 1.266a.464.464 0 0 0-.268.102.373.373 0 0 0-.114.276c0 .053.008.106.027.155a.375.375 0 0 0 .087.132.576.576 0 0 0 .397.11v.004a.863.863 0 0 0 .563-.182.573.573 0 0 0 .211-.457v-.14h-.903Z" />
    </svg>
  );
}

// Zoom — identidad 2025 (squircle azul con degradado). Icono de aplicación: se
// pinta a tamaño completo, sin la placa gris de la tarjeta. useId() por el mismo
// motivo que GmailIcon.
export function ZoomIcon({ size = 20, className }: IconProps) {
  const uid = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id={`${uid}-z`} x1="0" x2="1" y1="0" y2="0" gradientTransform="rotate(-60 88.792 30.85)scale(109.282)" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#0845bf"/><stop offset=".6" stopColor="#0b5cff"/><stop offset="1" stopColor="#4f90ee"/></linearGradient>
      </defs>
      <path fill={`url(#${uid}-z)`} d="M84.06 37.19V52.8c0 17.25-14 31.25-31.25 31.25H37.2c-17.25 0-31.25-14-31.25-31.25V37.2c0-17.25 14-31.25 31.25-31.25h15.6c17.25 0 31.25 14 31.25 31.25" transform="matrix(6.4 0 0 6.4 -32 -32)" />
      <path fill="#fff" d="M152.08 295.51H88.07c-4.49 0-8.5-2.67-10.22-6.82a11.05 11.05 0 0 1 2.4-12.07l44.33-44.33H92.81a15.8 15.8 0 0 1-15.8-15.8h59.02c4.5 0 8.5 2.68 10.22 6.83a11 11 0 0 1-2.4 12.05l-44.33 44.34h36.75a15.8 15.8 0 0 1 15.81 15.8M435 246.11a30.86 30.86 0 0 0-30.82-30.81 30.8 30.8 0 0 0-22.92 10.24 30.8 30.8 0 0 0-22.92-10.24 30.86 30.86 0 0 0-30.82 30.82v49.4a15.8 15.8 0 0 0 15.8-15.81v-33.6a15.03 15.03 0 0 1 30.03 0v33.6a15.8 15.8 0 0 0 15.81 15.8v-49.4a15.03 15.03 0 0 1 30.04 0v33.6a15.8 15.8 0 0 0 15.8 15.8zm-115.38 9.9a40.7 40.7 0 1 1-81.4-.01 40.7 40.7 0 0 1 81.4 0m-15.8 0a24.9 24.9 0 1 0-49.8-.01 24.9 24.9 0 0 0 49.8 0m-71.92 0a40.7 40.7 0 1 1-81.4 0 40.7 40.7 0 0 1 81.4 0m-15.8 0a24.9 24.9 0 1 0-49.8-.01 24.9 24.9 0 0 0 49.8 0" />
    </svg>
  );
}

// Microsoft Excel — icono de producto completo (10 degradados). Es el más
// pesado del archivo a propósito: la alternativa monocroma no se distingue de
// un icono genérico de hoja de cálculo, que es justo lo que había antes.
export function ExcelIcon({ size = 20, className }: IconProps) {
  const uid = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 486 500" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs><radialGradient id={`${uid}-a`} cx="-746.66" cy="781.44" r="13.89" fx="-746.66" fy="781.44" gradientTransform="matrix(-28.32596 -29.80763 -23.11916 21.97986 -2596.39 -38900.31)" gradientUnits="userSpaceOnUse"><stop offset=".06" stopColor="#379539"/><stop offset=".42" stopColor="#297c2d"/><stop offset=".7" stopColor="#15561c"/></radialGradient><radialGradient id={`${uid}-b`} cx="-773.19" cy="771.25" r="13.89" fx="-773.19" fy="771.25" gradientTransform="matrix(-11.97612 -11.58137 -8.95853 9.26806 -2155.12 -15858.88)" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#073b10"/><stop offset=".99" stopColor="#084a13" stopOpacity="0"/></radialGradient><radialGradient id={`${uid}-f`} cx="-824.11" cy="810.99" r="13.89" fx="-824.11" fy="810.99" gradientTransform="matrix(-9.02 0 0 19.09 -7120.4 -15378.69)" gradientUnits="userSpaceOnUse"><stop offset=".29" stopColor="#4eb43b"/><stop offset="1" stopColor="#72cc61" stopOpacity="0"/></radialGradient><radialGradient id={`${uid}-h`} cx="-769.14" cy="808.9" r="13.89" fx="-769.14" fy="808.9" gradientTransform="matrix(-16.9077 -13.68182 13.64112 -16.86345 -23523.37 3309.71)" gradientUnits="userSpaceOnUse"><stop offset=".44" stopColor="#79e96d"/><stop offset="1" stopColor="#d0eb76"/></radialGradient><radialGradient id={`${uid}-i`} cx="-675.64" cy="793.28" r="13.89" fx="-675.64" fy="793.28" gradientTransform="matrix(15.99196 15.99755 45.54153 -45.54797 -25315.85 47178.18)" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#20a85e"/><stop offset=".94" stopColor="#09442a"/></radialGradient><radialGradient id={`${uid}-j`} cx="-657.62" cy="853.99" r="13.89" fx="-657.62" fy="853.99" gradientTransform="matrix(0 11.2 12.9 0 -10902.85 7734.8)" gradientUnits="userSpaceOnUse"><stop offset=".58" stopColor="#33a662" stopOpacity="0"/><stop offset=".97" stopColor="#98f0b0"/></radialGradient><linearGradient id={`${uid}-c`} x1="69.43" x2="260.84" y1="210.33" y2="210.33" gradientTransform="matrix(1 0 0 -1 0 502)" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#52d17c"/><stop offset=".33" stopColor="#4aa647"/></linearGradient><linearGradient id={`${uid}-d`} x1="194.4" x2="194.4" y1="335.33" y2="161.68" gradientTransform="matrix(1 0 0 -1 0 502)" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#29852f"/><stop offset=".5" stopColor="#4aa647" stopOpacity="0"/></linearGradient><linearGradient id={`${uid}-e`} x1="80.49" x2="311.45" y1="297.22" y2="497.54" gradientTransform="matrix(1 0 0 -1 0 502)" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#66d052"/><stop offset="1" stopColor="#85e972"/></linearGradient><linearGradient id={`${uid}-g`} x1="182.11" x2="69.43" y1="377" y2="377" gradientTransform="matrix(1 0 0 -1 0 502)" gradientUnits="userSpaceOnUse"><stop offset=".18" stopColor="#c0e075" stopOpacity="0"/><stop offset="1" stopColor="#d1eb95"/></linearGradient></defs>
      <path d="M69.43 159.72c0-34.52 27.98-62.5 62.49-62.5h354.09v361.11c0 23.01-18.65 41.67-41.66 41.67H152.74c-46.01 0-83.31-37.31-83.31-83.33V159.72Z" style={{ fill: `url(#${uid}-a)` }} />
      <path d="M69.43 159.72c0-34.52 27.98-62.5 62.49-62.5h354.09v361.11c0 23.01-18.65 41.67-41.66 41.67H152.74c-46.01 0-83.31-37.31-83.31-83.33V159.72Z" style={{ fill: `url(#${uid}-b)`, fillOpacity: '.7' }} />
      <path d="M69.43 229.17c0-34.52 27.98-62.5 62.49-62.5h187.46c-23.01 0-41.66 18.66-41.66 41.67v83.33c0 23.01-18.65 41.67-41.66 41.67h-83.31c-46.01 0-83.31 37.31-83.31 83.33v-187.5Z" style={{ fill: `url(#${uid}-c)` }} />
      <path d="M69.43 229.17c0-34.52 27.98-62.5 62.49-62.5h187.46c-23.01 0-41.66 18.66-41.66 41.67v83.33c0 23.01-18.65 41.67-41.66 41.67h-83.31c-46.01 0-83.31 37.31-83.31 83.33v-187.5Z" style={{ fill: `url(#${uid}-d)`, fillOpacity: '.3' }} />
      <path d="M69.43 83.33C69.43 37.31 106.73 0 152.74 0h166.63v166.67H152.74c-46.01 0-83.31 37.31-83.31 83.33V83.33Z" style={{ fill: `url(#${uid}-e)` }} />
      <path d="M69.43 83.33C69.43 37.31 106.73 0 152.74 0h166.63v166.67H152.74c-46.01 0-83.31 37.31-83.31 83.33V83.33Z" style={{ fill: `url(#${uid}-f)` }} />
      <path d="M69.43 83.33C69.43 37.31 106.73 0 152.74 0h166.63v166.67H152.74c-46.01 0-83.31 37.31-83.31 83.33V83.33Z" style={{ fill: `url(#${uid}-g)` }} />
      <rect width="208.29" height="166.67" x="277.71" rx="41.66" ry="41.66" style={{ fill: `url(#${uid}-h)` }} />
      <rect width="222.17" height="222.22" y="236.11" rx="45.13" ry="45.13" style={{ fill: `url(#${uid}-i)` }} />
      <rect width="222.17" height="222.22" y="236.11" rx="45.13" ry="45.13" style={{ fillOpacity: '.3', fill: `url(#${uid}-j)` }} />
      <path d="M169.48 410.71h-34.25l-21.5-40.47c-.77-1.42-1.36-2.54-1.77-3.37-.35-.88-.74-1.89-1.15-3.01h-.35c-.53 1.42-1.03 2.57-1.5 3.45-.47.89-1.03 1.98-1.68 3.28l-22.3 40.11h-32.3l38.76-63.58-36.1-63.4h33.8l19.11 36.13c.77 1.48 1.42 2.78 1.95 3.9.59 1.06 1.18 2.33 1.77 3.81h.35l1.95-4.07c.53-1 1.24-2.33 2.12-3.98l19.82-35.77h32.21l-36.63 62.43 37.7 64.55Z" style={{ fill: '#fff' }}/>
    </svg>
  );
}

// Kisi — el archivo de marca que llegó era el lockup completo (isotipo +
// palabra + eslogan sobre fondo azul, 1024x1024): ilegible a 20 px. Aquí se
// reconstruye SOLO el isotipo (círculo + cuadrado), midiendo sus proporciones
// sobre ese archivo, sobre la placa azul de Kisi como icono de aplicación.
export function KisiIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect width="24" height="24" rx="5.5" fill="#4857F7" />
      <circle cx="8.25" cy="12" r="4.25" fill="#fff" />
      <rect x="12.39" y="8.05" width="7.61" height="7.9" rx="0.8" fill="#fff" />
    </svg>
  );
}

// Variante de aplicación de WhatsApp, SOLO para la rejilla de integraciones.
// WhatsAppIcon (el glifo suelto de arriba) se queda como está: los botones
// flotantes lo pintan en blanco sobre un círculo verde con [&_path]:fill-white,
// y una placa ahí daría un cuadrado verde dentro del círculo verde.
export function WhatsAppAppIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect width="24" height="24" rx="5.5" fill="#25D366" />
      <g transform="translate(4.04 4) scale(0.0442)"><path d="M307.546 52.566C273.709 18.684 228.706.017 180.756 0 81.951 0 1.538 80.404 1.504 179.235c-.017 31.594 8.242 62.432 23.928 89.609L0 361.736l95.024-24.925c26.179 14.285 55.659 21.805 85.655 21.814h.077c98.788 0 179.21-80.413 179.244-179.244.017-47.898-18.608-92.926-52.454-126.807v-.008Zm-126.79 275.788h-.06c-26.73-.008-52.952-7.194-75.831-20.765l-5.44-3.231-56.391 14.791 15.05-54.981-3.542-5.638c-14.912-23.721-22.793-51.139-22.776-79.286.035-82.14 66.867-148.973 149.051-148.973 39.793.017 77.198 15.53 105.328 43.695 28.131 28.157 43.61 65.596 43.593 105.398-.035 82.149-66.867 148.982-148.982 148.982v.008Zm81.719-111.577c-4.478-2.243-26.497-13.073-30.606-14.568-4.108-1.496-7.09-2.243-10.073 2.243-2.982 4.487-11.568 14.577-14.181 17.559-2.613 2.991-5.226 3.361-9.704 1.117-4.477-2.243-18.908-6.97-36.02-22.226-13.313-11.878-22.304-26.54-24.916-31.027-2.613-4.486-.275-6.91 1.959-9.136 2.011-2.011 4.478-5.234 6.721-7.847 2.244-2.613 2.983-4.486 4.478-7.469 1.496-2.991.748-5.603-.369-7.847-1.118-2.243-10.073-24.289-13.812-33.253-3.636-8.732-7.331-7.546-10.073-7.692-2.613-.13-5.595-.155-8.586-.155-2.991 0-7.839 1.118-11.947 5.604-4.108 4.486-15.677 15.324-15.677 37.361s16.047 43.344 18.29 46.335c2.243 2.991 31.585 48.225 76.51 67.632 10.684 4.615 19.029 7.374 25.535 9.437 10.727 3.412 20.49 2.931 28.208 1.779 8.604-1.289 26.498-10.838 30.228-21.298 3.73-10.46 3.73-19.433 2.613-21.298-1.117-1.865-4.108-2.991-8.586-5.234l.008-.017Z" fill="#fff" /></g>
    </svg>
  );
}

// Klaviyo — su marca es un hexágono: rectángulo con una muesca en V en el lado
// derecho. Geometría medida sobre el icono oficial de klaviyo.com
// (icons/icon-512x512.png): proporción exacta 3:2 y el vértice de la muesca al
// 78,7 % del ancho, a media altura. Se dibuja en vez de incrustar el trazado
// porque son cinco puntos y así no depende de un archivo de terceros.
export function KlaviyoIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M3 6h18l-3.83 6L21 18H3z" fill="#232325" />
    </svg>
  );
}
