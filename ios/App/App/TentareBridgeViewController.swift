import UIKit
import Capacitor

/// El controlador de la app: el de Capacitor más los plugins que viven DENTRO
/// del proyecto (no en node_modules), que Capacitor no descubre solo.
///
/// Lo usan SceneDelegate.swift y Main.storyboard.
class TentareBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(SignInWithApplePlugin())
        // Las próximas clases para el widget de la pantalla de inicio.
        bridge?.registerPluginInstance(ProximaClasePlugin())
        // «Tu clase empieza en 15 minutos», programado en el propio iPhone.
        bridge?.registerPluginInstance(AvisosLocalesPlugin())
        // Deslizar desde el borde izquierdo para volver, como en cualquier app
        // del iPhone. La web navega con `history.pushState`, así que cada
        // pantalla deja su entrada y el gesto vuelve a la anterior (Next lo
        // recibe como un `popstate`). La transición de la web NO se anima en
        // este caso (lib/student/transiciones.ts): WebKit ya anima el gesto.
        webView?.allowsBackForwardNavigationGestures = true
    }
}
