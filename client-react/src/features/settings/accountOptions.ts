/**
 * The option lists for the three `users` columns that are picked from a fixed
 * set: language, region and theme.
 *
 * They live in their own module because **two** forms edit the same three
 * columns from opposite ends. `ProfileCard` sets them for the person filling it
 * in; Admin → New accounts sets what the *next* account to register starts
 * with. Two copies of these lists would drift, and the drift would be silent:
 * an admin picking a default the profile form does not offer produces accounts
 * whose language shows up blank in their own settings.
 */

/**
 * The UI locales, which is deliberately **not** the policy's 22-entry *book*
 * language list — `users.language` is what the interface is written in, and
 * these four are the ones `app_labels` has translations for.
 *
 * The admin default is validated server-side against `app_languages`, which is
 * the table these four codes come from.
 */
export const UI_LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'ca', label: 'Català' },
  { value: 'it', label: 'Italiano' },
]

/** Ported verbatim from the old settings view. */
export const REGIONS = [
  { value: 'AU', label: 'Australia' },
  { value: 'BR', label: 'Brazil' },
  { value: 'CA', label: 'Canada' },
  { value: 'CN', label: 'China' },
  { value: 'FR', label: 'France' },
  { value: 'DE', label: 'Germany' },
  { value: 'IT', label: 'Italy' },
  { value: 'JP', label: 'Japan' },
  { value: 'MX', label: 'Mexico' },
  { value: 'PT', label: 'Portugal' },
  { value: 'RU', label: 'Russia' },
  { value: 'SA', label: 'Saudi Arabia' },
  { value: 'ES', label: 'Spain' },
  { value: 'TW', label: 'Taiwan' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'US', label: 'United States' },
]
