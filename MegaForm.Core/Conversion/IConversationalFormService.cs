using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace MegaForm.Core.Conversion
{
    /// <summary>
    /// Converts a static form schema into a one-question-at-a-time conversational experience.
    /// Platform-agnostic; UI/host renders the session state.
    /// </summary>
    public interface IConversationalFormService
    {
        Task<ConversationalFormSession> StartAsync(int formId, CancellationToken cancellationToken = default);

        Task<ConversationalFormSession> AnswerAsync(ConversationalAnswer answer, CancellationToken cancellationToken = default);

        Task<ConversationalFormSession> GetSessionAsync(string sessionId, CancellationToken cancellationToken = default);

        Task<ConversationalProgress> GetProgressAsync(string sessionId, CancellationToken cancellationToken = default);

        Task<Dictionary<string, object>> CompleteAsync(string sessionId, CancellationToken cancellationToken = default);
    }
}
