import type { CapacitorConfig } from '@capacitor/cli';

// La carcasa nativa de Tentare (docs/APP-IOS.md).
//
// La app NO lleva una copia de la web: carga la web real (`server.url`), que es
// donde vive la app de la alumna. Así un despliegue de Vercel llega a la app en
// el acto, sin pasar por la revisión de Apple. Lo que va empaquetado en
// `webDir` es solo la página de «Sin conexión» (`server.errorPath`).
//
// Una app por estudio sale de ESTE MISMO fichero, cambiando las variables de
// entorno al compilar — nunca cableando su id o su nombre aquí:
//
//   TENTARE_APP_ID    bundle id (por defecto `app.tentare`)
//   TENTARE_APP_NAME  nombre bajo el icono (por defecto `Tentare`)
//
// La URL de arranque es la MISMA para todas: `/app` sabe qué app la abre por
// su bundle id (`App.getInfo()`, ver lib/nativo/puente.ts) y decide desde ahí.
// Por eso no es configurable: la página de «Sin conexión» la lleva escrita
// (movil/www/index.html) y una URL distinta por app la dejaría desfasada.
//
// ⚠️ `allowNavigation` es la lista de lo que puede abrirse DENTRO de la app.
// Todo lo demás (Stripe, Google, un PDF de otro sitio) lo abre iOS fuera, que
// es lo que queremos: dentro de la app solo hay Tentare.

// ⚠️ Si cambia, cambia también en movil/www/index.html (botón de reintentar).
const URL_DE_ARRANQUE = 'https://www.tentare.app/app';
// Los mismos hosts que valida lib/nativo/enlaces.ts para los enlaces entrantes.
const HOSTS_PROPIOS = ['www.tentare.app', 'tentare.app'];

const config: CapacitorConfig = {
  appId: process.env.TENTARE_APP_ID || 'app.tentare',
  appName: process.env.TENTARE_APP_NAME || 'Tentare',
  webDir: 'movil/www',
  // La web lo lee para saber que la abre la app (además de `esAppNativa()`,
  // que solo existe una vez ha cargado el JS): sirve en el servidor.
  appendUserAgent: 'TentareApp',
  backgroundColor: '#F8FAFC',
  loggingBehavior: 'debug',
  server: {
    url: URL_DE_ARRANQUE,
    allowNavigation: HOSTS_PROPIOS,
    errorPath: 'index.html',
  },
  ios: {
    // Lo que respeta el notch y la barra de inicio lo decide la web con
    // `env(safe-area-inset-*)`, como ya hace como PWA instalada.
    contentInset: 'never',
  },
  plugins: {
    SplashScreen: {
      // El logo se queda hasta que la web lo quita al pintarse
      // (`ocultarPantallaDeCarga`, lib/nativo/puente.ts). Con 600 ms se iba
      // antes de que llegara la web y un arranque en frío enseñaba hasta 20 s
      // de pantalla en blanco. El plazo es solo la red de seguridad por si la
      // web no llegara a llamarla; la página de «Sin conexión» también la quita.
      launchAutoHide: true,
      launchShowDuration: 15000,
      backgroundColor: '#F8FAFC',
      showSpinner: false,
    },
    PushNotifications: {
      // Con la app abierta, el aviso se enseña igual que con la app cerrada.
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
