/**
 * Shared kernel — Result type & domain errors.
 *
 * The domain layer never throws for *expected* validation failures. Instead it
 * returns an explicit `Result<T>` so callers (application / UI layers) are
 * forced to handle the failure path. Unexpected programmer errors (invariants
 * that should be impossible) may still throw `DomainError`.
 */

/** A machine-readable category for a domain failure. */
export enum DomainErrorCode {
  Validation = "validation",
  Invariant = "invariant",
  NotReversible = "not_reversible",
  Unsupported = "unsupported",
}

/** A structured, serializable domain error. */
export class DomainError extends Error {
  readonly code: DomainErrorCode;
  /** Optional field path the error relates to (e.g. "amount.minor"). */
  readonly field?: string;

  constructor(code: DomainErrorCode, message: string, field?: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.field = field;
  }
}

/** Discriminated union representing either success or failure. */
export type Result<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: DomainError };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<T = never>(code: DomainErrorCode, message: string, field?: string): Result<T> {
  return { ok: false, error: new DomainError(code, message, field) };
}

/** Narrowing helper. */
export function isOk<T>(r: Result<T>): r is { ok: true; value: T } {
  return r.ok;
}

/**
 * Unwrap a Result, throwing the contained error when it is a failure. Use only
 * at the boundary where you have already decided a failure is exceptional.
 */
export function unwrap<T>(r: Result<T>): T {
  if (r.ok) return r.value;
  throw r.error;
}
