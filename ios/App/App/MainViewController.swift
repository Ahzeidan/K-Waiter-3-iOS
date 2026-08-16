import Capacitor

@objc(MainViewController)
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(KemetSecureStoragePlugin())
        bridge?.registerPluginInstance(KemetDatabasePlugin())
        bridge?.registerPluginInstance(KemetAirPrintPlugin())
    }
}
