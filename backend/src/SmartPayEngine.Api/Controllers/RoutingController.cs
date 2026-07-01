using Microsoft.AspNetCore.Mvc;
using SmartPayEngine.Api.Contracts;
using SmartPayEngine.Core.Abstractions;
using SmartPayEngine.Core.Exceptions;
using SmartPayEngine.Core.Models;

namespace SmartPayEngine.Api.Controllers;

/// <summary>
/// Endpoints for the Smart Routing service: score and rank the payment rails
/// that can carry a given amount/corridor.
/// </summary>
[ApiController]
[Route("api/routing")]
[Produces("application/json")]
public sealed class RoutingController : ControllerBase
{
    private readonly ISmartRoutingService _routing;

    public RoutingController(ISmartRoutingService routing) => _routing = routing;

    /// <summary>
    /// Rank the eligible rails for an amount/currency corridor under the chosen
    /// optimization preference (balanced / cheapest / fastest).
    /// </summary>
    [HttpPost("analyze")]
    [ProducesResponseType(typeof(RoutingRecommendation), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    public ActionResult<RoutingRecommendation> Analyze([FromBody] RoutingRequest request)
    {
        try
        {
            var recommendation = _routing.Analyze(
                request.ToMoney(),
                request.ToCurrency,
                request.Urgent,
                request.ToPolicy());
            return Ok(recommendation);
        }
        catch (DomainException ex)
        {
            return Problem(detail: ex.Message, statusCode: StatusCodes.Status400BadRequest);
        }
    }
}
