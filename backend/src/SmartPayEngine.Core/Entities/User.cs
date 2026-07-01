using SmartPayEngine.Core.Exceptions;
using SmartPayEngine.Core.ValueObjects;

namespace SmartPayEngine.Core.Entities;

/// <summary>
/// A platform user. Carries the <see cref="CustomerRiskProfile"/> the reversal
/// engine consults when a profile is not supplied inline on a transaction.
/// </summary>
public sealed class User
{
    public Guid Id { get; }

    public string Email { get; }

    public DateTimeOffset CreatedAt { get; }

    public CustomerRiskProfile RiskProfile { get; private set; }

    private User(Guid id, string email, DateTimeOffset createdAt, CustomerRiskProfile riskProfile)
    {
        Id = id;
        Email = email;
        CreatedAt = createdAt;
        RiskProfile = riskProfile;
    }

    public static User Create(
        string email,
        CustomerRiskProfile? riskProfile = null,
        DateTimeOffset? createdAt = null,
        Guid? id = null)
    {
        if (string.IsNullOrWhiteSpace(email) || !email.Contains('@'))
        {
            throw new DomainException("A valid email is required.", nameof(email));
        }

        return new User(
            id ?? Guid.NewGuid(),
            email.Trim(),
            createdAt ?? DateTimeOffset.UtcNow,
            riskProfile ?? CustomerRiskProfile.Unknown);
    }

    public void UpdateRiskProfile(CustomerRiskProfile profile) => RiskProfile = profile;
}
