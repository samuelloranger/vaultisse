/** The only country codes exposed by the profile region selector. */
export const VALID_REGIONS = [
    "AU",
    "BR",
    "CA",
    "CN",
    "FR",
    "DE",
    "IT",
    "JP",
    "MX",
    "PT",
    "RU",
    "SA",
    "ES",
    "TW",
    "GB",
    "US",
] as const;

export type RegionCode = (typeof VALID_REGIONS)[number];

export function isValidRegion(value: unknown): value is RegionCode {
    return typeof value === "string" && (VALID_REGIONS as readonly string[]).includes(value);
}

/** Invalid persisted values are never used as a provider parameter. */
export function validatedRegion(value: unknown): RegionCode {
    return isValidRegion(value) ? value : "US";
}
