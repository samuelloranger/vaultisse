import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BarcodeDecoder, Decode } from './useBarcodeScanner'
import { useBarcodeScanner } from './useBarcodeScanner'

/**
 * The camera hook, driven through its seam.
 *
 * jsdom has no camera and no `BarcodeDetector`, so the decoder interface is
 * where the fake goes: a scripted decoder proves the wiring — decodes reach the
 * caller, a pause tears the decoder down rather than filtering it, and every
 * media track is released on unmount — without either real implementation being
 * involved. The two real ones sit behind the same interface, which is why this
 * only has to be tested once.
 */

type FakeTrack = MediaStreamTrack & { stop: ReturnType<typeof vi.fn> }

function makeFakeStream() {
  const track = {
    stop: vi.fn(),
    getCapabilities: () => ({}),
    applyConstraints: vi.fn().mockResolvedValue(undefined),
  } as unknown as FakeTrack

  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream

  return { stream, track }
}

function makeFakeDecoder() {
  let deliver: ((decode: Decode) => void) | null = null

  let announceStarted: () => void = () => {}
  /**
   * Resolves the moment the decode loop is actually live.
   *
   * The hook opens the camera and starts the decoder in two *different*
   * effects: `status` flips to `scanning` as soon as the stream is attached,
   * while the decode callback is only wired a further two async hops later —
   * the decoder effect has to see the committed `streamReady`, await the
   * factory, then await `start()`. So the visible status is not evidence that
   * a decode can be delivered, and a test that emits on the strength of it is
   * racing the decoder's own startup. Await this instead: it is the decoder
   * saying it is ready, not a clock or a poll.
   */
  const started = new Promise<void>((resolve) => {
    announceStarted = resolve
  })

  const stop = vi.fn(() => {
    deliver = null
  })
  const start = vi.fn(
    async (_video: HTMLVideoElement, onDecode: (d: Decode) => void) => {
      deliver = onDecode
      announceStarted()
    }
  )

  const decoder: BarcodeDecoder = { kind: 'native', start, stop }

  return {
    decoder,
    start,
    stop,
    started,
    /** Whether the decode loop is currently live. */
    get running() {
      return deliver !== null
    },
    emit(decode: Decode) {
      // Loud rather than silent: an emit into a decoder that is not running is
      // the exact shape of the race above, and swallowing it turns a wiring
      // bug into a confusing "expected to be called, got 0 calls" somewhere
      // further down.
      if (!deliver) {
        throw new Error('the fake decoder was asked to emit before it started')
      }
      deliver(decode)
    },
  }
}

function Harness({
  active,
  paused,
  onDecode,
  createDecoder,
}: {
  active: boolean
  paused: boolean
  onDecode: (decode: Decode) => void
  createDecoder: () => Promise<BarcodeDecoder | null>
}) {
  const scanner = useBarcodeScanner({ active, paused, onDecode, createDecoder })
  return (
    <video ref={scanner.videoRef} data-testid="preview" data-status={scanner.status}>
      <track kind="captions" />
    </video>
  )
}

function status() {
  return screen.getByTestId('preview').getAttribute('data-status')
}

let getUserMedia: ReturnType<typeof vi.fn>

beforeEach(() => {
  // jsdom implements neither, and the hook touches both on every start.
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  getUserMedia = vi.fn()
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  })
})

afterEach(() => {
  Reflect.deleteProperty(navigator, 'mediaDevices')
})

describe('useBarcodeScanner', () => {
  it('opens the camera and forwards what the decoder reads', async () => {
    const { stream } = makeFakeStream()
    getUserMedia.mockResolvedValue(stream)
    const fake = makeFakeDecoder()
    const onDecode = vi.fn()

    render(
      <Harness
        active
        paused={false}
        onDecode={onDecode}
        createDecoder={async () => fake.decoder}
      />
    )

    await waitFor(() => expect(status()).toBe('scanning'))
    // The rear camera, asked for as a preference rather than a requirement: a
    // laptop with only a front camera should still scan.
    expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: { ideal: 'environment' } },
    })

    // `scanning` means the stream is attached, not that the decoder is wired.
    await fake.started
    fake.emit({ value: '9780261102217', format: 'ean_13' })
    expect(onDecode).toHaveBeenCalledWith({ value: '9780261102217', format: 'ean_13' })
  })

  it('stops the decoder while paused and starts it again after', async () => {
    const { stream, track } = makeFakeStream()
    getUserMedia.mockResolvedValue(stream)
    const fake = makeFakeDecoder()

    const view = render(
      <Harness
        active
        paused={false}
        onDecode={vi.fn()}
        createDecoder={async () => fake.decoder}
      />
    )
    await waitFor(() => expect(fake.running).toBe(true))

    view.rerender(
      <Harness
        active
        paused
        onDecode={vi.fn()}
        createDecoder={async () => fake.decoder}
      />
    )

    // Stopped, not filtered: nothing can decode behind the confirmation.
    await waitFor(() => expect(fake.stop).toHaveBeenCalled())
    expect(status()).toBe('paused')
    // The stream stays open across a pause — otherwise the preview blacks out
    // and the permission prompt comes back.
    expect(track.stop).not.toHaveBeenCalled()

    view.rerender(
      <Harness
        active
        paused={false}
        onDecode={vi.fn()}
        createDecoder={async () => fake.decoder}
      />
    )
    await waitFor(() => expect(fake.start).toHaveBeenCalledTimes(2))
    expect(status()).toBe('scanning')
  })

  it('releases every media track on unmount', async () => {
    const { stream, track } = makeFakeStream()
    getUserMedia.mockResolvedValue(stream)
    const fake = makeFakeDecoder()

    const view = render(
      <Harness
        active
        paused={false}
        onDecode={vi.fn()}
        createDecoder={async () => fake.decoder}
      />
    )
    await waitFor(() => expect(status()).toBe('scanning'))
    // Same two-effect gap as above: unmounting before the decoder is up would
    // assert against a teardown that has not been reached yet.
    await fake.started

    view.unmount()

    // The hot-phone bug: a camera left running behind a closed view.
    expect(track.stop).toHaveBeenCalledTimes(1)
    expect(fake.stop).toHaveBeenCalled()
  })

  it('explains a refused camera instead of retrying it', async () => {
    const refusal = new Error('denied')
    refusal.name = 'NotAllowedError'
    getUserMedia.mockRejectedValue(refusal)
    const fake = makeFakeDecoder()

    render(
      <Harness
        active
        paused={false}
        onDecode={vi.fn()}
        createDecoder={async () => fake.decoder}
      />
    )

    await waitFor(() => expect(status()).toBe('denied'))
    // One attempt. The browser will not re-prompt, so a retry loop is an
    // invisible hang.
    expect(getUserMedia).toHaveBeenCalledTimes(1)
    expect(fake.start).not.toHaveBeenCalled()
  })

  it('does not open the camera at all while inactive', async () => {
    const fake = makeFakeDecoder()

    render(
      <Harness
        active={false}
        paused={false}
        onDecode={vi.fn()}
        createDecoder={async () => fake.decoder}
      />
    )

    await waitFor(() => expect(status()).toBe('idle'))
    expect(getUserMedia).not.toHaveBeenCalled()
  })
})
