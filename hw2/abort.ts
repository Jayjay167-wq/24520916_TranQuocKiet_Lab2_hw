/** Shared helpers so cancellation looks the same everywhere. */

export function createAbortError(message = "The operation was aborted."): DOMException {
  return new DOMException(message, "AbortError");
}

export function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}
