using Microsoft.AspNetCore.Mvc;
using SmartPayEngine.Core.Catalogs;

namespace SmartPayEngine.Api.Controllers;

/// <summary>
/// Read-only reference data the engine reasons over: payment-rail economics and
/// dispute reason-code profiles. Useful for clients building UIs or
/// understanding the model's inputs.
/// </summary>
[ApiController]
[Route("api/catalog")]
[Produces("application/json")]
public sealed class CatalogController : ControllerBase
{
    /// <summary>All payment-provider profiles (cost, speed, reversibility, windows).</summary>
    [HttpGet("providers")]
    [ProducesResponseType(typeof(IReadOnlyCollection<ProviderProfile>), StatusCodes.Status200OK)]
    public ActionResult<IReadOnlyCollection<ProviderProfile>> Providers()
        => Ok(ProviderCatalog.All);

    /// <summary>All dispute reason-code profiles (win rates + evidence).</summary>
    [HttpGet("reason-codes")]
    [ProducesResponseType(typeof(IReadOnlyCollection<ReasonCodeProfile>), StatusCodes.Status200OK)]
    public ActionResult<IReadOnlyCollection<ReasonCodeProfile>> ReasonCodes()
        => Ok(ReasonCodeCatalog.All);
}
