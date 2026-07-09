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
    /// filled) even before/without any relay data.
    private var renderTimer: Timer?

    private var pendingStartCall: CAPPluginCall?
    private var pendingStopCall: CAPPluginCall?

    private let contentSize = CGSize(width: 300, height: 120)

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

            // Non-video (sample-buffer) PiP silently refuses to start unless the
            // app owns an ACTIVE audio session with a PiP-compatible category.
            // A Capacitor WebView app defaults to `.soloAmbient`, which does NOT
            // qualify — so `isPictureInPicturePossible` never flips true and
            // `startPictureInPicture()` does nothing at all. This is the single
            // most common reason sample-buffer PiP "just doesn't open".
            do {
                let audioSession = AVAudioSession.sharedInstance()
                try audioSession.setCategory(.playback, mode: .moviePlayback)
                try audioSession.setActive(true)
            } catch {
                call.reject("Audio-Session für Picture in Picture konnte nicht aktiviert werden: \(error.localizedDescription)")
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

            // Feed the layer continuously so it stays PiP-eligible and the
            // content keeps refreshing even without relay pushes.
            self.renderTimer?.invalidate()
            self.renderTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
                self?.render(CardioLiveRelay.shared.lastSample)
            }

            self.pendingStartCall = call
            self.dumpDiagnostics(controller, tag: "t=0")
            self.startWhenPossible(controller)
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
                self?.dumpDiagnostics(controller, tag: "t=1s")
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
                self?.dumpDiagnostics(controller, tag: "t=3s")
            }

            // Safety net: if the controller neither starts nor reports a
            // failure (the silent no-op case), fail the JS call instead of
            // leaving the promise pending forever with the button stuck in
            // its disabled "starting" state.
            DispatchQueue.main.asyncAfter(deadline: .now() + 5) { [weak self] in
                guard let self, let pending = self.pendingStartCall, pending === call else { return }
                NSLog("[CardioPiP] start timed out — no delegate callback within 5s")
                self.pendingStartCall = nil
                self.teardownDisplayLayer()
                pending.reject("Picture in Picture konnte nicht gestartet werden")
            }
        }
    }

    /// One-shot dump of every state that gates sample-buffer PiP — the
    /// controller fails silently (no delegate callback) when any of these is
    /// off, so this is the only way to see WHICH one it is on-device.
    private func dumpDiagnostics(_ controller: AVPictureInPictureController, tag: String) {
        let session = AVAudioSession.sharedInstance()
        let layer = displayLayer
        let host = hostView
        NSLog("""
        [CardioPiP][\(tag)] \
        possible=\(controller.isPictureInPicturePossible) \
        active=\(controller.isPictureInPictureActive) \
        suspended=\(controller.isPictureInPictureSuspended) \
        | audio: cat=\(session.category.rawValue) mode=\(session.mode.rawValue) otherPlaying=\(session.isOtherAudioPlaying) \
        | layer: status=\(layer?.status.rawValue ?? -1) ready=\(layer?.isReadyForMoreMediaData ?? false) \
        tbRate=\(layer?.controlTimebase.map { CMTimebaseGetRate($0) } ?? -1) \
        | host: inWindow=\(host?.window != nil) frame=\(host.map { NSCoder.string(for: $0.frame) } ?? "nil") \
        | appState=\(UIApplication.shared.applicationState.rawValue)
        """)
    }

    /// Attempt the start repeatedly with short spacing. A single call made in
    /// the same run-loop turn as the controller's creation can be silently
    /// swallowed by AVKit (no willStart/didStart/failedToStart at all), so
    /// retry until a delegate callback settles the pending call (didStart /
    /// failedToStart / the 5s timeout all clear `pendingStartCall`, which
    /// stops the retries).
    private var startAttempts = 0
    private func startWhenPossible(_ controller: AVPictureInPictureController) {
        startAttempts = 0
        attemptStart(controller)
    }

    private func attemptStart(_ controller: AVPictureInPictureController) {
        guard pendingStartCall != nil, !controller.isPictureInPictureActive else { return }
        startAttempts += 1
        NSLog("[CardioPiP] startPictureInPicture() attempt \(startAttempts)")
        controller.startPictureInPicture()
        guard startAttempts < 8 else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
            self?.attemptStart(controller)
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

        // Release the audio session we claimed in `start()` so other apps'
        // audio can resume; `.notifyOthersOnDeactivation` lets a paused
        // music/podcast app pick back up where it left off.
        try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
    }

    // MARK: - Rendering

    @MainActor private func render(_ sample: CardioLiveSample?) {
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
        NSLog("[CardioPiP] willStart")
    }

    public func pictureInPictureControllerDidStartPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        NSLog("[CardioPiP] didStart — isPictureInPictureActive=\(pictureInPictureController.isPictureInPictureActive)")
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
        NSLog("[CardioPiP] didStop")
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
