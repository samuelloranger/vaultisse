import { useCallback, useRef, useState } from 'react'
import { Button, Text, XStack, YStack } from 'tamagui'
import { ToastHost, useToasts } from '@/components/Toast'
import { useLocale } from '@/locale/LocaleProvider'
import { usePolicy } from '@/queries/app'
import { ScanDuplicateDialog } from './ScanDuplicateDialog'
import { ScanSummary } from './ScanSummary'
import { scanEntryToast } from './ScanToast'
import { useBarcodeScanner } from './useBarcodeScanner'
import { type ScanQueue, useScanQueue } from './useScanQueue'

/**
 * Scan mode: the camera stays open and a stack of books becomes a sweep of the
 * phone rather than twenty round trips through a dialog.
 *
 * ## The shape of the screen
 *
 * It is a full-bleed camera with chrome floating on top, not a page with a
 * camera on it. Everything overlaid is either something you need mid-motion
 * (the count, the shelf you are filling, the torch) or the way out. The one
 * thing that stops the flow is the duplicate confirmation, and that is
 * deliberate — see `ScanDuplicateDialog.tsx`.
 *
 * ## Why the shelf is asked once, up front
 *
 * A copy has to be shelved somewhere, and asking per book mid-scan would
 * destroy the rhythm the whole mode exists for. So with more than one location
 * it is asked before the camera starts — which also means the permission prompt
 * arrives *after* the question rather than on top of it — and then shown
 * persistently in the header so it can be changed between books. With exactly
 * one location the server's auto-assign rule already covers it and the question
 * never appears.
 *
 * A "decide later" option is deliberately not offered here. With more than one
 * location and no location given, `POST /book/isbn/:isbn` creates the book and
 * records **no copy at all** — which in a mode whose entire output is copies is
 * a silent no-op, not a deferral.
 *
 * ## Why the camera lives and dies with this component
 *
 * `ScanScreen` renders nothing at all when closed, so the view is mounted and
 * unmounted rather than hidden. The stream is owned by `useBarcodeScanner`'s
 * effect and every track is stopped in its cleanup: a camera left running
 * behind a closed view is the bug people notice as a hot phone and a live
 * indicator light.
 */

/** Dark-glass scrims over live video. Not product colours; there is no token
 *  for "legible over whatever the camera is pointed at". */
const TOP_SCRIM = 'linear-gradient(rgba(0,0,0,0.66), rgba(0,0,0,0))'
const RETICLE_SCRIM = '0 0 0 100vmax rgba(0,0,0,0.45)'

const CHROME_BUTTON = {
  minHeight: 44,
  paddingHorizontal: '$3',
  fontSize: 15,
  borderRadius: '$control',
  borderWidth: 1,
  borderColor: '$navBorderStrong',
  backgroundColor: '$navBgAlt',
  color: '$navText',
} as const

export function ScanScreen({
  open,
  onClose,
  onAddManually,
}: {
  open: boolean
  onClose: () => void
  /**
   * Hand an ISBN to the typed dialog. Called with the scanned code on a 404,
   * and with an empty string when the camera is unavailable — the typed path
   * is the fallback Scan mode is an addition to, never a replacement for.
   */
  onAddManually: (isbn: string) => void
}) {
  // Mounted only while open, so closing releases the camera and resets the
  // session rather than leaving both alive behind a hidden view.
  if (!open) return null
  return <ScanView onClose={onClose} onAddManually={onAddManually} />
}

function ScanView({
  onClose,
  onAddManually,
}: {
  onClose: () => void
  onAddManually: (isbn: string) => void
}) {
  const { data: policy } = usePolicy()
  const { t, tPlural } = useLocale()
  const locations = policy.locations
  const needsLocation = locations.length > 1

  const [locationId, setLocationId] = useState<number | null>(
    locations.length === 1 ? locations[0].id : null
  )
  const [chooserOpen, setChooserOpen] = useState(needsLocation)
  const [cameraOn, setCameraOn] = useState(!needsLocation)
  const [summaryOpen, setSummaryOpen] = useState(false)

  const toasts = useToasts()
  const { push: pushToast } = toasts

  // The toast for an entry carries an Undo that calls back into the queue that
  // produced it. A ref breaks the cycle without making `onEntry` unstable —
  // `useScanQueue` reads it at call time.
  const queueRef = useRef<ScanQueue | null>(null)

  const handleAddManually = useCallback(
    (isbn: string) => {
      onAddManually(isbn)
      onClose()
    },
    [onAddManually, onClose]
  )

  const queue = useScanQueue({
    locationId,
    translate: t,
    onEntry: useCallback(
      (entry) => {
        const toast = scanEntryToast(entry, {
          onUndo: (id) => queueRef.current?.undo(id),
          onAddManually: handleAddManually,
          translate: t,
        })
        if (toast) pushToast(toast)
      },
      [handleAddManually, pushToast, t]
    ),
  })
  queueRef.current = queue

  const scanner = useBarcodeScanner({
    active: cameraOn,
    // Stopped, not ignored. A camera still decoding behind the confirmation
    // stacks a second question behind the first.
    paused: chooserOpen || queue.duplicate !== null || summaryOpen,
    onDecode: queue.submit,
    translate: t,
  })

  const cameraFailed =
    scanner.status === 'denied' ||
    scanner.status === 'unsupported' ||
    scanner.status === 'insecure' ||
    scanner.status === 'error'

  const locationName =
    locations.find((location) => location.id === locationId)?.name ?? null

  function finish() {
    // Release the camera the moment Done is pressed; the summary is a report on
    // a session that is already over.
    setCameraOn(false)
    toasts.clear()
    setSummaryOpen(true)
  }

  return (
    <div
      data-testid="scan-screen"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        height: '100dvh',
        width: '100%',
        overflow: 'hidden',
        background: 'var(--navBgAlt)',
      }}
    >
      <video
        ref={scanner.videoRef}
        data-testid="scan-video"
        autoPlay
        muted
        playsInline
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />

      {scanner.status === 'scanning' || scanner.status === 'paused' ? (
        <div
          data-testid="scan-reticle"
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'min(78vw, 420px)',
            aspectRatio: '1.7',
            maxWidth: '100%',
            borderRadius: 12,
            border: '2px solid var(--navAccent)',
            boxShadow: RETICLE_SCRIM,
            opacity: scanner.status === 'paused' ? 0.35 : 1,
          }}
        />
      ) : null}

      {/* --- header ------------------------------------------------------- */}
      <YStack
        position="absolute"
        top={0}
        left={0}
        right={0}
        gap="$2"
        paddingHorizontal="$3"
        paddingBottom="$3"
        paddingTop="calc(12px + env(safe-area-inset-top))"
        style={{ backgroundImage: TOP_SCRIM }}
      >
        <XStack alignItems="center" gap="$2" flexWrap="wrap">
          <Button testID="scan-done" onPress={finish} {...CHROME_BUTTON}>
            {t('DONE', 'Done')}
          </Button>

          <YStack flex={1} minWidth={0}>
            <Text testID="scan-count" fontSize={15} fontWeight="600" color="$navText">
              {tPlural(
                'SCAN_ADDED_COUNT',
                queue.addedCount,
                '1 added',
                '{count} added'
              )}
              {queue.pendingCount > 0
                ? t('SCAN_PENDING_COUNT', ` · ${queue.pendingCount} pending`, {
                    count: queue.pendingCount,
                  })
                : ''}
            </Text>
            <Text fontSize={13} color="$navTextMuted">
              {scanner.status === 'paused'
                ? t('SCANNING_PAUSED', 'Scanning paused')
                : scanner.status === 'scanning'
                  ? t('POINT_CAMERA_BARCODE', 'Point the camera at the barcode')
                  : scanner.status === 'starting'
                    ? t('STARTING_CAMERA', 'Starting the camera…')
                    : ''}
            </Text>
          </YStack>

          {scanner.torchSupported ? (
            <Button
              testID="scan-torch"
              onPress={scanner.toggleTorch}
              aria-pressed={scanner.torchOn}
              {...CHROME_BUTTON}
              backgroundColor={scanner.torchOn ? '$navAccent' : '$navBgAlt'}
            >
              {t('TORCH', 'Torch')}
            </Button>
          ) : null}
        </XStack>

        {needsLocation ? (
          <XStack>
            <Button
              testID="scan-location"
              onPress={() => setChooserOpen(true)}
              aria-label={t(
                'SHELVING_AT_CHANGE',
                `Shelving at ${locationName ?? 'nowhere yet'}. Change.`,
                { location: locationName ?? 'nowhere yet' }
              )}
              {...CHROME_BUTTON}
            >
              {t('SHELF_CHOICE', `Shelf: ${locationName ?? 'choose'}`, {
                location: locationName ?? 'choose',
              })}
            </Button>
          </XStack>
        ) : null}
      </YStack>

      {/* --- the camera could not start ----------------------------------- */}
      {cameraFailed ? (
        <YStack
          testID="scan-camera-error"
          position="absolute"
          top={0}
          left={0}
          right={0}
          bottom={0}
          justifyContent="center"
          alignItems="center"
          padding="$4"
          backgroundColor="$navBg"
        >
          <YStack
            gap="$3"
            maxWidth={420}
            width="100%"
            padding="$4"
            borderRadius="$card"
            borderWidth={1}
            borderColor="$navBorderStrong"
            backgroundColor="$navBgAlt"
          >
            <Text fontFamily="$heading" fontSize={20} color="$navText">
              {t('CAMERA_NOT_AVAILABLE', 'The camera is not available')}
            </Text>
            <Text fontSize={15} color="$navTextMuted">
              {scanner.error ??
                t('CAMERA_COULD_NOT_START', 'The camera could not be started.')}
            </Text>
            <XStack gap="$2" flexWrap="wrap">
              <Button
                testID="scan-fallback-manual"
                onPress={() => handleAddManually('')}
                minHeight={44}
                fontSize={16}
                borderRadius="$control"
                backgroundColor="$primary"
                color="$onPrimary"
              >
                {t('TYPE_ISBN_INSTEAD', 'Type an ISBN instead')}
              </Button>
              <Button testID="scan-close" onPress={onClose} {...CHROME_BUTTON}>
                {t('CLOSE', 'Close')}
              </Button>
            </XStack>
          </YStack>
        </YStack>
      ) : null}

      {/* --- where do these copies go ------------------------------------- */}
      {chooserOpen ? (
        <YStack
          testID="scan-location-chooser"
          position="absolute"
          top={0}
          left={0}
          right={0}
          bottom={0}
          justifyContent="center"
          alignItems="center"
          padding="$4"
          backgroundColor="$navBg"
        >
          <YStack gap="$3" maxWidth={420} width="100%">
            <Text fontFamily="$heading" fontSize={22} color="$navText">
              {t('WHERE_COPIES_GO', 'Where do these copies go?')}
            </Text>
            <Text fontSize={15} color="$navTextMuted">
              {t(
                'SCAN_LOCATION_DESC',
                'Asked once so scanning is not interrupted. You can change it between books.'
              )}
            </Text>
            <YStack gap="$2">
              {locations.map((location) => (
                <Button
                  key={location.id}
                  testID={`scan-location-${location.id}`}
                  onPress={() => {
                    setLocationId(location.id)
                    setChooserOpen(false)
                    setCameraOn(true)
                  }}
                  aria-pressed={locationId === location.id}
                  minHeight={44}
                  fontSize={16}
                  justifyContent="flex-start"
                  borderRadius="$control"
                  borderWidth={1}
                  borderColor={
                    locationId === location.id ? '$navAccent' : '$navBorderStrong'
                  }
                  backgroundColor={
                    locationId === location.id ? '$navActiveBg' : '$navBgAlt'
                  }
                  color="$navText"
                >
                  {location.name}
                </Button>
              ))}
            </YStack>
            <XStack>
              <Button testID="scan-chooser-cancel" onPress={onClose} {...CHROME_BUTTON}>
                {t('LEAVE_SCAN_MODE', 'Leave scan mode')}
              </Button>
            </XStack>
          </YStack>
        </YStack>
      ) : null}

      {/* Not while a sheet is up. The toast stack lives in this overlay and the
          sheet in a portal above it, so an un-dismissed toast would sit on top
          of the question it is meant to be behind. */}
      {queue.duplicate === null && !summaryOpen ? (
        <ToastHost toasts={toasts.toasts} onDismiss={toasts.dismiss} />
      ) : null}

      <ScanDuplicateDialog
        prompt={queue.duplicate}
        onAddCopy={queue.confirmDuplicate}
        onSkip={queue.skipDuplicate}
      />

      <ScanSummary
        open={summaryOpen}
        entries={queue.entries}
        onUndo={queue.undo}
        onClose={onClose}
      />
    </div>
  )
}
