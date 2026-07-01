/**
 * Public surface of the domain layer.
 *
 * Application and UI code should import from `@/domain` rather than reaching
 * into individual files, so the internal structure can evolve freely.
 */
export * from "./shared/result";
export * from "./shared/math";
export * from "./money";
export * from "./entities/payment-rail";
export * from "./entities/transaction";
export * from "./entities/reason-code";
export * from "./entities/reversal-request";
export * from "./services/smart-routing.service";
export * from "./services/intelligent-reversal-engine";
