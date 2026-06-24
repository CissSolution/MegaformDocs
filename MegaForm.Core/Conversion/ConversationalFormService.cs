using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using Newtonsoft.Json;

namespace MegaForm.Core.Conversion
{
    /// <summary>
    /// Default conversational form implementation using an in-memory session store.
    /// </summary>
    public class ConversationalFormService : IConversationalFormService
    {
        private readonly IFormRepository _formRepository;
        private readonly ConcurrentDictionary<string, ConversationalFormSession> _sessions = new ConcurrentDictionary<string, ConversationalFormSession>();

        public ConversationalFormService(IFormRepository formRepository)
        {
            _formRepository = formRepository ?? throw new ArgumentNullException(nameof(formRepository));
        }

        public async Task<ConversationalFormSession> StartAsync(int formId, CancellationToken cancellationToken = default)
        {
            var form = await GetFormAsync(formId, cancellationToken).ConfigureAwait(false);
            if (form == null)
                throw new ArgumentException($"Form {formId} not found.", nameof(formId));

            var session = new ConversationalFormSession
            {
                FormId = formId,
                FormTitle = form.Title,
                Steps = BuildSteps(DeserializeSchema(form.SchemaJson)),
                CurrentStepIndex = 0,
                StartedAt = DateTime.UtcNow,
                LastActivityAt = DateTime.UtcNow
            };

            _sessions[session.SessionId] = session;
            return session;
        }

        public Task<ConversationalFormSession> AnswerAsync(ConversationalAnswer answer, CancellationToken cancellationToken = default)
        {
            if (answer == null)
                throw new ArgumentNullException(nameof(answer));

            if (!_sessions.TryGetValue(answer.SessionId, out var session))
                throw new KeyNotFoundException($"Session {answer.SessionId} not found.");

            if (session.IsCompleted)
                return Task.FromResult(session);

            var step = session.Steps.ElementAtOrDefault(session.CurrentStepIndex);
            if (step == null)
            {
                session.IsCompleted = true;
                session.CompletedAt = DateTime.UtcNow;
                return Task.FromResult(session);
            }

            session.Answers[step.FieldKey] = answer.Value;
            session.LastActivityAt = DateTime.UtcNow;

            do
            {
                session.CurrentStepIndex++;
            } while (session.CurrentStepIndex < session.Steps.Count &&
                     ShouldSkipStep(session.Steps[session.CurrentStepIndex], session.Answers));

            if (session.CurrentStepIndex >= session.Steps.Count)
            {
                session.IsCompleted = true;
                session.CompletedAt = DateTime.UtcNow;
            }

            return Task.FromResult(session);
        }

        public Task<ConversationalFormSession> GetSessionAsync(string sessionId, CancellationToken cancellationToken = default)
        {
            _sessions.TryGetValue(sessionId, out var session);
            return Task.FromResult(session);
        }

        public Task<ConversationalProgress> GetProgressAsync(string sessionId, CancellationToken cancellationToken = default)
        {
            _sessions.TryGetValue(sessionId, out var session);
            if (session == null)
                return Task.FromResult(new ConversationalProgress());

            var completed = session.Answers.Count;
            return Task.FromResult(new ConversationalProgress
            {
                TotalSteps = session.Steps.Count,
                CurrentStepIndex = session.CurrentStepIndex,
                CompletedSteps = completed,
                IsCompleted = session.IsCompleted
            });
        }

        public Task<Dictionary<string, object>> CompleteAsync(string sessionId, CancellationToken cancellationToken = default)
        {
            _sessions.TryGetValue(sessionId, out var session);
            if (session == null)
                return Task.FromResult<Dictionary<string, object>>(null);

            session.IsCompleted = true;
            session.CompletedAt = DateTime.UtcNow;
            return Task.FromResult(new Dictionary<string, object>(session.Answers, StringComparer.OrdinalIgnoreCase));
        }

        private async Task<FormInfo> GetFormAsync(int formId, CancellationToken cancellationToken)
        {
            // IFormRepository is synchronous in current Core; wrap for future async.
            return await Task.FromResult(_formRepository.GetForm(formId)).ConfigureAwait(false);
        }

        private static FormSchema DeserializeSchema(string schemaJson)
        {
            if (string.IsNullOrWhiteSpace(schemaJson))
                return new FormSchema();
            try
            {
                return JsonConvert.DeserializeObject<FormSchema>(schemaJson) ?? new FormSchema();
            }
            catch
            {
                return new FormSchema();
            }
        }

        private static List<ConversationalStep> BuildSteps(FormSchema schema)
        {
            var steps = new List<ConversationalStep>();
            if (schema?.Fields == null)
                return steps;

            foreach (var field in schema.Fields.Where(f => f != null && !f.Hidden).OrderBy(f => f.Order))
            {
                if (IsLayoutOrNonInput(field.Type))
                    continue;

                var step = new ConversationalStep
                {
                    FieldKey = field.Key,
                    Label = field.Label ?? field.Key,
                    Type = field.Type,
                    IsRequired = field.Required,
                    Placeholder = field.Placeholder,
                    HelpText = field.HelpText
                };

                if (field.Options != null)
                {
                    step.Options = field.Options
                        .Where(o => o != null)
                        .Select(o => new ConversationalOption { Value = o.Value, Label = o.Label ?? o.Value })
                        .ToList();
                }

                steps.Add(step);
            }

            return steps;
        }

        private static bool IsLayoutOrNonInput(string type)
        {
            if (string.IsNullOrWhiteSpace(type))
                return false;

            var nonInput = new[] { "Html", "Section", "Row", "PaymentSummary", "Captcha", "Terms" };
            return nonInput.Contains(type, StringComparer.OrdinalIgnoreCase);
        }

        private static bool ShouldSkipStep(ConversationalStep step, Dictionary<string, object> answers)
        {
            // Placeholder for conditional logic: currently no skip.
            return false;
        }
    }
}
