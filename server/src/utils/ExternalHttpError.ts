/**
 * A non-2xx answer from an external metadata provider.
 *
 * `fetch` only rejects on a network-level failure - a 404 or a 429 resolves
 * normally - so the providers raise this themselves to keep the two cases
 * their callers have always distinguished: "this ISBN has no metadata" (a
 * null result) versus "the lookup itself failed" (a throw, which the retry
 * logic inspects and which `POST /book/isbn/:isbn` reports as 502 rather than
 * as an empty shelf).
 */
export class ExternalHttpError extends Error {
    public readonly status: number;

    public constructor(status: number, provider: string) {
        super(`${provider} responded with HTTP ${status}`);
        this.name = "ExternalHttpError";
        this.status = status;
    }
}
