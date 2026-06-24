using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace MegaForm.Core.Addons.Quiz
{
    /// <summary>
    /// Core quiz scoring and grading service. Platform agnostic.
    /// </summary>
    public interface IQuizService
    {
        Task<QuizScoreResult> ScoreAsync(QuizDefinition quiz, QuizSubmission submission, CancellationToken cancellationToken = default);
        Task<QuizDefinition> GetByFormIdAsync(int formId, CancellationToken cancellationToken = default);
        Task SaveAsync(QuizDefinition quiz, CancellationToken cancellationToken = default);
        Task DeleteAsync(string quizId, CancellationToken cancellationToken = default);
        Task<IReadOnlyList<QuizScoreResult>> ListResultsAsync(int formId, CancellationToken cancellationToken = default);
    }
}
