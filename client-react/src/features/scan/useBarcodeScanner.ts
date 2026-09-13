import { useCallback, useEffect, useRef, useState } from 'react'
import type { InterpolationValues } from '@/locale/LocaleProvider'

/**
 * The camera, and the two barcode decoders, behind one hook.
 *
 * ## Why there are two decoders
 *
 * `BarcodeDetector` is the platform API: native, fast, and free of a WASM
 * download. It ships in Chrome and Edge, and **not in Safari** — which is the
 * device this feature is most likely to be used from. So `@zxing/browser` is
 * not a nicety here, it is the path that actually runs in production. Both sit
 * behind {@link BarcodeDecoder} so everything downstream — the queue, the
 * duplicate prompt, the tests — is written once.
 *
 * Feature detection is `'BarcodeDetector' in window` **plus** a
 * `getSupportedFormats()` call that actually contains `ean_13`: the constructor
 * exists in builds where the format set is empty, and a decoder that can never
 * match anything is worse than no decoder, because nothing ever reports it.
 *
 * ## Why the stream is owned here and not by the decoder
 *
 * `@zxing/browser` will happily open a camera for you. It is not given the
 * chance: a camera left running behind a closed view is the bug people notice
 * as a hot phone and a live indicator light, so the `MediaStream` is acquired
 * in one effect whose cleanup stops every track, and the decoder is only ever
 * handed the `<video>` element that is already playing it.
 *
 * ## `paused` stops the decoder; it does not ignore it
 *
 * When the duplicate confirmation is up, scanning pauses. That is implemented
 * by tearing the decoder down, not by dropping decodes on the floor: a camera
 * that keeps decoding behind a modal stacks a second question behind the first
 * and the user answers one dialog while a queue of them builds invisibly. The
 * stream stays open across a pause so the preview does not black out and the
 * permission prompt is not re-triggered.
 */

/** The barcode symbologies a book's barcode can plausibly arrive as. */
export type DecodeFormat = 'ean_13' | 'ean_8' | 'upc_a' | 'unknown'

/** One reading off the camera. Raw — nothing here is validated yet. */
export type Decode = {
  /** The digits the symbol carried, exactly as the decoder reported them. */
  value: string
  format: DecodeFormat
}

/**
 * The seam the whole feature is tested through.
 *
 * The camera cannot be driven in jsdom, so this interface is where the fake
 * goes: a test supplies a decoder that emits a scripted sequence and everything
 * above it — debounce, queue, library check, duplicate prompt — runs for real.
 */
export type BarcodeDecoder = {
  /** Which implementation this is. Surfaced in the UI for diagnosis. */
  readonly kind: 'native' | 'zxing'
  /** Begin decoding frames from `video`, calling `onDecode` per reading. */
  start(video: HTMLVideoElement, onDecode: (decode: Decode) => void): Promise<void>
  /** Stop the decode loop. Must be safe to call more than once. */
  stop(): void
}

/** Builds a decoder, or resolves to `null` when this browser has none. */
export type DecoderFactory = () => Promise<BarcodeDecoder | null>

/** How often the native detector is asked for a reading, in milliseconds. */
const NATIVE_INTERVAL_MS = 120

// ---------------------------------------------------------------------------
// The platform decoder
// ---------------------------------------------------------------------------

type NativeBarcode = { rawValue: string; format: string }

type NativeDetector = {
  detect(source: CanvasImageSource): Promise<NativeBarcode[]>
}

type NativeDetectorConstructor = {
  new (options?: { formats?: string[] }): NativeDetector
  getSupportedFormats(): Promise<string[]>
}

/**
 * Formats worth asking for.
 *
 * `ean_13` is the real target — a book's barcode is an EAN-13 whose digits
 * *are* the ISBN-13. The other two are requested so a decode is not silently
 * dropped: they are rejected at validation with "not a book barcode", which is
 * a thing someone can act on, rather than by the camera appearing to see
 * nothing at all.
 */
const WANTED_FORMATS = ['ean_13', 'ean_8', 'upc_a'] as const

function toDecodeFormat(raw: string): DecodeFormat {
  const format = raw.toLowerCase().replace(/-/g, '_')
  return (WANTED_FORMATS as readonly string[]).includes(format)
    ? (format as DecodeFormat)
    : 'unknown'
}

/**
 * The `BarcodeDetector` decoder, or `null` if this browser cannot do it.
 *
 * The `getSupportedFormats()` check is not redundant with the `in window`
 * check: some builds expose the constructor with an empty format set.
 */
export async function createNativeDecoder(): Promise<BarcodeDecoder | null> {
  if (typeof window === 'undefined' || !('BarcodeDetector' in window)) return null

  const Detector = (window as unknown as { BarcodeDetector: NativeDetectorConstructor })
    .BarcodeDetector

  let supported: string[]
  try {
    supported = await Detector.getSupportedFormats()
  } catch {
    return null
  }
  if (!supported.includes('ean_13')) return null

  const formats = WANTED_FORMATS.filter((format) => supported.includes(format))
  const detector = new Detector({ formats })

  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null

  return {
    kind: 'native',
    async start(video, onDecode) {
      const tick = async () => {
        if (stopped) return
        try {
          // `videoWidth` is 0 until the first frame has arrived; detecting on
          // an unsized element throws in some builds and returns nothing in
          // the rest, so skip the call entirely until there is a frame.
          if (video.videoWidth > 0) {
            for (const barcode of await detector.detect(video)) {
              if (stopped) return
              onDecode({
                value: barcode.rawValue,
                format: toDecodeFormat(barcode.format),
              })
            }
          }
        } catch {
          // A transient detect failure is normal — a frame arrives mid-resize,
          // the element is momentarily detached. Keep looping; a decoder that
          // gives up on one bad frame reads as a dead camera.
        }
        if (!stopped) timer = setTimeout(tick, NATIVE_INTERVAL_MS)
      }
      await tick()
    },
    stop() {
      stopped = true
      if (timer) clearTimeout(timer)
      timer = null
    },
  }
}

// ---------------------------------------------------------------------------
// The zxing decoder
// ---------------------------------------------------------------------------

/**
 * The `@zxing/browser` decoder — the Safari path.
 *
 * Imported dynamically so the library is a separate chunk that only a phone
 * that actually opens Scan mode ever downloads.
 */
export async function createZxingDecoder(): Promise<BarcodeDecoder | null> {
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] =
    await Promise.all([import('@zxing/browser'), import('@zxing/library')])

  const formats = new Map<number, DecodeFormat>([
    [BarcodeFormat.EAN_13, 'ean_13'],
    [BarcodeFormat.EAN_8, 'ean_8'],
    [BarcodeFormat.UPC_A, 'upc_a'],
  ])

  const hints = new Map<number, unknown>()
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [...formats.keys()])
  // A book barcode is dense and often read at an angle on a curved cover;
  // "try harder" is the difference between a decode in half a second and the
  // user slowly rotating the phone wondering whether the thing is on.
  hints.set(DecodeHintType.TRY_HARDER, true)

  const reader = new BrowserMultiFormatReader(hints, {
    delayBetweenScanAttempts: 100,
    delayBetweenScanSuccess: 300,
  })

  let controls: { stop: () => void } | null = null
  let stopped = false

  return {
    kind: 'zxing',
    async start(video, onDecode) {
      const next = await reader.decodeFromVideoElement(video, (result) => {
        if (stopped || !result) return
        onDecode({
          value: result.getText(),
          format: formats.get(result.getBarcodeFormat()) ?? 'unknown',
        })
      })
      // `stop()` can land while `decodeFromVideoElement` is still waiting on
      // the video's `canplay`. Without this the loop starts *after* the view
      // has gone and never stops.
      if (stopped) next.stop()
      else controls = next
    },
    stop() {
      stopped = true
      controls?.stop()
      controls = null
    },
  }
}

/** Native first, zxing second. The order the spec fixes. */
export async function createBestDecoder(): Promise<BarcodeDecoder | null> {
  return (await createNativeDecoder()) ?? (await createZxingDecoder())
}

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

/**
 * What the camera is currently doing. Every value except `scanning` and
 * `paused` is something the view has to explain in words.
 */
export type ScanStatus =
  | 'idle'
  | 'starting'
  | 'scanning'
  | 'paused'
  | 'denied'
  | 'insecure'
  | 'unsupported'
  | 'error'

export type BarcodeScanner = {
  /** Attach to the `<video>` the preview renders into. */
  videoRef: React.RefObject<HTMLVideoElement | null>
  status: ScanStatus
  /** A sentence for the user when `status` is a failure. */
  error: string | null
  /** Which decoder won, once one has started. */
  decoderKind: BarcodeDecoder['kind'] | null
  torchSupported: boolean
  torchOn: boolean
  toggleTorch: () => void
}

/** Is a camera plausibly available at all? Decides whether Scan is offered. */
export function cameraIsPlausible(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  )
}

function stopStream(stream: MediaStream | null) {
  for (const track of stream?.getTracks() ?? []) track.stop()
}

export function useBarcodeScanner({
  active,
  paused,
  onDecode,
  createDecoder = createBestDecoder,
  translate,
}: {
  /** Whether the camera should be open at all. */
  active: boolean
  /** Whether decoding is suspended (the confirmation is up). */
  paused: boolean
  onDecode: (decode: Decode) => void
  /** Injected by tests. Defaults to native-then-zxing. */
  createDecoder?: DecoderFactory
  /** Client label translator. Kept optional for hook-level tests. */
  translate?: (code: string, fallback: string, values?: InterpolationValues) => string
}): BarcodeScanner {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Both are read from inside long-lived async work, so they are refs rather
  // than deps: re-running the camera effect because a parent re-rendered would
  // drop the stream and re-prompt for permission.
  const onDecodeRef = useRef(onDecode)
  onDecodeRef.current = onDecode
  const createDecoderRef = useRef(createDecoder)
  createDecoderRef.current = createDecoder
  const translateRef = useRef(translate)
  translateRef.current = translate

  const [status, setStatus] = useState<ScanStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [decoderKind, setDecoderKind] = useState<BarcodeDecoder['kind'] | null>(null)
  const [streamReady, setStreamReady] = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)
  const [torchOn, setTorchOn] = useState(false)

  // --- the camera ----------------------------------------------------------
  useEffect(() => {
    if (!active) return

    let cancelled = false
    setStatus('starting')
    setError(null)

    const start = async () => {
      if (!cameraIsPlausible()) {
        setStatus('unsupported')
        setError(
          translateRef.current?.(
            'NO_CAMERA_API',
            'This browser has no camera API. Add the ISBN by hand instead.'
          ) ?? 'This browser has no camera API. Add the ISBN by hand instead.'
        )
        return
      }
      // Named plainly rather than folded into the generic failure: "camera
      // doesn't work" with no reason is unfixable by the person holding the
      // phone, and this one has an actual instruction attached.
      if (typeof window !== 'undefined' && window.isSecureContext === false) {
        setStatus('insecure')
        setError(
          translateRef.current?.(
            'CAMERA_NEEDS_HTTPS',
            'The camera needs a secure (https) connection. Open the library over https and try again.'
          ) ??
            'The camera needs a secure (https) connection. Open the library over https and try again.'
        )
        return
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
        })
        if (cancelled) {
          stopStream(stream)
          return
        }
        streamRef.current = stream

        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          try {
            await video.play()
          } catch {
            // Autoplay refusal and jsdom's unimplemented `play` land here. The
            // element is `muted` + `playsInline`, so in a real browser this is
            // rare and the decoder's own play attempt covers it.
          }
        }

        const track = stream.getVideoTracks()[0]
        // `torch` is a real, widely shipped track capability that the DOM lib
        // does not declare, and `getCapabilities` itself is absent in Safari.
        const capabilities = track?.getCapabilities?.() as
          | { torch?: boolean }
          | undefined
        setTorchSupported(Boolean(capabilities?.torch))

        setStreamReady(true)
        setStatus('scanning')
      } catch (cause) {
        if (cancelled) return
        const name = cause instanceof Error ? cause.name : ''
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          setStatus('denied')
          setError(
            translateRef.current?.(
              'CAMERA_ACCESS_REFUSED',
              'Camera access was refused. Add the ISBN by hand instead, or allow the camera in your browser settings and reopen Scan.'
            ) ??
              'Camera access was refused. Add the ISBN by hand instead, or allow the camera in your browser settings and reopen Scan.'
          )
        } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
          setStatus('unsupported')
          setError(
            translateRef.current?.(
              'NO_CAMERA_ANSWERED',
              'No camera answered. Add the ISBN by hand instead.'
            ) ?? 'No camera answered. Add the ISBN by hand instead.'
          )
        } else {
          setStatus('error')
          setError(
            translateRef.current?.(
              'CAMERA_COULD_NOT_START',
              'The camera could not be started. Add the ISBN by hand instead.'
            ) ?? 'The camera could not be started. Add the ISBN by hand instead.'
          )
        }
      }
    }

    void start()

    return () => {
      cancelled = true
      stopStream(streamRef.current)
      streamRef.current = null
      const video = videoRef.current
      if (video) video.srcObject = null
      setStreamReady(false)
      setTorchSupported(false)
      setTorchOn(false)
      setStatus('idle')
    }
  }, [active])

  // --- the decoder ---------------------------------------------------------
  useEffect(() => {
    if (!active || paused || !streamReady) return

    let cancelled = false
    let decoder: BarcodeDecoder | null = null

    const begin = async () => {
      const video = videoRef.current
      if (!video) return

      try {
        decoder = await createDecoderRef.current()
      } catch {
        decoder = null
      }
      if (cancelled) {
        decoder?.stop()
        return
      }
      if (!decoder) {
        setStatus('unsupported')
        setError(
          translateRef.current?.(
            'BARCODE_READER_UNSUPPORTED',
            'This browser cannot read barcodes. Add the ISBN by hand instead.'
          ) ?? 'This browser cannot read barcodes. Add the ISBN by hand instead.'
        )
        return
      }

      setDecoderKind(decoder.kind)
      try {
        await decoder.start(video, (found) => onDecodeRef.current(found))
      } catch {
        if (cancelled) return
        setStatus('error')
        setError(
          translateRef.current?.(
            'BARCODE_READER_FAILED',
            'The barcode reader could not start. Add the ISBN by hand instead.'
          ) ?? 'The barcode reader could not start. Add the ISBN by hand instead.'
        )
      }
    }

    void begin()

    return () => {
      cancelled = true
      decoder?.stop()
    }
  }, [active, paused, streamReady])

  // --- pause reporting -----------------------------------------------------
  useEffect(() => {
    if (!active || !streamReady) return
    // Functional, and only between the two healthy states: a `denied` or
    // `error` status must survive the confirmation opening and closing.
    setStatus((current) =>
      current === 'scanning' || current === 'paused'
        ? paused
          ? 'paused'
          : 'scanning'
        : current
    )
  }, [active, paused, streamReady])

  const toggleTorch = useCallback(() => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    const next = !torchOn
    void track
      .applyConstraints({
        // Not in the DOM lib's constraint type; it is a real, widely shipped
        // constraint on Android Chrome, which is where book spines get read in
        // badly lit rooms.
        advanced: [{ torch: next }],
      } as unknown as MediaTrackConstraints)
      .then(() => setTorchOn(next))
      .catch(() => setTorchSupported(false))
  }, [torchOn])

  return {
    videoRef,
    status,
    error,
    decoderKind,
    torchSupported,
    torchOn,
    toggleTorch,
  }
}
