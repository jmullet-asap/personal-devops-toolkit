#!/usr/bin/swift

import Cocoa
import Foundation

class AWSMenuBarApp: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem!
    
    func applicationDidFinishLaunching(_ notification: Notification) {
        print("AWS Menu Bar App starting...")
        setupMenuBarItem()
        print("Application finished launching")
        
        // Test programmatic menu display after 2 seconds
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            self.showMenuProgrammatically()
        }
    }
    
    private func setupMenuBarItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: 50)
        
        if let button = statusItem.button {
            button.title = "☁️"
            button.toolTip = "AWS Environment Switcher"
        }
        
        statusItem.menu = createMenu()
        
        print("Menu bar item created successfully")
    }
    
    @objc private func menuBarButtonClicked() {
        // Menu will show automatically
    }
    
    private func showMenuProgrammatically() {
        print("Attempting to show menu programmatically...")
        
        if let button = statusItem.button {
            print("Button exists, trying to show menu...")
            
            // Get button frame in screen coordinates
            let buttonFrame = button.convert(button.bounds, to: nil)
            let screenRect = button.window?.convertToScreen(buttonFrame) ?? .zero
            let screenPoint = NSPoint(x: screenRect.midX, y: screenRect.minY)
            
            print("Button screen position: \(screenPoint)")
            
            // Show menu at button location
            if let menu = statusItem.menu {
                menu.popUp(positioning: nil, at: screenPoint, in: nil)
                print("Menu popup attempted")
            } else {
                print("No menu found!")
            }
        } else {
            print("No button found!")
        }
        
        // Also try to force visibility
        statusItem.isVisible = true
        print("Forced status item visibility")
    }
    
    private func parseAWSConfig() -> [String: String] {
        let homeDir = FileManager.default.homeDirectoryForCurrentUser
        let configPath = homeDir.appendingPathComponent(".aws/config")
        
        guard let content = try? String(contentsOf: configPath) else {
            print("Could not read AWS config file")
            return [:]
        }
        
        var profiles: [String: String] = [:]
        let lines = content.components(separatedBy: .newlines)
        
        for line in lines {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.starts(with: "[profile ") && trimmed.hasSuffix("]") {
                let profileName = String(trimmed.dropFirst(9).dropLast(1))
                let displayName = createDisplayName(for: profileName)
                profiles[profileName] = displayName
            } else if trimmed == "[default]" {
                profiles["default"] = "Default (TRMI)"
            }
        }
        
        return profiles
    }
    
    private func createDisplayName(for profileName: String) -> String {
        switch profileName {
        case "dtmi-prod":
            return "DTMI Production"
        case "dtmi-nonprod":
            return "DTMI Non-Production"
        case "tric-prod":
            return "TRIC Production"
        case "tric-nonprod":
            return "TRIC Non-Production"
        case "tric-management":
            return "TRIC Management"
        case "tric-security":
            return "TRIC Security"
        case "tr-dev":
            return "TR Development"
        default:
            // Capitalize and format unknown profiles
            return profileName.replacingOccurrences(of: "-", with: " ").capitalized
        }
    }
    
    private func createMenu() -> NSMenu {
        let menu = NSMenu()
        
        // Get AWS profiles dynamically
        let profiles = parseAWSConfig()
        let sortedProfiles = profiles.keys.sorted()
        
        // Add menu items for each profile
        for profileName in sortedProfiles {
            guard let displayName = profiles[profileName] else { continue }
            
            let menuItem = NSMenuItem(title: displayName, action: nil, keyEquivalent: "")
            menuItem.submenu = createEnvironmentSubmenu(profileName: profileName)
            menu.addItem(menuItem)
        }
        
        menu.addItem(NSMenuItem.separator())
        
        let quitItem = NSMenuItem(title: "Quit", action: #selector(quitApp), keyEquivalent: "q")
        quitItem.target = self
        menu.addItem(quitItem)
        
        return menu
    }
    
    private func createEnvironmentSubmenu(profileName: String) -> NSMenu {
        let submenu = NSMenu()
        
        // Option 1: Just sign in
        let signInItem = NSMenuItem(title: "Sign In Only", action: #selector(signInOnly(_:)), keyEquivalent: "")
        signInItem.target = self
        signInItem.representedObject = profileName
        submenu.addItem(signInItem)
        
        // Option 2: Open iTerm2 with credentials
        let iTermItem = NSMenuItem(title: "Open iTerm2", action: #selector(openITerm(_:)), keyEquivalent: "")
        iTermItem.target = self
        iTermItem.representedObject = profileName
        submenu.addItem(iTermItem)
        
        // Option 3: Open iTerm2 + launch hub
        let iTermHubItem = NSMenuItem(title: "Open iTerm2 + Hub", action: #selector(openITermWithHub(_:)), keyEquivalent: "")
        iTermHubItem.target = self
        iTermHubItem.representedObject = profileName
        submenu.addItem(iTermHubItem)
        
        return submenu
    }
    
    @objc private func signInOnly(_ sender: NSMenuItem) {
        guard let profileName = sender.representedObject as? String else { return }
        executeCommand(profileName: profileName, action: .signInOnly)
    }
    
    @objc private func openITerm(_ sender: NSMenuItem) {
        guard let profileName = sender.representedObject as? String else { return }
        executeCommand(profileName: profileName, action: .openITerm)
    }
    
    @objc private func openITermWithHub(_ sender: NSMenuItem) {
        guard let profileName = sender.representedObject as? String else { return }
        executeCommand(profileName: profileName, action: .openITermWithHub)
    }
    
    @objc private func quitApp() {
        NSApplication.shared.terminate(self)
    }
    
    enum ActionType {
        case signInOnly
        case openITerm
        case openITermWithHub
    }
    
    private func executeCommand(profileName: String, action: ActionType) {
        let hubPath = "/Users/joshuamullet/repos/hub"
        
        switch action {
        case .signInOnly:
            // Just run the AWS login with profile
            runAWSLogin(profileName: profileName)
            
        case .openITerm:
            // Run AWS login, then open iTerm2
            runAWSLogin(profileName: profileName)
            openITerminalWithEnvironment(hubPath: hubPath)
            
        case .openITermWithHub:
            // Run AWS login, open iTerm2, and launch hub
            runAWSLogin(profileName: profileName)
            openITerminalWithHub(hubPath: hubPath)
        }
    }
    
    private func runAWSLogin(profileName: String) {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/local/bin/aws")
        
        // Use AWS CLI to login with the profile
        process.arguments = ["sso", "login", "--profile", profileName]
        
        do {
            try process.run()
            process.waitUntilExit()
            
            if process.terminationStatus == 0 {
                showNotification(title: "AWS Login", message: "Successfully authenticated to \(profileName)")
            } else {
                showNotification(title: "AWS Login Error", message: "Failed to authenticate to \(profileName)")
            }
        } catch {
            print("Error running AWS login: \(error)")
            showNotification(title: "AWS Login Error", message: "Error: \(error.localizedDescription)")
        }
    }
    
    
    private func showNotification(title: String, message: String) {
        let notification = NSUserNotification()
        notification.title = title
        notification.informativeText = message
        notification.soundName = NSUserNotificationDefaultSoundName
        
        let center = NSUserNotificationCenter.default
        center.deliver(notification)
    }
    
    private func openITerminal() {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/open")
        process.arguments = ["-a", "iTerm"]
        
        do {
            try process.run()
        } catch {
            print("Error opening iTerm2: \(error)")
        }
    }
    
    private func openITerminalWithHub(hubPath: String) {
        // Open iTerm with proper AWS environment variables and hub command
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            let script = """
                tell application "iTerm"
                    activate
                    create window with default profile
                    tell current session of current window
                        write text "cd \(hubPath)"
                        write text "hub"
                    end tell
                end tell
            """
            
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
            process.arguments = ["-e", script]
            
            do {
                try process.run()
            } catch {
                print("Error opening iTerm with hub: \(error)")
            }
        }
    }
    
    private func openITerminalWithEnvironment(hubPath: String) {
        // Open iTerm with AWS environment variables set
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            let script = """
                tell application "iTerm"
                    activate
                    create window with default profile
                    tell current session of current window
                        write text "cd \(hubPath)"
                    end tell
                end tell
            """
            
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
            process.arguments = ["-e", script]
            
            do {
                try process.run()
            } catch {
                print("Error opening iTerm: \(error)")
            }
        }
    }
}

// Main application setup
let app = NSApplication.shared
let delegate = AWSMenuBarApp()
app.delegate = delegate
app.setActivationPolicy(.accessory) // This makes it a menu bar only app
app.run()