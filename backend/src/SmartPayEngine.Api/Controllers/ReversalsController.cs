using Microsoft.AspNetCore.Mvc;
using SmartPayEngine.Api.Contracts;
using SmartPayEngine.Core.Abstractions;
using SmartPayEngine.Core.Entities;
using SmartPayEngine.Core.Exceptions;
using SmartPayEngine.Core.Models;
using SmartPayEngine.Core.ValueObjects;

namespace SmartPayEngine.Api.Controllers;

/// <summary>
/// Endpoints for analyzing and filing transaction reversals, powered by the
/// <see cref="IIntelligentReversalEngine"/>.
/// </summary>
[ApiController]
[Route("api/reversals")]
[Produces("application/json")]
public sealed class ReversalsController : ControllerBase
{
    private readonly IIntelligentReversalEngine _engine;
    private readonly IReversalRequestRepository _repository;

    public ReversalsController(
        IIntelligentReversalEngine engine,
        IReversalRequestRepository repository)
    {
        _engine = engine;
        _repository = repository;
    }

    /// <summary>
    /// Analyze a transaction for reversal and return the full AI assessment
    /// (probability, recommendation, reason code, evidence, explanation).
    /// Read-only — nothing is persisted.
    /// </summary>
    [HttpPost("analyze")]
    [ProducesResponseType(typeof(ReversalAnalysis), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    public ActionResult<ReversalAnalysis> Analyze([FromBody] AnalyzeReversalRequest request)
    {
        var (transaction, error) = BuildTransaction(request.Transaction);
        if (transaction is null)
        {
            return Problem(detail: error, statusCode: StatusCodes.Status400BadRequest);
        }

        try
        {
            var analysis = _engine.AnalyzeReversal(
                transaction,
                request.RequestedAmount,
                request.Context?.ToDomain());
            return Ok(analysis);
        }
        catch (DomainException ex)
        {
            return Problem(detail: ex.Message, statusCode: StatusCodes.Status400BadRequest);
        }
    }

    /// <summary>
    /// File a reversal request: runs the engine, persists a
    /// <see cref="ReversalRequest"/> populated with the AI verdict, and returns
    /// the created resource.
    /// </summary>
    [HttpPost("request")]
    [ProducesResponseType(typeof(ReversalRequest), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<ReversalRequest>> CreateReversal(
        [FromBody] CreateReversalRequest request,
        CancellationToken ct)
    {
        var (transaction, error) = BuildTransaction(request.Transaction);
        if (transaction is null)
        {
            return Problem(detail: error, statusCode: StatusCodes.Status400BadRequest);
        }

        try
        {
            var analysis = _engine.AnalyzeReversal(
                transaction,
                request.RequestedAmount,
                request.Context?.ToDomain());

            var reversal = ReversalRequest.FromAnalysis(analysis, transaction.Amount);
            await _repository.AddAsync(reversal, ct);

            return CreatedAtAction(nameof(GetById), new { id = reversal.Id }, reversal);
        }
        catch (DomainException ex)
        {
            return Problem(detail: ex.Message, statusCode: StatusCodes.Status400BadRequest);
        }
    }

    /// <summary>Fetch a previously filed reversal request.</summary>
    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(ReversalRequest), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ReversalRequest>> GetById(Guid id, CancellationToken ct)
    {
        var reversal = await _repository.GetByIdAsync(id, ct);
        return reversal is null ? NotFound() : Ok(reversal);
    }

    /// <summary>List filed reversal requests, highest priority first.</summary>
    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<ReversalRequest>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<ReversalRequest>>> List(CancellationToken ct)
        => Ok(await _repository.ListAsync(ct));

    private static (Transaction? Transaction, string? Error) BuildTransaction(TransactionDto dto)
    {
        try
        {
            return (dto.ToDomain(), null);
        }
        catch (DomainException ex)
        {
            return (null, ex.Message);
        }
    }
}
