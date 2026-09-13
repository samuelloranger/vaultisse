import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Image, Text, XStack, YStack } from 'tamagui'
import { useLocale } from '@/locale/LocaleProvider'
import { X } from './icons'

/**
 * Transient confirmations that do not move the layout.
 *
 * ## Why this exists in `components/`
 *
 * The client has no toast at all today: every screen reports an outcome as
 * inline text, which is right when the outcome is about the thing you are
 * looking at and wrong when it is about something that just happened while you
 * were looking elsewhere. Scan mode needs the second kind — the camera stays
 * open and the confirmation must not push the viewfinder around — and the rest
 * of the app wants the same thing, so it is a general component rather than a
 * scan-specific one.
 *
 * ## Shape
 *
 * The state lives in {@link useToasts} and the pixels in {@link ToastHost}, so
 * a screen can own its own stack without a provider, and a test can assert on
 * the list without rendering anything. There is deliberately no global
 * singleton: the old client's one global dialog controller is exactly the thing
 * `api/http.ts` documents dropping.
 *
 * ## Accessibility
 *
 * The stack is an `aria-live="polite"` region, so a toast is announced without
 * stealing focus from the camera view — and every toast keeps a dismiss button
 * at the 44px floor, because an auto-dismissing message with no manual exit is
 * unusable to anyone who reads slowly.
 */

export type ToastTone = 'neutral' | 'success' | 'danger'

export type ToastAction = {
  label: string
  onPress: () => void
}

export type ToastItem = {
  id: string
  title: string
  description?: string | null
  /** A thumbnail shown left of the text — a book cover, in Scan mode. */
  imageUrl?: string | null
  tone?: ToastTone
  action?: ToastAction | null
  /** Override the stack's default dismissal delay. */
  durationMs?: number
}

/** Default time a toast stays up. */
const DEFAULT_DURATION_MS = 5000

/** How many toasts may be on screen at once before the oldest is dropped. */
const DEFAULT_MAX = 3

export type Toasts = {
  toasts: ToastItem[]
  /** Show one. Returns its id. */
  push: (toast: Omit<ToastItem, 'id'>) => string
  dismiss: (id: string) => void
  clear: () => void
}

/** A stack of auto-dismissing toasts, capped and self-cleaning. */
export function useToasts({
  max = DEFAULT_MAX,
  durationMs = DEFAULT_DURATION_MS,
}: {
  max?: number
  durationMs?: number
} = {}): Toasts {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const nextIdRef = useRef(0)

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id)
    if (timer) clearTimeout(timer)
    timersRef.current.delete(id)
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const push = useCallback(
    (toast: Omit<ToastItem, 'id'>) => {
      nextIdRef.current += 1
      const id = `toast-${nextIdRef.current}`
      // `slice(-max)` rather than refusing the new one: the newest outcome is
      // the one worth reading, and a stack that stops updating looks frozen.
      setToasts((current) => [...current, { ...toast, id }].slice(-max))
      timersRef.current.set(
        id,
        setTimeout(() => dismiss(id), toast.durationMs ?? durationMs)
      )
      return id
    },
    [dismiss, durationMs, max]
  )

  const clear = useCallback(() => {
    for (const timer of timersRef.current.values()) clearTimeout(timer)
    timersRef.current.clear()
    setToasts([])
  }, [])

  // Timers outlive the component otherwise, and each one calls setState.
  useEffect(() => {
    const timers = timersRef.current
    return () => {
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
    }
  }, [])

  return { toasts, push, dismiss, clear }
}

const TONE_BORDER = {
  neutral: '$borderColorStrong',
  success: '$success',
  danger: '$danger',
} as const satisfies Record<ToastTone, string>

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const { t } = useLocale()
  return (
    <XStack
      testID={`toast-${toast.id}`}
      role="status"
      alignItems="center"
      gap="$3"
      width="100%"
      padding="$3"
      backgroundColor="$surface"
      borderWidth={1}
      borderColor={TONE_BORDER[toast.tone ?? 'neutral']}
      borderRadius="$card"
      // The stack itself is click-through so it never blocks the view behind
      // it; each toast opts back in.
      pointerEvents="auto"
      style={{ boxShadow: 'var(--pbShadow)' }}
    >
      {toast.imageUrl ? (
        <Image
          source={{ uri: toast.imageUrl }}
          width={36}
          height={52}
          borderRadius={4}
          objectFit="cover"
          flexShrink={0}
          alt=""
        />
      ) : null}

      <YStack flex={1} minWidth={0} gap="$0.5">
        <Text fontSize={15} fontWeight="600" color="$color" numberOfLines={2}>
          {toast.title}
        </Text>
        {toast.description ? (
          <Text fontSize={13} color="$colorMuted" numberOfLines={2}>
            {toast.description}
          </Text>
        ) : null}
      </YStack>

      {toast.action ? (
        <Button
          testID={`toast-action-${toast.id}`}
          onPress={toast.action.onPress}
          minHeight={44}
          paddingHorizontal="$3"
          fontSize={15}
          borderRadius="$control"
          backgroundColor="transparent"
          borderColor="$borderColor"
          color="$color"
          flexShrink={0}
        >
          {toast.action.label}
        </Button>
      ) : null}

      <Button
        testID={`toast-dismiss-${toast.id}`}
        onPress={onDismiss}
        aria-label={t('DISMISS', 'Dismiss')}
        width={44}
        height={44}
        padding={0}
        borderRadius="$control"
        backgroundColor="transparent"
        borderWidth={0}
        icon={X}
        color="$colorMuted"
        flexShrink={0}
      />
    </XStack>
  )
}

/**
 * Renders a stack of toasts, newest at the bottom.
 *
 * Absolutely positioned against its nearest positioned ancestor rather than the
 * viewport, so it sits inside whatever it is decorating — the scan overlay, a
 * screen — instead of floating over the whole app.
 */
export function ToastHost({
  toasts,
  onDismiss,
  testID = 'toast-host',
}: {
  toasts: ToastItem[]
  onDismiss: (id: string) => void
  testID?: string
}) {
  if (toasts.length === 0) return null

  return (
    <YStack
      testID={testID}
      aria-live="polite"
      position="absolute"
      bottom={0}
      left={0}
      right={0}
      gap="$2"
      padding="$3"
      // Clear of the home indicator on a notched phone. A literal px inside the
      // calc(): Tamagui substitutes a token only when it *is* the whole value.
      paddingBottom="calc(12px + env(safe-area-inset-bottom))"
      pointerEvents="none"
      alignItems="center"
    >
      {toasts.map((toast) => (
        <YStack key={toast.id} width="100%" maxWidth={520}>
          <Toast toast={toast} onDismiss={() => onDismiss(toast.id)} />
        </YStack>
      ))}
    </YStack>
  )
}
