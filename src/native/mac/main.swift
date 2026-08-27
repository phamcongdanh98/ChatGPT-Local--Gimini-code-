import Cocoa
import WebKit

class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, NSWindowDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    var statusItem: NSStatusItem!
    var parentPid: pid_t = 0
    var targetUrlString: String = "http://127.0.0.1:3301/ui"

    func setupMainMenu() {
        let mainMenu = NSMenu()

        // 1. App Menu
        let appMenuItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "Về Local Coder", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "Ẩn vào Menu Bar", action: #selector(hideToTray), keyEquivalent: "w")
        appMenu.addItem(withTitle: "Ẩn Local Coder", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        let hideOthers = appMenu.addItem(withTitle: "Ẩn ứng dụng khác", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        hideOthers.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(withTitle: "Hiện tất cả", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "Thoát Local Coder", action: #selector(terminateApp), keyEquivalent: "q")
        appMenuItem.submenu = appMenu
        mainMenu.addItem(appMenuItem)

        // 2. Edit Menu (BẮT BUỘC ĐỂ CMD+V, CMD+C, CMD+A, CMD+X HOẠT ĐỘNG TRÊN MAC)
        let editMenuItem = NSMenuItem()
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(withTitle: "Hoàn tác", action: Selector(("undo:")), keyEquivalent: "z")
        editMenu.addItem(withTitle: "Làm lại", action: Selector(("redo:")), keyEquivalent: "Z")
        editMenu.addItem(NSMenuItem.separator())
        editMenu.addItem(withTitle: "Cắt", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Sao chép", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Dán", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Chọn tất cả", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editMenuItem.submenu = editMenu
        mainMenu.addItem(editMenuItem)

        // 3. Window Menu
        let windowMenuItem = NSMenuItem()
        let windowMenu = NSMenu(title: "Cửa sổ")
        windowMenu.addItem(withTitle: "Thu nhỏ", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "Phóng to", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        windowMenu.addItem(withTitle: "Đóng & Ẩn vào Menu Bar", action: #selector(hideToTray), keyEquivalent: "w")
        windowMenuItem.submenu = windowMenu
        mainMenu.addItem(windowMenuItem)

        NSApp.mainMenu = mainMenu
    }

    func setupStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = statusItem.button {
            if let iconUrl = Bundle.main.url(forResource: "AppIcon", withExtension: "icns"),
               let img = NSImage(contentsOf: iconUrl) {
                img.size = NSSize(width: 18, height: 18)
                button.image = img
            } else if let img = NSImage(contentsOfFile: "src/assets/logo.png") {
                img.size = NSSize(width: 18, height: 18)
                button.image = img
            } else {
                button.title = "🛡️"
            }
            button.action = #selector(statusItemClicked)
            button.target = self
        }

        let menu = NSMenu()
        let statusTitle = NSMenuItem(title: "🟢 Local Secure: Đang chạy", action: nil, keyEquivalent: "")
        statusTitle.isEnabled = false
        menu.addItem(statusTitle)
        menu.addItem(NSMenuItem.separator())

        menu.addItem(withTitle: "Mở Dashboard", action: #selector(showMainWindow), keyEquivalent: "o")
        menu.addItem(withTitle: "Ẩn cửa sổ", action: #selector(hideToTray), keyEquivalent: "h")
        menu.addItem(withTitle: "Sao chép URL Dashboard", action: #selector(copyDashboardUrl), keyEquivalent: "c")
        menu.addItem(NSMenuItem.separator())
        menu.addItem(withTitle: "Thoát hoàn toàn Local Secure", action: #selector(terminateApp), keyEquivalent: "q")

        statusItem.menu = menu
    }

    @objc func statusItemClicked() {
        toggleMainWindow()
    }

    @objc func showMainWindow() {
        NSApp.setActivationPolicy(.regular)
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    @objc func hideToTray() {
        window.orderOut(nil)
        NSApp.setActivationPolicy(.accessory)
    }

    @objc func toggleMainWindow() {
        if window.isVisible && NSApp.isActive {
            hideToTray()
        } else {
            showMainWindow()
        }
    }

    @objc func copyDashboardUrl() {
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(targetUrlString, forType: .string)
    }

    @objc func terminateApp() {
        if parentPid > 0 {
            kill(parentPid, SIGTERM)
        }
        NSApplication.shared.terminate(nil)
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        hideToTray()
        return false
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        setupMainMenu()

        if let iconUrl = Bundle.main.url(forResource: "AppIcon", withExtension: "icns"),
           let iconImage = NSImage(contentsOf: iconUrl) {
            NSApp.applicationIconImage = iconImage
        } else if let iconImage = NSImage(contentsOfFile: "src/assets/AppIcon.icns") ?? NSImage(contentsOfFile: "src/assets/logo.png") {
            NSApp.applicationIconImage = iconImage
        }

        let width: CGFloat = 1120
        let height: CGFloat = 800
        let screenSize = NSScreen.main?.frame.size ?? CGSize(width: width, height: height)
        let rect = NSRect(
            x: (screenSize.width - width) / 2,
            y: (screenSize.height - height) / 2,
            width: width,
            height: height
        )

        window = NSWindow(
            contentRect: rect,
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Local Coder"
        window.minSize = NSSize(width: 860, height: 600)
        window.center()
        window.delegate = self

        let config = WKWebViewConfiguration()
        let prefs = WKWebpagePreferences()
        prefs.allowsContentJavaScript = true
        config.defaultWebpagePreferences = prefs

        webView = WKWebView(frame: window.contentView!.bounds, configuration: config)
        webView.autoresizingMask = [.width, .height]
        webView.navigationDelegate = self
        webView.uiDelegate = self

        var targetUrl = "http://127.0.0.1:3301/ui"
        if CommandLine.arguments.count > 1 {
            targetUrl = CommandLine.arguments[1]
        }
        if CommandLine.arguments.count > 2, let pid = Int32(CommandLine.arguments[2]) {
            parentPid = pid
        }
        targetUrlString = targetUrl
        setupStatusItem()

        if let url = URL(string: targetUrl) {
            webView.load(URLRequest(url: url))
        }

        window.contentView?.addSubview(webView)
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationWillTerminate(_ notification: Notification) {
        if parentPid > 0 {
            kill(parentPid, SIGTERM)
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return false
    }

    // MARK: - WKUIDelegate (Xử lý các hộp thoại Confirm / Alert của JavaScript)
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = NSAlert()
        alert.messageText = "Local Coder"
        alert.informativeText = message
        alert.addButton(withTitle: "OK")
        alert.runModal()
        completionHandler()
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert()
        alert.messageText = "Xác nhận"
        alert.informativeText = message
        alert.addButton(withTitle: "Đồng ý")
        alert.addButton(withTitle: "Hủy")
        let res = alert.runModal()
        completionHandler(res == .alertFirstButtonReturn)
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
