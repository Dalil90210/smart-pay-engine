using Microsoft.AspNetCore.Mvc;
using SmartPayEngine.Api.Contracts;
using SmartPayEngine.Core.Abstractions;
using SmartPayEngine.Core.Entities;
using SmartPayEngine.Core.Exceptions;
using SmartPayEngine.Core.Models;

namespace SmartPayEngine.Api.Controllers;

/// <summary>
/// CRUD-lite endpoints for transactions plus routing/reversal analysis driven
/// off a stored transaction. Transactions live in the in-memory sandbox store.
/// </summary>
[ApiController]
[Route("api/transactions")]
[Produces("application/json")]
public sealed class TransactionsController : ControllerBase
{
    private readonly ITransactionRepository _transactions;
    private readonly ISmartRoutingService _routing;
    private readonly IIntelligentReversalEngine _engine;

    public TransactionsController(
        ITransactionRepository transactions,
        ISmartRoutingService routing,
        IIntelligentReversalEngine engine)
    {
        _transactions = transactions;
        _routing = routing;
        _engine = engine;
    }

    /// <summary>Create and store a transaction.</summary>
    [HttpPost]
    [ProducesResponseType(typeof(Transaction), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<Transaction>> Create(
        [FromBody] TransactionDto dto,
        CancellationToken ct)
    {
        Transaction transaction;
        try
        {
            transaction = dto.ToDomain();
        }
        catch (DomainException ex)
        {
            return Problem(detail: ex.Message, statusCode: StatusCodes.Status400BadRequest);
        }

        await _transactions.AddAsync(transaction, ct);
        return CreatedAtAction(nameof(GetById), new { id = transaction.Id }, transaction);
    }

    /// <summary>Fetch a stored transaction.</summary>
    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(Transaction), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<Transaction>> GetById(Guid id, CancellationToken ct)
    {
        var transaction = await _transactions.GetByIdAsync(id, ct);
        return transaction is null ? NotFound() : Ok(transaction);
    }

    /// <summary>List stored transactions, newest first.</summary>
    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<Transaction>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<Transaction>>> List(CancellationToken ct)
        => Ok(await _transactions.ListAsync(ct));

    /// <summary>Rank routing options for a stored transaction's corridor.</summary>
    [HttpGet("{id:guid}/routing")]
    [ProducesResponseType(typeof(RoutingRecommendation), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<RoutingRecommendation>> Routing(Guid id, CancellationToken ct)
    {
        var transaction = await _transactions.GetByIdAsync(id, ct);
        return transaction is null ? NotFound() : Ok(_routing.Analyze(transaction));
    }

    /// <summary>Run the reversal engine against a stored transaction.</summary>
    [HttpPost("{id:guid}/reversal-analysis")]
    [ProducesResponseType(typeof(ReversalAnalysis), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<ReversalAnalysis>> ReversalAnalysis(
        Guid id,
        [FromBody] StoredReversalAnalysisRequest request,
        CancellationToken ct)
    {
        var transaction = await _transactions.GetByIdAsync(id, ct);
        if (transaction is null)
        {
            return NotFound();
        }

        var amount = request.RequestedAmount ?? transaction.Amount.Amount;
        try
        {
            return Ok(_engine.AnalyzeReversal(transaction, amount, request.Context?.ToDomain()));
        }
        catch (DomainException ex)
        {
            return Problem(detail: ex.Message, statusCode: StatusCodes.Status400BadRequest);
        }
    }
}
