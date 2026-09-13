import { useEffect, useState } from 'react'
import { Button, Text, XStack, YStack } from 'tamagui'
import { MutedText } from '@/components/Card'
import { Field } from '@/components/Field'
import { Check } from '@/components/icons'
import { ResponsiveDialog } from '@/components/ResponsiveDialog'
import { errorMessage } from '@/components/ScreenState'
import { useLocale } from '@/locale/LocaleProvider'
import { useEnableTwoFactor, useSetupTwoFactor } from '@/queries/user'
import { copyText } from './deviceInfo'

/**
 * Turning two-factor authentication on, in two steps: enrol, then save the
 * backup codes.
 *
 * ## The QR code is not the primary path
 *
 * It is the *desktop* path. On a phone — where most people set this up — the
 * authenticator app is on the same screen as the QR code, and a phone cannot
 * photograph itself. So the secret is shown as selectable text with a copy
 * button next to it, in monospace with the groups spaced, and the QR sits
 * underneath for the case where a second device is holding the camera.
 *
 * ## Step two cannot be dismissed by accident
 *
 * `POST /user/2fa/enable` answers with backup codes that exist nowhere else:
 * only bcrypt hashes are stored, and nothing can reissue them except turning
 * 2FA off and on again. A dialog that closes on a backdrop tap at that moment
 * costs the user their recovery path.
 *
 * So while the codes are on screen: the backdrop and Escape do not close the
 * dialog, and the only way out is a Done button gated behind an explicit "I
 * have saved these" acknowledgement. This is the one place in the client where
 * a modal is deliberately harder to dismiss than the shared component makes it,
 * and it is the one place where dismissing it is unrecoverable.
 */
export function TwoFactorSetupDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [code, setCode] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [copied, setCopied] = useState<'none' | 'ok' | 'failed'>('none')
  const setup = useSetupTwoFactor()
  const enable = useEnableTwoFactor()
  const { t } = useLocale()

  const setupMutate = setup.mutate
  // Enrolment starts when the dialog opens, not when it is rendered: the call
  // writes a new secret and discards the previous one, so it must happen once
  // per opening rather than once per mount.
  useEffect(() => {
    if (open) setupMutate()
  }, [open, setupMutate])

  const backupCodes = enable.data?.backupCodes ?? null
  // Read into a local so the JSX below can narrow it once and keep that
  // narrowing inside the copy callback — TypeScript drops it again for a
  // property read across a closure boundary.
  const enrolment = setup.data ?? null

  function close() {
    setCode('')
    setAcknowledged(false)
    setCopied('none')
    setup.reset()
    enable.reset()
    onOpenChange(false)
  }

  /** The codes are showing and have not been acknowledged: refuse to close. */
  const locked = backupCodes !== null && !acknowledged

  function submit() {
    const trimmed = code.trim()
    if (trimmed.length < 6 || enable.isPending) return
    enable.mutate(trimmed)
  }

  async function copy(text: string) {
    setCopied((await copyText(text)) ? 'ok' : 'failed')
  }

  if (backupCodes) {
    return (
      <ResponsiveDialog
        open={open}
        onOpenChange={(next) => {
          if (next) return
          if (!locked) close()
        }}
        title={t('SAVE_BACKUP_CODES', 'Save your backup codes')}
        description={t(
          'SAVE_BACKUP_CODES_DESC',
          'Each code works once, if you lose your authenticator. They are shown now and never again.'
        )}
        actions={
          <>
            <Button
              testID="twofactor-codes-copy"
              onPress={() => copy(backupCodes.join('\n'))}
              minHeight={44}
              fontSize={16}
              borderRadius="$control"
              backgroundColor="transparent"
              borderColor="$borderColor"
              color="$color"
            >
              {t('COPY_ALL', 'Copy all')}
            </Button>
            <Button
              testID="twofactor-codes-done"
              onPress={close}
              disabled={!acknowledged}
              opacity={acknowledged ? 1 : 0.5}
              minHeight={44}
              fontSize={16}
              borderRadius="$control"
              backgroundColor="$primary"
              color="$onPrimary"
            >
              {t('DONE', 'Done')}
            </Button>
          </>
        }
      >
        <YStack gap="$3">
          <YStack
            testID="twofactor-codes"
            gap="$1"
            padding="$3"
            borderRadius="$control"
            borderWidth={1}
            borderColor="$borderColor"
            backgroundColor="$background"
          >
            {backupCodes.map((backupCode) => (
              <Text
                key={backupCode}
                fontFamily="$mono"
                fontSize={16}
                color="$color"
                // Selectable: copy-all can fail, and then this is the only way
                // to get them off the screen.
                userSelect="text"
              >
                {backupCode}
              </Text>
            ))}
          </YStack>

          {copied === 'ok' ? (
            <MutedText testID="twofactor-copied" role="status">
              {t(
                'COPIED_BACKUP_CODES',
                'Copied to the clipboard. Paste them somewhere safe now.'
              )}
            </MutedText>
          ) : copied === 'failed' ? (
            <Text fontSize={14} color="$red10">
              {t(
                'CLIPBOARD_BLOCKED_CODES',
                'This browser refused clipboard access. Select the codes above and copy them by hand.'
              )}
            </Text>
          ) : null}

          {/*
            A real toggle, not a checkbox glyph: at 44px it is a target, and
            `aria-pressed` carries the state to a screen reader. Nothing here
            claims the user actually saved them — only that they were asked.
          */}
          <Button
            testID="twofactor-ack"
            onPress={() => setAcknowledged((current) => !current)}
            aria-pressed={acknowledged}
            icon={acknowledged ? Check : undefined}
            minHeight={44}
            fontSize={15}
            justifyContent="flex-start"
            borderRadius="$control"
            backgroundColor={acknowledged ? '$accentSoft' : 'transparent'}
            borderColor={acknowledged ? '$accent' : '$borderColor'}
            borderWidth={1}
            color="$color"
          >
            {t('I_SAVED_CODES', 'I have saved these codes')}
          </Button>
        </YStack>
      </ResponsiveDialog>
    )
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title={t('SET_UP_2FA', 'Set up two-factor authentication')}
      description={t(
        'SET_UP_2FA_DESC',
        'Add the secret below to an authenticator app, then confirm the six-digit code it shows.'
      )}
      actions={
        <>
          <Button
            testID="twofactor-setup-cancel"
            onPress={close}
            minHeight={44}
            fontSize={16}
            borderRadius="$control"
            backgroundColor="transparent"
            borderColor="$borderColor"
            color="$color"
          >
            {t('CANCEL', 'Cancel')}
          </Button>
          <Button
            testID="twofactor-setup-submit"
            onPress={submit}
            disabled={code.trim().length < 6 || enable.isPending}
            opacity={code.trim().length < 6 ? 0.5 : 1}
            minHeight={44}
            fontSize={16}
            borderRadius="$control"
            backgroundColor="$primary"
            color="$onPrimary"
          >
            {enable.isPending ? t('VERIFYING', 'Verifying…') : t('TURN_ON', 'Turn on')}
          </Button>
        </>
      }
    >
      <YStack gap="$3">
        {setup.isPending ? (
          <MutedText testID="twofactor-setup-loading">
            {t('PREPARING_SECRET', 'Preparing a secret…')}
          </MutedText>
        ) : setup.isError ? (
          <Text testID="twofactor-setup-error" fontSize={14} color="$red10">
            {errorMessage(setup.error)}
          </Text>
        ) : enrolment ? (
          <YStack gap="$3">
            <YStack gap="$2">
              <Text fontSize={14} color="$colorMuted">
                {t('SETUP_KEY', 'Setup key')}
              </Text>
              <Text
                testID="twofactor-secret"
                fontFamily="$mono"
                fontSize={16}
                lineHeight={24}
                color="$color"
                userSelect="text"
                padding="$2"
                borderRadius="$control"
                borderWidth={1}
                borderColor="$borderColor"
                backgroundColor="$background"
              >
                {enrolment.secret}
              </Text>
              <XStack gap="$2" alignItems="center" flexWrap="wrap">
                <Button
                  testID="twofactor-secret-copy"
                  onPress={() => copy(enrolment.secret)}
                  minHeight={44}
                  fontSize={15}
                  borderRadius="$control"
                  backgroundColor="transparent"
                  borderColor="$borderColor"
                  color="$color"
                >
                  {t('COPY_KEY', 'Copy key')}
                </Button>
                {copied === 'ok' ? (
                  <MutedText role="status">{t('COPIED', 'Copied.')}</MutedText>
                ) : copied === 'failed' ? (
                  <Text fontSize={14} color="$red10">
                    {t(
                      'CLIPBOARD_BLOCKED_KEY',
                      'Clipboard blocked — select the key above instead.'
                    )}
                  </Text>
                ) : null}
              </XStack>
              <MutedText fontSize={13}>
                {t(
                  'PHONE_2FA_HINT',
                  'Setting this up on the phone you are reading this on? Copy the key — the QR code is for scanning from a second device.'
                )}
              </MutedText>
            </YStack>

            <XStack justifyContent="center">
              <img
                src={enrolment.qrCodeDataUrl}
                alt={t('QR_CODE_ALT', 'QR code containing the same setup key')}
                width={160}
                height={160}
                style={{ width: 160, height: 160, borderRadius: 8 }}
              />
            </XStack>
          </YStack>
        ) : null}

        <Field
          testID="twofactor-code"
          label={t('SIX_DIGIT_CODE', 'Six-digit code')}
          value={code}
          onChangeText={(next) => setCode(next.replace(/[^0-9]/g, '').slice(0, 6))}
          placeholder={t('SIX_DIGIT_CODE_PLACEHOLDER', '123456')}
          // The two attributes the old client had on neither of its code
          // fields: a numeric keypad instead of a full keyboard, and the hook
          // iOS and Android use to offer the code straight from the SMS/app.
          inputMode="numeric"
          autoComplete="one-time-code"
          onSubmit={submit}
          error={enable.isError ? errorMessage(enable.error) : null}
        />
      </YStack>
    </ResponsiveDialog>
  )
}
