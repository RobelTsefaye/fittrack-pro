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
    /// Keeps the display layer continuously fed. An `AVSampleBufferDisplayLayer`
    /// only becomes eligible for PiP (`isPictureInPicturePossible == true`)
    /// while it's actively receiving frames — a single enqueued frame is not
    /// enough, and relay pushes only arrive ~1/s AND only while a Watch cardio
    /// session is live. This ticks independently so PiP can start (and stay
    /// filled) even before/without any relay or poll data.
    private var renderTimer: Timer?

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

    // Wide and short — a slim overlay bar, not a big floating tile. Matches
    // CardioPipContentView's own .frame(width:height:).
    private let contentSize = CGSize(width: 440, height: 84)

    /// When the live relay last delivered a sample — used to let a fresher
    /// native (WatchConnectivity) push always win over a server stream
    /// response; see `streamOnce` below.
    private var lastNativeUpdateAt = Date.distantPast

    private var streamTask: Task<Void, Never>?
    private static let apiBaseURL = "https://fittrack-pro-ashen.vercel.app"
    /// Native relay data (CardioLiveRelay) only ever arrives on the one
    /// device actually paired with the Watch — WCSession.isSupported() is
    /// unconditionally false on iPad, so an iPad running this plugin would
    /// otherwise show a permanently blank PiP window. Subscribing to the same
    /// server SSE stream the web view uses (see /api/cardio/live/stream and
    /// cardio-live-context.tsx) fills that in: updates are pushed within
    /// ~300ms of the phone's POST. Runs unconditionally rather than
    /// only-on-iPad so there's no device-type branch to get wrong, and the
    /// freshness guard in `streamOnce` makes it a no-op wherever native relay
    /// data is already flowing.
    // Wait before reconnecting after the stream ends (server closes it at ~50s)
    // or errors — short, since a reconnect resumes the live view immediately.
    private static let streamReconnectNanos: UInt64 = 1_000_000_000

    @objc func isSupported(_ call: CAPPluginCall) {
        call.resolve(["supported": AVPictureInPictureController.isPictureInPictureSupported()])
    }

    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            NSLog("[CardioPiP] start() called")
            guard AVPictureInPictureController.isPictureInPictureSupported() else {
                call.reject("Picture in Picture wird auf diesem Gerät nicht unterstützt")
                return
            }
            if let pipController = self.pipController, pipController.isPictureInPictureActive {
                call.resolve()
                return
            }

            // THE prerequisite that was missing: PiP on iOS only becomes
            // possible while an active `.playback` audio session exists —
            // without it `isPictureInPicturePossible` never turns true and
            // `startPictureInPicture()` silently does nothing (no window, no
            // error). `.mixWithOthers` is deliberate: this feature exists to
            // float over a video the user is watching in *another* app, and
            // our PiP has no audio of its own, so we must NOT interrupt that
            // app's sound. A non-mixing session would kill the movie's audio
            // the moment PiP starts.
            self.activateAudioSession()

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
            self.startStreaming()

            // Feed the layer continuously so it stays PiP-eligible even
            // before the first relay/poll sample arrives. 10fps (not the
            // data's ~1Hz): the displayed bpm eases toward the latest sample
            // a little per frame (see renderFrame), so the number counts
            // smoothly instead of popping to a new value once a second.
            self.renderTimer?.invalidate()
            self.renderTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
                self?.renderFrame()
            }

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
        NSLog("[CardioPiP] waitUntilPossibleThenStart: possible=\(controller.isPictureInPicturePossible)")
        if controller.isPictureInPicturePossible {
            beginStartAttempts(controller)
            return
        }
        possibleObservation = controller.observe(\.isPictureInPicturePossible, options: [.new]) { [weak self] ctrl, change in
            NSLog("[CardioPiP] isPictureInPicturePossible changed -> \(String(describing: change.newValue))")
            guard change.newValue == true else { return }
            DispatchQueue.main.async {
                self?.possibleObservation = nil
                self?.possibleTimeoutTask?.cancel()
                self?.possibleTimeoutTask = nil
                self?.beginStartAttempts(ctrl)
            }
        }
        possibleTimeoutTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            guard !Task.isCancelled else { return }
            await MainActor.run {
                guard let self, self.possibleObservation != nil else { return }
                NSLog("[CardioPiP] 5s TIMEOUT — isPictureInPicturePossible never flipped true")
                self.possibleObservation = nil
                self.pendingStartCall?.reject(
                    "Picture in Picture wurde nicht bereit (isPictureInPicturePossible blieb false)"
                )
                self.pendingStartCall = nil
                self.teardownDisplayLayer()
            }
        }
    }

    /// On-device evidence (this exact hardware, logged): the FIRST
    /// `startPictureInPicture()` call is silently swallowed by AVKit — even
    /// with `isPictureInPicturePossible == true` — and produces no
    /// willStart/didStart/failedToStart at all. The retry ~0.4s later is the
    /// one that actually opens the window ("attempt 2" in the captured log).
    /// So: keep calling until a delegate callback settles `pendingStartCall`
    /// (didStart / failedToStart both clear it, which stops the loop), and
    /// give up with a real JS error after 8 tries instead of hanging the
    /// button in its disabled "starting" state forever.
    private var startAttempts = 0

    private func beginStartAttempts(_ controller: AVPictureInPictureController) {
        startAttempts = 0
        attemptStart(controller)
    }

    private func attemptStart(_ controller: AVPictureInPictureController) {
        guard pendingStartCall != nil, !controller.isPictureInPictureActive else { return }
        startAttempts += 1
        NSLog("[CardioPiP] startPictureInPicture() attempt \(startAttempts)")
        controller.startPictureInPicture()
        if startAttempts < 8 {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
                self?.attemptStart(controller)
            }
        } else {
            // Out of attempts — one last grace period for a late didStart,
            // then surface a real error instead of a forever-pending promise.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { [weak self] in
                guard let self, let pending = self.pendingStartCall else { return }
                NSLog("[CardioPiP] gave up after \(self.startAttempts) start attempts")
                self.pendingStartCall = nil
                self.teardownDisplayLayer()
                pending.reject("Picture in Picture konnte nicht gestartet werden")
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

    private func activateAudioSession() {
        let session = AVAudioSession.sharedInstance()
        do {
            // NO .mixWithOthers: the on-device-verified working configuration
            // used a plain non-mixing .playback session. PiP start on this
            // setup is fragile enough (see the retry loop below) that we keep
            // exactly what was proven to open a window; a mixing session was
            // part of a build where the start was silently swallowed. If
            // mixing is ever re-attempted, verify PiP still starts on-device
            // first.
            try session.setCategory(.playback, mode: .moviePlayback)
            try session.setActive(true)
            NSLog("[CardioPiP] audio session active: cat=\(session.category.rawValue) mode=\(session.mode.rawValue)")
        } catch {
            NSLog("[CardioPiP] activateAudioSession FAILED: \(error)")
        }
    }

    private func deactivateAudioSession() {
        // notifyOthersOnDeactivation lets whatever app we were mixing over
        // (the movie the user is watching) resume its normal audio focus.
        try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
    }

    private func makeDisplayLayer() -> AVSampleBufferDisplayLayer {
        if let displayLayer, let hostView, hostView.superview != nil {
            return displayLayer
        }
        let layer = AVSampleBufferDisplayLayer()
        layer.videoGravity = .resizeAspect

        // A `controlTimebase` gives the layer a clock. Without it the PiP
        // controller has no playback state to reason about and never reports
        // `isPictureInPicturePossible == true` for a sample-buffer source, so
        // `startPictureInPicture()` silently does nothing (no willStart /
        // didStart / failedToStart ever fires).
        var timebase: CMTimebase?
        CMTimebaseCreateWithSourceClock(
            allocator: kCFAllocatorDefault,
            sourceClock: CMClockGetHostTimeClock(),
            timebaseOut: &timebase
        )
        if let timebase {
            CMTimebaseSetRate(timebase, rate: 1.0)
            layer.controlTimebase = timebase
        }

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
        renderTimer?.invalidate()
        renderTimer = nil
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
        stopStreaming()
        deactivateAudioSession()
        latestSample = nil
        displayedHeartRate = 0
        zoneSeconds = [:]
        lastElapsed = nil
        lastZoneKey = 0
    }

    // MARK: - Server SSE stream (devices with no Watch pairing, e.g. iPad)

    private func startStreaming() {
        streamTask?.cancel()
        guard let token = SyncTokenStore.load() else {
            // No token stored on this device (Settings → API Tokens →
            // "Für Hintergrund-Sync verwenden" was never tapped here) —
            // nothing to authenticate the stream with. The relay subscription
            // above still covers this device fine if it happens to be the
            // Watch-paired iPhone; only a device with neither ends up blank.
            return
        }
        streamTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.streamOnce(token: token)
                // Stream ended (server closed it at ~50s) or errored — pause
                // briefly, then reconnect for the next window.
                try? await Task.sleep(nanoseconds: Self.streamReconnectNanos)
            }
        }
    }

    private func stopStreaming() {
        streamTask?.cancel()
        streamTask = nil
    }

    /// Opens one SSE connection and applies each `data:` frame until the
    /// server closes it or the connection drops; the caller loops to reconnect.
    private func streamOnce(token: String) async {
        guard let url = URL(string: Self.apiBaseURL + "/api/cardio/live/stream") else { return }
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.timeoutInterval = 70

        guard let (bytes, response) = try? await URLSession.shared.bytes(for: request),
              let http = response as? HTTPURLResponse, http.statusCode < 400
        else { return }

        do {
            for try await line in bytes.lines {
                if Task.isCancelled { return }
                // SSE frames: "data: <json>". Ignore ": ping" heartbeats,
                // "retry:" directives, and blank separator lines.
                guard line.hasPrefix("data:") else { continue }
                let payload = line.dropFirst("data:".count).trimmingCharacters(in: .whitespaces)
                guard let data = payload.data(using: .utf8),
                      let decoded = try? JSONDecoder().decode(CardioLiveSnapshotResponse.self, from: data)
                else { continue }

                await MainActor.run {
                    // A native relay push always wins if it's recent — the
                    // stream only fills in for a device that never gets one.
                    guard Date().timeIntervalSince(self.lastNativeUpdateAt) > 3 else { return }
                    guard let sample = decoded.data else { return }
                    self.render(sample)
                    if !sample.isRunning {
                        self.pipController?.stopPictureInPicture()
                    }
                }
            }
        } catch {
            // Connection dropped — the caller's loop reconnects.
        }
    }

    // MARK: - Rendering

    /// Latest data sample (relay or poll) — the *target* the displayed value
    /// eases toward; renderFrame() below does the actual drawing.
    private var latestSample: CardioLiveSample?
    /// The bpm value currently shown, smoothed across frames so a new sample
    /// (e.g. 79 → 91) counts up over a few frames instead of popping.
    private var displayedHeartRate: Double = 0

    /// CUMULATIVE seconds spent in each zone this session (key: zone 1–5, or
    /// 0 for "below zone 1 / no zone"). The PiP timer shows the TOTAL time in
    /// the currently-active zone across the whole session — summed even if the
    /// user left the zone and came back later — not per-interval. Accumulated
    /// from the Watch's authoritative `elapsedSeconds` (identical on the
    /// iPad's polled samples): each sample adds the elapsed delta since the
    /// previous one to whichever zone was active during that slice.
    private var zoneSeconds: [Int: Int] = [:]
    private var lastElapsed: Int?
    private var lastZoneKey = 0

    @MainActor private func render(_ sample: CardioLiveSample?) {
        if let sample {
            let key = sample.zone ?? 0
            if let last = lastElapsed {
                if sample.elapsedSeconds < last {
                    // Fresh session (elapsed jumped backwards) → start totals over.
                    zoneSeconds = [:]
                } else {
                    // Attribute the elapsed slice to the zone that was active
                    // during it (the previous sample's zone).
                    zoneSeconds[lastZoneKey, default: 0] += sample.elapsedSeconds - last
                }
            }
            lastElapsed = sample.elapsedSeconds
            lastZoneKey = key
            latestSample = sample
        }
        renderFrame()
    }

    @MainActor private func renderFrame() {
        guard let displayLayer else { return }

        let target = latestSample?.heartRate ?? 0
        if displayedHeartRate == 0 {
            // First reading: show it immediately rather than counting up from 0.
            displayedHeartRate = target
        } else {
            let delta = target - displayedHeartRate
            // ~25% of the remaining gap per frame at 10fps ≈ settles in under
            // a second — matches the ~1s sample cadence, so the number is
            // still gliding when the next sample lands. Snap when close so
            // it doesn't hover at n±0.4 forever.
            displayedHeartRate = abs(delta) < 0.5 ? target : displayedHeartRate + delta * 0.25
        }

        // Beat phase drives the heart icon's subtle pulse at the actual
        // heart rate (bpm/60 beats per second).
        let bpmForBeat = max(displayedHeartRate, 40)
        let beatPhase = Date().timeIntervalSinceReferenceDate * (bpmForBeat / 60) * 2 * .pi

        // Total time in the currently-active zone this session (see zoneSeconds).
        let currentZoneKey = latestSample?.zone ?? 0
        let zoneTotalSeconds = zoneSeconds[currentZoneKey, default: 0]

        let content = CardioPipContentView(
            heartRate: displayedHeartRate,
            zone: latestSample?.zone,
            elapsedSeconds: zoneTotalSeconds,
            beatPhase: beatPhase
        )
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
        // `kCVPixelBufferIOSurfacePropertiesKey` is REQUIRED: PiP hands each
        // frame to a separate system process, and only IOSurface-backed pixel
        // buffers can cross that process boundary. Without it the enqueued
        // sample fails serialization with `FigSampleBufferSerialization
        // err=-19642` and the PiP window stays blank. 32BGRA is the format the
        // display/serialization path handles reliably (32ARGB does not).
        let attrs: [CFString: Any] = [
            kCVPixelBufferCGImageCompatibilityKey: true,
            kCVPixelBufferCGBitmapContextCompatibilityKey: true,
            kCVPixelBufferIOSurfacePropertiesKey: [:] as CFDictionary,
        ]
        var pixelBuffer: CVPixelBuffer?
        let status = CVPixelBufferCreate(
            kCFAllocatorDefault, width, height,
            kCVPixelFormatType_32BGRA,
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
            bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue
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
    public func pictureInPictureControllerWillStartPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        NSLog("[CardioPiP] willStartPictureInPicture")
    }

    public func pictureInPictureControllerDidStartPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        NSLog("[CardioPiP] didStartPictureInPicture — isPictureInPictureActive=\(pictureInPictureController.isPictureInPictureActive)")
        pendingStartCall?.resolve()
        pendingStartCall = nil
    }

    public func pictureInPictureController(
        _ pictureInPictureController: AVPictureInPictureController,
        failedToStartPictureInPictureWithError error: Error
    ) {
        NSLog("[CardioPiP] failedToStartPictureInPicture: \(error)")
        pendingStartCall?.reject(error.localizedDescription)
        pendingStartCall = nil
        teardownDisplayLayer()
    }

    /// Fires whether PiP was stopped by our own `stop()`, the user dismissing
    /// the PiP window's close control, or the system reclaiming it for any
    /// other reason — this is the single place all three converge, so
    /// cleanup and the JS-facing "stopped" event only need to live here.
    public func pictureInPictureControllerDidStopPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        NSLog("[CardioPiP] didStopPictureInPicture")
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
        // true — part of the on-device-verified configuration under which the
        // PiP window actually opened. `false` would be friendlier to another
        // app's audio, but it shipped in a build whose PiP start was silently
        // swallowed; re-evaluate only with an on-device start test.
        true
    }
}
