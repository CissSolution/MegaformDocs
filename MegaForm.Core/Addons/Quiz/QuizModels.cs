using System;
using System.Collections.Generic;

namespace MegaForm.Core.Addons.Quiz
{
    public class QuizDefinition
    {
        public string Id { get; set; } = Guid.NewGuid().ToString("N");
        public int FormId { get; set; }
        public string Title { get; set; }
        public List<QuizQuestion> Questions { get; set; } = new List<QuizQuestion>();
        public List<QuizResultBand> ResultBands { get; set; } = new List<QuizResultBand>();
        public bool ShowCorrectAnswers { get; set; }
        public bool AllowMultipleAttempts { get; set; }
        public int? PassingScore { get; set; }
    }

    public class QuizQuestion
    {
        public string Id { get; set; } = Guid.NewGuid().ToString("N");
        public string FieldKey { get; set; }
        public string Text { get; set; }
        public int Points { get; set; } = 1;
        public List<QuizAnswerOption> Options { get; set; } = new List<QuizAnswerOption>();
    }

    public class QuizAnswerOption
    {
        public string Id { get; set; } = Guid.NewGuid().ToString("N");
        public string Label { get; set; }
        public string Value { get; set; }
        public bool IsCorrect { get; set; }
    }

    public class QuizSubmission
    {
        public int SubmissionId { get; set; }
        public int FormId { get; set; }
        public string UserIdentifier { get; set; }
        public Dictionary<string, object> Answers { get; set; } = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        public DateTime SubmittedAt { get; set; } = DateTime.UtcNow;
    }

    public class QuizScoreResult
    {
        public int TotalQuestions { get; set; }
        public int CorrectAnswers { get; set; }
        public int TotalScore { get; set; }
        public int MaxPossibleScore { get; set; }
        public double Percentage => MaxPossibleScore == 0 ? 0 : (TotalScore * 100.0 / MaxPossibleScore);
        public bool Passed { get; set; }
        public string ResultBandId { get; set; }
        public string ResultBandTitle { get; set; }
        public string ResultBandDescription { get; set; }
        public List<QuizAnswerDetail> Details { get; set; } = new List<QuizAnswerDetail>();
    }

    public class QuizAnswerDetail
    {
        public string QuestionId { get; set; }
        public string QuestionText { get; set; }
        public object GivenAnswer { get; set; }
        public object CorrectAnswer { get; set; }
        public bool IsCorrect { get; set; }
        public int PointsEarned { get; set; }
    }

    public class QuizResultBand
    {
        public string Id { get; set; } = Guid.NewGuid().ToString("N");
        public string Title { get; set; }
        public string Description { get; set; }
        public int MinScore { get; set; }
        public int MaxScore { get; set; }
    }
}
