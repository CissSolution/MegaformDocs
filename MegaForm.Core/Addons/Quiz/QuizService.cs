using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace MegaForm.Core.Addons.Quiz
{
    /// <summary>
    /// Default platform-agnostic quiz scoring implementation.
    /// </summary>
    public class QuizService : IQuizService
    {
        private readonly IQuizStore _store;

        public QuizService(IQuizStore store)
        {
            _store = store ?? throw new ArgumentNullException(nameof(store));
        }

        public async Task<QuizScoreResult> ScoreAsync(QuizDefinition quiz, QuizSubmission submission, CancellationToken cancellationToken = default)
        {
            if (quiz == null)
                throw new ArgumentNullException(nameof(quiz));
            if (submission == null)
                throw new ArgumentNullException(nameof(submission));

            var result = new QuizScoreResult
            {
                TotalQuestions = quiz.Questions.Count,
                MaxPossibleScore = quiz.Questions.Sum(q => q.Points)
            };

            foreach (var question in quiz.Questions)
            {
                submission.Answers.TryGetValue(question.FieldKey, out var givenValue);
                var givenString = givenValue?.ToString() ?? string.Empty;
                var correctOption = question.Options.FirstOrDefault(o => o.IsCorrect);
                var correctValue = correctOption?.Value ?? string.Empty;
                var isCorrect = string.Equals(givenString.Trim(), correctValue.Trim(), StringComparison.OrdinalIgnoreCase);
                var pointsEarned = isCorrect ? question.Points : 0;

                result.Details.Add(new QuizAnswerDetail
                {
                    QuestionId = question.Id,
                    QuestionText = question.Text,
                    GivenAnswer = givenValue,
                    CorrectAnswer = correctValue,
                    IsCorrect = isCorrect,
                    PointsEarned = pointsEarned
                });

                if (isCorrect)
                    result.CorrectAnswers++;

                result.TotalScore += pointsEarned;
            }

            var band = quiz.ResultBands
                .OrderBy(b => b.MinScore)
                .FirstOrDefault(b => result.TotalScore >= b.MinScore && result.TotalScore <= b.MaxScore);

            if (band != null)
            {
                result.ResultBandId = band.Id;
                result.ResultBandTitle = band.Title;
                result.ResultBandDescription = band.Description;
            }

            if (quiz.PassingScore.HasValue)
                result.Passed = result.TotalScore >= quiz.PassingScore.Value;
            else
                result.Passed = result.Percentage >= 50;

            await _store.SaveResultAsync(quiz.FormId, result, cancellationToken).ConfigureAwait(false);
            return result;
        }

        public Task<QuizDefinition> GetByFormIdAsync(int formId, CancellationToken cancellationToken = default)
        {
            return _store.GetByFormIdAsync(formId, cancellationToken);
        }

        public Task SaveAsync(QuizDefinition quiz, CancellationToken cancellationToken = default)
        {
            return _store.SaveAsync(quiz, cancellationToken);
        }

        public Task DeleteAsync(string quizId, CancellationToken cancellationToken = default)
        {
            return _store.DeleteAsync(quizId, cancellationToken);
        }

        public Task<IReadOnlyList<QuizScoreResult>> ListResultsAsync(int formId, CancellationToken cancellationToken = default)
        {
            return _store.ListResultsAsync(formId, cancellationToken);
        }
    }
}
