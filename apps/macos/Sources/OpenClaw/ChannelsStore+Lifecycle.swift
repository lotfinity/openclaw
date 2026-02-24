import OpenClawProtocol
import Foundation

extension ChannelsStore {
    func start() {
        guard !self.isPreview else { return }
        guard self.pollTask == nil else { return }
        self.pollTask = Task.detached { [weak self] in
            guard let self else { return }
            await self.refresh(probe: true)
            await self.loadConfigSchema()
            await self.loadConfig()
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: UInt64(self.interval * 1_000_000_000))
                await self.refresh(probe: false)
            }
        }
    }

    func stop() {
        self.pollTask?.cancel()
        self.pollTask = nil
    }

    func refresh(probe: Bool) async {
        guard !self.isRefreshing else { return }
        self.isRefreshing = true
        defer { self.isRefreshing = false }

        do {
            let params: [String: AnyCodable] = [
                "probe": AnyCodable(probe),
                "timeoutMs": AnyCodable(8000),
            ]
            let snap: ChannelsStatusSnapshot = try await GatewayConnection.shared.requestDecoded(
                method: .channelsStatus,
                params: params,
                timeoutMs: 12000)
            self.snapshot = snap
            self.whatsappRuntimeStatus = self.resolveWhatsAppRuntimeStatus(from: snap)
            self.lastSuccess = Date()
            self.lastError = nil
        } catch {
            self.lastError = error.localizedDescription
            self.whatsappRuntimeStatus = nil
        }
    }

    func startWhatsAppLogin(force: Bool, autoWait: Bool = true) async {
        guard !self.whatsappBusy else { return }
        self.whatsappBusy = true
        defer { self.whatsappBusy = false }
        var shouldAutoWait = false
        do {
            let params: [String: AnyCodable] = [
                "force": AnyCodable(force),
                "timeoutMs": AnyCodable(30000),
                "mode": AnyCodable("qr"),
            ]
            let result: WhatsAppLoginStartResult = try await GatewayConnection.shared.requestDecoded(
                method: .webLoginStart,
                params: params,
                timeoutMs: 35000)
            self.whatsappLoginMessage = result.message
            self.whatsappLoginQrDataUrl = result.qrDataUrl
            self.whatsappLoginConnected = nil
            shouldAutoWait = autoWait && result.qrDataUrl != nil
        } catch {
            self.whatsappLoginMessage = error.localizedDescription
            self.whatsappLoginQrDataUrl = nil
            self.whatsappLoginConnected = nil
        }
        await self.refresh(probe: true)
        if shouldAutoWait {
            Task { await self.waitWhatsAppLogin() }
        }
    }

    func waitWhatsAppLogin(timeoutMs: Int = 120_000) async {
        guard !self.whatsappBusy else { return }
        self.whatsappBusy = true
        defer { self.whatsappBusy = false }
        do {
            let params: [String: AnyCodable] = [
                "timeoutMs": AnyCodable(timeoutMs),
            ]
            let result: WhatsAppLoginWaitResult = try await GatewayConnection.shared.requestDecoded(
                method: .webLoginWait,
                params: params,
                timeoutMs: Double(timeoutMs) + 5000)
            self.whatsappLoginMessage = result.message
            self.whatsappLoginConnected = result.connected
            if result.connected {
                self.whatsappLoginQrDataUrl = nil
            }
        } catch {
            self.whatsappLoginMessage = error.localizedDescription
        }
        await self.refresh(probe: true)
    }

    func requestWhatsAppPairCode() async {
        guard !self.whatsappBusy else { return }
        self.whatsappBusy = true
        defer { self.whatsappBusy = false }
        do {
            let phone = self.whatsappLinkPhoneNumber.trimmingCharacters(in: .whitespacesAndNewlines)
            let params: [String: AnyCodable] = [
                "mode": AnyCodable("request-code"),
                "phoneNumber": AnyCodable(phone),
                "timeoutMs": AnyCodable(15000),
            ]
            let result: WhatsAppLoginStartResult = try await GatewayConnection.shared.requestDecoded(
                method: .webLoginStart,
                params: params,
                timeoutMs: 20000)
            self.whatsappLoginMessage = result.message
            self.whatsappLoginQrDataUrl = result.qrDataUrl
            self.whatsappLoginConnected = nil
        } catch {
            self.whatsappLoginMessage = error.localizedDescription
        }
        await self.refresh(probe: true)
    }

    func logoutWhatsApp() async {
        guard !self.whatsappBusy else { return }
        self.whatsappBusy = true
        defer { self.whatsappBusy = false }
        do {
            let params: [String: AnyCodable] = [
                "channel": AnyCodable("whatsapp"),
            ]
            let result: ChannelLogoutResult = try await GatewayConnection.shared.requestDecoded(
                method: .channelsLogout,
                params: params,
                timeoutMs: 15000)
            if result.remoteLoggedOut == true && result.localCleared == true {
                self.whatsappLoginMessage = "WAHA session logged out and local credentials cleared."
            } else if result.remoteLoggedOut == true {
                self.whatsappLoginMessage = "WAHA session logged out."
            } else if result.localCleared == true {
                self.whatsappLoginMessage = "Logged out and cleared local credentials."
            } else if result.cleared {
                self.whatsappLoginMessage = "WhatsApp session logout completed."
            } else {
                self.whatsappLoginMessage = "No WhatsApp session found."
            }
            self.whatsappLoginQrDataUrl = nil
        } catch {
            self.whatsappLoginMessage = error.localizedDescription
        }
        await self.refresh(probe: true)
    }

    func logoutTelegram() async {
        guard !self.telegramBusy else { return }
        self.telegramBusy = true
        defer { self.telegramBusy = false }
        do {
            let params: [String: AnyCodable] = [
                "channel": AnyCodable("telegram"),
            ]
            let result: ChannelLogoutResult = try await GatewayConnection.shared.requestDecoded(
                method: .channelsLogout,
                params: params,
                timeoutMs: 15000)
            if result.envToken == true {
                self.configStatus = "Telegram token still set via env; config cleared."
            } else {
                self.configStatus = result.cleared
                    ? "Telegram token cleared."
                    : "No Telegram token configured."
            }
            await self.loadConfig()
        } catch {
            self.configStatus = error.localizedDescription
        }
        await self.refresh(probe: true)
    }
}

private struct WhatsAppLoginStartResult: Codable {
    let qrDataUrl: String?
    let message: String
}

private struct WhatsAppLoginWaitResult: Codable {
    let connected: Bool
    let message: String
}

private struct ChannelLogoutResult: Codable {
    let channel: String?
    let accountId: String?
    let cleared: Bool
    let envToken: Bool?
    let remoteLoggedOut: Bool?
    let localCleared: Bool?
}

private extension ChannelsStore {
    func resolveWhatsAppRuntimeStatus(from snap: ChannelsStatusSnapshot) -> String? {
        guard let status = snap.decodeChannel("whatsapp", as: ChannelsStatusSnapshot.WhatsAppStatus.self)
        else { return nil }
        let linked = status.linked ? "linked" : "not linked"
        let connection = status.connected ? "connected" : "disconnected"
        var parts = [linked, connection]
        if let lastError = status.lastError, !lastError.isEmpty {
            parts.append("error: \(lastError)")
        } else if let disconnect = status.lastDisconnect?.error, !disconnect.isEmpty {
            parts.append("last disconnect: \(disconnect)")
        }
        return parts.joined(separator: " • ")
    }
}
