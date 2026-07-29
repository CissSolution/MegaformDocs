using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Services;
using MegaForm.Core.Workflow;
using Xunit;

namespace MegaForm.Sdk.Tests
{
    public sealed class WorkflowWaitingTests
    {
        [Fact]
        public async Task HumanTask_ParksExecution_WithoutWalkingDefaultEdge()
        {
            var repository = new InMemoryWorkflowRepository();
            repository.Save(45, new WorkflowDefinition
            {
                StartNodeId = "review",
                Nodes = new List<WorkflowNode>
                {
                    new WorkflowNode { Id = "review", Type = WorkflowNodeType.Approval, Label = "Review" },
                    new WorkflowNode { Id = "publish", Type = WorkflowNodeType.End, Label = "Publish" }
                },
                Edges = new List<WorkflowEdge>
                {
                    new WorkflowEdge
                    {
                        SourceNodeId = "review",
                        SourceHandle = "default",
                        TargetNodeId = "publish"
                    }
                }
            });

            var waiting = new WaitingExecutor();
            var end = new CountingEndExecutor();
            var engine = new WorkflowEngineV2(
                repository,
                null,
                new INodeExecutor[] { waiting, end });

            var result = await engine.ExecuteAsync(
                45, 1001, new Dictionary<string, object>(), CancellationToken.None);

            Assert.Equal(WorkflowExecutionStatus.Waiting, result.Status);
            Assert.Equal("review", result.CurrentNodeId);
            Assert.Null(result.CompletedAt);
            Assert.Equal(1, waiting.Calls);
            Assert.Equal(0, end.Calls);
            Assert.Equal(WorkflowExecutionStatus.Waiting,
                repository.GetExecution(result.ExecutionId).Status);
        }

        private sealed class WaitingExecutor : INodeExecutor
        {
            public int Calls { get; private set; }
            public WorkflowNodeType NodeType => WorkflowNodeType.Approval;

            public Task<WorkflowNodeResult> ExecuteAsync(
                WorkflowNode node,
                WorkflowExecutionContext context,
                CancellationToken cancellationToken)
            {
                Calls++;
                context.PendingTaskId = "task-1";
                return Task.FromResult(WorkflowNodeResult.Waiting());
            }

            public WorkflowValidationResult Validate(WorkflowNode node) =>
                new WorkflowValidationResult { IsValid = true };
        }

        private sealed class CountingEndExecutor : INodeExecutor
        {
            public int Calls { get; private set; }
            public WorkflowNodeType NodeType => WorkflowNodeType.End;

            public Task<WorkflowNodeResult> ExecuteAsync(
                WorkflowNode node,
                WorkflowExecutionContext context,
                CancellationToken cancellationToken)
            {
                Calls++;
                return Task.FromResult(WorkflowNodeResult.Success(null));
            }

            public WorkflowValidationResult Validate(WorkflowNode node) =>
                new WorkflowValidationResult { IsValid = true };
        }
    }
}
