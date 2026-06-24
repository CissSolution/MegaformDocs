# Prompt-Recipe Library — Architecture

## Problem

We want detailed prompt templates for many recurring AI tasks (convert premium
form, build Razor master-detail, build Razor image gallery, build Dynamic
Label tabs variant A/B, …). Stuffing all of them into `MF_AI_Knowledge.Body`
bloats SQL: each recipe is 2–4 KB markdown and we'll have 30–50 of them.

## Decision: KB-row-as-index + recipe-file-on-disk

```
DB row (small, indexed):                File on disk (large, lazy):
┌─────────────────────────────┐        ┌────────────────────────────────────┐
│ MF_AI_Knowledge             │        │ DesktopModules/MegaForm/Resources/ │
│                             │        │ PromptRecipes/                     │
│ slug:    convert-premium-…  │ ──┬──> │   convert-premium-form.md          │
│ kind:    prompt_recipe      │   │    │   build-razor-master-detail.md     │
│ title:   Convert Premium …  │   ├──> │   build-razor-image-gallery.md     │
│ summary: 1 line WHY to use  │   │    │   build-dynamic-label-tabs.md      │
│ tags:    ...                │   ├──> │   build-dynamic-label-stats.md     │
│ body:    {"recipe_file":    │   │    │   …                                │
│           "convert-…md"}    │   │    └────────────────────────────────────┘
└─────────────────────────────┘   │
                                  │
                          ~500 bytes per KB row
                          (vs 2-4 KB if body inlined)
```

## Why this shape

1. **KB stays small + searchable** — only summaries + tags + file pointer go to
   SQL. AI's `list_knowledge` returns all 30+ recipes' summaries in a couple
   of kilobytes total (not 100 KB+).
2. **Files version-control naturally** — markdown files in `Resources/` ship
   with the DNN module and update on each release. No need for SQL migrations
   when a recipe changes.
3. **AI can browse first, then drill in** — calls `list_knowledge(kind=
   "prompt_recipe")` to see all summaries, picks one, calls
   `get_prompt_recipe(slug)` to get the full body. Same two-step browse-then-
   read pattern as widgets/templates already use.
4. **Zero schema migration** — reuses existing `MF_AI_Knowledge` columns.
   Only the `Kind` value `prompt_recipe` is new + one new API endpoint.
5. **No bundle bloat** — recipes load from server only when AI requests them,
   not via the builder JS bundle.

## What ships

| Layer            | Change |
|------------------|--------|
| C# controller    | `GET /AiTools/GetPromptRecipe?slug=…` — joins KB row + file content |
| TS tool registry | new `get_prompt_recipe` tool entry → maps to the endpoint |
| SQL seed         | one row per recipe: slug, summary, tags, `{"recipe_file":"..md"}` |
| Files            | `Resources/PromptRecipes/<slug>.md` — markdown |
| System prompt    | one paragraph telling AI the library exists |

## Adding a new recipe (workflow)

1. Drop a markdown file under `Resources/PromptRecipes/your-recipe.md`.
2. Append one INSERT to `Seed/ai-knowledge-prompt-recipes.sql` with the slug,
   summary, tags, and `body = '{"recipe_file": "your-recipe.md"}'`.
3. Run the seed → AI sees it in next `list_knowledge` call.

No code change. No rebuild. Recipes are shippable as a pure-content drop.

## Read-ordering for the AI

When the user gives a high-level task ("convert this form to consultation"),
the AI flow is:

```
1. list_knowledge(kind="prompt_recipe", search=relevant_keywords)
   → returns [{slug, title, summary, tags}, …]
2. get_prompt_recipe(slug="convert-premium-form")
   → returns full markdown body with detailed rules + ops shape
3. inspect_form_customizations(formId)
   → returns current schema + custom html/css
4. emit ops following the recipe's rules
```

The system prompt is updated to make step 1 the very first move when the user
asks for a multi-field transformation. This concentrates expensive reasoning
into a one-time recipe load instead of being implicit in every system prompt
turn.
