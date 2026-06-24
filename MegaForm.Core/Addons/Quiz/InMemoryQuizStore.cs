using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace MegaForm.Core.Addons.Quiz
{
    /// <summary>
    /// In-memory quiz store. Replace with persistent store for production.
    /// </summary>
    public class InMemoryQuizStore : IQuizStore
    {
        private readonly ConcurrentDictionary<string, QuizDefinition> _quizzes = new ConcurrentDictionary<string, QuizDefinition>();
        private readonly ConcurrentDictionary<int, List<QuizScoreResult>> _results = new ConcurrentDictionary<int, List<QuizScoreResult>>();

        public Task<QuizDefinition> GetByFormIdAsync(int formId, CancellationToken cancellationToken = default)
        {
            var quiz = _quizzes.Values.FirstOrDefault(q => q.FormId == formId);
            return Task.FromResult(quiz);
        }

        public Task SaveAsync(QuizDefinition quiz, CancellationToken cancellationToken = default)
        {
            if (quiz == null)
                throw new ArgumentNullException(nameof(quiz));

            if (string.IsNullOrWhiteSpace(quiz.Id))
                quiz.Id = Guid.NewGuid().ToString("N");

            _quizzes[quiz.Id] = quiz;
            return Task.CompletedTask;
        }

        public Task DeleteAsync(string quizId, CancellationToken cancellationToken = default)
        {
            if (!string.IsNullOrWhiteSpace(quizId))
                _quizzes.TryRemove(quizId, out _);

            return Task.CompletedTask;
        }

        public Task<IReadOnlyList<QuizScoreResult>> ListResultsAsync(int formId, CancellationToken cancellationToken = default)
        {
            var list = _results.TryGetValue(formId, out var results)
                ? results.AsReadOnly()
                : new List<QuizScoreResult>().AsReadOnly();

            return Task.FromResult<IReadOnlyList<QuizScoreResult>>(list);
        }

        public Task SaveResultAsync(int formId, QuizScoreResult result, CancellationToken cancellationToken = default)
        {
            if (result == null)
                return Task.CompletedTask;

            var list = _results.GetOrAdd(formId, _ => new List<QuizScoreResult>());
            lock (list)
            {
                list.Add(result);
            }

            return Task.CompletedTask;
        }
    }
}
