/**
 * Domain `Money` value object.
 *
 * Money is represented as an integer number of **minor units** (cents/pence)
 * plus an ISO currency. It is immutable; every operation returns a new
 * instance. Currency mismatches are treated as invariant violations because
 * the domain should never silently mix currencies.
 *
 * The supported `Currency` union is reused from the existing app utilities so
 * the domain layer and the rest of the codebase agree on the currency set.
 */
import type { Currency } from "@/lib/money";
import { DomainError, DomainErrorCode } from "./shared/result";

export type { Currency };

export class Money {
  /** Integer minor units. May be negative (e.g. a debit). */
  readonly minor: number;
  readonly currency: Currency;

  private constructor(minor: number, currency: Currency) {
    this.minor = minor;
    this.currency = currency;
  }

  /**
   * Construct money from minor units. Throws on non-integer input because a
   * fractional minor unit indicates a rounding bug upstream.
   */
  static fromMinor(minor: number, currency: Currency): Money {
    if (!Number.isInteger(minor)) {
      throw new DomainError(
        DomainErrorCode.Validation,
        `Money.minor must be an integer number of minor units, got ${minor}`,
        "minor",
      );
    }
    return new Money(minor, currency);
  }

  /** Convenience constructor from a major-unit amount (e.g. 12.34 USD). */
  static fromMajor(major: number, currency: Currency): Money {
    return new Money(Math.round(major * 100), currency);
  }

  static zero(currency: Currency): Money {
    return new Money(0, currency);
  }

  private assertSameCurrency(other: Money): void {
    if (other.currency !== this.currency) {
      throw new DomainError(
        DomainErrorCode.Invariant,
        `Currency mismatch: ${this.currency} vs ${other.currency}`,
        "currency",
      );
    }
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.minor + other.minor, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.minor - other.minor, this.currency);
  }

  /** Scale by a ratio, rounding to the nearest minor unit. */
  percentage(ratio: number): Money {
    return new Money(Math.round(this.minor * ratio), this.currency);
  }

  abs(): Money {
    return new Money(Math.abs(this.minor), this.currency);
  }

  get isZero(): boolean {
    return this.minor === 0;
  }

  get isPositive(): boolean {
    return this.minor > 0;
  }

  /** Ratio of this amount to another (absolute values). 0 when divisor is 0. */
  ratioTo(other: Money): number {
    this.assertSameCurrency(other);
    if (other.minor === 0) return 0;
    return Math.abs(this.minor) / Math.abs(other.minor);
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.minor === other.minor;
  }

  /** Major-unit representation for display/serialization. */
  toMajor(): number {
    return this.minor / 100;
  }

  toJSON(): { minor: number; currency: Currency } {
    return { minor: this.minor, currency: this.currency };
  }
}
