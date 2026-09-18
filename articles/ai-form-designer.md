# AI Form Designer

MegaForm AI Form Designer lets you create a form by describing what you need in everyday language.
You can then continue the conversation to add fields, change the layout, improve validation, or
adjust what happens after submission.

The same experience is available on **DNN**, **Oqtane**, and **Umbraco**. The way you open MegaForm
is different on each platform, but the create, preview, refine, and save workflow is consistent.

## Before you start

1. Open **MegaForm > Settings > AI Settings**.
2. Choose your AI provider.
3. Enter the provider API key and select a model.
4. Use **Test connection**, then save the settings.

Google Gemini, OpenAI, Anthropic, OpenRouter, and OpenAI-compatible providers are supported. A
Gemini Flash model is a practical low-cost option for routine form creation and editing.

## Create a form with AI

1. Open the MegaForm dashboard and choose **Create form**.
2. Select **Create with AI**.
3. Describe the form, its audience, and the information you need to collect.
4. Review the live preview.
5. Ask for any changes in the same conversation.
6. Select **Save & Use Now** or open the result in the full builder.

For example:

> Create a customer support form with name, email, product, priority, message, screenshots, and a
> consent checkbox. Send urgent requests to the support workflow.

## Refine an existing form

Open a form in the builder and select **AI Designer**. Describe the change you want without
recreating the form:

- "Add an appointment date and available time slot."
- "Split this form into Contact details and Request details."
- "Make phone optional and require either email or phone."
- "Add a manager approval step for requests above $1,000."
- "Translate the labels and messages into French."

The preview updates as the form changes. Continue asking for refinements until the form is ready,
then save and publish it normally.

## Create forms from existing data

When your site already contains business data, name the source in your request. MegaForm can help
build a form around an available SQL table or an imported Umbraco Forms definition. Always review
field mappings, validation, and submission behavior before publishing.

- [Use Umbraco Forms data in MegaForm](umbraco-forms-data-source.md)
- [Build forms from SQL tables](sql-table-forms-and-cascades.md)

## Platform guides

- [AI Form Designer on Umbraco](umbraco-ai-form-designer.md)
- [AI Form Designer on Oqtane](oqtane-ai-form-designer.md)
- [AI Form Designer on DNN](dnn-ai-form-designer.md)

## Tips for better results

- State the purpose of the form and who will complete it.
- List required fields and any fields that should be optional.
- Mention approvals, notifications, confirmation messages, and redirects.
- For multi-step forms, describe the desired sections in order.
- Ask for one focused refinement at a time when polishing a complex form.
- Test the published form as a visitor before making it available to everyone.
