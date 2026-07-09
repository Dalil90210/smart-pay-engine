type Props = { password: string };

export function getPasswordChecks(password: string) {
  return {
    length: password.length >= 8,
    lower: /[a-z]/.test(password),
    upper: /[A-Z]/.test(password),
    number: /\d/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password),
  };
}

export function getPasswordScore(password: string) {
  return Object.values(getPasswordChecks(password)).filter(Boolean).length;
}

export function PasswordStrength({ password }: Props) {
  const checks = getPasswordChecks(password);
  const score = Object.values(checks).filter(Boolean).length;
  const tooShort = password.length > 0 && !checks.length;

  const label =
    password.length === 0
      ? ""
      : score <= 2
      ? "Weak"
      : score === 3
      ? "Fair"
      : score === 4
      ? "Good"
      : "Strong";
  const barColor =
    score <= 2 ? "bg-destructive" : score === 3 ? "bg-amber-500" : score === 4 ? "bg-lime-500" : "bg-emerald-500";
  const textColor =
    score <= 2 ? "text-destructive" : score === 3 ? "text-amber-500" : score === 4 ? "text-lime-600" : "text-emerald-600";

  return (
    <div className="mt-2" aria-live="polite">
      {password.length > 0 && (
        <>
          <div className="flex h-1.5 gap-1" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={`h-full flex-1 rounded-full transition-colors ${
                  i < score ? barColor : "bg-muted"
                }`}
              />
            ))}
          </div>
          <p className={`mt-1 text-xs font-medium ${textColor}`}>Strength: {label}</p>
        </>
      )}
      <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
        <li className={checks.length ? "text-emerald-600" : tooShort ? "text-destructive" : ""}>
          • At least 8 characters
        </li>
        <li className={checks.upper && checks.lower ? "text-emerald-600" : ""}>
          • Upper &amp; lowercase letters
        </li>
        <li className={checks.number ? "text-emerald-600" : ""}>• At least one number</li>
        <li className={checks.symbol ? "text-emerald-600" : ""}>• A symbol (recommended)</li>
      </ul>
    </div>
  );
}
