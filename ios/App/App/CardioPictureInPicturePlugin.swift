import Foundation
import UIKit
import SwiftUI
import AVKit
import AVFoundation
import Capacitor

/**
 * System-wide Picture in Picture for the live cardio (Laufen/Radfahren) view
 * — a native, freely-floating, draggable/dockable OS window, using Apple's
 * non-video PiP path: `AVPictureInPictureController.ContentSource` fed by an
 * `AVSampleBufferDisplayLayer` instead of an `AVPlayerLayer`, available
 * since iOS 15 (this app's deployment target is 26.0, well above that).
 *
 * There is no real "video" here — every ~1s (matching the Watch's push
 * cadence, see PhoneWorkoutObserver.pushCardioLiveUpdate) the current zone +
 * heart rate are rendered from `CardioPipContentView` into a single-frame
 * `CMSampleBuffer` and enqueued. `AVPictureInPictureSampleBufferPlaybackDelegate`
 * is implemented with "always playing, no scrubbing" semantics — matching a
 * live feed with no timeline to scrub or pause.
 *
 * Live data for rendering comes from `CardioLiveRelay`, NOT from JS — see
 * that type's doc comment for why the JS bridge can't be relied on once
 * this app is backgrounded (the entire point of this feature).
 */
@objc(CardioPictureInPicturePlugin)
public class CardioPictureInPicturePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CardioPictureInPicturePlugin"
    public let jsName = "CardioPictureInPicture"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "addListener", returnType: CAPPluginReturnCallback),
        CAPPluginMethod(name: "removeAllListeners", returnType: CAPPluginReturnPromise),
    ]

    private var pipController: AVPictureInPictureController?
    private var displayLayer: AVSampleBufferDisplayLayer?
    /// Tiny, non-hidden host view for `displayLayer` — `AVPictureInPictureController`
    /// requires its content source's layer to actually be part of a rendered
    /// view hierarchy, but there's no reason for it to be visually
    /// noticeable: the system's PiP chrome takes over the instant PiP starts.
    private var hostView: UIView?
    private var relaySubscription: UUID?

    /// `isPictureInPicturePossible` is KVO-observable and starts out `false`
    /// even after the content source/layer are wired up — AVKit needs at
    /// least one render pass to confirm the layer can actually produce
    /// frames. Calling `startPictureInPicture()` before it flips to `true`
    /// is the single most common reason sample-buffer PiP silently does
    /// nothing (no window, often no error either): this observation is what
    /// makes `start()` wait for the real go-ahead instead of racing it.
    private var possibleObservation: NSKeyValueObservation?
    private var possibleTimeoutTask: Task<Void, Never>?

    private var pendingStartCall: CAPPluginCall?
    private var pendingStopCall: CAPPluginCall?

    private let contentSize = CGSize(width: 300, height: 300)

    /// When the live relay last delivered a sample — used to let a fresher
    /// native (WatchConnectivity) push always win over a slower poll
    /// response; see `pollOnce` below.
    private var lastNativeUpdateAt = Date.distantPast

    private var pollTask: Task<Void, Never>?
    private static let apiBaseURL = "https://fittrack-pro-ashen.vercel.app"
    /// Native relay data (CardioLiveRelay) only ever arrives on the one
    /// device actually paired with the Watch — WCSession.isSupported() is
    /// unconditionally false on iPad, so an iPad running this plugin would
    /// otherwise show a permanently blank PiP window. Polling the same
    /// server relay the JS side uses (cardio-live-context.tsx) is the
    /// fallback; it runs unconditionally rather than only-on-iPad so there's
    /// no device-type branch to get wrong, and the freshness guard in
    /// `pollOnce` already makes it a no-op wherever native data is flowing.
    private static let pollIntervalNanos: UInt64 = 2_000_000_000

    @objc func isSupported(_ call: CAPPluginCall) {
        call.resolve(["supported": AVPictureInPictureController.isPictureInPictureSupported()])
    }

    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard AVPictureInPictureController.isPictureInPictureSupported() else {
                call.reject("Picture in Picture wird auf diesem Gerät nicht unterstützt")
                return
            }
            if let pipController = self.pipController, pipController.isPictureInPictureActive {
                call.resolve()
                return
            }

            let layer = self.makeDisplayLayer()
            let contentSource = AVPictureInPictureController.ContentSource(
                sampleBufferDisplayLayer: layer,
                playbackDelegate: self
            )
            let controller = AVPictureInPictureController(contentSource: contentSource)
            controller.delegate = self
            self.pipController = controller

            // Render whatever the last known sample was immediately, so the
            // window doesn't open on a blank black square while waiting for
            // the Watch's next ~1s push.
            self.render(CardioLiveRelay.shared.lastSample)
            self.relaySubscription = CardioLiveRelay.shared.subscribe { [weak self] sample in
                DispatchQueue.main.async {
                    self?.lastNativeUpdateAt = Date()
                    self?.render(sample)
                    // The Watch pushes one isRunning:false sample right as a
                    // cardio session ends/is cancelled (see
                    // PhoneWorkoutObserver.pushCardioLiveUpdate) — close PiP
                    // automatically rather than leaving a frozen, stale
                    // window floating over whatever app the user is in.
                    if !sample.isRunning {
                        self?.pipController?.stopPictureInPicture()
                    }
                }
            }
            self.startPolling()

            self.pendingStartCall = call
            self.waitUntilPossibleThenStart(controller)
        }
    }

    /// `startPictureInPicture()` must not be called until
    /// `isPictureInPicturePossible` is `true` — see the property's doc
    /// comment above. Observes it via KVO and starts the moment it flips;
    /// if it never does within a few seconds (content source never became
    /// eligible — e.g. the host view/layer didn't actually attach), rejects
    /// the pending JS call with a real error instead of silently doing
    /// nothing, which is what made the original bug invisible.
    private func waitUntilPossibleThenStart(_ controller: AVPictureInPictureController) {
        if controller.isPictureInPicturePossible {
            controller.startPictureInPicture()
            return
        }
        possibleObservation = controller.observe(\.isPictureInPicturePossible, options: [.new]) { [weak self] ctrl, change in
            guard change.newValue == true else { return }
            DispatchQueue.main.async {
                self?.possibleObservation = nil
                self?.possibleTimeoutTask?.cancel()
                self?.possibleTimeoutTask = nil
                ctrl.startPictureInPicture()
            }
        }
        possibleTimeoutTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            guard !Task.isCancelled else { return }
            await MainActor.run {
                guard let self, self.possibleObservation != nil else { return }
                self.possibleObservation = nil
                self.pendingStartCall?.reject(
                    "Picture in Picture wurde nicht bereit (isPictureInPicturePossible blieb false)"
                )
                self.pendingStartCall = nil
                self.teardownDisplayLayer()
            }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let pipController = self.pipController, pipController.isPictureInPictureActive else {
                call.resolve()
                return
            }
            self.pendingStopCall = call
            pipController.stopPictureInPicture()
        }
    }

    private func makeDisplayLayer() -> AVSampleBufferDisplayLayer {
        if let displayLayer, let hostView, hostView.superview != nil {
            return displayLayer
        }
        let layer = AVSampleBufferDisplayLayer()
        layer.videoGravity = .resizeAspect

        // 8x8pt, top-left corner, fully opaque and NOT `isHidden` — a hidden
        // or zero-area layer can make `isPictureInPicturePossible` report
        // false. At this size it's imperceptible in the brief moment before
        // the system's PiP window animates in and covers it.
        let container = UIView(frame: CGRect(x: 0, y: 0, width: 8, height: 8))
        container.isUserInteractionEnabled = false
        container.backgroundColor = .black
        container.layer.addSublayer(layer)
        layer.frame = container.bounds

        if let window = Self.keyWindow() {
            window.addSubview(container)
        }

        self.displayLayer = layer
        self.hostView = container
        return layer
    }

    private static func keyWindow() -> UIWindow? {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow }
    }

    private func teardownDisplayLayer() {
        displayLayer?.flushAndRemoveImage()
        hostView?.removeFromSuperview()
        displayLayer = nil
        hostView = nil
        pipController = nil
        if let relaySubscription {
            CardioLiveRelay.shared.unsubscribe(relaySubscription)
        }
        relaySubscription = nil
        possibleObservation = nil
        possibleTimeoutTask?.cancel()
        possibleTimeoutTask = nil
        stopPolling()
    }

    // MARK: - Server poll fallback (devices with no Watch pairing, e.g. iPad)

    private func startPolling() {
        pollTask?.cancel()
        guard let token = SyncTokenStore.load() else {
            // No token stored on this device (Settings → API Tokens →
            // "Für Hintergrund-Sync verwenden" was never tapped here) —
            // nothing to poll with. The relay subscription above still
            // covers this device fine if it happens to be the Watch-paired
            // iPhone; only a device with neither ends up with a stuck window.
            return
        }
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.pollOnce(token: token)
                try? await Task.sleep(nanoseconds: Self.pollIntervalNanos)
            }
        }
    }

    private func stopPolling() {
        pollTask?.cancel()
        pollTask = nil
    }

    private func pollOnce(token: String) async {
        guard let url = URL(string: Self.apiBaseURL + "/api/cardio/live") else { return }
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        guard let (data, response) = try? await URLSession.shared.data(for: request),
              let http = response as? HTTPURLResponse, http.statusCode < 400,
              let decoded = try? JSONDecoder().decode(CardioLiveSnapshotResponse.self, from: data),
              let sample = decoded.data
        else { return }

        await MainActor.run {
            // A native push always wins if it's recent — the poll is only
            // meant to fill in for a device that never gets one at all.
            guard Date().timeIntervalSince(self.lastNativeUpdateAt) > 3 else { return }
            self.render(sample)
            if !sample.isRunning {
                self.pipController?.stopPictureInPicture()
            }
        }
    }

    // MARK: - Rendering

    private func render(_ sample: CardioLiveSample?) {
        guard let displayLayer else { return }
        let content = CardioPipContentView(heartRate: sample?.heartRate ?? 0, zone: sample?.zone)
        let renderer = ImageRenderer(content: content)
        renderer.scale = UIScreen.main.scale
        guard let cgImage = renderer.cgImage else { return }
        guard let pixelBuffer = Self.makePixelBuffer(from: cgImage) else { return }
        guard let sampleBuffer = Self.makeSampleBuffer(from: pixelBuffer) else { return }

        if displayLayer.status == .failed {
            displayLayer.flush()
        }
        displayLayer.enqueue(sampleBuffer)
    }

    private static func makePixelBuffer(from image: CGImage) -> CVPixelBuffer? {
        let width = image.width
        let height = image.height
        let attrs: [CFString: Any] = [
            kCVPixelBufferCGImageCompatibilityKey: true,
            kCVPixelBufferCGBitmapContextCompatibilityKey: true,
        ]
        var pixelBuffer: CVPixelBuffer?
        let status = CVPixelBufferCreate(
            kCFAllocatorDefault, width, height,
            kCVPixelFormatType_32ARGB,
            attrs as CFDictionary,
            &pixelBuffer
        )
        guard status == kCVReturnSuccess, let buffer = pixelBuffer else { return nil }

        CVPixelBufferLockBaseAddress(buffer, [])
        defer { CVPixelBufferUnlockBaseAddress(buffer, []) }

        guard let context = CGContext(
            data: CVPixelBufferGetBaseAddress(buffer),
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue
        ) else { return nil }

        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        return buffer
    }

    /// Wraps a single frame as a `CMSampleBuffer` marked "display immediately"
    /// — this is a one-shot snapshot pushed roughly once per second, not a
    /// synced video stream, so there's no reason to set up (and keep
    /// advancing) `displayLayer.controlTimebase`; `kCMSampleAttachmentKey_DisplayImmediately`
    /// tells the layer to show it the moment it's enqueued instead of
    /// scheduling it against a media clock.
    private static func makeSampleBuffer(from pixelBuffer: CVPixelBuffer) -> CMSampleBuffer? {
        var formatDescription: CMVideoFormatDescription?
        let formatStatus = CMVideoFormatDescriptionCreateForImageBuffer(
            allocator: kCFAllocatorDefault,
            imageBuffer: pixelBuffer,
            formatDescriptionOut: &formatDescription
        )
        guard formatStatus == noErr, let formatDescription else { return nil }

        var timingInfo = CMSampleTimingInfo(
            duration: .invalid,
            presentationTimeStamp: CMClockGetTime(CMClockGetHostTimeClock()),
            decodeTimeStamp: .invalid
        )

        var sampleBuffer: CMSampleBuffer?
        let sampleStatus = CMSampleBufferCreateReadyWithImageBuffer(
            allocator: kCFAllocatorDefault,
            imageBuffer: pixelBuffer,
            formatDescription: formatDescription,
            sampleTiming: &timingInfo,
            sampleBufferOut: &sampleBuffer
        )
        guard sampleStatus == noErr, let sampleBuffer else { return nil }

        if let attachments = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary: true) {
            let dict = unsafeBitCast(CFArrayGetValueAtIndex(attachments, 0), to: CFMutableDictionary.self)
            CFDictionarySetValue(
                dict,
                Unmanaged.passUnretained(kCMSampleAttachmentKey_DisplayImmediately).toOpaque(),
                Unmanaged.passUnretained(kCFBooleanTrue).toOpaque()
            )
        }

        return sampleBuffer
    }
}

// MARK: - AVPictureInPictureControllerDelegate

extension CardioPictureInPicturePlugin: AVPictureInPictureControllerDelegate {
    public func pictureInPictureControllerDidStartPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        pendingStartCall?.resolve()
        pendingStartCall = nil
    }

    public func pictureInPictureController(
        _ pictureInPictureController: AVPictureInPictureController,
        failedToStartPictureInPictureWithError error: Error
    ) {
        pendingStartCall?.reject(error.localizedDescription)
        pendingStartCall = nil
        teardownDisplayLayer()
    }

    /// Fires whether PiP was stopped by our own `stop()`, the user dismissing
    /// the PiP window's close control, or the system reclaiming it for any
    /// other reason — this is the single place all three converge, so
    /// cleanup and the JS-facing "stopped" event only need to live here.
    public func pictureInPictureControllerDidStopPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        teardownDisplayLayer()
        pendingStopCall?.resolve()
        pendingStopCall = nil
        notifyListeners("stopped", data: [:])
    }
}

// MARK: - AVPictureInPictureSampleBufferPlaybackDelegate

extension CardioPictureInPicturePlugin: AVPictureInPictureSampleBufferPlaybackDelegate {
    /// No real play/pause state — a live feed has nothing to pause. Ignoring
    /// this (rather than tearing down) means tapping the system PiP window's
    /// pause control just leaves the last frame on screen, which is the
    /// closest equivalent to "paused" a live-only feed can offer.
    public func pictureInPictureController(_ pictureInPictureController: AVPictureInPictureController, setPlaying playing: Bool) {}

    public func pictureInPictureControllerTimeRangeForPlayback(_ pictureInPictureController: AVPictureInPictureController) -> CMTimeRange {
        CMTimeRange(start: .negativeInfinity, duration: .positiveInfinity)
    }

    public func pictureInPictureControllerIsPlaybackPaused(_ pictureInPictureController: AVPictureInPictureController) -> Bool {
        false
    }

    public func pictureInPictureController(
        _ pictureInPictureController: AVPictureInPictureController,
        didTransitionToRenderSize newRenderSize: CMVideoDimensions
    ) {}

    public func pictureInPictureController(
        _ pictureInPictureController: AVPictureInPictureController,
        skipByInterval skipInterval: CMTime,
        completion completionHandler: @escaping () -> Void
    ) {
        // No timeline to skip within — a live feed has no "back 15s".
        completionHandler()
    }

    public func pictureInPictureControllerShouldProhibitBackgroundAudioPlayback(_ pictureInPictureController: AVPictureInPictureController) -> Bool {
        true
    }
}
