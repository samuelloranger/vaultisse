import { describe, expect, it } from 'vitest'
import { createLocale } from '@/locale/LocaleProvider'
import { metadataLookupFailureMessage } from './metadataLookupError'

const french = createLocale('fr', 'CA', {
  UNSPECIFIED_METADATA_SOURCE: 'une source de métadonnées',
  METADATA_SOURCES_NOT_CONFIGURED:
    'Configuration manquante sur ce serveur pour : {sources}.',
  METADATA_SOURCE_NOT_CONFIGURED:
    'Métadonnées indisponibles : {configured} Demandez à un administrateur de vérifier la configuration ou ajoutez le livre manuellement.',
})

describe('localized metadata source failures', () => {
  it('names a reported source without imposing plural grammar', () => {
    expect(
      metadataLookupFailureMessage(
        {
          kind: 'source_not_configured',
          unconfiguredSources: ['google-books'],
          sourcesTried: [],
          failedSources: [],
        },
        french.t
      )
    ).toBe(
      'Métadonnées indisponibles : Configuration manquante sur ce serveur pour : google-books. Demandez à un administrateur de vérifier la configuration ou ajoutez le livre manuellement.'
    )
  })

  it('uses a localized generic source when the server names none', () => {
    expect(
      metadataLookupFailureMessage(
        {
          kind: 'source_not_configured',
          unconfiguredSources: [],
          sourcesTried: [],
          failedSources: [],
        },
        french.t
      )
    ).toBe(
      'Métadonnées indisponibles : Configuration manquante sur ce serveur pour : une source de métadonnées. Demandez à un administrateur de vérifier la configuration ou ajoutez le livre manuellement.'
    )
  })
})
