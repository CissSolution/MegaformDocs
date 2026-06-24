# MegaForm Post-Submission Experience Roadmap

This delivery implements **V1** in the shared Vite/TS builder + renderer pipeline and stores the schema in `settings.postSubmitExperience` so Web / DNN / Oqtane can reuse the same experience.

## Implemented in this round (V1)

- Rich confirmation page
- Redirect immediately
- Timed redirect after showing the confirmation page
- Token insertion for message / URLs
- Submission ID chip
- CTA buttons (primary + secondary)
- Answer summary
- Fill again button
- Portable schema model in `MegaForm.Core`

## Schema shape

```json
{
  "settings": {
    "postSubmitExperience": {
      "enabled": true,
      "mode": "rich",
      "title": "Submission received",
      "message": "Thanks {{field:name}}! We have received your submission.",
      "showSubmissionId": true,
      "submissionIdLabel": "Submission ID",
      "showAnswerSummary": true,
      "answerSummaryTitle": "Your answers",
      "hideEmptyAnswers": true,
      "allowFillAgain": true,
      "fillAgainLabel": "Submit another response",
      "redirectUrl": "https://example.com/next-step?ref={{submission:id}}",
      "redirectDelaySeconds": 5,
      "redirectNotice": "Redirecting shortly…",
      "buttons": [
        {
          "label": "Open dashboard",
          "url": "https://example.com/dashboard?submission={{submission:id}}",
          "variant": "primary",
          "newTab": false
        },
        {
          "label": "Download guide",
          "url": "https://example.com/guide.pdf",
          "variant": "secondary",
          "newTab": true
        }
      ]
    }
  }
}
```

## Planned V2

- Multiple outcome pages
- Logic routing
- Download PDF
- Email copy
- Edit submission link
- Outcome by payment / workflow state

## Planned V3

- Booking / calendar handoff
- Portal deep-link
- A/B testing ending pages
- Conversion tracking events
