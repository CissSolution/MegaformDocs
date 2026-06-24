using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace MegaForm.Core.Addons.Quiz
{
    /// <summary>
    /// Quiz persistence abstraction. Hosts provide the store.
    /// </summary>
    public interface IQuizStore
    {
        Task<QuizDefinition> GetByFormIdAsync(int formId, CancellationToken cancellationToken = default);
        Task SaveAsync(QuizDefinition quiz, CancellationToken cancellationToken = default);
        Task DeleteAsync(string quizId, CancellationToken cancellationToken = default);
        Task<IReadOnlyList<QuizScoreResult>> ListResultsAsync(int formId, CancellationToken cancellationToken = default);
        Task SaveResultAsync(int formId, QuizScoreResult result, CancellationToken cancellationToken = default);
    }
}
