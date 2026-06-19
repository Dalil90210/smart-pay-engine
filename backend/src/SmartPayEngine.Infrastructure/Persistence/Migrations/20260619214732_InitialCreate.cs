using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SmartPayEngine.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "reversal_requests",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    TransactionId = table.Column<Guid>(type: "TEXT", nullable: false),
                    requested_amount = table.Column<string>(type: "TEXT", nullable: false),
                    Status = table.Column<string>(type: "TEXT", nullable: false),
                    SuccessProbability = table.Column<int>(type: "INTEGER", nullable: false),
                    RecommendedAction = table.Column<string>(type: "TEXT", nullable: false),
                    ReasonCode = table.Column<string>(type: "TEXT", nullable: false),
                    EvidenceNeeded = table.Column<string>(type: "TEXT", nullable: false),
                    AIExplanation = table.Column<string>(type: "TEXT", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_reversal_requests", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_reversal_requests_Status",
                table: "reversal_requests",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_reversal_requests_TransactionId",
                table: "reversal_requests",
                column: "TransactionId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "reversal_requests");
        }
    }
}
