import UIKit
import Capacitor

/// El controlador de la app: el de Capacitor más los plugins que viven DENTRO
/// del proyecto (no en node_modules), que Capacitor no descubre solo.
///
/// Lo usan SceneDelegate.swift y Main.storyboard.
class TentareBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(SignInWithApplePlugin())
    }
}
