using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using MegaForm.Core.Models;
using MegaForm.Core.Workflow;
using Newtonsoft.Json;

namespace MegaForm.Core.Services.Starters
{
    public static class ConfiguredAppStarterDefinitions
    {
        private const string BlogAuthorRole = "Blog Authors";
        private const string BlogEditorRole = "Blog Editors";
        private const string BlogSeoRole = "SEO Reviewers";
        private const string BlogLegalRole = "Content Legal Reviewers";
        private const string BlogPublisherRole = "Blog Publishers";
        private const string BlogImageField = "featured_image_upload";
        private const string StarterPassword = "";

#pragma warning disable CS8603
        public static AppStarterDefinition Get(string key)
        {
            var normalized = (key ?? string.Empty).Trim().ToLowerInvariant();
            switch (normalized)
            {
                case "blog":
                case "blogs":
                case "blog-publishing":
                    return Blog();
                default:
                    return null;
            }
        }
#pragma warning restore CS8603

        private static AppStarterDefinition Blog()
        {
            var def = new AppStarterDefinition
            {
                Key = "blog",
                AppScope = AppProfileScopes.Blog,
                AppKey = "blog-starter",
                AppName = "Blog Publishing Starter",
                AppDescription = "Seeded MegaForm app template for public posts, featured content, editorial review, SEO review, legal review, scheduling, newsletter/RSS flags, and publishing workflow.",
                FormTitle = "Blog Publishing Starter",
                FormDescription = "Comprehensive content publishing app with rich text posts, media assets, SEO/social metadata, categories, tags, audience targeting, governance fields, workflow queues, and sample posts.",
                Icon = "fa-solid fa-newspaper",
                AccentColor = "#0f766e",
                SortOrder = 60,
                PrimaryFormKey = "posts",
                DefaultViewKey = "blog-home",
                BoardViewKey = "blog-editorial-board",
                ArchiveViewKey = "blog-archive",
                ScheduledViewKey = "blog-scheduled",
                CardViewKey = "blog-card",
                SubmitButtonText = "Submit Post for Review",
                SuccessMessage = "Your article is now in the editorial workflow.",
                RequireAuth = false,
                EnableSaveResume = true,
                Profile = new AppProfileDefinition
                {
                    Scope = AppProfileScopes.Blog,
                    DisplayName = "Blogs",
                    EntitySingular = "Post",
                    EntityPlural = "Posts",
                    EnableWorkflowInbox = true,
                    EnableAssignments = true,
                    EnableComments = true,
                    EnableStablePublicUrl = true
                },
                SchemaFactory = BuildBlogSchema,
                WorkflowFactory = BuildBlogWorkflow
            };

            def.AppSettings["starter"] = "blog";
            def.AppSettings["defaultViewKey"] = "blog-home";
            def.AppSettings["publicViewKey"] = "blog-home";
            def.AppSettings["archiveViewKey"] = "blog-archive";
            def.AppSettings["feedViewKey"] = "blog-feed";
            def.AppSettings["calendarViewKey"] = "blog-calendar";
            def.FormSettings["starter"] = "blog";
            def.FormSettings["appProfile"] = AppProfileScopes.Blog;
            def.FormSettings["publicViewKey"] = "blog-home";
            def.FormSettings["titleField"] = "title";
            def.FormSettings["slugField"] = "slug";
            def.FormSettings["statusField"] = "status";
            def.FormSettings["publishDateField"] = "publish_date";
            def.FormSettings["featuredImageField"] = "featured_image_url";
            def.FormSettings["ogImageField"] = "og_image_url";
            def.FormSettings["categoryField"] = "category";
            def.FormSettings["tagsField"] = "tags";
            def.FormSettings["viewCountField"] = "view_count";
            def.FormSettings["readerCountField"] = "unique_readers";
            def.FormSettings["commentCountField"] = "comment_count";
            def.FormSettings["commentsField"] = "sample_comments_json";
            def.FormSettings["primaryKeyField"] = "post_uid";
            def.FormSettings["categoryKeyField"] = "category_uid";
            def.FormSettings["tableRole"] = "posts";
            def.FormSettings["relatedForms"] = "categories,comments,reader-events";
            def.Resources["submitLabel"] = "Create post";
            def.Resources["inboxLabel"] = "Editorial inbox";
            def.Resources["archiveLabel"] = "Blog archive";
            def.Resources["calendarLabel"] = "Content calendar";
            def.Resources["feedLabel"] = "RSS/newsletter feed";
            def.AttachmentFieldKeys.Add(BlogImageField);

            AddBlogRelatedForms(def);

            def.Roles.Add(Role(BlogAuthorRole, "blog.author", "Blog Author", "blog.author@megaform.local"));
            def.Roles.Add(Role(BlogEditorRole, "blog.editor", "Blog Editor", "blog.editor@megaform.local"));
            def.Roles.Add(Role(BlogSeoRole, "blog.seo", "SEO Reviewer", "blog.seo@megaform.local"));
            def.Roles.Add(Role(BlogLegalRole, "blog.legal", "Content Legal Reviewer", "blog.legal@megaform.local"));
            def.Roles.Add(Role(BlogPublisherRole, "blog.publisher", "Blog Publisher", "blog.publisher@megaform.local"));

            def.Queries.Add(Query("all-posts", "All Blog Posts", "Every seeded post across draft, review, scheduled, published, and archived states.", 5, new { sort = new[] { new { field = "publish_date", dir = "desc" } } }));
            def.Queries.Add(Query("public-posts", "Public Posts", "Published posts sorted by publish date descending.", 10, new { status = "published", sort = new[] { new { field = "publish_date", dir = "desc" } } }));
            def.Queries.Add(Query("recent-posts", "Recent Blog Posts", "Latest published posts for recent blog lists and side rails.", 12, new { status = "published", sort = new[] { new { field = "publish_date", dir = "desc" } } }));
            def.Queries.Add(Query("recent-timeline-posts", "Recent Timeline Posts", "ACME demo timeline posts grouped by Today, Yesterday, This Week, and Earlier.", 13, new { demo = "acme-recent-timeline", sort = new[] { new { field = "recent_order", dir = "asc" } } }));
            def.Queries.Add(Query("featured-posts", "Featured Posts", "Published posts marked as featured.", 20, new { status = "published", filters = new[] { new { field = "is_featured", op = "equals", value = "true" } } }));
            def.Queries.Add(Query("blog-archive", "Blog Archive", "Published posts with category, tag, and date filters.", 30, new { status = "published", filters = new[] { "category", "tags", "publish_date" } }));
            def.Queries.Add(Query("editorial-review", "Editorial Review", "Posts waiting for editor review.", 40, new { status = "in_review" }));
            def.Queries.Add(Query("seo-review", "SEO Review", "Posts waiting for SEO metadata review.", 50, new { status = "seo_review" }));
            def.Queries.Add(Query("legal-review", "Legal Review", "Posts waiting for content/legal review.", 55, new { status = "legal_review" }));
            def.Queries.Add(Query("ready-to-publish", "Ready To Publish", "Posts approved by editorial, SEO, and legal review.", 58, new { status = "ready_to_publish" }));
            def.Queries.Add(Query("scheduled-posts", "Scheduled Posts", "Approved posts with a future publish date.", 60, new { status = "scheduled", sort = new[] { new { field = "publish_date", dir = "asc" } } }));
            def.Queries.Add(Query("content-calendar", "Content Calendar", "Draft, review, ready, and scheduled posts sorted by publish date.", 65, new { statuses = new[] { "draft", "in_review", "seo_review", "legal_review", "ready_to_publish", "scheduled" }, sort = new[] { new { field = "publish_date", dir = "asc" } } }));
            def.Queries.Add(Query("seo-gaps", "SEO Gaps", "Posts that need stronger search or social metadata before publishing.", 68, new { statuses = new[] { "seo_review", "legal_review", "ready_to_publish", "scheduled" }, fields = new[] { "seo_title", "seo_description", "canonical_url", "og_image_url", "social_title" } }));
            def.Queries.Add(Query("my-drafts", "My Drafts", "Draft posts owned by the current author.", 70, new { status = "draft", field = "author_email", source = "currentUser.email" }));
            def.Queries.Add(Query("newsletter-candidates", "Newsletter Candidates", "Published or scheduled posts marked for newsletter placement.", 80, new { statuses = new[] { "published", "scheduled" }, filters = new[] { new { field = "newsletter_featured", op = "equals", value = "true" } } }));
            def.Queries.Add(Query("popular-posts", "Popular Posts", "Published posts sorted by readership and comment volume.", 82, new { status = "published", sort = new[] { new { field = "view_count", dir = "desc" }, new { field = "comment_count", dir = "desc" } } }));
            def.Queries.Add(Query("popular-home-posts", "Popular Home Posts", "Popular non-featured posts for the ACME Blog home card grid.", 83, new { status = "published", filters = new[] { new { field = "is_featured", op = "equals", value = "false" } }, sort = new[] { new { field = "view_count", dir = "desc" }, new { field = "comment_count", dir = "desc" } } }));
            def.Queries.Add(Query("comment-moderation", "Comment Moderation", "Posts with active public comments, moderation queues, or locked comment threads.", 84, new { statuses = new[] { "published", "scheduled" }, filters = new[] { "comment_moderation_state", "comment_count", "latest_comment_excerpt" } }));
            def.Queries.Add(Query("archived-posts", "Archived Posts", "Posts removed from public listing but retained for audit/search.", 90, new { status = "archived" }));

            def.Views.Add(View("blog-home", BuildBlogHomeView));
            def.Views.Add(View("blog-admin-dashboard", BuildBlogAdminDashboardView));
            def.Views.Add(View("blog-recent", BuildRecentBlogsView));
            def.Views.Add(View("blog-featured", BuildFeaturedView));
            def.Views.Add(View("blog-archive", BuildArchiveView));
            def.Views.Add(View("blog-feed", BuildFeedView));
            def.Views.Add(View("blog-editorial-board", id => QueueView(id, "blog-editorial-board", "editorial-review", "Editorial Board", true, "Editor Review", "in_review", 30)));
            def.Views.Add(View("blog-seo-review", id => QueueView(id, "blog-seo-review", "seo-review", "SEO Review Board", false, "SEO Review", "seo_review", 40)));
            def.Views.Add(View("blog-legal-review", id => QueueView(id, "blog-legal-review", "legal-review", "Legal Review Board", false, "Legal Review", "legal_review", 45)));
            def.Views.Add(View("blog-ready", id => QueueView(id, "blog-ready", "ready-to-publish", "Ready To Publish", false, "Ready", "ready_to_publish", 48)));
            def.Views.Add(View("blog-scheduled", id => QueueView(id, "blog-scheduled", "scheduled-posts", "Publishing Schedule", false, "Scheduled", "scheduled", 50)));
            def.Views.Add(View("blog-calendar", BuildCalendarView));
            def.Views.Add(View("blog-seo-gaps", BuildSeoGapsView));
            def.Views.Add(View("blog-popular", BuildPopularView));
            def.Views.Add(View("blog-comments", BuildCommentModerationView));
            def.Views.Add(View("blog-drafts", id => QueueView(id, "blog-drafts", "my-drafts", "My Drafts", false, "Drafts", "draft", 56)));
            def.Views.Add(View("blog-register", BuildRegisterView));
            def.Views.Add(View("blog-card", BuildCardView));
            def.Views.Add(View("blog-detail", BuildDetailView));

            AddPermission(def, "view", "Anonymous Users", "all");
            AddPermission(def, "view", BlogAuthorRole, "own");
            AddPermission(def, "view", BlogEditorRole, "all");
            AddPermission(def, "view", BlogSeoRole, "all");
            AddPermission(def, "view", BlogLegalRole, "all");
            AddPermission(def, "view", BlogPublisherRole, "all");
            AddPermission(def, "edit", BlogAuthorRole, "own");
            AddPermission(def, "edit", BlogEditorRole, "all");
            AddPermission(def, "approve", BlogEditorRole, "all");
            AddPermission(def, "approve", BlogSeoRole, "all");
            AddPermission(def, "approve", BlogLegalRole, "all");
            AddPermission(def, "approve", BlogPublisherRole, "all");
            AddPermission(def, "export", BlogPublisherRole, "all");

            foreach (var sample in BuildBlogSamples())
                def.Samples.Add(sample);

            return def;
        }

        private static AppStarterRoleDefinition Role(string roleName, string userName, string displayName, string email)
        {
            return new AppStarterRoleDefinition
            {
                RoleName = roleName,
                UserName = userName,
                DisplayName = displayName,
                Email = email,
                Password = StarterPassword
            };
        }

        private static AppStarterQueryDefinition Query(string key, string name, string description, int sortOrder, object definition)
        {
            return new AppStarterQueryDefinition
            {
                QueryKey = key,
                QueryName = name,
                Description = description,
                SortOrder = sortOrder,
                Definition = definition
            };
        }

        private static AppStarterViewDefinition View(string key, Func<int, FormViewInfo> build)
        {
            return new AppStarterViewDefinition { ViewKey = key, Build = (formId, _) => build(formId) };
        }

        private static AppStarterViewDefinition View(string key, Func<int, IReadOnlyDictionary<string, int>, FormViewInfo> build)
        {
            return new AppStarterViewDefinition { ViewKey = key, Build = build };
        }

        private static void AddPermission(AppStarterDefinition def, string permissionType, string roleName, string scope)
        {
            def.Permissions.Add(new FormPermissionInfo
            {
                PermissionType = permissionType,
                PrincipalType = "role",
                RoleName = roleName,
                Scope = scope,
                IsGranted = true
            });
        }

        private static void AddBlogRelatedForms(AppStarterDefinition def)
        {
            def.RelatedForms.Add(new AppStarterRelatedFormDefinition
            {
                FormKey = "categories",
                FormTitle = "Blog Categories",
                FormDescription = "Lookup table for public blog categories, colors, routing, and editorial ownership.",
                SubmitButtonText = "Save Category",
                SuccessMessage = "Category saved.",
                RequireAuth = true,
                EnableSaveResume = false,
                SchemaFactory = BuildBlogCategorySchema,
                FormSettings = RelatedSettings("categories", "category_uid", "category_name"),
                Samples = BuildBlogCategorySamples()
            });

            def.RelatedForms.Add(new AppStarterRelatedFormDefinition
            {
                FormKey = "comments",
                FormTitle = "Blog Comments",
                FormDescription = "Child comment table linked to Blog Posts and optionally to DNN/Oqtane users by user id and email.",
                SubmitButtonText = "Post Comment",
                SuccessMessage = "Comment submitted for moderation.",
                RequireAuth = false,
                EnableSaveResume = false,
                SchemaFactory = BuildBlogCommentSchema,
                FormSettings = RelatedSettings("comments", "comment_uid", "comment_body"),
                ChildSamples =
                {
                    new AppStarterChildSampleRecord
                    {
                        ParentFormKey = "posts",
                        RelationLabel = "Comments",
                        AuthorRoleName = BlogAuthorRole,
                        FinalStatus = "Approved",
                        DaysAgo = 1,
                        BuildRows = BuildBlogCommentRows
                    }
                }
            });

            def.RelatedForms.Add(new AppStarterRelatedFormDefinition
            {
                FormKey = "reader-events",
                FormTitle = "Blog Reader Events",
                FormDescription = "Analytics fact table for reads, shares, likes, bookmarks, and newsletter clicks linked to Blog Posts.",
                SubmitButtonText = "Track Event",
                SuccessMessage = "Event tracked.",
                RequireAuth = false,
                EnableSaveResume = false,
                SchemaFactory = BuildBlogReaderEventSchema,
                FormSettings = RelatedSettings("reader-events", "event_uid", "event_type"),
                ChildSamples =
                {
                    new AppStarterChildSampleRecord
                    {
                        ParentFormKey = "posts",
                        RelationLabel = "Reader Events",
                        AuthorRoleName = BlogAuthorRole,
                        FinalStatus = "Recorded",
                        DaysAgo = 1,
                        BuildRows = BuildBlogReaderEventRows
                    }
                }
            });

            def.Relations.Add(Relation("categories", "posts", "Posts in Category", "category_uid", "category_uid", "has_many", false));
            def.Relations.Add(Relation("posts", "comments", "Comments", "post_uid", "post_uid", "has_many", true));
            def.Relations.Add(Relation("posts", "reader-events", "Reader Events", "post_uid", "post_uid", "has_many", true));
        }

        private static Dictionary<string, object> RelatedSettings(string tableRole, string primaryKeyField, string titleField)
        {
            return new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase)
            {
                ["starter"] = "blog",
                ["appProfile"] = AppProfileScopes.Blog,
                ["tableRole"] = tableRole,
                ["primaryKeyField"] = primaryKeyField,
                ["titleField"] = titleField
            };
        }

        private static AppStarterRelationDefinition Relation(string parentFormKey, string childFormKey, string label, string parentKey, string foreignKey, string relationType, bool cascadeDelete)
        {
            return new AppStarterRelationDefinition
            {
                ParentFormKey = parentFormKey,
                ChildFormKey = childFormKey,
                Label = label,
                ParentKey = parentKey,
                ForeignKey = foreignKey,
                RelationType = relationType,
                CascadeDelete = cascadeDelete
            };
        }

        private static FormSchema BuildBlogSchema()
        {
            return new FormSchema
            {
                Version = "1.0",
                Settings = new FormSettings
                {
                    MultiPage = true,
                    ShowProgressBar = true,
                    PreviousButtonText = "Back",
                    NextButtonText = "Next",
                    HoneypotFieldName = "__mf_blog_hp",
                    RateLimitMaxPerWindow = 100,
                    SubmitButtonText = "Submit Post for Review",
                    PostSubmitExperience = new PostSubmitExperience
                    {
                        Enabled = true,
                        Mode = "rich",
                        Title = "Post submitted",
                        Message = "Your article is now in the editorial workflow."
                    }
                },
                Fields = new List<FormField>
                {
                    Section("content_section", "Content", 5, false),
                    UniqueId("post_uid", "Post Unique ID", 8, "POST-", 5, 1001, "Stable blog post key used by related comments, reader events, and external integrations."),
                    Field("Text", "title", "Title", true, 10, "The public headline for the post."),
                    Field("Text", "slug", "Slug", true, 20, "Lowercase URL slug, for example product-roadmap-2026."),
                    Field("Text", "subtitle", "Subtitle", false, 25, "Optional supporting headline for article detail pages."),
                    Field("Textarea", "excerpt", "Excerpt", true, 30, "Short card, archive, and SEO preview copy."),
                    Field("RichText", "body", "Article Body", true, 40, "Rich article content with headings, lists, blockquotes, and links."),
                    Select("content_type", "Content Type", true, 50, "Blog Post", "News", "Guide", "Release Notes", "Customer Story", "Opinion"),
                    Select("category", "Category", true, 60, "Development", "Design", "AI/ML", "Accessibility", "UX", "Product", "Company News", "Product Updates", "Customer Stories", "Leadership", "Engineering", "Security", "Events"),
                    Field("Text", "category_uid", "Category Key", true, 62, "Stable category key copied from the Categories form."),
                    Field("Text", "tags", "Tags", false, 70, "Comma-separated tags for archive filtering."),
                    Select("audience", "Audience", true, 80, "Public", "Customers", "Partners", "Internal"),
                    Select("language", "Language", true, 90, "en-US", "vi-VN", "fr-FR", "ja-JP"),
                    Field("Text", "series", "Series", false, 100, "Optional content series or pillar name."),
                    Field("Text", "campaign", "Campaign", false, 110, "Optional marketing campaign, launch, or editorial initiative."),

                    Section("media_section", "Media", 120, true),
                    Field("Text", "featured_image_url", "Featured Image URL", false, 130, "Public image URL, relative route, or embedded generated image used by list/card templates."),
                    new FormField { Type = "File", Key = BlogImageField, Label = "Featured Image Upload", Order = 140, HelpText = "Upload an image asset for the post.", FileSettings = new FileFieldSettings { MaxFiles = 1, MaxSizeMB = 8, AllowedExtensions = new List<string> { ".jpg", ".jpeg", ".png", ".webp", ".svg" } } },
                    Field("Text", "og_image_url", "Open Graph Image URL", false, 150, "Image URL or embedded generated image used for social previews when different from the featured image."),
                    Field("Text", "image_alt_text", "Image Alt Text", false, 160, "Accessible description of the featured image."),
                    Field("Textarea", "media_caption", "Media Caption", false, 170, "Optional caption or attribution shown under the hero image."),

                    Section("publishing_section", "Author and Publishing", 200, true),
                    Field("Text", "author_name", "Author", true, 210, "Visible author name."),
                    Field("Email", "author_email", "Author Email", true, 220, "Used for draft ownership and workflow QA."),
                    Field("Text", "author_avatar_url", "Author Avatar URL", false, 224, "Public avatar image URL for blog cards and article detail."),
                    Field("Text", "author_role", "Author Role", false, 225, "Visible author role or byline subtitle."),
                    Field("Textarea", "author_bio", "Author Bio", false, 226, "Short public author biography for article detail pages."),
                    Field("Number", "author_followers", "Author Followers", false, 227, "Demo audience size shown in author bio cards."),
                    Field("Text", "content_owner", "Content Owner", false, 230, "Business owner accountable for this article."),
                    Field("Date", "publish_date", "Publish Date", true, 240, "Published or scheduled date."),
                    Field("Date", "embargo_until", "Embargo Until", false, 250, "Optional date before which the post should not go live."),
                    Field("Date", "expiry_date", "Review or Expiry Date", false, 260, "Optional review date for outdated content."),
                    Select("status", "Status", true, 270, "draft", "in_review", "seo_review", "legal_review", "ready_to_publish", "scheduled", "published", "archived"),
                    BooleanSelect("is_featured", "Featured", 280, "Marks the post for the blog-home hero/featured query."),
                    BooleanSelect("newsletter_featured", "Newsletter Featured", 290, "Marks the post for newsletter candidate views."),
                    BooleanSelect("rss_enabled", "RSS Enabled", 300, "Includes the post in feed/export views."),
                    BooleanSelect("allow_comments", "Allow Comments", 310, "Public comment policy flag for host templates."),

                    Section("engagement_section", "Reader Engagement and Comments", 320, true),
                    Field("Number", "view_count", "Total Reads", false, 330, "Total page views or reads for the article."),
                    Field("Number", "unique_readers", "Unique Readers", false, 340, "Estimated unique readers for analytics and popularity views."),
                    Field("Number", "comment_count", "Comment Count", false, 350, "Number of public comments on this article."),
                    Field("Number", "share_count", "Share Count", false, 360, "Estimated social or newsletter shares."),
                    Field("Number", "average_engagement_seconds", "Average Engagement Seconds", false, 370, "Average active reading time in seconds."),
                    Select("comment_moderation_state", "Comment Moderation State", false, 380, "Open", "Review Queue", "Locked", "Archived"),
                    Field("Date", "last_commented_on", "Last Commented On", false, 390, "Most recent public comment date."),
                    Field("Text", "latest_comment_author", "Latest Comment Author", false, 400, "Display name for the most recent comment."),
                    Field("Textarea", "latest_comment_excerpt", "Latest Comment Excerpt", false, 410, "Short visible excerpt from the latest comment."),
                    Field("Textarea", "sample_comments_json", "Sample Comments JSON", false, 420, "Seeded comment thread used for QA, imports, and demo moderation."),

                    Section("seo_section", "SEO and Social", 440, true),
                    Field("Text", "seo_title", "SEO Title", false, 450, "Search result title."),
                    Field("Textarea", "seo_description", "SEO Description", false, 460, "Search result description."),
                    Field("Text", "meta_keywords", "Meta Keywords", false, 470, "Optional comma-separated SEO keywords."),
                    Field("Text", "canonical_url", "Canonical URL", false, 480, "Optional canonical URL or route."),
                    Field("Text", "social_title", "Social Title", false, 490, "Title used in social cards."),
                    Field("Textarea", "social_description", "Social Description", false, 500, "Description used in social cards."),
                    Field("Number", "reading_time", "Reading Time", false, 510, "Estimated reading time in minutes."),

                    Section("governance_section", "Governance", 540, true),
                    Select("editorial_priority", "Editorial Priority", false, 550, "Low", "Normal", "High", "Launch Critical"),
                    BooleanSelect("legal_review_required", "Legal Review Required", 560, "Flags posts that need content/legal approval."),
                    Field("Textarea", "compliance_notes", "Compliance Notes", false, 570, "Claims, restrictions, disclosures, or review notes."),
                    Field("Textarea", "revision_summary", "Revision Summary", false, 580, "Short summary of what changed in the latest revision."),
                    Select("moderation_status", "Moderation Status", false, 590, "Open", "Watching", "Locked", "Closed"),
                    Field("Textarea", "editor_notes", "Internal Editor Notes", false, 600, "Private notes for editorial and publishing teams.")
                }
            };
        }

        private static FormSchema BuildBlogCategorySchema()
        {
            return new FormSchema
            {
                Version = "1.0",
                Settings = new FormSettings
                {
                    MultiPage = false,
                    ShowProgressBar = false,
                    HoneypotFieldName = "__mf_blog_category_hp",
                    SubmitButtonText = "Save Category"
                },
                Fields = new List<FormField>
                {
                    UniqueId("category_uid", "Category Unique ID", 10, "CAT-", 4, 101, "Stable category key used by Blog Posts."),
                    Field("Text", "category_name", "Category Name", true, 20, "Visible category name."),
                    Field("Text", "category_slug", "Category Slug", true, 30, "Lowercase URL/filter slug."),
                    Field("Text", "description", "Description", false, 40, "Short public category description."),
                    Field("Text", "accent_color", "Accent Color", false, 50, "Hex color used by category badges."),
                    Field("Number", "sort_order", "Sort Order", false, 60, "Display order in filters."),
                    BooleanSelect("is_public", "Public", 70, "Controls whether this category appears in public browsing."),
                    Field("Text", "owner_role", "Owner Role", false, 80, "Editorial owner for this content category.")
                }
            };
        }

        private static FormSchema BuildBlogCommentSchema()
        {
            return new FormSchema
            {
                Version = "1.0",
                Settings = new FormSettings
                {
                    MultiPage = false,
                    ShowProgressBar = false,
                    HoneypotFieldName = "__mf_blog_comment_hp",
                    SubmitButtonText = "Post Comment"
                },
                Fields = new List<FormField>
                {
                    UniqueId("comment_uid", "Comment Unique ID", 10, "COM-", 5, 5001, "Stable comment key."),
                    Field("Text", "post_uid", "Post Unique ID", true, 20, "Foreign key to Blog Posts.post_uid."),
                    Field("Text", "post_slug", "Post Slug", true, 25, "Readable parent post slug for imports and QA."),
                    Field("Number", "parent_comment_id", "Parent Comment ID", false, 30, "Optional reply parent."),
                    Field("Text", "commenter_name", "Commenter Name", true, 40, "Visible commenter name."),
                    Field("Email", "commenter_email", "Commenter Email", false, 50, "Used for moderation and optional user matching."),
                    Field("Number", "cms_user_id", "DNN/Oqtane User ID", false, 60, "Optional platform user id when commenter is authenticated."),
                    Field("Textarea", "comment_body", "Comment Body", true, 70, "Public comment text."),
                    Select("moderation_status", "Moderation Status", true, 80, "pending", "approved", "spam", "hidden"),
                    Field("Number", "like_count", "Like Count", false, 90, "Demo comment likes."),
                    Field("Date", "posted_on", "Posted On", false, 100, "Comment date.")
                }
            };
        }

        private static FormSchema BuildBlogReaderEventSchema()
        {
            return new FormSchema
            {
                Version = "1.0",
                Settings = new FormSettings
                {
                    MultiPage = false,
                    ShowProgressBar = false,
                    HoneypotFieldName = "__mf_blog_event_hp",
                    SubmitButtonText = "Track Event"
                },
                Fields = new List<FormField>
                {
                    UniqueId("event_uid", "Event Unique ID", 10, "EVT-", 6, 9001, "Stable analytics event key."),
                    Field("Text", "post_uid", "Post Unique ID", true, 20, "Foreign key to Blog Posts.post_uid."),
                    Field("Text", "post_slug", "Post Slug", true, 25, "Readable parent post slug."),
                    Select("event_type", "Event Type", true, 30, "read", "unique_reader", "share", "like", "bookmark", "newsletter_click"),
                    Field("Number", "cms_user_id", "DNN/Oqtane User ID", false, 40, "Optional authenticated platform user id."),
                    Field("Text", "visitor_key", "Visitor Key", false, 50, "Anonymous visitor/session key."),
                    Field("Number", "engagement_seconds", "Engagement Seconds", false, 60, "Active reading time."),
                    Field("Text", "referrer", "Referrer", false, 70, "Traffic source."),
                    Field("Date", "event_date", "Event Date", false, 80, "Event date.")
                }
            };
        }

        private static FormField Field(string type, string key, string label, bool required, int order, string helpText)
        {
            return new FormField { Type = type, Key = key, Label = label, Required = required, Order = order, HelpText = helpText ?? string.Empty };
        }

        private static FormField UniqueId(string key, string label, int order, string prefix, int padding, long startValue, string helpText)
        {
            return new FormField
            {
                Type = "UniqueId",
                Key = key,
                Label = label,
                Required = true,
                ReadOnly = true,
                Order = order,
                HelpText = helpText ?? string.Empty,
                WidgetProps = new Dictionary<string, object>
                {
                    ["prefix"] = prefix,
                    ["padding"] = padding,
                    ["startValue"] = startValue,
                    ["suffixType"] = "none"
                }
            };
        }

        private static FormField Select(string key, string label, bool required, int order, params string[] values)
        {
            return new FormField
            {
                Type = "Select",
                Key = key,
                Label = label,
                Required = required,
                Order = order,
                Options = (values ?? new string[0]).Select(v => new MegaForm.Core.Models.FieldOption { Label = ToTitle(v), Value = v }).ToList()
            };
        }

        private static FormField BooleanSelect(string key, string label, int order, string helpText)
        {
            var field = Select(key, label, false, order, "true", "false");
            field.HelpText = helpText ?? string.Empty;
            field.DefaultValue = "false";
            return field;
        }

        private static FormField Section(string key, string label, int order, bool pageBreak)
        {
            var field = new FormField
            {
                Type = "Section",
                Key = key,
                Label = label,
                Order = order
            };

            if (pageBreak)
                field.Properties = new Dictionary<string, object> { { "pageBreak", true } };

            return field;
        }

        private static WorkflowDefinition BuildBlogWorkflow(int formId)
        {
            var editor = Approval("editorial-review", "Editorial Review", BlogEditorRole, "in_review", "seo_review", "changes_requested", 100);
            var seo = Approval("seo-review", "SEO Review", BlogSeoRole, "seo_review", "legal_review", "seo_changes_requested", 360);
            var legal = Approval("legal-review", "Legal Review", BlogLegalRole, "legal_review", "ready_to_publish", "legal_changes_requested", 620);
            var publisher = Approval("publish-schedule", "Publish or Schedule", BlogPublisherRole, "ready_to_publish", "published", "scheduled", 880);
            var published = End("end-published", "Published", "Blog post published.", 1180, 70);
            var changes = End("end-needs-changes", "Changes Requested", "Blog post returned for changes.", 1180, 250);

            return new WorkflowDefinition
            {
                FormId = formId,
                Name = "Blog Editorial Publishing Starter",
                StartNodeId = editor.Id,
                Nodes = new List<WorkflowNode> { editor, seo, legal, publisher, published, changes },
                Edges = new List<WorkflowEdge>
                {
                    new WorkflowEdge { SourceNodeId = editor.Id, SourceHandle = "approved", TargetNodeId = seo.Id, Label = "Editor approved" },
                    new WorkflowEdge { SourceNodeId = editor.Id, SourceHandle = "rejected", TargetNodeId = changes.Id, Label = "Needs changes" },
                    new WorkflowEdge { SourceNodeId = seo.Id, SourceHandle = "approved", TargetNodeId = legal.Id, Label = "SEO approved" },
                    new WorkflowEdge { SourceNodeId = seo.Id, SourceHandle = "rejected", TargetNodeId = changes.Id, Label = "SEO changes" },
                    new WorkflowEdge { SourceNodeId = legal.Id, SourceHandle = "approved", TargetNodeId = publisher.Id, Label = "Legal approved" },
                    new WorkflowEdge { SourceNodeId = legal.Id, SourceHandle = "rejected", TargetNodeId = changes.Id, Label = "Legal changes" },
                    new WorkflowEdge { SourceNodeId = publisher.Id, SourceHandle = "approved", TargetNodeId = published.Id, Label = "Published" },
                    new WorkflowEdge { SourceNodeId = publisher.Id, SourceHandle = "rejected", TargetNodeId = changes.Id, Label = "Scheduled or hold" }
                },
                Settings = new WorkflowSettings { EnableExecutionLog = true, ExecutionTimeoutSeconds = 180 }
            };
        }

        private static WorkflowNode Approval(string id, string label, string role, string pending, string approved, string rejected, int x)
        {
            return new WorkflowNode
            {
                Id = id,
                Type = WorkflowNodeType.Approval,
                Label = label,
                ZoneType = WorkflowZoneType.Action,
                Position = new CanvasPosition { X = x, Y = 120 },
                Config = ToConfig(new ApprovalNodeConfig
                {
                    CandidateRoles = new List<string> { role },
                    CandidateUsers = new List<string>(),
                    AllowClaim = true,
                    AllowForward = true,
                    AllowReassign = true,
                    CommentRequiredOnReject = true,
                    DueInHours = 24,
                    PendingSubmissionStatus = pending,
                    ApprovedSubmissionStatus = approved,
                    RejectedSubmissionStatus = rejected
                })
            };
        }

        private static WorkflowNode End(string id, string label, string message, int x, int y)
        {
            return new WorkflowNode
            {
                Id = id,
                Type = WorkflowNodeType.End,
                Label = label,
                ZoneType = WorkflowZoneType.Action,
                Position = new CanvasPosition { X = x, Y = y },
                Config = ToConfig(new EndNodeConfig { EndType = EndType.Success, Message = message })
            };
        }

        private static Dictionary<string, object> ToConfig<T>(T config)
        {
            return JsonConvert.DeserializeObject<Dictionary<string, object>>(JsonConvert.SerializeObject(config))
                   ?? new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        }

        private static FormViewInfo BuildBlogHomeView(int formId)
        {
            var wrapper = string.Join("\n", new[]
            {
                AcmeBlogCssMarker(),
                @"<div class=""mf-acme-blog min-h-screen bg-background"">
  <section class=""relative bg-gradient-to-br from-primary/5 via-background to-muted/30 border-b"">
    <div class=""mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 lg:py-24"">
      <div class=""text-center mb-12"">
        <span class=""inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4""><i class=""fa-solid fa-fire h-4 w-4"" aria-hidden=""true""></i> Featured Stories</span>
        <h1 class=""text-4xl lg:text-6xl font-bold tracking-tight mb-4"">Insights &amp; Ideas</h1>
        <p class=""text-xl text-muted-foreground max-w-2xl mx-auto"">Discover the latest in design, development, and product thinking from industry experts.</p>
      </div>
      <div class=""max-w-2xl mx-auto mb-12"">
        <div class=""relative"" data-mflv-stop=""1"">
          <i class=""fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground"" aria-hidden=""true""></i>
          <input type=""text"" placeholder=""Search articles, topics, authors..."" class=""w-full h-14 pl-12 pr-4 rounded-full border-2 border-border bg-background text-lg focus:border-primary"" />
          <button type=""button"" class=""absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-6 inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all bg-primary text-primary-foreground hover:bg-primary/90 h-9 py-2"">Search</button>
        </div>
      </div>
      <div class=""relative group rounded-3xl overflow-hidden bg-card border shadow-lg"">
        <div class=""grid lg:grid-cols-2"">
          <div class=""relative aspect-[4/3] lg:aspect-auto overflow-hidden"">
            <img src=""https://images.unsplash.com/photo-1558655146-9f40138edfeb?w=1200&amp;h=600&amp;fit=crop"" alt=""The Future of Design Systems: Building for Scale and Consistency"" class=""absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"" />
            <div class=""absolute top-4 left-4""><span class=""px-3 py-1 rounded-full bg-primary text-primary-foreground text-sm font-medium"">Featured</span></div>
          </div>
          <div class=""p-8 lg:p-12 flex flex-col justify-center"">
            <div class=""flex items-center gap-3 mb-4""><span class=""px-3 py-1 rounded-full bg-muted text-muted-foreground text-sm font-medium"">Design</span><span class=""text-sm text-muted-foreground"">12 min read</span></div>
            <h2 class=""text-2xl lg:text-3xl font-bold mb-4 group-hover:text-primary transition-colors""><a data-mflv-stop=""1"" href=""?vk=blog-detail&amp;slug=future-design-systems-scale-consistency"">The Future of Design Systems: Building for Scale and Consistency</a></h2>
            <p class=""text-muted-foreground mb-6 line-clamp-3"">Explore how modern design systems are evolving to meet the demands of enterprise applications, multi-platform experiences, and global teams.</p>
            <div class=""flex items-center justify-between mt-auto"">
              <div class=""flex items-center gap-3""><img src=""https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&amp;h=100&amp;fit=crop"" alt=""Sarah Chen"" class=""h-11 w-11 rounded-full"" /><div><p class=""font-medium text-sm"">Sarah Chen</p><p class=""text-xs text-muted-foreground"">Dec 15, 2024</p></div></div>
              <div class=""flex items-center gap-4 text-sm text-muted-foreground""><span class=""flex items-center gap-1""><i class=""fa-solid fa-eye h-4 w-4"" aria-hidden=""true""></i>15.4k</span><span class=""flex items-center gap-1""><i class=""fa-regular fa-comment h-4 w-4"" aria-hidden=""true""></i>89</span><span class=""flex items-center gap-1""><i class=""fa-solid fa-share-nodes h-4 w-4"" aria-hidden=""true""></i>234</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
  <section class=""py-16"">
    <div class=""mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"">
      <div class=""flex flex-col lg:flex-row gap-12"">
        <div class=""flex-1"">
          <div class=""flex items-center justify-between mb-8""><div class=""flex items-center gap-3""><i class=""fa-solid fa-arrow-trend-up h-6 w-6 text-primary"" aria-hidden=""true""></i><h2 class=""text-2xl font-bold"">Popular This Week</h2></div><a data-mflv-stop=""1"" href=""?vk=blog-archive"" class=""text-primary hover:underline flex items-center gap-1 text-sm font-medium"">View All <i class=""fa-solid fa-chevron-right h-4 w-4"" aria-hidden=""true""></i></a></div>
          <div class=""flex flex-wrap gap-2 mb-8"" data-mf-acme-filter-group=""category"">
            <button type=""button"" data-mflv-stop=""1"" data-mf-acme-filter=""category"" data-mf-acme-value=""All"" class=""px-4 py-2 rounded-full text-sm font-medium transition-all bg-primary text-primary-foreground"">All <span class=""ml-1.5 opacity-60"">(156)</span></button>
            <button type=""button"" data-mflv-stop=""1"" data-mf-acme-filter=""category"" data-mf-acme-value=""Development"" class=""px-4 py-2 rounded-full text-sm font-medium transition-all bg-muted text-muted-foreground hover:bg-muted/80"">Development <span class=""ml-1.5 opacity-60"">(38)</span></button>
            <button type=""button"" data-mflv-stop=""1"" data-mf-acme-filter=""category"" data-mf-acme-value=""Design"" class=""px-4 py-2 rounded-full text-sm font-medium transition-all bg-muted text-muted-foreground hover:bg-muted/80"">Design <span class=""ml-1.5 opacity-60"">(42)</span></button>
            <button type=""button"" data-mflv-stop=""1"" data-mf-acme-filter=""category"" data-mf-acme-value=""AI/ML"" class=""px-4 py-2 rounded-full text-sm font-medium transition-all bg-muted text-muted-foreground hover:bg-muted/80"">AI/ML <span class=""ml-1.5 opacity-60"">(24)</span></button>
            <button type=""button"" data-mflv-stop=""1"" data-mf-acme-filter=""category"" data-mf-acme-value=""Product"" class=""px-4 py-2 rounded-full text-sm font-medium transition-all bg-muted text-muted-foreground hover:bg-muted/80"">Product <span class=""ml-1.5 opacity-60"">(31)</span></button>
            <button type=""button"" data-mflv-stop=""1"" data-mf-acme-filter=""category"" data-mf-acme-value=""Accessibility"" class=""px-4 py-2 rounded-full text-sm font-medium transition-all bg-muted text-muted-foreground hover:bg-muted/80"">Accessibility <span class=""ml-1.5 opacity-60"">(21)</span></button>
          </div>
          <div class=""mf-acme-home-posts grid md:grid-cols-2 gap-6"">{{rows}}</div>
          <div class=""mf-acme-filter-empty flex flex-col items-center justify-center py-12 text-center"" hidden>No posts match this category.</div>
          <div class=""text-center mt-12""><button type=""button"" data-mflv-stop=""1"" class=""inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground h-10 px-6"">Load More Articles <i class=""fa-solid fa-arrow-right h-4 w-4"" aria-hidden=""true""></i></button></div>
        </div>
        <aside class=""w-full lg:w-80 shrink-0 space-y-8"">
          <div class=""bg-card rounded-2xl border p-6""><h3 class=""font-bold mb-4 flex items-center gap-2""><i class=""fa-solid fa-star h-5 w-5 text-primary"" aria-hidden=""true""></i> Trending Topics</h3><div class=""flex flex-wrap gap-2""><a data-mflv-stop=""1"" href=""#"" class=""px-3 py-1.5 rounded-full bg-muted text-sm hover:bg-primary hover:text-primary-foreground transition-colors"">#React</a><a data-mflv-stop=""1"" href=""#"" class=""px-3 py-1.5 rounded-full bg-muted text-sm hover:bg-primary hover:text-primary-foreground transition-colors"">#TypeScript</a><a data-mflv-stop=""1"" href=""#"" class=""px-3 py-1.5 rounded-full bg-muted text-sm hover:bg-primary hover:text-primary-foreground transition-colors"">#Design Systems</a><a data-mflv-stop=""1"" href=""#"" class=""px-3 py-1.5 rounded-full bg-muted text-sm hover:bg-primary hover:text-primary-foreground transition-colors"">#AI</a></div></div>
          <div class=""bg-gradient-to-br from-primary to-primary/80 rounded-2xl p-6 text-primary-foreground""><h3 class=""font-bold text-lg mb-2"">Stay Updated</h3><p class=""text-primary-foreground/80 text-sm mb-4"">Get the latest articles delivered straight to your inbox.</p><div class=""space-y-3"" data-mflv-stop=""1""><input type=""email"" placeholder=""Your email"" class=""file:text-foreground placeholder:text-primary-foreground/60 selection:bg-primary selection:text-primary-foreground border-input h-9 w-full min-w-0 rounded-md border bg-primary-foreground/10 px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none md:text-sm"" /><button type=""button"" class=""w-full inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all bg-secondary text-secondary-foreground hover:bg-secondary/80 h-9 px-4 py-2"">Subscribe</button></div><p class=""text-xs text-primary-foreground/60 mt-3"">No spam. Unsubscribe anytime.</p></div>
          <div class=""bg-card rounded-2xl border p-6""><h3 class=""font-bold mb-4 flex items-center gap-2""><i class=""fa-solid fa-users h-5 w-5 text-primary"" aria-hidden=""true""></i> Community</h3><div class=""space-y-4""><div class=""flex items-center justify-between""><span class=""text-muted-foreground text-sm"">Total Articles</span><span class=""font-bold"">1,248</span></div><div class=""flex items-center justify-between""><span class=""text-muted-foreground text-sm"">Authors</span><span class=""font-bold"">86</span></div><div class=""flex items-center justify-between""><span class=""text-muted-foreground text-sm"">Monthly Readers</span><span class=""font-bold"">125K+</span></div><div class=""flex items-center justify-between""><span class=""text-muted-foreground text-sm"">Comments</span><span class=""font-bold"">8.4K</span></div></div></div>
        </aside>
      </div>
    </div>
  </section>
</div>"
            });
            return ListView(formId, "blog-home", "popular-home-posts", "Blog Home", true, 10, wrapper, AcmeHomePostTemplate(), AcmeDetailTemplate(), "No published posts yet.", 4);
        }

        private static FormViewInfo BuildBlogAdminDashboardView(int formId)
        {
            var wrapper = string.Join("\n", new[]
            {
                "<div style=\"display:grid;gap:20px;font-family:Segoe UI,Arial,sans-serif;color:#0f172a\">",
                "  <section style=\"display:grid;gap:16px;padding:22px;border:1px solid #c7d2fe;border-radius:16px;background:linear-gradient(135deg,#eef2ff 0%,#ffffff 64%)\">",
                "    <div style=\"display:flex;justify-content:space-between;align-items:end;gap:14px;flex-wrap:wrap\"><div><div style=\"font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#4338ca;font-weight:800\">MegaForm Blog Admin</div><h2 style=\"margin:5px 0 0;font-size:30px;line-height:1.15;color:#0f172a\">Publishing Dashboard</h2><p style=\"margin:8px 0 0;color:#475569;font-size:14px;line-height:1.55\">Create, review, schedule, publish, and measure posts from one operational surface.</p></div><div style=\"display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:flex-end\"><button type=\"button\" class=\"mflv-add-btn\" data-mflv-add=\"1\" data-mflv-stop=\"1\" style=\"border:0;border-radius:12px;background:#4338ca;color:#ffffff;font-weight:900;padding:12px 16px;box-shadow:0 12px 24px rgba(67,56,202,.22);cursor:pointer\">+ New Blog Post</button><a href=\"?vk=blog-home\" style=\"text-decoration:none;border-radius:12px;background:#ffffff;border:1px solid #c7d2fe;color:#4338ca;font-weight:800;padding:11px 14px\">View Public Blog</a></div></div>",
                "    <nav aria-label=\"Blog admin views\" style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px\">",
                "      <a href=\"?vk=blog-editorial-board\" style=\"text-decoration:none;padding:12px;border-radius:12px;background:#ffffff;border:1px solid #dbeafe;color:#1d4ed8;font-weight:800\">Editorial Review</a>",
                "      <a href=\"?vk=blog-seo-review\" style=\"text-decoration:none;padding:12px;border-radius:12px;background:#ffffff;border:1px solid #fed7aa;color:#c2410c;font-weight:800\">SEO Review</a>",
                "      <a href=\"?vk=blog-legal-review\" style=\"text-decoration:none;padding:12px;border-radius:12px;background:#ffffff;border:1px solid #fecdd3;color:#be123c;font-weight:800\">Legal Review</a>",
                "      <a href=\"?vk=blog-ready\" style=\"text-decoration:none;padding:12px;border-radius:12px;background:#ffffff;border:1px solid #bbf7d0;color:#15803d;font-weight:800\">Ready To Publish</a>",
                "      <a href=\"?vk=blog-calendar\" style=\"text-decoration:none;padding:12px;border-radius:12px;background:#ffffff;border:1px solid #ddd6fe;color:#6d28d9;font-weight:800\">Calendar</a>",
                "      <a href=\"?vk=blog-comments\" style=\"text-decoration:none;padding:12px;border-radius:12px;background:#ffffff;border:1px solid #fecdd3;color:#be123c;font-weight:800\">Comments</a>",
                "      <a href=\"?vk=blog-popular\" style=\"text-decoration:none;padding:12px;border-radius:12px;background:#ffffff;border:1px solid #bbf7d0;color:#15803d;font-weight:800\">Popular</a>",
                "      <a href=\"?vk=blog-recent\" style=\"text-decoration:none;padding:12px;border-radius:12px;background:#ffffff;border:1px solid #e2e8f0;color:#334155;font-weight:800\">Recent Blogs</a>",
                "      <a href=\"?vk=blog-archive\" style=\"text-decoration:none;padding:12px;border-radius:12px;background:#ffffff;border:1px solid #dbeafe;color:#1d4ed8;font-weight:800\">Blog Archive</a>",
                "    </nav>",
                "  </section>",
                "  <section style=\"display:grid;gap:14px;padding:18px;border:1px solid #e2e8f0;border-radius:16px;background:#ffffff\">",
                "    <div style=\"display:flex;justify-content:space-between;gap:12px;align-items:end;flex-wrap:wrap\"><div><div style=\"font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#0f766e;font-weight:900\">Relational Blog App</div><h3 style=\"margin:4px 0 0;font-size:22px;color:#0f172a\">Data model and authoring flow</h3><p style=\"margin:6px 0 0;color:#64748b;font-size:13px\">MegaForm seeds separate linked forms instead of one flat form: Posts, Categories, Comments, and Reader Events.</p></div><div style=\"display:flex;gap:8px;flex-wrap:wrap\"><button type=\"button\" class=\"mflv-add-btn\" data-mflv-add=\"1\" data-mflv-stop=\"1\" style=\"border:1px solid #0f766e;border-radius:10px;background:#0f766e;color:#fff;font-weight:900;padding:9px 12px;cursor:pointer\">+ New Post</button><a href=\"?vk=blog-archive\" style=\"text-decoration:none;border:1px solid #cbd5e1;border-radius:10px;padding:9px 12px;color:#334155;font-weight:800\">Open Archive</a><a href=\"?vk=blog-comments\" style=\"text-decoration:none;border:1px solid #fecdd3;border-radius:10px;padding:9px 12px;color:#be123c;font-weight:800\">Moderate Comments</a></div></div>",
                "    <div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px\">",
                "      <div style=\"padding:14px;border-radius:14px;background:#f8fafc;border:1px solid #e2e8f0\"><strong style=\"display:block;color:#0f172a\">Blog Posts</strong><span style=\"display:block;margin-top:4px;font-size:12px;color:#64748b\">Primary form. Unique key: <code>post_uid</code>. Public card, archive, detail, workflow queues.</span></div>",
                "      <div style=\"padding:14px;border-radius:14px;background:#f0fdfa;border:1px solid #99f6e4\"><strong style=\"display:block;color:#0f766e\">Categories</strong><span style=\"display:block;margin-top:4px;font-size:12px;color:#0f766e\">Lookup form. Relation: <code>category_uid</code> to Posts for filters and ownership.</span></div>",
                "      <div style=\"padding:14px;border-radius:14px;background:#fff1f2;border:1px solid #fecdd3\"><strong style=\"display:block;color:#be123c\">Comments</strong><span style=\"display:block;margin-top:4px;font-size:12px;color:#be123c\">Child form. Relation: <code>post_uid</code> to Posts. Supports anonymous or DNN/Oqtane user id.</span></div>",
                "      <div style=\"padding:14px;border-radius:14px;background:#eff6ff;border:1px solid #bfdbfe\"><strong style=\"display:block;color:#1d4ed8\">Reader Events</strong><span style=\"display:block;margin-top:4px;font-size:12px;color:#1d4ed8\">Fact form for reads, shares, bookmarks, likes, and newsletter clicks.</span></div>",
                "    </div>",
                "  </section>",
                "  <section style=\"display:grid;gap:12px\">",
                "    <div style=\"display:flex;justify-content:space-between;gap:12px;align-items:end;flex-wrap:wrap\"><h3 style=\"margin:0;font-size:20px;color:#0f172a\">Latest operational register</h3><a href=\"?vk=blog-register\" style=\"color:#2563eb;font-size:13px;font-weight:800;text-decoration:none\">Open full register</a></div>",
                "    <div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px\">{{rows}}</div>",
                "  </section>",
                "</div>"
            });
            var row = string.Join("\n", new[]
            {
                "<article " + DetailOpenAttributes() + " style=\"cursor:pointer;display:grid;gap:10px;padding:15px;border:1px solid #e2e8f0;border-radius:14px;background:#ffffff;box-shadow:0 10px 26px rgba(15,23,42,.05)\">",
                "  <div style=\"display:flex;justify-content:space-between;gap:10px;align-items:start\"><div><div style=\"font-size:12px;color:#64748b\">{{field:category}} / {{field:publish_date|format=yyyy-MM-dd}}</div><h3 style=\"margin:4px 0 0;font-size:18px;line-height:1.25;color:#0f172a\">{{field:title}}</h3></div><span style=\"padding:4px 9px;border-radius:999px;background:#f1f5f9;color:#334155;font-size:11px;font-weight:800\">{{submission:status}}</span></div>",
                "  <div style=\"display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;text-align:center\">",
                "    <div style=\"padding:8px;border-radius:12px;background:#f8fafc\"><strong style=\"display:block;color:#0f172a\">{{field:view_count}}</strong><span style=\"font-size:11px;color:#64748b\">reads</span></div>",
                "    <div style=\"padding:8px;border-radius:12px;background:#f8fafc\"><strong style=\"display:block;color:#0f172a\">{{field:unique_readers}}</strong><span style=\"font-size:11px;color:#64748b\">readers</span></div>",
                "    <div style=\"padding:8px;border-radius:12px;background:#f8fafc\"><strong style=\"display:block;color:#0f172a\">{{field:comment_count}}</strong><span style=\"font-size:11px;color:#64748b\">comments</span></div>",
                "    <div style=\"padding:8px;border-radius:12px;background:#f8fafc\"><strong style=\"display:block;color:#0f172a\">{{field:share_count}}</strong><span style=\"font-size:11px;color:#64748b\">shares</span></div>",
                "  </div>",
                "</article>"
            });
            return ListView(formId, "blog-admin-dashboard", "all-posts", "Blog Admin Dashboard", false, 8, wrapper, row, ArticleDetailTemplate(), "No blog operations yet.");
        }

        private static FormViewInfo BuildRecentBlogsView(int formId)
        {
            var wrapper = string.Join("\n", new[]
            {
                AcmeBlogCssMarker(),
                @"<div class=""mf-acme-blog min-h-screen bg-background"" data-mf-blogkit-filter-category=""All"" data-mf-blogkit-filter-status=""All"">
  <section class=""border-b bg-gradient-to-br from-primary/5 via-background to-muted/30""><div class=""mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12""><div class=""flex flex-col lg:flex-row lg:items-end justify-between gap-6""><div><nav class=""flex items-center gap-2 text-sm text-muted-foreground mb-2""><a data-mflv-stop=""1"" href=""?vk=blog-home"" class=""hover:text-primary"">Blog</a><i class=""fa-solid fa-chevron-right h-4 w-4"" aria-hidden=""true""></i><span>Recent</span></nav><h1 class=""text-3xl lg:text-4xl font-bold flex items-center gap-3""><i class=""fa-regular fa-calendar h-8 w-8 text-primary"" aria-hidden=""true""></i>Recent Articles</h1><p class=""text-muted-foreground mt-2"">Stay up to date with the latest content</p></div><div class=""flex items-center gap-6""><div class=""text-center""><p class=""text-2xl font-bold"">24</p><p class=""text-xs text-muted-foreground"">This Month</p></div><div class=""h-10 w-px bg-border""></div><div class=""text-center""><p class=""text-2xl font-bold text-green-600"">18</p><p class=""text-xs text-muted-foreground"">Published</p></div><div class=""h-10 w-px bg-border""></div><div class=""text-center""><p class=""text-2xl font-bold text-yellow-600"">4</p><p class=""text-xs text-muted-foreground"">Drafts</p></div><div class=""h-10 w-px bg-border""></div><div class=""text-center""><p class=""text-2xl font-bold text-blue-600"">2</p><p class=""text-xs text-muted-foreground"">Scheduled</p></div></div></div></div></section>
  <section class=""border-b sticky top-0 bg-background/95 backdrop-blur z-10""><div class=""mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4""><div class=""flex flex-col lg:flex-row lg:items-center gap-4""><div class=""relative flex-1 max-w-md"" data-mflv-stop=""1""><i class=""fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"" aria-hidden=""true""></i><input type=""text"" placeholder=""Search recent articles..."" class=""file:text-foreground placeholder:text-muted-foreground border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 pl-9 text-base shadow-xs transition-[color,box-shadow] outline-none md:text-sm"" /></div><div class=""flex items-center gap-2 overflow-x-auto pb-2 lg:pb-0 scrollbar-hide"" data-mf-acme-filter-group=""category""><button data-mflv-stop=""1"" data-mf-acme-filter=""category"" data-mf-acme-value=""All"" type=""button"" class=""px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all bg-primary text-primary-foreground"">All</button><button data-mflv-stop=""1"" data-mf-acme-filter=""category"" data-mf-acme-value=""Design"" type=""button"" class=""px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all bg-muted text-muted-foreground hover:bg-muted/80"">Design</button><button data-mflv-stop=""1"" data-mf-acme-filter=""category"" data-mf-acme-value=""Development"" type=""button"" class=""px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all bg-muted text-muted-foreground hover:bg-muted/80"">Development</button><button data-mflv-stop=""1"" data-mf-acme-filter=""category"" data-mf-acme-value=""AI/ML"" type=""button"" class=""px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all bg-muted text-muted-foreground hover:bg-muted/80"">AI/ML</button><button data-mflv-stop=""1"" data-mf-acme-filter=""category"" data-mf-acme-value=""Accessibility"" type=""button"" class=""px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all bg-muted text-muted-foreground hover:bg-muted/80"">Accessibility</button><button data-mflv-stop=""1"" data-mf-acme-filter=""category"" data-mf-acme-value=""UX"" type=""button"" class=""px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all bg-muted text-muted-foreground hover:bg-muted/80"">UX</button><button data-mflv-stop=""1"" data-mf-acme-filter=""category"" data-mf-acme-value=""Engineering"" type=""button"" class=""px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all bg-muted text-muted-foreground hover:bg-muted/80"">Engineering</button></div><div class=""flex items-center gap-2"" data-mf-acme-filter-group=""status""><span class=""text-sm text-muted-foreground"">Status:</span><button data-mflv-stop=""1"" data-mf-acme-filter=""status"" data-mf-acme-value=""All"" type=""button"" class=""px-3 py-1.5 rounded-full text-xs font-medium transition-all bg-primary text-primary-foreground"">All</button><button data-mflv-stop=""1"" data-mf-acme-filter=""status"" data-mf-acme-value=""published"" type=""button"" class=""px-3 py-1.5 rounded-full text-xs font-medium transition-all bg-muted text-muted-foreground hover:bg-muted/80"">Published</button><button data-mflv-stop=""1"" data-mf-acme-filter=""status"" data-mf-acme-value=""draft"" type=""button"" class=""px-3 py-1.5 rounded-full text-xs font-medium transition-all bg-muted text-muted-foreground hover:bg-muted/80"">Draft</button><button data-mflv-stop=""1"" data-mf-acme-filter=""status"" data-mf-acme-value=""scheduled"" type=""button"" class=""px-3 py-1.5 rounded-full text-xs font-medium transition-all bg-muted text-muted-foreground hover:bg-muted/80"">Scheduled</button></div><button data-mflv-stop=""1"" type=""button"" class=""inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground h-8 px-3 shrink-0""><i class=""fa-solid fa-arrows-rotate h-4 w-4"" aria-hidden=""true""></i>Refresh</button></div></div></section>
  <section class=""py-8""><div class=""mx-auto max-w-7xl px-4 sm:px-6 lg:px-8""><div class=""flex gap-8""><div class=""flex-1"">{{rows}}<div class=""mf-acme-filter-empty flex flex-col items-center justify-center py-12 text-center"" hidden>No recent articles match these filters.</div><div class=""text-center mt-8""><button data-mflv-stop=""1"" type=""button"" class=""inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground h-10 px-6"">Load Earlier Articles <i class=""fa-solid fa-chevron-right h-4 w-4"" aria-hidden=""true""></i></button></div></div><aside class=""hidden lg:block w-80 shrink-0 space-y-6""><div class=""bg-card rounded-xl border p-5""><h3 class=""font-bold mb-4 flex items-center gap-2""><i class=""fa-solid fa-arrow-trend-up h-5 w-5 text-primary"" aria-hidden=""true""></i>Trending Now</h3><div class=""space-y-4""><div class=""flex gap-3""><span class=""text-2xl font-bold text-muted-foreground/30 w-6"">1</span><div class=""flex-1 min-w-0""><a data-mflv-stop=""1"" href=""?vk=blog-detail&amp;slug=future-design-systems-scale-consistency"" class=""text-sm font-medium hover:text-primary transition-colors line-clamp-2"">The Future of Design Systems: Building for Scale</a><p class=""text-xs text-muted-foreground mt-1 flex items-center gap-2""><i class=""fa-solid fa-eye h-3 w-3"" aria-hidden=""true""></i>15.4k views</p></div></div><div class=""flex gap-3""><span class=""text-2xl font-bold text-muted-foreground/30 w-6"">2</span><div class=""flex-1 min-w-0""><a data-mflv-stop=""1"" href=""?vk=blog-detail&amp;slug=understanding-react-server-components"" class=""text-sm font-medium hover:text-primary transition-colors line-clamp-2"">Understanding React Server Components</a><p class=""text-xs text-muted-foreground mt-1 flex items-center gap-2""><i class=""fa-solid fa-eye h-3 w-3"" aria-hidden=""true""></i>12.3k views</p></div></div></div></div><div class=""bg-card rounded-xl border p-5""><h3 class=""font-bold mb-4"">Quick Actions</h3><div class=""space-y-2""><button data-mflv-stop=""1"" data-mflv-add=""1"" type=""button"" class=""mflv-add-btn w-full justify-start gap-2 inline-flex items-center rounded-md text-sm font-medium border bg-background h-9 px-4 py-2""><i class=""fa-regular fa-calendar h-4 w-4"" aria-hidden=""true""></i>Schedule New Post</button><a data-mflv-stop=""1"" href=""?vk=blog-admin-dashboard"" class=""w-full justify-start gap-2 inline-flex items-center rounded-md text-sm font-medium border bg-background h-9 px-4 py-2""><i class=""fa-solid fa-filter h-4 w-4"" aria-hidden=""true""></i>Manage Categories</a><a data-mflv-stop=""1"" href=""?vk=blog-popular"" class=""w-full justify-start gap-2 inline-flex items-center rounded-md text-sm font-medium border bg-background h-9 px-4 py-2""><i class=""fa-solid fa-arrow-trend-up h-4 w-4"" aria-hidden=""true""></i>View Analytics</a></div></div><div class=""bg-card rounded-xl border p-5""><h3 class=""font-bold mb-4"">Recent Activity</h3><div class=""space-y-3""><div class=""text-sm""><p class=""text-muted-foreground"">New comment on <span class=""text-foreground font-medium"">Design Systems article</span></p><p class=""text-xs text-muted-foreground/60"">2m ago</p></div><div class=""text-sm""><p class=""text-muted-foreground"">Post scheduled: <span class=""text-foreground font-medium"">State Management Guide</span></p><p class=""text-xs text-muted-foreground/60"">1h ago</p></div><div class=""text-sm""><p class=""text-muted-foreground"">Draft saved: <span class=""text-foreground font-medium"">Accessibility Guide</span></p><p class=""text-xs text-muted-foreground/60"">3h ago</p></div><div class=""text-sm""><p class=""text-muted-foreground"">Post published: <span class=""text-foreground font-medium"">React Server Components</span></p><p class=""text-xs text-muted-foreground/60"">8h ago</p></div></div></div></aside></div></div></section>
</div>"
            });
            var row = string.Join("\n", new[]
            {
                "{{field:recent_group_heading_html}}",
                "<div class=\"space-y-4 ml-6 pl-6 border-l-2 border-dashed border-border mb-4\"><article class=\"group bg-card rounded-xl border overflow-hidden hover:shadow-lg transition-all duration-300\" data-mf-acme-item=\"1\" data-mf-acme-category=\"{{field:category|format=plain}}\" data-mf-acme-status=\"{{field:recent_status|format=plain}}\" " + DetailNavigateAttributes() + ">",
                "  <div class=\"flex flex-col sm:flex-row\">",
                "    <div class=\"relative w-full sm:w-48 shrink-0 aspect-video sm:aspect-square\"><img src=\"{{field:featured_image_url|format=plain}}\" alt=\"{{field:image_alt_text|format=plain}}\" class=\"absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition-transform duration-500\" /><div class=\"absolute top-2 left-2\"><span class=\"{{field:recent_status_class|format=plain}}\">{{field:recent_status_label}}</span></div></div>",
                "    <div class=\"flex-1 p-4 flex flex-col\">",
                "      <div class=\"flex items-center gap-2 mb-2\"><span class=\"px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium\">{{field:category}}</span><span class=\"text-xs text-muted-foreground flex items-center gap-1\"><i class=\"fa-regular fa-clock h-3 w-3\" aria-hidden=\"true\"></i>{{field:reading_time}} min</span><span class=\"text-xs text-muted-foreground ml-auto\">{{field:recent_time_label}}</span></div>",
                "      <h3 class=\"font-semibold mb-1 group-hover:text-primary transition-colors line-clamp-1\"><a data-mflv-stop=\"1\" href=\"?vk=blog-detail&amp;mfid={{submission:id}}\">{{field:recent_title}}</a></h3>",
                "      <p class=\"text-sm text-muted-foreground line-clamp-2 mb-3\">{{field:recent_excerpt}}</p>",
                "      <div class=\"flex items-center justify-between mt-auto pt-3 border-t\"><div class=\"flex items-center gap-2\"><img src=\"{{field:author_avatar_url|format=plain}}\" alt=\"{{field:author_name|format=plain}}\" class=\"h-6 w-6 rounded-full object-cover\" /><span class=\"text-xs font-medium\">{{field:author_name}}</span></div>{{field:recent_metrics_html}}</div>",
                "  </div>",
                "  </div>",
                "</article></div>"
            });
            return ListView(formId, "blog-recent", "recent-timeline-posts", "Recent Blogs", false, 12, wrapper, row, AcmeDetailTemplate(), "No recent blog posts yet.", 10);
        }

        private static FormViewInfo BuildFeaturedView(int formId)
        {
            var wrapper = string.Join("\n", new[]
            {
                AcmeBlogCssMarker(),
                @"<div class=""mf-acme-blog min-h-screen bg-background"">
  <section class=""border-b bg-muted/30""><div class=""mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12""><h1 class=""text-3xl font-bold"">Featured Stories</h1><p class=""text-muted-foreground mt-1"">Hero-ready posts for landing pages, newsletters, and campaign modules.</p></div></section>
  <section class=""py-12""><div class=""mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 grid md:grid-cols-2 gap-6"">{{rows}}</div></section>
</div>"
            });
            return ListView(formId, "blog-featured", "featured-posts", "Featured Posts", false, 15, wrapper, AcmeHomePostTemplate(), AcmeDetailTemplate(), "No featured posts yet.");
        }

        private static FormViewInfo BuildArchiveView(int formId)
        {
            var wrapper = string.Join("\n", new[]
            {
                AcmeBlogCssMarker(),
                @"<div class=""mf-acme-blog mf-acme-blog-archive min-h-screen bg-background"" data-view-mode=""grid"" data-demo-state=""normal"" data-mf-blogkit-filter-category=""All"">
  <section class=""border-b bg-muted/30""><div class=""mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12""><div class=""flex flex-col md:flex-row md:items-center md:justify-between gap-6""><div><nav class=""flex items-center gap-2 text-sm text-muted-foreground mb-2""><a data-mflv-stop=""1"" href=""?vk=blog-home"" class=""hover:text-primary"">Blog</a><i class=""fa-solid fa-chevron-right h-4 w-4"" aria-hidden=""true""></i><span>All Articles</span></nav><h1 class=""text-3xl font-bold"">All Articles</h1><p class=""text-muted-foreground mt-1"">Browse our collection of 160+ articles</p></div><div class=""flex items-center gap-3""><div class=""relative"" data-mflv-stop=""1""><i class=""fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"" aria-hidden=""true""></i><input type=""text"" placeholder=""Search articles..."" class=""file:text-foreground placeholder:text-muted-foreground border-input h-9 w-64 min-w-0 rounded-md border bg-transparent px-3 py-1 pl-9 text-base shadow-xs transition-[color,box-shadow] outline-none md:text-sm"" /></div></div></div></div></section>
  <section class=""border-b sticky top-0 bg-background/95 backdrop-blur z-10""><div class=""mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4""><div class=""flex flex-col lg:flex-row lg:items-center justify-between gap-4"">
    <div class=""flex items-center gap-2 overflow-x-auto pb-2 lg:pb-0 scrollbar-hide"" data-mf-acme-filter-group=""category""><button data-mflv-stop=""1"" data-mf-acme-filter=""category"" data-mf-acme-value=""All"" type=""button"" class=""px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all bg-primary text-primary-foreground"">All</button><button data-mflv-stop=""1"" data-mf-acme-filter=""category"" data-mf-acme-value=""Design"" type=""button"" class=""px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all bg-muted text-muted-foreground hover:bg-muted/80"">Design</button><button data-mflv-stop=""1"" data-mf-acme-filter=""category"" data-mf-acme-value=""Development"" type=""button"" class=""px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all bg-muted text-muted-foreground hover:bg-muted/80"">Development</button><button data-mflv-stop=""1"" data-mf-acme-filter=""category"" data-mf-acme-value=""AI/ML"" type=""button"" class=""px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all bg-muted text-muted-foreground hover:bg-muted/80"">AI/ML</button><button data-mflv-stop=""1"" data-mf-acme-filter=""category"" data-mf-acme-value=""Accessibility"" type=""button"" class=""px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all bg-muted text-muted-foreground hover:bg-muted/80"">Accessibility</button><button data-mflv-stop=""1"" data-mf-acme-filter=""category"" data-mf-acme-value=""UX"" type=""button"" class=""px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all bg-muted text-muted-foreground hover:bg-muted/80"">UX</button><button data-mflv-stop=""1"" data-mf-acme-filter=""category"" data-mf-acme-value=""Product"" type=""button"" class=""px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all bg-muted text-muted-foreground hover:bg-muted/80"">Product</button></div>
    <div class=""flex items-center gap-3""><button data-mflv-stop=""1"" type=""button"" class=""inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2""><i class=""fa-solid fa-arrow-up-wide-short h-4 w-4"" aria-hidden=""true""></i>Most Recent<i class=""fa-solid fa-chevron-down h-4 w-4"" aria-hidden=""true""></i></button><button data-mflv-stop=""1"" type=""button"" class=""inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2""><i class=""fa-solid fa-filter h-4 w-4"" aria-hidden=""true""></i>Filters</button><div class=""flex items-center border rounded-lg p-1""><button data-mflv-stop=""1"" data-mf-acme-layout=""grid"" type=""button"" class=""p-2 rounded transition-colors bg-primary text-primary-foreground""><i class=""fa-solid fa-grip h-4 w-4"" aria-hidden=""true""></i></button><button data-mflv-stop=""1"" data-mf-acme-layout=""list"" type=""button"" class=""p-2 rounded transition-colors hover:bg-muted""><i class=""fa-solid fa-list h-4 w-4"" aria-hidden=""true""></i></button></div><button data-mflv-stop=""1"" data-mf-acme-state=""empty"" type=""button"" class=""inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground h-8 px-3"">Empty State</button></div>
  </div></div></section>
  <section class=""py-12""><div class=""mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"">
    <div class=""mf-acme-loading-state flex flex-col items-center justify-center py-24"" hidden><i class=""fa-solid fa-spinner h-12 w-12 text-primary animate-spin mb-4"" aria-hidden=""true""></i><p class=""text-muted-foreground"">Loading articles...</p></div>
    <div class=""mf-acme-empty-state flex flex-col items-center justify-center py-24 text-center"" hidden><div class=""w-24 h-24 rounded-full bg-muted flex items-center justify-center mb-6""><i class=""fa-regular fa-file-lines h-12 w-12 text-muted-foreground"" aria-hidden=""true""></i></div><h3 class=""text-xl font-semibold mb-2"">No articles found</h3><p class=""text-muted-foreground max-w-md mb-6"">We couldn&apos;t find any articles matching your criteria. Try adjusting your filters or search query.</p><button data-mflv-stop=""1"" data-mf-acme-state=""normal"" type=""button"" class=""inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground h-9 px-4 py-2"">Clear Filters</button></div>
    <div class=""mf-acme-archive-list grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"">{{rows}}</div>
    <div class=""mf-acme-filter-empty flex flex-col items-center justify-center py-24 text-center"" hidden>No articles found for this filter.</div>
    <div class=""mf-acme-pagination flex items-center justify-center gap-2 mt-12""><button data-mflv-stop=""1"" type=""button"" class=""inline-flex items-center justify-center rounded-md text-sm font-medium border bg-background h-9 w-9""><i class=""fa-solid fa-chevron-left h-4 w-4"" aria-hidden=""true""></i></button><button data-mflv-stop=""1"" type=""button"" class=""inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground h-9 w-9"">1</button><button data-mflv-stop=""1"" type=""button"" class=""inline-flex items-center justify-center rounded-md text-sm font-medium border bg-background h-9 w-9"">2</button><button data-mflv-stop=""1"" type=""button"" class=""inline-flex items-center justify-center rounded-md text-sm font-medium border bg-background h-9 w-9"">3</button><button data-mflv-stop=""1"" type=""button"" class=""inline-flex items-center justify-center rounded-md text-sm font-medium border bg-background h-9 w-9""><i class=""fa-solid fa-chevron-right h-4 w-4"" aria-hidden=""true""></i></button></div>
  </div></section>
</div>"
            });
            var row = string.Join("\n", new[]
            {
                "<article class=\"mf-acme-archive-card group bg-card rounded-xl border overflow-hidden hover:shadow-lg transition-all duration-300\" data-mf-acme-item=\"1\" data-mf-acme-category=\"{{field:category|format=plain}}\" data-mf-acme-status=\"{{submission:status|format=plain}}\" " + DetailNavigateAttributes() + ">",
                "  <div class=\"mf-acme-archive-wrap flex flex-col\">",
                "    <div class=\"mf-acme-archive-image relative w-full aspect-[4/3] overflow-hidden\">",
                "      <img src=\"{{field:featured_image_url|format=plain}}\" alt=\"{{field:image_alt_text|format=plain}}\" class=\"absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition-transform duration-500\" />",
                "      <div class=\"absolute top-3 left-3\"><span class=\"px-2 py-1 rounded-full bg-background/90 backdrop-blur text-xs font-medium\">{{field:category}}</span></div>",
                "      <button type=\"button\" data-mflv-stop=\"1\" data-mf-acme-toggle=\"bookmark\" class=\"absolute top-3 right-3 p-2 rounded-full bg-background/90 backdrop-blur opacity-0 group-hover:opacity-100 transition-opacity\"><i class=\"fa-regular fa-bookmark h-4 w-4\" aria-hidden=\"true\"></i></button>",
                "    </div>",
                "    <div class=\"flex-1 p-4 flex flex-col\">",
                "      <div class=\"flex items-center gap-2 text-xs text-muted-foreground mb-2\"><i class=\"fa-regular fa-clock h-3 w-3\" aria-hidden=\"true\"></i><span>{{field:reading_time}} min</span><span class=\"text-border\">|</span><span>{{field:publish_date_label}}</span></div>",
                "      <h3 class=\"font-semibold mb-2 line-clamp-2 group-hover:text-primary transition-colors\"><a data-mflv-stop=\"1\" href=\"?vk=blog-detail&amp;mfid={{submission:id}}\">{{field:title}}</a></h3>",
                "      <p class=\"text-sm text-muted-foreground line-clamp-2 mb-4\">{{field:excerpt}}</p>",
                "      <div class=\"flex items-center justify-between pt-3 border-t mt-auto\"><div class=\"flex items-center gap-2\"><span class=\"h-6 w-6 rounded-full bg-primary/10 text-primary grid place-items-center text-[10px] font-bold\">MF</span><span class=\"text-xs font-medium\">{{field:author_name}}</span></div><div class=\"flex items-center gap-2 text-xs text-muted-foreground\"><button type=\"button\" data-mflv-stop=\"1\" data-mf-acme-toggle=\"like\" data-mf-acme-counter=\".mf-acme-like-count\" class=\"flex items-center gap-0.5\"><i class=\"fa-regular fa-heart h-3 w-3\" aria-hidden=\"true\"></i><span class=\"mf-acme-like-count\">{{field:share_count}}</span></button><span class=\"flex items-center gap-0.5\"><i class=\"fa-regular fa-comment h-3 w-3\" aria-hidden=\"true\"></i>{{field:comment_count}}</span></div></div>",
                "    </div>",
                "  </div>",
                "</article>"
            });
            return ListView(formId, "blog-archive", "blog-archive", "Blog Archive", false, 20, wrapper, row, AcmeDetailTemplate(), "No archive posts yet.", 8);
        }

        private static FormViewInfo BuildFeedView(int formId)
        {
            var wrapper = string.Join("\n", new[]
            {
                "<div style=\"display:grid;gap:18px;font-family:Segoe UI,Arial,sans-serif;color:#0f172a\">",
                "  <section style=\"display:flex;justify-content:space-between;gap:14px;align-items:end;flex-wrap:wrap;padding:20px 22px;border:1px solid #bfdbfe;border-radius:16px;background:#eff6ff\">",
                "    <div><div style=\"font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#1d4ed8;font-weight:800\">Distribution</div><h2 style=\"margin:5px 0 0;font-size:28px;line-height:1.2\">Newsletter and Feed Candidates</h2></div>",
                "    <div style=\"font-size:13px;color:#64748b\">Posts flagged for newsletter, RSS, or homepage promotion.</div>",
                "  </section>",
                "  <section style=\"display:grid;gap:12px\">{{rows}}</section>",
                "</div>"
            });
            var row = string.Join("\n", new[]
            {
                "<article style=\"display:grid;gap:10px;padding:16px 18px;border:1px solid #dbeafe;border-radius:14px;background:#ffffff\">",
                "  <div style=\"display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap\"><strong style=\"font-size:17px;color:#0f172a\">{{field:title}}</strong><span style=\"color:#2563eb;font-size:12px;font-weight:800\">{{field:publish_date|format=yyyy-MM-dd}}</span></div>",
                "  <div style=\"font-size:13px;line-height:1.6;color:#475569\">{{field:excerpt}}</div>",
                "  <div style=\"display:flex;gap:8px;flex-wrap:wrap;font-size:12px;color:#64748b\"><span>{{field:category}}</span><span>{{field:audience}}</span><span>RSS {{field:rss_enabled}}</span><span>Newsletter {{field:newsletter_featured}}</span></div>",
                "</article>"
            });
            return ListView(formId, "blog-feed", "newsletter-candidates", "Newsletter Feed", false, 25, wrapper, row, ArticleDetailTemplate(), "No newsletter candidates yet.");
        }

        private static FormViewInfo QueueView(int formId, string viewKey, string queryKey, string viewName, bool isDefault, string label, string status, int sortOrder)
        {
            var wrapper = string.Join("\n", new[]
            {
                "<div style=\"display:grid;gap:18px;font-family:Segoe UI,Arial,sans-serif;color:#0f172a\">",
                "  <section style=\"display:flex;justify-content:space-between;gap:14px;align-items:end;flex-wrap:wrap;padding:20px 22px;border:1px solid #bae6fd;border-radius:16px;background:linear-gradient(135deg,#f0f9ff 0%,#ffffff 65%)\">",
                "    <div><div style=\"font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#0369a1;font-weight:800\">Workflow Queue</div><h2 style=\"margin:5px 0 0;font-size:28px;line-height:1.2\">" + label + "</h2></div>",
                "    <div style=\"padding:8px 12px;border-radius:999px;background:#e0f2fe;color:#075985;font-size:12px;font-weight:800\">" + status + "</div>",
                "  </section>",
                "  <section style=\"overflow:hidden;border:1px solid #e5e7eb;border-radius:16px;background:#ffffff\">",
                "    <table style=\"width:100%;border-collapse:separate;border-spacing:0\"><thead style=\"background:#f1f5f9\"><tr>",
                "      <th style=\"padding:12px 14px;text-align:left;font-size:12px;text-transform:uppercase;color:#475569\">Post</th>",
                "      <th style=\"padding:12px 14px;text-align:left;font-size:12px;text-transform:uppercase;color:#475569\">Author</th>",
                "      <th style=\"padding:12px 14px;text-align:left;font-size:12px;text-transform:uppercase;color:#475569\">Category</th>",
                "      <th style=\"padding:12px 14px;text-align:left;font-size:12px;text-transform:uppercase;color:#475569\">Stage</th>",
                "    </tr></thead><tbody>{{rows}}</tbody></table>",
                "  </section>",
                "</div>"
            });
            var row = string.Join("\n", new[]
            {
                "<tr>",
                "  <td style=\"padding:13px 14px;border-bottom:1px solid #e2e8f0\"><div style=\"font-weight:800;color:#0f172a\">{{field:title}}</div><div style=\"margin-top:4px;color:#64748b;font-size:12px\">{{field:seo_title}}</div></td>",
                "  <td style=\"padding:13px 14px;border-bottom:1px solid #e2e8f0;color:#334155\">{{field:author_name}}</td>",
                "  <td style=\"padding:13px 14px;border-bottom:1px solid #e2e8f0;color:#334155\">{{field:category}}</td>",
                "  <td style=\"padding:13px 14px;border-bottom:1px solid #e2e8f0\"><span style=\"display:inline-block;padding:4px 10px;border-radius:999px;background:#e0f2fe;color:#075985;font-size:11px;font-weight:800\">{{submission:status}}</span></td>",
                "</tr>"
            });
            return ListView(formId, viewKey, queryKey, viewName, isDefault, sortOrder, wrapper, row, ArticleDetailTemplate(), "No posts in this queue.");
        }

        private static FormViewInfo BuildCalendarView(int formId)
        {
            var wrapper = string.Join("\n", new[]
            {
                "<div style=\"display:grid;gap:18px;font-family:Segoe UI,Arial,sans-serif;color:#0f172a\">",
                "  <section style=\"display:flex;justify-content:space-between;gap:14px;align-items:end;flex-wrap:wrap;padding:20px 22px;border:1px solid #c4b5fd;border-radius:16px;background:#f5f3ff\">",
                "    <div><div style=\"font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#6d28d9;font-weight:800\">Calendar</div><h2 style=\"margin:5px 0 0;font-size:28px;line-height:1.2\">Content Calendar</h2></div>",
                "    <div style=\"font-size:13px;color:#64748b\">Drafts, reviews, ready posts, and scheduled releases ordered by publish date.</div>",
                "  </section>",
                "  <section style=\"overflow:hidden;border:1px solid #e5e7eb;border-radius:16px;background:#ffffff\">",
                "    <table style=\"width:100%;border-collapse:separate;border-spacing:0\"><thead style=\"background:#f5f3ff\"><tr>",
                "      <th style=\"padding:12px 14px;text-align:left;font-size:12px;text-transform:uppercase;color:#475569\">Date</th>",
                "      <th style=\"padding:12px 14px;text-align:left;font-size:12px;text-transform:uppercase;color:#475569\">Post</th>",
                "      <th style=\"padding:12px 14px;text-align:left;font-size:12px;text-transform:uppercase;color:#475569\">Owner</th>",
                "      <th style=\"padding:12px 14px;text-align:left;font-size:12px;text-transform:uppercase;color:#475569\">Campaign</th>",
                "      <th style=\"padding:12px 14px;text-align:left;font-size:12px;text-transform:uppercase;color:#475569\">Status</th>",
                "    </tr></thead><tbody>{{rows}}</tbody></table>",
                "  </section>",
                "</div>"
            });
            var row = string.Join("\n", new[]
            {
                "<tr>",
                "  <td style=\"padding:13px 14px;border-bottom:1px solid #e2e8f0;color:#334155;white-space:nowrap;font-weight:800\">{{field:publish_date|format=yyyy-MM-dd}}</td>",
                "  <td style=\"padding:13px 14px;border-bottom:1px solid #e2e8f0\"><div style=\"font-weight:800;color:#0f172a\">{{field:title}}</div><div style=\"margin-top:4px;color:#64748b;font-size:12px\">{{field:content_type}} / {{field:category}} / {{field:audience}}</div></td>",
                "  <td style=\"padding:13px 14px;border-bottom:1px solid #e2e8f0;color:#334155\">{{field:content_owner}}</td>",
                "  <td style=\"padding:13px 14px;border-bottom:1px solid #e2e8f0;color:#64748b\">{{field:campaign}}</td>",
                "  <td style=\"padding:13px 14px;border-bottom:1px solid #e2e8f0\"><span style=\"display:inline-block;padding:4px 10px;border-radius:999px;background:#ede9fe;color:#6d28d9;font-size:11px;font-weight:800\">{{submission:status}}</span></td>",
                "</tr>"
            });
            return ListView(formId, "blog-calendar", "content-calendar", "Content Calendar", false, 52, wrapper, row, ArticleDetailTemplate(), "No calendar posts yet.");
        }

        private static FormViewInfo BuildSeoGapsView(int formId)
        {
            var wrapper = string.Join("\n", new[]
            {
                "<div style=\"display:grid;gap:18px;font-family:Segoe UI,Arial,sans-serif;color:#0f172a\">",
                "  <section style=\"display:flex;justify-content:space-between;gap:14px;align-items:end;flex-wrap:wrap;padding:20px 22px;border:1px solid #fed7aa;border-radius:16px;background:#fff7ed\">",
                "    <div><div style=\"font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#c2410c;font-weight:800\">SEO QA</div><h2 style=\"margin:5px 0 0;font-size:28px;line-height:1.2\">SEO and Social Gaps</h2></div>",
                "    <div style=\"font-size:13px;color:#64748b\">Review search, canonical, and social metadata before publish.</div>",
                "  </section>",
                "  <section style=\"overflow:hidden;border:1px solid #e5e7eb;border-radius:16px;background:#ffffff\">",
                "    <table style=\"width:100%;border-collapse:separate;border-spacing:0\"><thead style=\"background:#fff7ed\"><tr>",
                "      <th style=\"padding:12px 14px;text-align:left;font-size:12px;text-transform:uppercase;color:#475569\">Post</th>",
                "      <th style=\"padding:12px 14px;text-align:left;font-size:12px;text-transform:uppercase;color:#475569\">SEO</th>",
                "      <th style=\"padding:12px 14px;text-align:left;font-size:12px;text-transform:uppercase;color:#475569\">Social</th>",
                "      <th style=\"padding:12px 14px;text-align:left;font-size:12px;text-transform:uppercase;color:#475569\">Canonical</th>",
                "    </tr></thead><tbody>{{rows}}</tbody></table>",
                "  </section>",
                "</div>"
            });
            var row = string.Join("\n", new[]
            {
                "<tr>",
                "  <td style=\"padding:13px 14px;border-bottom:1px solid #e2e8f0\"><div style=\"font-weight:800;color:#0f172a\">{{field:title}}</div><div style=\"margin-top:4px;color:#64748b;font-size:12px\">{{submission:status}} / {{field:editorial_priority}}</div></td>",
                "  <td style=\"padding:13px 14px;border-bottom:1px solid #e2e8f0;color:#334155\"><div>{{field:seo_title}}</div><div style=\"margin-top:4px;font-size:12px;color:#64748b\">{{field:seo_description}}</div></td>",
                "  <td style=\"padding:13px 14px;border-bottom:1px solid #e2e8f0;color:#334155\"><div>{{field:social_title}}</div><div style=\"margin-top:4px;font-size:12px;color:#64748b\">{{field:social_description}}</div></td>",
                "  <td style=\"padding:13px 14px;border-bottom:1px solid #e2e8f0;color:#2563eb;font-size:12px\">{{field:canonical_url}}</td>",
                "</tr>"
            });
            return ListView(formId, "blog-seo-gaps", "seo-gaps", "SEO Gaps", false, 54, wrapper, row, ArticleDetailTemplate(), "No SEO gaps are queued.");
        }

        private static FormViewInfo BuildPopularView(int formId)
        {
            var wrapper = string.Join("\n", new[]
            {
                AcmeBlogCssMarker(),
                @"<div class=""mf-acme-blog min-h-screen bg-background"">
  <section class=""border-b bg-muted/30""><div class=""mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12""><h1 class=""text-3xl font-bold"">Popular Posts</h1><p class=""text-muted-foreground mt-1"">Readership, comments, shares, and active engagement ranked for editors.</p></div></section>
  <section class=""py-12""><div class=""mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 grid md:grid-cols-2 gap-6"">{{rows}}</div></section>
</div>"
            });
            return ListView(formId, "blog-popular", "popular-posts", "Popular Posts", false, 55, wrapper, AcmeHomePostTemplate(), AcmeDetailTemplate(), "No popular posts yet.");
        }

        private static FormViewInfo BuildCommentModerationView(int formId)
        {
            var wrapper = string.Join("\n", new[]
            {
                BlogKitStyles(),
                "<div style=\"display:grid;gap:18px;font-family:Segoe UI,Arial,sans-serif;color:#0f172a\">",
                "  <section style=\"display:flex;justify-content:space-between;gap:14px;align-items:end;flex-wrap:wrap;padding:20px 22px;border:1px solid #fecdd3;border-radius:16px;background:#fff1f2\">",
                "    <div><div style=\"font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#be123c;font-weight:800\">Community</div><h2 style=\"margin:5px 0 0;font-size:28px;line-height:1.2;color:#0f172a\">Comment Moderation</h2></div>",
                "    <div style=\"font-size:13px;color:#64748b\">Track conversation volume, readers, latest comments, and moderation status.</div>",
                "  </section>",
                "  <section style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px\">{{rows}}</section>",
                "</div>"
            });
            var row = string.Join("\n", new[]
            {
                "<article " + DetailOpenAttributes() + " style=\"cursor:pointer;display:grid;gap:12px;padding:16px;border:1px solid #fecdd3;border-radius:16px;background:#ffffff;box-shadow:0 10px 28px rgba(15,23,42,.06)\">",
                "  <div style=\"display:flex;justify-content:space-between;gap:12px;align-items:start\"><div><div style=\"font-size:12px;color:#64748b\">{{field:category}} / {{field:publish_date|format=yyyy-MM-dd}}</div><h3 style=\"margin:4px 0 0;font-size:18px;line-height:1.28;color:#0f172a\">{{field:title}}</h3></div><span style=\"padding:4px 10px;border-radius:999px;background:#ffe4e6;color:#be123c;font-size:11px;font-weight:800;white-space:nowrap\">{{field:comment_moderation_state}}</span></div>",
                "  <div style=\"display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;text-align:center\">",
                "    <div style=\"padding:8px;border-radius:12px;background:#fff1f2\"><strong style=\"display:block;color:#0f172a\">{{field:comment_count}}</strong><span style=\"font-size:11px;color:#64748b\">comments</span></div>",
                "    <div style=\"padding:8px;border-radius:12px;background:#f8fafc\"><strong style=\"display:block;color:#0f172a\">{{field:view_count}}</strong><span style=\"font-size:11px;color:#64748b\">reads</span></div>",
                "    <div style=\"padding:8px;border-radius:12px;background:#f8fafc\"><strong style=\"display:block;color:#0f172a\">{{field:unique_readers}}</strong><span style=\"font-size:11px;color:#64748b\">readers</span></div>",
                "    <div style=\"padding:8px;border-radius:12px;background:#f8fafc\"><strong style=\"display:block;color:#0f172a\">{{field:average_engagement_seconds}}</strong><span style=\"font-size:11px;color:#64748b\">sec avg</span></div>",
                "  </div>",
                "  <div style=\"display:grid;gap:5px;padding-top:4px\"><div style=\"font-size:12px;font-weight:800;color:#0f172a\">Latest comment</div><div style=\"font-size:13px;color:#334155;font-weight:700\">{{field:latest_comment_author}}</div><div style=\"font-size:12px;line-height:1.55;color:#64748b\">{{field:latest_comment_excerpt}}</div><div style=\"font-size:12px;color:#94a3b8\">Last: {{field:last_commented_on|format=yyyy-MM-dd}}</div></div>",
                "  " + SocialLinksTemplate(),
                "</article>"
            });
            return ListView(formId, "blog-comments", "comment-moderation", "Comment Moderation", false, 57, wrapper, row, ArticleDetailTemplate(), "No comment threads need moderation.");
        }

        private static FormViewInfo BuildRegisterView(int formId)
        {
            var wrapper = string.Join("\n", new[]
            {
                "<div style=\"display:grid;gap:18px;font-family:Segoe UI,Arial,sans-serif;color:#0f172a\">",
                "  <section style=\"display:flex;justify-content:space-between;gap:14px;align-items:end;flex-wrap:wrap;padding:20px 22px;border:1px solid #e2e8f0;border-radius:16px;background:#f8fafc\">",
                "    <div><div style=\"font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#475569;font-weight:800\">Register</div><h2 style=\"margin:5px 0 0;font-size:28px;line-height:1.2\">All Blog Posts</h2></div>",
                "    <div style=\"font-size:13px;color:#64748b\">Complete operational register across all content lifecycle states.</div>",
                "  </section>",
                "  <section style=\"overflow:hidden;border:1px solid #e5e7eb;border-radius:16px;background:#ffffff\">",
                "    <table style=\"width:100%;border-collapse:separate;border-spacing:0\"><thead style=\"background:#f1f5f9\"><tr>",
                "      <th style=\"padding:12px 14px;text-align:left;font-size:12px;text-transform:uppercase;color:#475569\">Post</th>",
                "      <th style=\"padding:12px 14px;text-align:left;font-size:12px;text-transform:uppercase;color:#475569\">Lifecycle</th>",
                "      <th style=\"padding:12px 14px;text-align:left;font-size:12px;text-transform:uppercase;color:#475569\">Distribution</th>",
                "      <th style=\"padding:12px 14px;text-align:left;font-size:12px;text-transform:uppercase;color:#475569\">Governance</th>",
                "    </tr></thead><tbody>{{rows}}</tbody></table>",
                "  </section>",
                "</div>"
            });
            var row = string.Join("\n", new[]
            {
                "<tr>",
                "  <td style=\"padding:13px 14px;border-bottom:1px solid #e2e8f0\"><div style=\"font-weight:800;color:#0f172a\">{{field:title}}</div><div style=\"margin-top:4px;color:#64748b;font-size:12px\">{{field:slug}}</div></td>",
                "  <td style=\"padding:13px 14px;border-bottom:1px solid #e2e8f0;color:#334155\"><div>{{submission:status}}</div><div style=\"margin-top:4px;font-size:12px;color:#64748b\">{{field:publish_date|format=yyyy-MM-dd}}</div></td>",
                "  <td style=\"padding:13px 14px;border-bottom:1px solid #e2e8f0;color:#334155\"><div>Featured {{field:is_featured}}</div><div style=\"margin-top:4px;font-size:12px;color:#64748b\">Newsletter {{field:newsletter_featured}} / RSS {{field:rss_enabled}}</div></td>",
                "  <td style=\"padding:13px 14px;border-bottom:1px solid #e2e8f0;color:#334155\"><div>{{field:view_count}} reads / {{field:comment_count}} comments</div><div style=\"margin-top:4px;font-size:12px;color:#64748b\">{{field:comment_moderation_state}} / Legal {{field:legal_review_required}}</div></td>",
                "</tr>"
            });
            return ListView(formId, "blog-register", "all-posts", "Blog Register", false, 58, wrapper, row, ArticleDetailTemplate(), "No posts are available.");
        }

        private static FormViewInfo BuildCardView(int formId)
        {
            var template = string.Join("\n", new[] { AcmeBlogCssMarker(), "<div class=\"mf-acme-blog\">" + CardRowTemplate() + "</div>" });
            return new FormViewInfo
            {
                FormId = formId,
                ViewKey = "blog-card",
                QueryKey = "public-posts",
                ViewType = "card",
                ViewName = "Blog Card",
                IsDefault = false,
                SortOrder = 60,
                ConfigJson = JsonConvert.SerializeObject(new { cardFields = "title,subtitle,excerpt,featured_image_url,image_alt_text,category,content_type,tags,author_name,publish_date,reading_time,audience,view_count,unique_readers,comment_count,share_count,canonical_url,comment_moderation_state,latest_comment_excerpt", cardTemplate = template }),
                CustomHtml = template,
                CustomCss = string.Empty,
                PermissionsJson = "[]",
                CreatedOnUtc = DateTime.UtcNow
            };
        }

        private static FormViewInfo BuildDetailView(int formId, IReadOnlyDictionary<string, int> formIds)
        {
            var commentsFormId = 0;
            if (formIds != null && formIds.TryGetValue("comments", out var foundCommentsFormId))
                commentsFormId = foundCommentsFormId;

            return ListView(formId, "blog-detail", "public-posts", "Blog Detail", false, 70, "{{rows}}", AcmeDetailTemplate(commentsFormId), AcmeDetailTemplate(commentsFormId), "No post is available.", 1);
        }

        private static FormViewInfo ListView(int formId, string viewKey, string queryKey, string viewName, bool isDefault, int sortOrder, string wrapper, string row, string detail, string empty, int pageSize = 8)
        {
            return new FormViewInfo
            {
                FormId = formId,
                ViewKey = viewKey,
                QueryKey = queryKey,
                ViewType = "listview",
                ViewName = viewName,
                IsDefault = isDefault,
                SortOrder = sortOrder,
                ConfigJson = JsonConvert.SerializeObject(new
                {
                    title = viewName,
                    pageSize = pageSize,
                    enableSearch = true,
                    enableSort = true,
                    showAddButton = false,
                    showRowActions = false,
                    emptyMessage = empty,
                    fields = new[]
                    {
                        new { key = "title", label = "Title", type = "Text" },
                        new { key = "subtitle", label = "Subtitle", type = "Text" },
                        new { key = "excerpt", label = "Excerpt", type = "Text" },
                        new { key = "featured_image_url", label = "Featured Image", type = "Image" },
                        new { key = "image_alt_text", label = "Image Alt Text", type = "Text" },
                        new { key = "content_type", label = "Content Type", type = "Select" },
                        new { key = "category", label = "Category", type = "Select" },
                        new { key = "tags", label = "Tags", type = "Text" },
                        new { key = "audience", label = "Audience", type = "Select" },
                        new { key = "publish_date", label = "Publish Date", type = "Date" },
                        new { key = "publish_date_label", label = "Publish Date Label", type = "Text" },
                        new { key = "publish_date_full_label", label = "Full Publish Date", type = "Text" },
                        new { key = "author_name", label = "Author", type = "Text" },
                        new { key = "status", label = "Status", type = "Select" },
                        new { key = "reading_time", label = "Reading Time", type = "Number" },
                        new { key = "is_featured", label = "Featured", type = "Select" },
                        new { key = "view_count", label = "Reads", type = "Number" },
                        new { key = "unique_readers", label = "Readers", type = "Number" },
                        new { key = "comment_count", label = "Comments", type = "Number" },
                        new { key = "share_count", label = "Shares", type = "Number" },
                        new { key = "canonical_url", label = "Canonical URL", type = "Text" },
                        new { key = "latest_comment_author", label = "Latest Comment Author", type = "Text" },
                        new { key = "latest_comment_excerpt", label = "Latest Comment Excerpt", type = "Textarea" },
                        new { key = "last_commented_on_label", label = "Last Comment Date Label", type = "Text" },
                        new { key = "comment_moderation_state", label = "Comment Moderation", type = "Select" }
                    },
                    rowTemplate = row,
                    wrapperTemplate = wrapper,
                    detailTemplate = detail
                }),
                CustomHtml = string.Empty,
                CustomCss = string.Empty,
                PermissionsJson = "[]",
                CreatedOnUtc = DateTime.UtcNow
            };
        }

        private static string DetailOpenAttributes()
        {
            return "data-mflv-action=\"view\" data-mflv-id=\"{{submission:id}}\" role=\"button\" tabindex=\"0\"";
        }

        private static string DetailNavigateAttributes()
        {
            return "data-mflv-action=\"navigate\" data-mflv-id=\"{{submission:id}}\" data-mflv-url=\"?vk=blog-detail&amp;mfid={{submission:id}}\" role=\"link\" tabindex=\"0\"";
        }

        private static string AcmeBlogCssMarker()
        {
            return "<span class=\"mf-acme-blog-css-anchor\" hidden></span>";
        }

        private static string BlogKitStyles()
        {
            return AcmeBlogCssMarker();
            /*
            return @"<style>
.mflv-shell:has(.mf-blogkit) > .mflv-toolbar { display:none; }
.mf-blogkit, .mf-blogkit * { box-sizing:border-box; }
.mf-blogkit {
  --mf-ink:#101828;
  --mf-muted:#667085;
  --mf-line:#e4e7ec;
  --mf-soft:#f8fafc;
  --mf-teal:#0f766e;
  --mf-blue:#2563eb;
  --mf-amber:#d97706;
  --mf-rose:#be123c;
  --mf-shadow:0 18px 44px rgba(16,24,40,.10);
  max-width:1180px;
  margin:0 auto;
  display:grid;
  gap:22px;
  color:var(--mf-ink);
  font-family:Segoe UI, Arial, sans-serif;
  letter-spacing:0;
}
.mf-blogkit a { color:inherit; }
.mf-blogkit button, .mf-blogkit input, .mf-blogkit select { font:inherit; letter-spacing:0; }
.mf-blogkit button { cursor:pointer; }
.mf-blogkit-hero {
  display:grid;
  grid-template-columns:minmax(0,1.35fr) minmax(280px,.65fr);
  gap:22px;
  align-items:stretch;
  padding:26px;
  border:1px solid #cbd5e1;
  border-radius:8px;
  background:linear-gradient(135deg,#f8fafc 0%,#ecfeff 45%,#fff7ed 100%);
  box-shadow:var(--mf-shadow);
}
.mf-blogkit-hero-copy { display:grid; gap:14px; align-content:center; min-width:0; }
.mf-blogkit-eyebrow { color:var(--mf-teal); font-size:12px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; }
.mf-blogkit h1, .mf-blogkit h2, .mf-blogkit h3, .mf-blogkit p { margin:0; }
.mf-blogkit h1 { max-width:760px; font-size:42px; line-height:1.08; font-weight:850; color:var(--mf-ink); }
.mf-blogkit h2 { font-size:26px; line-height:1.16; font-weight:850; color:var(--mf-ink); }
.mf-blogkit h3 { font-size:18px; line-height:1.25; font-weight:850; color:var(--mf-ink); }
.mf-blogkit p { color:var(--mf-muted); line-height:1.65; }
.mf-blogkit-search {
  display:grid;
  grid-template-columns:auto minmax(0,1fr) auto;
  align-items:center;
  gap:10px;
  max-width:720px;
  padding:8px 8px 8px 14px;
  border:1px solid #d0d5dd;
  border-radius:8px;
  background:#fff;
  box-shadow:0 10px 26px rgba(16,24,40,.08);
}
.mf-blogkit-search input { width:100%; min-width:0; border:0; outline:0; color:var(--mf-ink); }
.mf-blogkit-search button, .mf-blogkit-newsletter-form button {
  border:0;
  border-radius:8px;
  padding:9px 14px;
  background:var(--mf-ink);
  color:#fff;
  font-weight:800;
}
.mf-blogkit-pills { display:flex; flex-wrap:wrap; gap:8px; }
.mf-blogkit-pills button, .mf-blogkit-control-row button, .mf-blogkit-view-toggle button, .mf-blogkit-pager button {
  display:inline-flex;
  align-items:center;
  gap:7px;
  border:1px solid #d0d5dd;
  border-radius:999px;
  padding:8px 12px;
  background:#fff;
  color:#344054;
  font-size:13px;
  font-weight:800;
}
.mf-blogkit-pills button.is-active, .mf-blogkit-control-row button.is-active, .mf-blogkit-view-toggle button.is-active {
  border-color:#0f766e;
  background:#ccfbf1;
  color:#0f766e;
}
.mf-blogkit-feature-panel {
  position:relative;
  display:grid;
  gap:12px;
  align-content:end;
  min-height:280px;
  padding:22px;
  border-radius:8px;
  color:#fff;
  overflow:hidden;
  background:
    linear-gradient(145deg,rgba(16,24,40,.94),rgba(15,118,110,.78)),
    radial-gradient(circle at 80% 10%,rgba(251,191,36,.55),transparent 35%);
}
.mf-blogkit-feature-panel strong { display:block; font-size:26px; line-height:1.15; }
.mf-blogkit-feature-panel p { color:#e2e8f0; }
.mf-blogkit-trend-badge {
  width:max-content;
  display:inline-flex;
  align-items:center;
  gap:7px;
  border-radius:999px;
  padding:6px 10px;
  background:#fef3c7;
  color:#92400e;
  font-size:12px;
  font-weight:900;
}
.mf-blogkit-mini-metrics, .mf-blogkit-head-stats, .mf-blogkit-stat-grid {
  display:grid;
  grid-template-columns:repeat(3,minmax(0,1fr));
  gap:10px;
}
.mf-blogkit-mini-metrics span, .mf-blogkit-head-stats span, .mf-blogkit-stat-grid span {
  display:grid;
  gap:3px;
  padding:10px;
  border:1px solid rgba(255,255,255,.25);
  border-radius:8px;
  background:rgba(255,255,255,.12);
  color:inherit;
  font-size:12px;
}
.mf-blogkit-layout { display:grid; grid-template-columns:minmax(0,1fr) 300px; gap:22px; align-items:start; }
.mf-blogkit-section-head, .mf-blogkit-page-head, .mf-blogkit-filterbar {
  display:flex;
  justify-content:space-between;
  align-items:flex-end;
  gap:14px;
  flex-wrap:wrap;
}
.mf-blogkit-page-head {
  padding:22px;
  border:1px solid var(--mf-line);
  border-radius:8px;
  background:#fff;
  box-shadow:0 10px 28px rgba(16,24,40,.06);
}
.mf-blogkit-page-head p { max-width:700px; margin-top:6px; }
.mf-blogkit-section-head a, .mf-blogkit-row-actions a, .mf-blogkit-action-link {
  text-decoration:none;
  color:var(--mf-blue);
  font-weight:850;
  font-size:13px;
}
.mf-blogkit-grid, .mf-blogkit-archive-list {
  display:grid;
  grid-template-columns:repeat(3,minmax(0,1fr));
  gap:16px;
}
.mf-blogkit-home-grid { margin-top:14px; }
.mf-blogkit-card, .mf-blogkit-archive-item, .mf-blogkit-timeline-item {
  min-width:0;
  cursor:pointer;
  overflow:hidden;
  border:1px solid var(--mf-line);
  border-radius:8px;
  background:#fff;
  box-shadow:0 12px 30px rgba(16,24,40,.07);
  transition:transform .18s ease, box-shadow .18s ease, border-color .18s ease;
}
.mf-blogkit-card:hover, .mf-blogkit-archive-item:hover, .mf-blogkit-timeline-item:hover {
  transform:translateY(-2px);
  border-color:#99f6e4;
  box-shadow:0 18px 44px rgba(16,24,40,.12);
}
.mf-blogkit-card-media { position:relative; overflow:hidden; background:#f1f5f9; }
.mf-blogkit-card img, .mf-blogkit-archive-item img, .mf-blogkit-timeline-item img, .mf-blogkit-detail-hero img {
  display:block;
  width:100%;
  object-fit:cover;
  background:#f1f5f9;
}
.mf-blogkit-card img { aspect-ratio:16/10; }
.mf-blogkit-home-grid .mf-blogkit-card:first-child { grid-column:span 2; grid-row:span 2; }
.mf-blogkit-home-grid .mf-blogkit-card:first-child img { aspect-ratio:16/9; }
.mf-blogkit-home-grid .mf-blogkit-card:first-child h3 { font-size:27px; line-height:1.14; }
.mf-blogkit-card-body, .mf-blogkit-archive-body, .mf-blogkit-timeline-body { display:grid; gap:10px; padding:16px; min-width:0; }
.mf-blogkit-card-body p, .mf-blogkit-archive-body p, .mf-blogkit-timeline-body p {
  display:-webkit-box;
  -webkit-line-clamp:3;
  -webkit-box-orient:vertical;
  overflow:hidden;
}
.mf-blogkit-card-meta, .mf-blogkit-metrics, .mf-blogkit-tagline, .mf-blogkit-row-actions, .mf-blogkit-card-actions, .mf-blogkit-social-links {
  display:flex;
  align-items:center;
  flex-wrap:wrap;
  gap:8px;
  color:var(--mf-muted);
  font-size:12px;
}
.mf-blogkit-category, .mf-blogkit-status {
  width:max-content;
  border-radius:999px;
  padding:4px 8px;
  background:#ecfeff;
  color:#0f766e;
  font-weight:900;
}
.mf-blogkit-status { background:#eef2ff; color:#3730a3; text-transform:capitalize; }
.mf-blogkit-metrics span {
  display:inline-flex;
  align-items:center;
  gap:5px;
  color:#475467;
  font-weight:750;
}
.mf-blogkit-card-actions { justify-content:space-between; padding-top:4px; }
.mf-blogkit-card-actions button, .mf-blogkit-social-links a, .mf-blogkit-floating-share a {
  display:inline-flex;
  align-items:center;
  justify-content:center;
  gap:6px;
  min-height:34px;
  border:1px solid #d0d5dd;
  border-radius:999px;
  padding:7px 10px;
  background:#fff;
  color:#344054;
  text-decoration:none;
  font-size:12px;
  font-weight:850;
}
.mf-blogkit-card-actions button.is-active { border-color:#fb7185; background:#fff1f2; color:#be123c; }
.mf-blogkit-sidebar { position:sticky; top:18px; display:grid; gap:14px; }
.mf-blogkit-sidebar section {
  display:grid;
  gap:12px;
  padding:16px;
  border:1px solid var(--mf-line);
  border-radius:8px;
  background:#fff;
  box-shadow:0 10px 28px rgba(16,24,40,.06);
}
.mf-blogkit-topic-list { display:flex; flex-wrap:wrap; gap:8px; }
.mf-blogkit-topic-list span {
  border-radius:999px;
  padding:6px 9px;
  background:#f2f4f7;
  color:#344054;
  font-size:12px;
  font-weight:800;
}
.mf-blogkit-newsletter-form { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:8px; }
.mf-blogkit-newsletter-form input, .mf-blogkit-control-row select {
  min-width:0;
  border:1px solid #d0d5dd;
  border-radius:8px;
  padding:9px 10px;
  background:#fff;
}
.mf-blogkit-stat-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
.mf-blogkit-stat-grid span { border-color:#eaecf0; background:#f9fafb; color:#475467; }
.mf-blogkit-stat-grid b, .mf-blogkit-head-stats b { color:var(--mf-ink); font-size:17px; }
.mf-blogkit-author-row { display:grid; grid-template-columns:38px minmax(0,1fr); gap:10px; align-items:center; }
.mf-blogkit-author-row > span {
  display:grid;
  place-items:center;
  width:38px;
  height:38px;
  border-radius:999px;
  background:#101828;
  color:#fff;
  font-weight:900;
}
.mf-blogkit-author-row small { display:block; color:var(--mf-muted); margin-top:2px; }
.mf-blogkit-head-stats { grid-template-columns:repeat(4,minmax(80px,1fr)); color:#475467; }
.mf-blogkit-head-stats span { border-color:#eaecf0; background:#f9fafb; }
.mf-blogkit-filterbar {
  align-items:center;
  padding:12px;
  border:1px solid var(--mf-line);
  border-radius:8px;
  background:#fff;
}
.mf-blogkit-control-row { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
.mf-blogkit-archive[data-view-mode=list] .mf-blogkit-archive-list { grid-template-columns:1fr; }
.mf-blogkit-archive[data-view-mode=list] .mf-blogkit-archive-item { grid-template-columns:220px minmax(0,1fr) auto; display:grid; align-items:stretch; }
.mf-blogkit-archive[data-view-mode=list] .mf-blogkit-archive-item img { height:100%; min-height:170px; aspect-ratio:auto; }
.mf-blogkit-archive-item { position:relative; display:grid; grid-template-rows:auto 1fr auto; }
.mf-blogkit-archive-item img { aspect-ratio:16/9; }
.mf-blogkit-archive-item .mf-blogkit-card-actions { padding:0 16px 16px; }
.mf-blogkit-loading-demo, .mf-blogkit-empty-demo {
  display:none;
  padding:28px;
  border:1px dashed #d0d5dd;
  border-radius:8px;
  background:#fff;
  text-align:center;
  color:var(--mf-muted);
}
.mf-blogkit-loading-demo span {
  display:block;
  height:82px;
  margin:10px 0;
  border-radius:8px;
  background:linear-gradient(90deg,#f2f4f7 0%,#eaecf0 50%,#f2f4f7 100%);
  background-size:200% 100%;
  animation:mfBlogPulse 1.3s ease-in-out infinite;
}
.mf-blogkit-empty-demo i { display:block; margin-bottom:10px; font-size:32px; color:#98a2b3; }
.mf-blogkit-archive[data-demo-state=loading] .mf-blogkit-archive-list,
.mf-blogkit-archive[data-demo-state=empty] .mf-blogkit-archive-list,
.mf-blogkit-archive[data-demo-state=loading] .mf-blogkit-pager,
.mf-blogkit-archive[data-demo-state=empty] .mf-blogkit-pager { display:none; }
.mf-blogkit-archive[data-demo-state=loading] .mf-blogkit-loading-demo,
.mf-blogkit-archive[data-demo-state=empty] .mf-blogkit-empty-demo { display:block; }
.mf-blogkit-pager {
  display:flex;
  justify-content:center;
  align-items:center;
  gap:10px;
  color:var(--mf-muted);
  font-size:13px;
  font-weight:800;
}
.mf-blogkit-filter-empty {
  padding:20px;
  border:1px dashed #d0d5dd;
  border-radius:8px;
  background:#fff;
  color:var(--mf-muted);
  text-align:center;
}
.mf-blogkit-timeline {
  position:relative;
  display:grid;
  gap:16px;
  padding-left:24px;
}
.mf-blogkit-timeline:before {
  content:'';
  position:absolute;
  left:7px;
  top:0;
  bottom:0;
  width:2px;
  background:#d0d5dd;
}
.mf-blogkit-timeline-item {
  position:relative;
  display:grid;
  grid-template-columns:168px minmax(0,1fr);
  overflow:visible;
}
.mf-blogkit-timeline-item:before {
  display:block;
  grid-column:1 / -1;
  width:max-content;
  margin:0 0 8px -24px;
  border-radius:999px;
  padding:5px 10px;
  background:#101828;
  color:#fff;
  font-size:12px;
  font-weight:900;
}
.mf-blogkit-timeline-item:nth-of-type(1):before { content:'Today'; }
.mf-blogkit-timeline-item:nth-of-type(2):before { content:'Yesterday'; }
.mf-blogkit-timeline-item:nth-of-type(3):before { content:'This Week'; }
.mf-blogkit-timeline-item:nth-of-type(7):before { content:'Earlier'; }
.mf-blogkit-timeline-dot {
  position:absolute;
  left:-23px;
  top:48px;
  width:12px;
  height:12px;
  border:3px solid #fff;
  border-radius:999px;
  background:var(--mf-teal);
  box-shadow:0 0 0 1px var(--mf-teal);
}
.mf-blogkit-timeline-item img { height:100%; min-height:150px; border-radius:8px 0 0 8px; }
.mf-blogkit-action-link {
  display:flex;
  align-items:center;
  gap:8px;
  border:1px solid #d0d5dd;
  border-radius:8px;
  padding:10px 11px;
  color:#344054;
}
.mf-blogkit-activity { margin:0; padding-left:18px; color:var(--mf-muted); line-height:1.55; }
.mf-blogkit-detail { max-width:980px; }
.mf-blogkit-detail-hero {
  overflow:hidden;
  border:1px solid var(--mf-line);
  border-radius:8px;
  background:#fff;
  box-shadow:var(--mf-shadow);
}
.mf-blogkit-detail-hero img { aspect-ratio:16/7; }
.mf-blogkit-detail-head { display:grid; gap:12px; padding:22px; }
.mf-blogkit-detail-head h1 { font-size:40px; }
.mf-blogkit-detail-grid { display:grid; grid-template-columns:62px minmax(0,1fr); gap:18px; align-items:start; }
.mf-blogkit-floating-share {
  position:sticky;
  top:20px;
  display:grid;
  gap:8px;
}
.mf-blogkit-floating-share a { width:42px; height:42px; padding:0; }
.mf-blogkit-article {
  display:grid;
  gap:20px;
  min-width:0;
  padding:24px;
  border:1px solid var(--mf-line);
  border-radius:8px;
  background:#fff;
}
.mf-blogkit-article-body { font-size:16px; line-height:1.8; color:#344054; }
.mf-blogkit-article-body h2, .mf-blogkit-article-body h3 { margin:24px 0 10px; color:var(--mf-ink); }
.mf-blogkit-article-body p { margin:0 0 14px; color:#344054; }
.mf-blogkit-article-body blockquote {
  margin:18px 0;
  padding:16px 18px;
  border-left:4px solid var(--mf-teal);
  border-radius:8px;
  background:#f0fdfa;
  color:#115e59;
  font-weight:750;
}
.mf-blogkit-article-body pre {
  overflow:auto;
  padding:16px;
  border-radius:8px;
  background:#101828;
  color:#f8fafc;
}
.mf-blogkit-article-body figure { margin:18px 0; }
.mf-blogkit-article-body img { max-width:100%; border-radius:8px; }
.mf-blogkit-article-body figcaption { margin-top:8px; color:#667085; font-size:13px; }
.mf-blogkit-detail-panel {
  display:grid;
  gap:12px;
  padding:16px;
  border:1px solid var(--mf-line);
  border-radius:8px;
  background:#f9fafb;
}
.mf-blogkit-comment { display:grid; gap:8px; padding:14px; border:1px solid #eaecf0; border-radius:8px; background:#fff; }
.mf-blogkit-comment.reply { margin-left:28px; background:#f8fafc; }
.mf-blogkit-related { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }
.mf-blogkit-related a, .mf-blogkit-prevnext a {
  display:grid;
  gap:6px;
  min-width:0;
  text-decoration:none;
  border:1px solid var(--mf-line);
  border-radius:8px;
  padding:13px;
  background:#fff;
}
.mf-blogkit-prevnext { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
.mf-blogkit-tags { display:flex; flex-wrap:wrap; gap:8px; }
.mf-blogkit-tags span { border-radius:999px; padding:6px 9px; background:#f2f4f7; color:#344054; font-size:12px; font-weight:800; }
@keyframes mfBlogPulse { 0% { background-position:200% 0; } 100% { background-position:-200% 0; } }
@media (max-width:980px) {
  .mf-blogkit-hero, .mf-blogkit-layout, .mf-blogkit-detail-grid { grid-template-columns:1fr; }
  .mf-blogkit-sidebar, .mf-blogkit-floating-share { position:static; }
  .mf-blogkit-floating-share { display:flex; flex-wrap:wrap; }
  .mf-blogkit-grid, .mf-blogkit-archive-list, .mf-blogkit-related { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .mf-blogkit-home-grid .mf-blogkit-card:first-child { grid-column:span 2; }
}
@media (max-width:680px) {
  .mf-blogkit { gap:16px; }
  .mf-blogkit h1, .mf-blogkit-detail-head h1 { font-size:30px; line-height:1.12; }
  .mf-blogkit-hero, .mf-blogkit-page-head, .mf-blogkit-article { padding:16px; }
  .mf-blogkit-search, .mf-blogkit-newsletter-form { grid-template-columns:1fr; }
  .mf-blogkit-grid, .mf-blogkit-archive-list, .mf-blogkit-related, .mf-blogkit-prevnext, .mf-blogkit-head-stats { grid-template-columns:1fr; }
  .mf-blogkit-home-grid .mf-blogkit-card:first-child { grid-column:auto; }
  .mf-blogkit-archive[data-view-mode=list] .mf-blogkit-archive-item, .mf-blogkit-timeline-item { grid-template-columns:1fr; }
  .mf-blogkit-timeline { padding-left:18px; }
  .mf-blogkit-timeline-item img { border-radius:8px 8px 0 0; }
}
</style>";*/
        }

        private static string SocialLinksTemplate(string align = "left")
        {
            var extra = string.Equals(align, "right", StringComparison.OrdinalIgnoreCase) ? " mf-blogkit-social-right" : string.Empty;
            return "<nav class=\"mf-blogkit-social-links" + extra + "\" aria-label=\"Social links\">" +
                   "<a data-mflv-stop=\"1\" href=\"{{field:canonical_url|format=plain}}\" aria-label=\"Open canonical link\"><i class=\"fa-solid fa-link\" aria-hidden=\"true\"></i><span>Canonical</span></a>" +
                   "<a data-mflv-stop=\"1\" href=\"https://www.linkedin.com/shareArticle?mini=true&amp;url={{field:canonical_url|format=plain}}&amp;title={{field:title|format=plain}}\" target=\"_blank\" rel=\"noopener noreferrer\" aria-label=\"Share on LinkedIn\"><i class=\"fa-brands fa-linkedin-in\" aria-hidden=\"true\"></i><span>LinkedIn</span></a>" +
                   "<a data-mflv-stop=\"1\" href=\"https://twitter.com/intent/tweet?text={{field:title|format=plain}}&amp;url={{field:canonical_url|format=plain}}\" target=\"_blank\" rel=\"noopener noreferrer\" aria-label=\"Share on X\"><i class=\"fa-brands fa-x-twitter\" aria-hidden=\"true\"></i><span>Share</span></a>" +
                   "<a data-mflv-stop=\"1\" href=\"mailto:?subject={{field:title|format=plain}}&amp;body={{field:canonical_url|format=plain}}\" aria-label=\"Share by email\"><i class=\"fa-solid fa-envelope\" aria-hidden=\"true\"></i><span>Email</span></a>" +
                   "</nav>";
        }

        private static string AcmeHomePostTemplate()
        {
            return string.Join("\n", new[]
            {
                "<article class=\"mf-acme-popular-card group bg-card rounded-2xl border overflow-hidden hover:shadow-lg transition-all duration-300\" data-mf-acme-item=\"1\" data-mf-acme-category=\"{{field:category|format=plain}}\" data-mf-acme-status=\"{{submission:status|format=plain}}\" " + DetailNavigateAttributes() + ">",
                "  <div class=\"mf-acme-popular-card-grid grid\">",
                "    <div class=\"relative overflow-hidden aspect-video\">",
                "      <img src=\"{{field:featured_image_url|format=plain}}\" alt=\"{{field:image_alt_text|format=plain}}\" class=\"absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition-transform duration-500\" />",
                "      <div class=\"absolute top-3 left-3\"><span class=\"inline-flex items-center gap-1 px-2 py-1 rounded-full bg-orange-500 text-white text-xs font-medium\"><i class=\"fa-solid fa-fire h-3 w-3\" aria-hidden=\"true\"></i> Trending</span></div>",
                "    </div>",
                "    <div class=\"p-6\">",
                "      <div class=\"flex items-center gap-2 mb-3\"><span class=\"px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium\">{{field:category}}</span><span class=\"text-xs text-muted-foreground flex items-center gap-1\"><i class=\"fa-regular fa-clock h-3 w-3\" aria-hidden=\"true\"></i> {{field:reading_time}} min</span></div>",
                "      <h3 class=\"font-bold mb-2 group-hover:text-primary transition-colors line-clamp-2 text-lg\"><a data-mflv-stop=\"1\" href=\"?vk=blog-detail&amp;mfid={{submission:id}}\">{{field:title}}</a></h3>",
                "      <p class=\"text-muted-foreground text-sm mb-4 line-clamp-2\">{{field:excerpt}}</p>",
                "      <div class=\"flex items-center justify-between pt-4 border-t\">",
                "        <div class=\"flex items-center gap-2\"><span class=\"h-8 w-8 rounded-full bg-primary/10 text-primary grid place-items-center text-xs font-bold\">MF</span><div><p class=\"text-sm font-medium\">{{field:author_name}}</p><p class=\"text-xs text-muted-foreground\">{{field:publish_date_label}}</p></div></div>",
                "        <div class=\"flex items-center gap-3 text-xs text-muted-foreground\"><span class=\"flex items-center gap-1\"><i class=\"fa-solid fa-eye h-3.5 w-3.5\" aria-hidden=\"true\"></i>{{field:view_count}}</span><span class=\"flex items-center gap-1\"><i class=\"fa-regular fa-comment h-3.5 w-3.5\" aria-hidden=\"true\"></i>{{field:comment_count}}</span></div>",
                "      </div>",
                "    </div>",
                "  </div>",
                "</article>"
            });
        }

        private static string BlogCardTemplate()
        {
            return string.Join("\n", new[]
            {
                "<article class=\"mf-blogkit-card\" data-mf-blogkit-item=\"1\" data-mf-blogkit-category=\"{{field:category|format=plain}}\" data-mf-blogkit-status=\"{{submission:status|format=plain}}\" " + DetailNavigateAttributes() + ">",
                "  <div class=\"mf-blogkit-card-media\"><img src=\"{{field:featured_image_url|format=plain}}\" alt=\"{{field:image_alt_text|format=plain}}\" /><span class=\"mf-blogkit-trend-badge\"><i class=\"fa-solid fa-arrow-trend-up\" aria-hidden=\"true\"></i>Trending</span></div>",
                "  <div class=\"mf-blogkit-card-body\">",
                "    <div class=\"mf-blogkit-card-meta\"><span class=\"mf-blogkit-category\">{{field:category}}</span><span>{{field:publish_date|format=yyyy-MM-dd}}</span><span>{{field:reading_time}} min read</span></div>",
                "    <h3>{{field:title}}</h3>",
                "    <p>{{field:excerpt}}</p>",
                "    <div class=\"mf-blogkit-card-meta\"><span>{{field:author_name}}</span><span>{{field:content_type}}</span><span>{{field:audience}}</span></div>",
                "    <div class=\"mf-blogkit-metrics\"><span><i class=\"fa-solid fa-eye\" aria-hidden=\"true\"></i>{{field:view_count}}</span><span><i class=\"fa-solid fa-user-group\" aria-hidden=\"true\"></i>{{field:unique_readers}}</span><span><i class=\"fa-solid fa-comment\" aria-hidden=\"true\"></i>{{field:comment_count}}</span><span><i class=\"fa-solid fa-share-nodes\" aria-hidden=\"true\"></i>{{field:share_count}}</span></div>",
                "    " + SocialLinksTemplate(),
                "    <div class=\"mf-blogkit-card-actions\"><button type=\"button\" data-mflv-stop=\"1\" data-mf-blogkit-toggle=\"bookmark\" aria-label=\"Bookmark post\" aria-pressed=\"false\"><i class=\"fa-regular fa-bookmark\" aria-hidden=\"true\"></i></button><button type=\"button\" data-mflv-stop=\"1\" data-mf-blogkit-toggle=\"like\" data-mf-blogkit-counter=\".mf-blogkit-card-like-count\" aria-label=\"Like post\" aria-pressed=\"false\"><i class=\"fa-regular fa-heart\" aria-hidden=\"true\"></i><span class=\"mf-blogkit-card-like-count\">{{field:share_count}}</span></button></div>",
                "  </div>",
                "</article>"
            });
        }

        private static string CardRowTemplate()
        {
            return AcmeHomePostTemplate();
        }

        private static string ArticleDetailTemplate()
        {
            return AcmeDetailTemplate();
        }

        private static string AcmeDetailTemplate(int commentsFormId = 0)
        {
            var template = string.Join("\n", new[]
            {
                AcmeBlogCssMarker(),
                @"<div class=""mf-acme-blog min-h-screen bg-background"">
  <div class=""border-b""><div class=""mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-4""><nav class=""flex items-center gap-2 text-sm text-muted-foreground""><a data-mflv-stop=""1"" href=""?vk=blog-home"" class=""hover:text-primary"">Blog</a><i class=""fa-solid fa-chevron-right h-4 w-4"" aria-hidden=""true""></i><a data-mflv-stop=""1"" href=""?vk=blog-archive"" class=""hover:text-primary"">{{field:category}}</a><i class=""fa-solid fa-chevron-right h-4 w-4"" aria-hidden=""true""></i><span class=""truncate max-w-[200px]"">{{field:title}}</span></nav></div></div>
  <header class=""py-12 lg:py-16"">
    <div class=""mx-auto max-w-4xl px-4 sm:px-6 lg:px-8"">
      <div class=""flex flex-wrap items-center gap-3 mb-6""><a data-mflv-stop=""1"" href=""?vk=blog-archive"" class=""px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"">{{field:category}}</a><span class=""flex items-center gap-1 text-sm text-muted-foreground""><i class=""fa-regular fa-calendar h-4 w-4"" aria-hidden=""true""></i>{{field:publish_date_full_label}}</span><span class=""flex items-center gap-1 text-sm text-muted-foreground""><i class=""fa-regular fa-clock h-4 w-4"" aria-hidden=""true""></i>{{field:reading_time}} min read</span></div>
      <h1 class=""text-3xl lg:text-5xl font-bold tracking-tight mb-4"">{{field:title}}</h1>
      <p class=""text-xl text-muted-foreground mb-8"">{{field:subtitle}}</p>
      <div class=""flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-8 border-b"">
        <div class=""flex items-center gap-4""><img src=""{{field:author_avatar_url|format=plain}}"" alt=""{{field:author_name|format=plain}}"" class=""h-14 w-14 rounded-full object-cover"" /><div><p class=""font-semibold"">{{field:author_name}}</p><p class=""text-sm text-muted-foreground"">{{field:author_role}}</p></div><button data-mflv-stop=""1"" type=""button"" class=""ml-2 inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground h-8 px-3"">Follow</button></div>
        <div class=""flex items-center gap-2""><button data-mflv-stop=""1"" data-mf-acme-toggle=""like"" data-mf-acme-counter="".mf-acme-detail-like-count"" type=""button"" class=""inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-md text-sm font-medium transition-all border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground h-8 px-3""><i class=""fa-regular fa-heart h-4 w-4"" aria-hidden=""true""></i><span class=""mf-acme-detail-like-count"">{{field:share_count}}</span></button><button data-mflv-stop=""1"" data-mf-acme-toggle=""bookmark"" type=""button"" class=""inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground h-8 px-3""><i class=""fa-regular fa-bookmark h-4 w-4"" aria-hidden=""true""></i></button><a data-mflv-stop=""1"" href=""https://twitter.com/intent/tweet?text={{field:title|format=plain}}&amp;url={{field:canonical_url|format=plain}}"" target=""_blank"" rel=""noopener noreferrer"" class=""inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-md text-sm font-medium transition-all border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground h-8 px-3""><i class=""fa-solid fa-share-nodes h-4 w-4"" aria-hidden=""true""></i>Share</a></div>
      </div>
    </div>
  </header>
  <div class=""mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 mb-12""><div class=""relative aspect-[16/9] rounded-2xl overflow-hidden""><img src=""{{field:featured_image_url|format=plain}}"" alt=""{{field:image_alt_text|format=plain}}"" class=""absolute inset-0 h-full w-full object-cover"" /></div></div>
  <article class=""mx-auto max-w-4xl px-4 sm:px-6 lg:px-8"">
    <div class=""flex gap-8"">
      <aside class=""hidden lg:block w-12 shrink-0""><div class=""sticky top-24 space-y-3""><a data-mflv-stop=""1"" href=""https://twitter.com/intent/tweet?text={{field:title|format=plain}}&amp;url={{field:canonical_url|format=plain}}"" target=""_blank"" rel=""noopener noreferrer"" class=""w-10 h-10 rounded-full border flex items-center justify-center hover:bg-muted hover:border-primary transition-colors""><i class=""fa-brands fa-x-twitter h-4 w-4"" aria-hidden=""true""></i></a><a data-mflv-stop=""1"" href=""https://www.facebook.com/sharer/sharer.php?u={{field:canonical_url|format=plain}}"" target=""_blank"" rel=""noopener noreferrer"" class=""w-10 h-10 rounded-full border flex items-center justify-center hover:bg-muted hover:border-primary transition-colors""><i class=""fa-brands fa-facebook-f h-4 w-4"" aria-hidden=""true""></i></a><a data-mflv-stop=""1"" href=""https://www.linkedin.com/shareArticle?mini=true&amp;url={{field:canonical_url|format=plain}}&amp;title={{field:title|format=plain}}"" target=""_blank"" rel=""noopener noreferrer"" class=""w-10 h-10 rounded-full border flex items-center justify-center hover:bg-muted hover:border-primary transition-colors""><i class=""fa-brands fa-linkedin-in h-4 w-4"" aria-hidden=""true""></i></a><a data-mflv-stop=""1"" href=""{{field:canonical_url|format=plain}}"" class=""w-10 h-10 rounded-full border flex items-center justify-center hover:bg-muted hover:border-primary transition-colors""><i class=""fa-solid fa-link h-4 w-4"" aria-hidden=""true""></i></a></div></aside>
      <div class=""flex-1 min-w-0"">
        <div class=""prose prose-lg dark:prose-invert max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-h2:text-2xl prose-h2:mt-12 prose-h2:mb-4 prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3 prose-p:text-muted-foreground prose-p:leading-relaxed prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-blockquote:border-l-primary prose-blockquote:bg-muted/30 prose-blockquote:py-4 prose-blockquote:px-6 prose-blockquote:rounded-r-lg prose-blockquote:not-italic prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-pre:bg-foreground prose-pre:text-background prose-img:rounded-xl prose-figcaption:text-center prose-figcaption:text-sm prose-figcaption:text-muted-foreground prose-li:text-muted-foreground prose-strong:text-foreground"">{{field:body}}</div>
        <div class=""mt-12 pt-8 border-t""><h3 class=""font-semibold mb-4"">Tags</h3><div class=""flex flex-wrap gap-2""><a data-mflv-stop=""1"" href=""#"" class=""px-3 py-1.5 rounded-full bg-muted text-sm hover:bg-primary hover:text-primary-foreground transition-colors"">#{{field:tags}}</a></div></div>
        <div class=""mt-8 p-4 bg-muted/30 rounded-xl lg:hidden""><p class=""text-sm font-medium mb-3"">Share this article</p><div class=""flex items-center gap-2""><a data-mflv-stop=""1"" href=""https://twitter.com/intent/tweet?text={{field:title|format=plain}}&amp;url={{field:canonical_url|format=plain}}"" class=""flex-1 gap-2 inline-flex items-center justify-center rounded-md text-sm font-medium border bg-background h-8 px-3"">Twitter</a><a data-mflv-stop=""1"" href=""https://www.facebook.com/sharer/sharer.php?u={{field:canonical_url|format=plain}}"" class=""flex-1 gap-2 inline-flex items-center justify-center rounded-md text-sm font-medium border bg-background h-8 px-3"">Facebook</a><a data-mflv-stop=""1"" href=""https://www.linkedin.com/shareArticle?mini=true&amp;url={{field:canonical_url|format=plain}}&amp;title={{field:title|format=plain}}"" class=""flex-1 gap-2 inline-flex items-center justify-center rounded-md text-sm font-medium border bg-background h-8 px-3"">LinkedIn</a></div></div>
        <div class=""mt-12 p-6 bg-muted/30 rounded-2xl""><div class=""flex flex-col sm:flex-row gap-6""><img src=""{{field:author_avatar_url|format=plain}}"" alt=""{{field:author_name|format=plain}}"" class=""h-20 w-20 rounded-full object-cover"" /><div class=""flex-1""><div class=""flex items-center gap-2 mb-1""><h3 class=""font-bold text-lg"">{{field:author_name}}</h3><span class=""px-2 py-0.5 rounded bg-primary/10 text-primary text-xs font-medium"">Author</span></div><p class=""text-sm text-muted-foreground mb-3"">{{field:author_bio}}</p><div class=""flex items-center gap-4""><span class=""text-sm text-muted-foreground"">{{field:author_followers}} followers</span><button data-mflv-stop=""1"" type=""button"" class=""inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground h-8 px-3"">Follow</button></div></div></div></div>
      </div>
    </div>
  </article>
  <section class=""mt-16 py-12 border-t bg-muted/20""><div class=""mx-auto max-w-4xl px-4 sm:px-6 lg:px-8""><h2 class=""text-2xl font-bold mb-8 flex items-center gap-2""><i class=""fa-regular fa-comment h-6 w-6"" aria-hidden=""true""></i>Comments ({{field:comment_count}})</h2><div class=""bg-card rounded-xl border p-6 mb-8"" data-mflv-stop=""1"" data-mf-blogkit-comment-shell=""1"" data-mf-blogkit-comment-form=""__MF_COMMENTS_FORM_ID__"" data-mf-blogkit-post-uid=""{{field:post_uid|format=plain}}"" data-mf-blogkit-post-slug=""{{field:slug|format=plain}}""><h3 class=""font-semibold mb-4"">Leave a comment</h3><div class=""grid sm:grid-cols-2 gap-3 mb-3""><input data-mf-blogkit-comment-name=""1"" type=""text"" placeholder=""Your name"" class=""border-input placeholder:text-muted-foreground h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none"" /><input data-mf-blogkit-comment-email=""1"" type=""email"" placeholder=""Email (optional)"" class=""border-input placeholder:text-muted-foreground h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none"" /></div><textarea data-mf-blogkit-comment-body=""1"" placeholder=""Share your thoughts..."" class=""border-input placeholder:text-muted-foreground flex min-h-[100px] w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none md:text-sm mb-4""></textarea><div class=""flex items-center justify-between gap-3 flex-wrap""><p data-mf-blogkit-comment-status=""1"" class=""text-sm text-muted-foreground"">Comments are saved in the Blog Comments child form and linked by Post Unique ID.</p><button data-mf-blogkit-comment-submit=""1"" type=""button"" class=""inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground h-9 px-4 py-2"">Post Comment</button></div></div><div class=""space-y-6"" data-mf-blogkit-comment-list=""1""><div class=""bg-card rounded-xl border p-6""><div class=""flex gap-4""><img src=""https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&amp;h=100&amp;fit=crop"" alt=""Alex Rivera"" class=""h-11 w-11 rounded-full object-cover shrink-0"" /><div class=""flex-1 min-w-0""><div class=""flex items-center gap-2 mb-2""><span class=""font-semibold"">Alex Rivera</span><span class=""text-sm text-muted-foreground"">2 hours ago</span></div><p class=""text-muted-foreground mb-3"">This is exactly what our team needed to read. We have been struggling with scaling our design system and the section on tokens really clarified our approach.</p><div class=""flex items-center gap-4""><button data-mflv-stop=""1"" type=""button"" class=""flex items-center gap-1 text-sm text-muted-foreground hover:text-primary""><i class=""fa-regular fa-thumbs-up h-4 w-4"" aria-hidden=""true""></i>24</button><button data-mflv-stop=""1"" type=""button"" class=""flex items-center gap-1 text-sm text-muted-foreground hover:text-primary""><i class=""fa-solid fa-reply h-4 w-4"" aria-hidden=""true""></i>Reply</button></div><div class=""mt-4 space-y-4 pl-4 border-l-2""><div class=""flex gap-3""><img src=""{{field:author_avatar_url|format=plain}}"" alt=""{{field:author_name|format=plain}}"" class=""h-9 w-9 rounded-full object-cover shrink-0"" /><div class=""flex-1""><div class=""flex items-center gap-2 mb-1""><span class=""font-semibold text-sm"">{{field:author_name}}</span><span class=""px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-medium"">Author</span><span class=""text-xs text-muted-foreground"">1 hour ago</span></div><p class=""text-sm text-muted-foreground"">Thanks Alex! Tokens are definitely the foundation. Happy to chat more about your specific challenges.</p></div></div></div></div></div></div><div class=""bg-card rounded-xl border p-6""><div class=""flex gap-4""><img src=""https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&amp;h=100&amp;fit=crop"" alt=""Maria Santos"" class=""h-11 w-11 rounded-full object-cover shrink-0"" /><div class=""flex-1 min-w-0""><div class=""flex items-center gap-2 mb-2""><span class=""font-semibold"">Maria Santos</span><span class=""text-sm text-muted-foreground"">5 hours ago</span></div><p class=""text-muted-foreground mb-3"">The AI section is fascinating. Do you have any recommendations for tools that are already implementing this kind of intelligent assistance?</p><div class=""flex items-center gap-4""><button data-mflv-stop=""1"" type=""button"" class=""flex items-center gap-1 text-sm text-muted-foreground hover:text-primary""><i class=""fa-regular fa-thumbs-up h-4 w-4"" aria-hidden=""true""></i>15</button><button data-mflv-stop=""1"" type=""button"" class=""flex items-center gap-1 text-sm text-muted-foreground hover:text-primary""><i class=""fa-solid fa-reply h-4 w-4"" aria-hidden=""true""></i>Reply</button></div></div></div></div><div class=""bg-card rounded-xl border p-6""><div class=""flex gap-4""><img src=""https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&amp;h=100&amp;fit=crop"" alt=""James Park"" class=""h-11 w-11 rounded-full object-cover shrink-0"" /><div class=""flex-1 min-w-0""><div class=""flex items-center gap-2 mb-2""><span class=""font-semibold"">James Park</span><span class=""text-sm text-muted-foreground"">8 hours ago</span></div><p class=""text-muted-foreground mb-3"">Great article! One thing I would add is the importance of versioning strategies. It is often overlooked but critical for enterprise adoption.</p><div class=""flex items-center gap-4""><button data-mflv-stop=""1"" type=""button"" class=""flex items-center gap-1 text-sm text-muted-foreground hover:text-primary""><i class=""fa-regular fa-thumbs-up h-4 w-4"" aria-hidden=""true""></i>32</button><button data-mflv-stop=""1"" type=""button"" class=""flex items-center gap-1 text-sm text-muted-foreground hover:text-primary""><i class=""fa-solid fa-reply h-4 w-4"" aria-hidden=""true""></i>Reply</button></div></div></div></div></div><div class=""text-center mt-8""><button data-mflv-stop=""1"" type=""button"" class=""inline-flex items-center justify-center rounded-md text-sm font-medium border bg-background h-9 px-4 py-2"">Load More Comments</button></div></div></section>
  <section class=""py-16 border-t""><div class=""mx-auto max-w-7xl px-4 sm:px-6 lg:px-8""><h2 class=""text-2xl font-bold mb-8"">Related Articles</h2><div class=""grid md:grid-cols-3 gap-6""><article class=""group bg-card rounded-xl border overflow-hidden hover:shadow-lg transition-all""><div class=""relative aspect-[4/3]""><img src=""https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=400&amp;h=300&amp;fit=crop"" alt=""Related post"" class=""absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"" /><div class=""absolute top-3 left-3""><span class=""px-2 py-1 rounded-full bg-background/90 backdrop-blur text-xs font-medium"">Development</span></div></div><div class=""p-5""><div class=""flex items-center gap-2 text-xs text-muted-foreground mb-2""><i class=""fa-regular fa-clock h-3 w-3"" aria-hidden=""true""></i>8 min</div><h3 class=""font-semibold group-hover:text-primary transition-colors line-clamp-2""><a data-mflv-stop=""1"" href=""?vk=blog-detail&amp;slug=understanding-react-server-components"">Building Component Libraries with React and TypeScript</a></h3></div></article><article class=""group bg-card rounded-xl border overflow-hidden hover:shadow-lg transition-all""><div class=""relative aspect-[4/3]""><img src=""https://images.unsplash.com/photo-1561070791-2526d30994b5?w=400&amp;h=300&amp;fit=crop"" alt=""Related post"" class=""absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"" /><div class=""absolute top-3 left-3""><span class=""px-2 py-1 rounded-full bg-background/90 backdrop-blur text-xs font-medium"">Design</span></div></div><div class=""p-5""><div class=""flex items-center gap-2 text-xs text-muted-foreground mb-2""><i class=""fa-regular fa-clock h-3 w-3"" aria-hidden=""true""></i>6 min</div><h3 class=""font-semibold group-hover:text-primary transition-colors line-clamp-2""><a data-mflv-stop=""1"" href=""?vk=blog-detail&amp;slug=psychology-of-color-digital-products"">Design Tokens: The Foundation of Scalable Systems</a></h3></div></article><article class=""group bg-card rounded-xl border overflow-hidden hover:shadow-lg transition-all""><div class=""relative aspect-[4/3]""><img src=""https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=400&amp;h=300&amp;fit=crop"" alt=""Related post"" class=""absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"" /><div class=""absolute top-3 left-3""><span class=""px-2 py-1 rounded-full bg-background/90 backdrop-blur text-xs font-medium"">Accessibility</span></div></div><div class=""p-5""><div class=""flex items-center gap-2 text-xs text-muted-foreground mb-2""><i class=""fa-regular fa-clock h-3 w-3"" aria-hidden=""true""></i>10 min</div><h3 class=""font-semibold group-hover:text-primary transition-colors line-clamp-2""><a data-mflv-stop=""1"" href=""?vk=blog-detail&amp;slug=building-accessible-components-from-scratch"">Accessibility in Modern Design Systems</a></h3></div></article></div></div></section>
  <section class=""border-t py-8""><div class=""mx-auto max-w-4xl px-4 sm:px-6 lg:px-8""><div class=""flex items-center justify-between""><a data-mflv-stop=""1"" href=""?vk=blog-archive"" class=""group flex items-center gap-3 text-muted-foreground hover:text-primary""><i class=""fa-solid fa-arrow-left h-5 w-5 group-hover:-translate-x-1 transition-transform"" aria-hidden=""true""></i><div class=""text-right""><span class=""text-xs uppercase tracking-wider"">Previous</span><p class=""font-medium text-foreground text-sm"">Building Component Libraries</p></div></a><a data-mflv-stop=""1"" href=""?vk=blog-recent"" class=""group flex items-center gap-3 text-muted-foreground hover:text-primary""><div><span class=""text-xs uppercase tracking-wider"">Next</span><p class=""font-medium text-foreground text-sm"">Design Tokens Guide</p></div><i class=""fa-solid fa-arrow-right h-5 w-5 group-hover:translate-x-1 transition-transform"" aria-hidden=""true""></i></a></div></div></section>
</div>"
            });
            return template.Replace("__MF_COMMENTS_FORM_ID__", commentsFormId.ToString(CultureInfo.InvariantCulture));
        }

        private static List<AppStarterSampleRecord> BuildBlogSamples()
        {
            var today = DateTime.UtcNow.Date;
            var mockMonth = new DateTime(2024, 12, 15);
            var posts = new List<BlogPostSeed>();
            AddPost(posts, "The Future of Design Systems: Building for Scale and Consistency", "future-design-systems-scale-consistency", "Design", true, "published", mockMonth, 365, "#b91c1c", "#f87171", "design-systems", "scale", "consistency");
            AddPost(posts, "Understanding React Server Components: A Complete Guide", "understanding-react-server-components", "Development", false, "published", new DateTime(2024, 12, 12), 362, "#1d4ed8", "#38bdf8", "react", "server-components", "typescript");
            AddPost(posts, "AI-Powered UX: Designing for Intelligence", "ai-powered-ux-designing-for-intelligence", "AI/ML", false, "published", new DateTime(2024, 12, 10), 360, "#6d28d9", "#a78bfa", "ai", "ux", "research");
            AddPost(posts, "The Psychology of Color in Digital Products", "psychology-of-color-digital-products", "Design", false, "published", new DateTime(2024, 12, 8), 358, "#be123c", "#fb7185", "color", "psychology", "product");
            AddPost(posts, "Building Accessible Components from Scratch", "building-accessible-components-from-scratch", "Accessibility", false, "published", new DateTime(2024, 12, 5), 355, "#0f766e", "#5eead4", "accessibility", "components", "wcag");
            AddPost(posts, "TypeScript Best Practices for Large Codebases", "typescript-best-practices-large-codebases", "Development", false, "published", new DateTime(2024, 12, 3), 353, "#164e63", "#22d3ee", "typescript", "architecture", "codebases");
            AddPost(posts, "Micro-Interactions That Delight Users", "micro-interactions-that-delight-users", "UX", false, "published", new DateTime(2024, 12, 1), 351, "#7c3aed", "#f472b6", "animation", "ux", "interactions");
            AddPost(posts, "State Management in 2024: A Comprehensive Comparison", "state-management-2024-comparison", "Development", false, "published", new DateTime(2024, 11, 28), 348, "#334155", "#14b8a6", "state-management", "react", "frontend");
            AddPost(posts, "Performance Optimization Techniques for Next.js", "performance-optimization-nextjs", "Development", false, "draft", new DateTime(2024, 12, 8), 349, "#0f172a", "#38bdf8", "performance", "nextjs", "optimization");
            AddPost(posts, "The Art of Code Review", "art-of-code-review", "Engineering", false, "draft", new DateTime(2024, 12, 5), 350, "#14532d", "#86efac", "code-review", "engineering", "quality");

            AddPost(posts, "A Practical Guide to Blog Governance", "practical-guide-blog-governance", "Leadership", false, "in_review", today.AddDays(2), 2, "#155e75", "#67e8f9", "security", "governance", "audit");
            AddPost(posts, "Using Queries to Power Public Archives", "queries-power-public-archives", "Product Updates", false, "in_review", today.AddDays(3), 3, "#4338ca", "#a5b4fc", "integration", "sql", "automation");
            AddPost(posts, "Customer Story: Faster Policy Publishing", "customer-story-policy-publishing", "Customer Stories", false, "in_review", today.AddDays(5), 5, "#166534", "#86efac", "customer-story", "policy", "publishing");
            AddPost(posts, "Reusable Views for Content Teams", "reusable-views-content-teams", "Product Updates", false, "in_review", today.AddDays(7), 7, "#92400e", "#fbbf24", "views", "content", "builder");

            AddPost(posts, "SEO Metadata That Editors Actually Use", "seo-metadata-editors-use", "Product Updates", false, "seo_review", today.AddDays(9), 9, "#0f172a", "#2dd4bf", "seo", "metadata", "publishing");
            AddPost(posts, "Turning Attachments Into Editorial Assets", "attachments-editorial-assets", "Company News", false, "seo_review", today.AddDays(10), 10, "#5b21b6", "#c084fc", "assets", "images", "governance");
            AddPost(posts, "Structured Content as a Business Workflow", "structured-content-business-workflow", "Leadership", false, "seo_review", today.AddDays(12), 12, "#14532d", "#22c55e", "workflow", "content", "strategy");

            AddPost(posts, "Legal Review for Public Claims", "legal-review-public-claims", "Security", false, "legal_review", today.AddDays(13), 13, "#7f1d1d", "#fb923c", "legal", "claims", "review");
            AddPost(posts, "Privacy-Friendly Content Operations", "privacy-friendly-content-operations", "Security", false, "legal_review", today.AddDays(14), 14, "#312e81", "#38bdf8", "privacy", "governance", "publishing");
            AddPost(posts, "Disclosure Patterns for Sponsored Posts", "disclosure-patterns-sponsored-posts", "Leadership", false, "legal_review", today.AddDays(15), 15, "#854d0e", "#fde047", "disclosure", "sponsored", "compliance");

            AddPost(posts, "Launch Brief: App Builder Workspaces", "launch-brief-app-builder-workspaces", "Product Updates", false, "ready_to_publish", today.AddDays(15), 15, "#1e40af", "#93c5fd", "launch", "workspace", "builder");
            AddPost(posts, "Authoring Patterns for Review Teams", "authoring-patterns-review-teams", "Engineering", false, "ready_to_publish", today.AddDays(16), 16, "#065f46", "#6ee7b7", "authors", "review", "patterns");

            AddPost(posts, "June Release Notes for App Builders", "june-release-notes-app-builders", "Product Updates", false, "scheduled", today.AddDays(16), 16, "#1e3a8a", "#60a5fa", "release", "builder", "apps");
            AddPost(posts, "Behind the Scenes of Starter Templates", "behind-starter-templates", "Company News", false, "scheduled", today.AddDays(21), 21, "#7f1d1d", "#f87171", "templates", "qa", "starter");
            AddPost(posts, "Customer Story: Content Ops at Scale", "content-ops-at-scale", "Customer Stories", false, "scheduled", today.AddDays(28), 28, "#115e59", "#5eead4", "customer-story", "content-ops", "scale");
            AddPost(posts, "Event Recap: Building With MegaForm", "event-recap-building-with-megaform", "Events", false, "scheduled", today.AddDays(32), 32, "#581c87", "#e879f9", "event", "community", "builder");

            AddPost(posts, "Draft: Measuring Reader Intent", "draft-measuring-reader-intent", "Product Updates", false, "draft", today.AddDays(34), 34, "#374151", "#9ca3af", "analytics", "draft", "readers");
            AddPost(posts, "Draft: A Better Author Handoff", "draft-better-author-handoff", "Leadership", false, "draft", today.AddDays(38), 38, "#713f12", "#facc15", "authors", "handoff", "process");
            AddPost(posts, "Draft: Archive Filters That Make Sense", "draft-archive-filters", "Product Updates", false, "draft", today.AddDays(41), 41, "#312e81", "#818cf8", "archive", "filters", "query");
            AddPost(posts, "Draft: Permission Patterns for Public Content", "draft-permission-patterns-public-content", "Company News", false, "draft", today.AddDays(45), 45, "#881337", "#fb7185", "permissions", "public", "security");
            AddPost(posts, "Draft: Multilingual Publishing Notes", "draft-multilingual-publishing-notes", "Product Updates", false, "draft", today.AddDays(48), 48, "#0f766e", "#99f6e4", "translation", "language", "localization");
            AddPost(posts, "Draft: Series Planning for Content Teams", "draft-series-planning-content-teams", "Leadership", false, "draft", today.AddDays(52), 52, "#4c1d95", "#c4b5fd", "series", "calendar", "planning");

            AddPost(posts, "Archived: Early Template Packaging Notes", "archived-template-packaging-notes", "Engineering", false, "archived", today.AddDays(-120), 120, "#475569", "#94a3b8", "archived", "templates", "notes");
            AddPost(posts, "Archived: Legacy Form Embed Guidance", "archived-legacy-form-embed-guidance", "Company News", false, "archived", today.AddDays(-180), 180, "#78350f", "#fbbf24", "archived", "embed", "legacy");

            var samples = new List<AppStarterSampleRecord>();
            for (var i = 0; i < posts.Count; i++)
            {
                var post = posts[i];
                var includeUpload = i < 8;
                samples.Add(new AppStarterSampleRecord
                {
                    AuthorRoleName = BlogAuthorRole,
                    FinalStatus = post.Status,
                    DaysAgo = post.Offset,
                    InsertDirectly = post.Status == "draft" || post.Status == "archived",
                    BackdateOpenTask = post.Status == "in_review" || post.Status == "seo_review" || post.Status == "legal_review" || post.Status == "ready_to_publish",
                    WorkflowApproverRoleNames = WorkflowApproversFor(post.Status),
                    BuildData = author => BuildPostData(post, author),
                    BuildAttachments = formId => includeUpload
                        ? new[] { StarterSeedAttachmentFactory.CreateSvgAttachment(formId, BlogImageField, post.Slug + "-hero.svg", post.Title, post.BackgroundColor, post.AccentColor) }
                        : new StarterSeedAttachment[0]
                });
            }
            return samples;
        }

        private static List<AppStarterSampleRecord> BuildBlogCategorySamples()
        {
            var categories = new[]
            {
                new { Name = "Design", Slug = "design", Color = "#b4535f", Owner = BlogEditorRole, Sort = 10 },
                new { Name = "Development", Slug = "development", Color = "#2563eb", Owner = BlogEditorRole, Sort = 20 },
                new { Name = "AI/ML", Slug = "ai-ml", Color = "#7c3aed", Owner = BlogEditorRole, Sort = 30 },
                new { Name = "Accessibility", Slug = "accessibility", Color = "#0f766e", Owner = BlogEditorRole, Sort = 40 },
                new { Name = "UX", Slug = "ux", Color = "#c026d3", Owner = BlogEditorRole, Sort = 50 },
                new { Name = "Product Updates", Slug = "product-updates", Color = "#1d4ed8", Owner = BlogPublisherRole, Sort = 60 },
                new { Name = "Customer Stories", Slug = "customer-stories", Color = "#166534", Owner = BlogPublisherRole, Sort = 70 },
                new { Name = "Security", Slug = "security", Color = "#991b1b", Owner = BlogLegalRole, Sort = 80 },
                new { Name = "Leadership", Slug = "leadership", Color = "#854d0e", Owner = BlogPublisherRole, Sort = 90 },
                new { Name = "Engineering", Slug = "engineering", Color = "#164e63", Owner = BlogEditorRole, Sort = 100 },
                new { Name = "Company News", Slug = "company-news", Color = "#881337", Owner = BlogPublisherRole, Sort = 110 },
                new { Name = "Events", Slug = "events", Color = "#581c87", Owner = BlogPublisherRole, Sort = 120 }
            };

            return categories.Select(cat => new AppStarterSampleRecord
            {
                AuthorRoleName = BlogPublisherRole,
                FinalStatus = "Active",
                InsertDirectly = true,
                DaysAgo = cat.Sort,
                BuildData = _ => new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase)
                {
                    ["category_uid"] = CategoryKeyFor(cat.Name),
                    ["category_name"] = cat.Name,
                    ["category_slug"] = cat.Slug,
                    ["description"] = cat.Name + " articles and editorial operations.",
                    ["accent_color"] = cat.Color,
                    ["sort_order"] = cat.Sort,
                    ["is_public"] = "true",
                    ["owner_role"] = cat.Owner
                }
            }).ToList();
        }

        private static IEnumerable<Dictionary<string, object>> BuildBlogCommentRows(Dictionary<string, object> parent, StarterSeedUserProjection author)
        {
            var count = ToInt(GetValue(parent, "comment_count"));
            if (count <= 0)
                yield break;

            var postUid = Convert.ToString(GetValue(parent, "post_uid")) ?? string.Empty;
            var slug = Convert.ToString(GetValue(parent, "slug")) ?? string.Empty;
            var title = Convert.ToString(GetValue(parent, "title")) ?? "this article";
            var latestAuthor = Convert.ToString(GetValue(parent, "latest_comment_author")) ?? "Reader";
            var latest = Convert.ToString(GetValue(parent, "latest_comment_excerpt")) ?? "Useful article.";
            var rows = Math.Min(3, Math.Max(1, count));
            for (var i = 0; i < rows; i++)
            {
                var name = i == 0 ? latestAuthor : CommentAuthorFor(slug.Length + i);
                yield return new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase)
                {
                    ["comment_uid"] = "COM-" + Math.Abs((slug + i).GetHashCode()).ToString("00000", CultureInfo.InvariantCulture),
                    ["post_uid"] = postUid,
                    ["post_slug"] = slug,
                    ["parent_comment_id"] = i == 2 ? 1 : 0,
                    ["commenter_name"] = name,
                    ["commenter_email"] = Slugify(name) + "@example.local",
                    ["cms_user_id"] = i == 2 ? author.UserId : 0,
                    ["comment_body"] = i == 0 ? latest : "Related comment sample for " + title + ".",
                    ["moderation_status"] = i == 0 && count > 60 ? "pending" : "approved",
                    ["like_count"] = Math.Max(1, (count / (i + 2))),
                    ["posted_on"] = DateTime.UtcNow.Date.AddDays(-(i + 1)).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)
                };
            }
        }

        private static IEnumerable<Dictionary<string, object>> BuildBlogReaderEventRows(Dictionary<string, object> parent, StarterSeedUserProjection author)
        {
            var postUid = Convert.ToString(GetValue(parent, "post_uid")) ?? string.Empty;
            var slug = Convert.ToString(GetValue(parent, "slug")) ?? string.Empty;
            var reads = ToInt(GetValue(parent, "view_count"));
            if (reads <= 0)
                yield break;

            var events = new[] { "read", "unique_reader", "share", "like", "bookmark", "newsletter_click" };
            for (var i = 0; i < events.Length; i++)
            {
                yield return new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase)
                {
                    ["event_uid"] = "EVT-" + Math.Abs((slug + events[i]).GetHashCode()).ToString("000000", CultureInfo.InvariantCulture),
                    ["post_uid"] = postUid,
                    ["post_slug"] = slug,
                    ["event_type"] = events[i],
                    ["cms_user_id"] = i % 2 == 0 ? author.UserId : 0,
                    ["visitor_key"] = "visitor-" + Math.Abs((slug + i).GetHashCode()).ToString("0000", CultureInfo.InvariantCulture),
                    ["engagement_seconds"] = Math.Max(10, ToInt(GetValue(parent, "average_engagement_seconds")) - (i * 7)),
                    ["referrer"] = i == 0 ? "direct" : i == 1 ? "newsletter" : "social",
                    ["event_date"] = DateTime.UtcNow.Date.AddDays(-i).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)
                };
            }
        }

        private static List<string> WorkflowApproversFor(string status)
        {
            if (status == "seo_review") return new List<string> { BlogEditorRole };
            if (status == "legal_review") return new List<string> { BlogEditorRole, BlogSeoRole };
            if (status == "ready_to_publish") return new List<string> { BlogEditorRole, BlogSeoRole, BlogLegalRole };
            if (status == "published" || status == "scheduled") return new List<string> { BlogEditorRole, BlogSeoRole, BlogLegalRole, BlogPublisherRole };
            return new List<string>();
        }

        private static Dictionary<string, object> BuildPostData(BlogPostSeed post, StarterSeedUserProjection author)
        {
            var contentType = ContentTypeFor(post);
            var audience = AudienceFor(post);
            var campaign = CampaignFor(post);
            var image = ImageFor(post);
            var needsLegal = post.Status == "legal_review" || post.Status == "ready_to_publish" || post.Status == "published" || post.Status == "scheduled";
            var isDistributionReady = post.Status == "published" || post.Status == "scheduled";
            var allowComments = post.Category != "Security" && post.Status != "archived";
            var engagement = EngagementFor(post, allowComments);
            var publishDateLabel = post.PublishDateUtc.ToString("MMM d, yyyy", CultureInfo.InvariantCulture);
            var publishDateFullLabel = post.PublishDateUtc.ToString("MMMM d, yyyy", CultureInfo.InvariantCulture);
            var lastCommentedOnLabel = engagement.LastCommentedOnUtc.HasValue
                ? engagement.LastCommentedOnUtc.Value.ToString("MMM d, yyyy", CultureInfo.InvariantCulture)
                : string.Empty;

            return new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase)
            {
                ["title"] = post.Title,
                ["slug"] = post.Slug,
                ["subtitle"] = SubtitleFor(post),
                ["excerpt"] = ExcerptFor(post),
                ["featured_image_url"] = image,
                ["og_image_url"] = image,
                ["image_alt_text"] = "Editorial illustration for " + post.Title,
                ["media_caption"] = "Generated starter image for the MegaForm Blog app.",
                ["body"] = BodyHtml(post.Title, post.Category),
                ["content_type"] = contentType,
                ["category"] = post.Category,
                ["category_uid"] = CategoryKeyFor(post.Category),
                ["tags"] = string.Join(", ", post.Tags),
                ["audience"] = audience,
                ["language"] = "en-US",
                ["series"] = SeriesFor(post),
                ["campaign"] = campaign,
                ["author_name"] = AuthorNameFor(post, author),
                ["author_email"] = author.Email,
                ["author_avatar_url"] = AuthorAvatarFor(post),
                ["author_role"] = AuthorRoleFor(post),
                ["author_bio"] = AuthorBioFor(post),
                ["author_followers"] = AuthorFollowersFor(post),
                ["content_owner"] = OwnerFor(post),
                ["publish_date"] = post.PublishDateUtc.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                ["publish_date_label"] = publishDateLabel,
                ["publish_date_full_label"] = publishDateFullLabel,
                ["embargo_until"] = post.PublishDateUtc.AddDays(-2).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                ["expiry_date"] = post.PublishDateUtc.AddMonths(6).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                ["status"] = post.Status,
                ["recent_order"] = RecentOrderFor(post),
                ["recent_group_heading_html"] = RecentGroupHeadingHtmlFor(post),
                ["recent_title"] = RecentTitleFor(post),
                ["recent_excerpt"] = RecentExcerptFor(post),
                ["recent_status"] = RecentStatusFor(post),
                ["recent_status_label"] = ToTitle(RecentStatusFor(post)),
                ["recent_status_class"] = RecentStatusClassFor(post),
                ["recent_time_label"] = RecentTimeLabelFor(post),
                ["recent_metrics_html"] = RecentMetricsHtmlFor(post),
                ["is_featured"] = post.Featured ? "true" : "false",
                ["newsletter_featured"] = (isDistributionReady && (post.Featured || post.Offset % 2 == 0)) ? "true" : "false",
                ["rss_enabled"] = isDistributionReady ? "true" : "false",
                ["allow_comments"] = allowComments ? "true" : "false",
                ["view_count"] = engagement.ViewCount,
                ["unique_readers"] = engagement.UniqueReaders,
                ["comment_count"] = engagement.CommentCount,
                ["share_count"] = engagement.ShareCount,
                ["average_engagement_seconds"] = engagement.AverageEngagementSeconds,
                ["comment_moderation_state"] = engagement.ModerationState,
                ["last_commented_on"] = engagement.LastCommentedOnUtc.HasValue ? engagement.LastCommentedOnUtc.Value.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) : string.Empty,
                ["last_commented_on_label"] = lastCommentedOnLabel,
                ["latest_comment_author"] = engagement.LatestCommentAuthor,
                ["latest_comment_excerpt"] = engagement.LatestCommentExcerpt,
                ["sample_comments_json"] = BuildCommentsJson(post, engagement),
                ["seo_title"] = post.Title + " | MegaForm Blog",
                ["seo_description"] = "Learn how MegaForm supports " + post.Category.ToLowerInvariant() + " publishing with reusable views, workflow review, and app-builder structure.",
                ["meta_keywords"] = string.Join(", ", post.Tags),
                ["canonical_url"] = "/blog/" + post.Slug,
                ["social_title"] = post.Title,
                ["social_description"] = "A MegaForm Blog starter sample for " + post.Category.ToLowerInvariant() + " teams.",
                ["reading_time"] = ReadingTimeFor(post),
                ["editorial_priority"] = post.Featured || post.Status == "ready_to_publish" ? "High" : "Normal",
                ["legal_review_required"] = needsLegal ? "true" : "false",
                ["compliance_notes"] = needsLegal ? "Check claims, screenshots, customer names, and outbound links before publish." : "Standard editorial review.",
                ["revision_summary"] = "Seeded starter article with complete content metadata and workflow state.",
                ["moderation_status"] = post.Status == "archived" ? "Closed" : "Open",
                ["editor_notes"] = "Use this sample to validate Blog app queries, views, permissions, and workflow inbox routing."
            };
        }

        private static BlogEngagementSeed EngagementFor(BlogPostSeed post, bool allowComments)
        {
            var mockEngagement = MockEngagementFor(post, allowComments);
            if (mockEngagement != null) return mockEngagement;

            var isPublic = post.Status == "published" || post.Status == "scheduled";
            var isPublished = post.Status == "published";
            var baseViews = isPublished
                ? 900 + (post.Offset * 41) + (post.Title.Length * 17)
                : isPublic
                    ? 140 + (post.Offset * 7)
                    : post.Status == "draft" || post.Status == "archived"
                        ? 18 + (post.Offset % 13)
                        : 65 + (post.Offset * 3);
            if (post.Featured) baseViews += 860;

            var comments = allowComments && isPublished
                ? 4 + (post.Offset % 8) + (post.Featured ? 9 : 0)
                : allowComments && post.Status == "scheduled"
                    ? 1 + (post.Offset % 3)
                    : 0;

            var moderation = !allowComments
                ? (post.Status == "archived" ? "Archived" : "Locked")
                : comments >= 14
                    ? "Review Queue"
                    : "Open";

            return new BlogEngagementSeed
            {
                ViewCount = baseViews,
                UniqueReaders = Math.Max(1, (int)Math.Round(baseViews * 0.64d)),
                CommentCount = comments,
                ShareCount = isPublic ? Math.Max(0, (baseViews / 18) + (post.Featured ? 22 : 0)) : 0,
                AverageEngagementSeconds = isPublic ? 95 + (post.Offset % 6) * 18 : 42 + (post.Offset % 5) * 9,
                ModerationState = moderation,
                LastCommentedOnUtc = comments > 0 ? post.PublishDateUtc.AddDays(Math.Min(5, Math.Max(1, post.Offset % 7))) : (DateTime?)null,
                LatestCommentAuthor = comments > 0 ? CommentAuthorFor(post.Offset) : string.Empty,
                LatestCommentExcerpt = comments > 0 ? LatestCommentFor(post) : string.Empty
            };
        }

        private static string ImageFor(BlogPostSeed post)
        {
            var image = MockImageFor(post.Slug);
            return !string.IsNullOrWhiteSpace(image)
                ? image
                : InlineImage(post.Title, post.BackgroundColor, post.AccentColor);
        }

        private static string MockImageFor(string slug)
        {
            switch (slug)
            {
                case "future-design-systems-scale-consistency": return "https://images.unsplash.com/photo-1558655146-9f40138edfeb?w=1600&h=900&fit=crop";
                case "understanding-react-server-components": return "https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=600&h=400&fit=crop";
                case "ai-powered-ux-designing-for-intelligence": return "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=600&h=400&fit=crop";
                case "psychology-of-color-digital-products": return "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=600&h=400&fit=crop";
                case "building-accessible-components-from-scratch": return "https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=600&h=400&fit=crop";
                case "typescript-best-practices-large-codebases": return "https://images.unsplash.com/photo-1516116216624-53e697fedbea?w=600&h=400&fit=crop";
                case "micro-interactions-that-delight-users": return "https://images.unsplash.com/photo-1561070791-2526d30994b5?w=600&h=400&fit=crop";
                case "state-management-2024-comparison": return "https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?w=600&h=400&fit=crop";
                case "performance-optimization-nextjs": return "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&h=400&fit=crop";
                case "art-of-code-review": return "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=600&h=400&fit=crop";
                default: return null;
            }
        }

        private static string SubtitleFor(BlogPostSeed post)
        {
            if (post.Slug == "future-design-systems-scale-consistency")
                return "A comprehensive exploration of modern design systems and their evolution";

            return "A complete MegaForm-powered publishing workflow sample.";
        }

        private static string ExcerptFor(BlogPostSeed post)
        {
            switch (post.Slug)
            {
                case "future-design-systems-scale-consistency": return "Explore how modern design systems are evolving to meet the demands of enterprise applications, multi-platform experiences, and global teams.";
                case "understanding-react-server-components": return "A deep dive into RSC architecture and how it changes the way we think about React applications.";
                case "ai-powered-ux-designing-for-intelligence": return "How artificial intelligence is reshaping user experience design principles and methodologies.";
                case "psychology-of-color-digital-products": return "Research-backed insights on how color choices affect user behavior and conversion rates.";
                case "building-accessible-components-from-scratch": return "A comprehensive guide to creating WCAG-compliant UI components for modern web applications.";
                case "typescript-best-practices-large-codebases": return "Essential patterns and practices for managing TypeScript in enterprise-scale applications.";
                case "micro-interactions-that-delight-users": return "Learn how small animations and feedback can dramatically improve user experience.";
                case "state-management-2024-comparison": return "Comparing Redux, Zustand, Jotai, and other popular state management solutions.";
                default: return "A starter article showing how MegaForm can model content, workflow, named views, and public publishing surfaces inside one app.";
            }
        }

        private static int RecentOrderFor(BlogPostSeed post)
        {
            switch (post.Slug)
            {
                case "future-design-systems-scale-consistency": return 1;
                case "understanding-react-server-components": return 2;
                case "ai-powered-ux-designing-for-intelligence": return 3;
                case "psychology-of-color-digital-products": return 4;
                case "building-accessible-components-from-scratch": return 5;
                case "typescript-best-practices-large-codebases": return 6;
                case "micro-interactions-that-delight-users": return 7;
                case "state-management-2024-comparison": return 8;
                case "performance-optimization-nextjs": return 9;
                case "art-of-code-review": return 10;
                default: return 0;
            }
        }

        private static string RecentGroupHeadingHtmlFor(BlogPostSeed post)
        {
            var order = RecentOrderFor(post);
            string label;
            string count;
            string icon;
            string marginClass = "mt-10";

            switch (order)
            {
                case 1:
                    label = "Today";
                    count = "2 articles";
                    icon = "fa-regular fa-calendar";
                    marginClass = "mt-0";
                    break;
                case 3:
                    label = "Yesterday";
                    count = "3 articles";
                    icon = "fa-regular fa-clock";
                    break;
                case 6:
                    label = "This Week";
                    count = "3 articles";
                    icon = "fa-solid fa-calendar-week";
                    break;
                case 9:
                    label = "Earlier";
                    count = "2 articles";
                    icon = "fa-solid fa-box-archive";
                    break;
                default:
                    return string.Empty;
            }

            return "<div class=\"flex items-center gap-3 mb-4 " + marginClass + "\"><div class=\"h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center\"><i class=\"" + icon + " h-5 w-5 text-primary\" aria-hidden=\"true\"></i></div><div><h2 class=\"text-xl font-bold\">" + label + "</h2><p class=\"text-sm text-muted-foreground\">" + count + "</p></div></div>";
        }

        private static string RecentTitleFor(BlogPostSeed post)
        {
            switch (post.Slug)
            {
                case "future-design-systems-scale-consistency": return "The Future of Design Systems: Building for Scale";
                case "understanding-react-server-components": return "Understanding React Server Components";
                case "state-management-2024-comparison": return "State Management in 2024: A Comprehensive Guide";
                default: return post.Title;
            }
        }

        private static string RecentExcerptFor(BlogPostSeed post)
        {
            switch (post.Slug)
            {
                case "future-design-systems-scale-consistency": return "Explore how modern design systems are evolving to meet enterprise demands.";
                case "understanding-react-server-components": return "A deep dive into RSC architecture and how it changes React apps.";
                case "ai-powered-ux-designing-for-intelligence": return "How artificial intelligence is reshaping user experience design.";
                case "psychology-of-color-digital-products": return "Research-backed insights on how color affects user behavior.";
                case "building-accessible-components-from-scratch": return "A comprehensive guide to creating WCAG-compliant UI components.";
                case "typescript-best-practices-large-codebases": return "Essential patterns for managing TypeScript in enterprise apps.";
                case "micro-interactions-that-delight-users": return "Learn how small animations improve user experience.";
                case "state-management-2024-comparison": return "Comparing Redux, Zustand, Jotai, and other solutions.";
                case "performance-optimization-nextjs": return "Advanced strategies for building lightning-fast applications.";
                case "art-of-code-review": return "How to give and receive feedback that improves code quality.";
                default: return ExcerptFor(post);
            }
        }

        private static string RecentStatusFor(BlogPostSeed post)
        {
            switch (post.Slug)
            {
                case "building-accessible-components-from-scratch": return "draft";
                case "state-management-2024-comparison": return "scheduled";
                default:
                    return RecentOrderFor(post) > 0 ? "published" : post.Status;
            }
        }

        private static string RecentStatusClassFor(BlogPostSeed post)
        {
            switch (RecentStatusFor(post))
            {
                case "draft": return "px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-yellow-100 text-yellow-700";
                case "scheduled": return "px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-blue-100 text-blue-700";
                default: return "px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-green-100 text-green-700";
            }
        }

        private static string RecentTimeLabelFor(BlogPostSeed post)
        {
            switch (post.Slug)
            {
                case "future-design-systems-scale-consistency": return "Today, 10:30 AM";
                case "understanding-react-server-components": return "Today, 8:15 AM";
                case "ai-powered-ux-designing-for-intelligence": return "Yesterday, 4:20 PM";
                case "psychology-of-color-digital-products": return "Yesterday, 11:00 AM";
                case "building-accessible-components-from-scratch": return "Yesterday, 9:45 AM";
                case "typescript-best-practices-large-codebases": return "Dec 13, 2024";
                case "micro-interactions-that-delight-users": return "Dec 12, 2024";
                case "state-management-2024-comparison": return "Dec 11, 2024";
                case "performance-optimization-nextjs": return "Dec 8, 2024";
                case "art-of-code-review": return "Dec 5, 2024";
                default: return post.PublishDateUtc.ToString("MMM d, yyyy", CultureInfo.InvariantCulture);
            }
        }

        private static string RecentMetricsHtmlFor(BlogPostSeed post)
        {
            var status = RecentStatusFor(post);
            if (status == "draft")
                return "<span class=\"text-xs text-muted-foreground italic\">Not published yet</span>";
            if (status == "scheduled")
                return "<span class=\"text-xs text-muted-foreground italic\">Scheduled for later</span>";

            string views;
            string likes;
            string comments;
            switch (post.Slug)
            {
                case "future-design-systems-scale-consistency": views = "1.5k"; likes = "89"; comments = "24"; break;
                case "understanding-react-server-components": views = "982"; likes = "67"; comments = "18"; break;
                case "ai-powered-ux-designing-for-intelligence": views = "2.3k"; likes = "145"; comments = "32"; break;
                case "psychology-of-color-digital-products": views = "1.9k"; likes = "98"; comments = "15"; break;
                case "typescript-best-practices-large-codebases": views = "3.4k"; likes = "178"; comments = "41"; break;
                case "micro-interactions-that-delight-users": views = "2.9k"; likes = "134"; comments = "23"; break;
                case "performance-optimization-nextjs": views = "5.7k"; likes = "289"; comments = "67"; break;
                case "art-of-code-review": views = "4.2k"; likes = "198"; comments = "52"; break;
                default: views = "1.1k"; likes = "48"; comments = "12"; break;
            }

            return "<div class=\"flex items-center gap-3 text-xs text-muted-foreground\"><span class=\"flex items-center gap-1\"><i class=\"fa-solid fa-eye h-3 w-3\" aria-hidden=\"true\"></i>" + views + "</span><span class=\"flex items-center gap-1\"><i class=\"fa-regular fa-heart h-3 w-3\" aria-hidden=\"true\"></i>" + likes + "</span><span class=\"flex items-center gap-1\"><i class=\"fa-regular fa-comment h-3 w-3\" aria-hidden=\"true\"></i>" + comments + "</span></div>";
        }

        private static string AuthorAvatarFor(BlogPostSeed post)
        {
            switch (post.Slug)
            {
                case "future-design-systems-scale-consistency": return "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop";
                case "understanding-react-server-components": return "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop";
                case "ai-powered-ux-designing-for-intelligence": return "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop";
                case "psychology-of-color-digital-products": return "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=200&fit=crop";
                case "building-accessible-components-from-scratch": return "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&h=200&fit=crop";
                case "typescript-best-practices-large-codebases": return "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop";
                case "micro-interactions-that-delight-users": return "https://images.unsplash.com/photo-1544723795-3fb6469f5b39?w=200&h=200&fit=crop";
                case "state-management-2024-comparison": return "https://images.unsplash.com/photo-1519345182560-3f2917c472ef?w=200&h=200&fit=crop";
                case "performance-optimization-nextjs": return "https://images.unsplash.com/photo-1519345182560-3f2917c472ef?w=200&h=200&fit=crop";
                case "art-of-code-review": return "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200&h=200&fit=crop";
                default: return "https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=200&h=200&fit=crop";
            }
        }

        private static string AuthorRoleFor(BlogPostSeed post)
        {
            switch (post.Slug)
            {
                case "future-design-systems-scale-consistency": return "Design Lead at TechCorp";
                case "understanding-react-server-components": return "Senior Frontend Architect";
                case "ai-powered-ux-designing-for-intelligence": return "AI Product Designer";
                case "psychology-of-color-digital-products": return "Product Design Researcher";
                case "building-accessible-components-from-scratch": return "Accessibility Engineer";
                case "typescript-best-practices-large-codebases": return "Principal TypeScript Engineer";
                case "performance-optimization-nextjs": return "Performance Engineer";
                case "art-of-code-review": return "Engineering Manager";
                default: return OwnerFor(post);
            }
        }

        private static string AuthorBioFor(BlogPostSeed post)
        {
            if (post.Slug == "future-design-systems-scale-consistency")
                return "Sarah is a design systems expert with 10+ years of experience building scalable UI frameworks for enterprise products.";

            return "This author writes about practical content operations, reusable app templates, and governed publishing workflows.";
        }

        private static int AuthorFollowersFor(BlogPostSeed post)
        {
            if (post.Slug == "future-design-systems-scale-consistency") return 12400;
            return Math.Max(1200, EngagementFor(post, true).UniqueReaders);
        }

        private static string AuthorNameFor(BlogPostSeed post, StarterSeedUserProjection author)
        {
            switch (post.Slug)
            {
                case "future-design-systems-scale-consistency": return "Sarah Chen";
                case "understanding-react-server-components": return "Michael Torres";
                case "ai-powered-ux-designing-for-intelligence": return "Emily Watson";
                case "psychology-of-color-digital-products": return "David Kim";
                case "building-accessible-components-from-scratch": return "Anna Lee";
                case "typescript-best-practices-large-codebases": return "James Wilson";
                case "micro-interactions-that-delight-users": return "Sophie Martin";
                case "state-management-2024-comparison": return "Chris Johnson";
                case "performance-optimization-nextjs": return "Ryan Peters";
                case "art-of-code-review": return "Lisa Chen";
                default: return author.DisplayName;
            }
        }

        private static int ReadingTimeFor(BlogPostSeed post)
        {
            switch (post.Slug)
            {
                case "future-design-systems-scale-consistency": return 12;
                case "understanding-react-server-components": return 8;
                case "ai-powered-ux-designing-for-intelligence": return 10;
                case "psychology-of-color-digital-products": return 6;
                case "building-accessible-components-from-scratch": return 15;
                case "typescript-best-practices-large-codebases": return 11;
                case "micro-interactions-that-delight-users": return 7;
                case "state-management-2024-comparison": return 14;
                case "performance-optimization-nextjs": return 9;
                case "art-of-code-review": return 6;
                default: return 4 + (post.Offset % 5);
            }
        }

        private static BlogEngagementSeed MockEngagementFor(BlogPostSeed post, bool allowComments)
        {
            int views;
            int comments;
            int shares;
            switch (post.Slug)
            {
                case "future-design-systems-scale-consistency": views = 15420; comments = 89; shares = 234; break;
                case "understanding-react-server-components": views = 12300; comments = 67; shares = 189; break;
                case "ai-powered-ux-designing-for-intelligence": views = 9870; comments = 45; shares = 156; break;
                case "psychology-of-color-digital-products": views = 8540; comments = 32; shares = 128; break;
                case "building-accessible-components-from-scratch": views = 7650; comments = 28; shares = 98; break;
                case "typescript-best-practices-large-codebases": views = 6890; comments = 41; shares = 112; break;
                case "micro-interactions-that-delight-users": views = 5420; comments = 23; shares = 87; break;
                case "state-management-2024-comparison": views = 4980; comments = 56; shares = 145; break;
                default: return null;
            }

            return new BlogEngagementSeed
            {
                ViewCount = views,
                UniqueReaders = Math.Max(1, (int)Math.Round(views * 0.64d)),
                CommentCount = allowComments ? comments : 0,
                ShareCount = shares,
                AverageEngagementSeconds = 210,
                ModerationState = allowComments ? (comments > 60 ? "Review Queue" : "Open") : "Locked",
                LastCommentedOnUtc = allowComments ? post.PublishDateUtc.AddDays(1) : (DateTime?)null,
                LatestCommentAuthor = allowComments ? CommentAuthorFor(post.Offset) : string.Empty,
                LatestCommentExcerpt = allowComments ? LatestCommentFor(post) : string.Empty
            };
        }

        private static string BuildCommentsJson(BlogPostSeed post, BlogEngagementSeed engagement)
        {
            if (engagement.CommentCount <= 0)
                return "[]";

            var count = Math.Min(4, engagement.CommentCount);
            var rows = new List<object>();
            for (var i = 0; i < count; i++)
            {
                rows.Add(new
                {
                    author = CommentAuthorFor(post.Offset + i),
                    postedOn = post.PublishDateUtc.AddDays(i + 1).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                    status = i == 0 && engagement.ModerationState == "Review Queue" ? "needs_review" : "approved",
                    sentiment = i % 3 == 0 ? "positive" : "neutral",
                    body = i == 0 ? LatestCommentFor(post) : "Useful context for teams evaluating " + post.Category.ToLowerInvariant() + " workflows."
                });
            }

            return JsonConvert.SerializeObject(rows, Formatting.Indented);
        }

        private static string CommentAuthorFor(int seed)
        {
            var names = new[] { "Ava Chen", "Minh Tran", "Jordan Lee", "Sam Rivera", "Priya Shah", "Noah Carter", "Linh Pham" };
            return names[Math.Abs(seed) % names.Length];
        }

        private static string LatestCommentFor(BlogPostSeed post)
        {
            if (post.Tags.Contains("workflow")) return "This maps closely to our review process; the queue examples make it easier to explain to editors.";
            if (post.Tags.Contains("security")) return "Helpful governance framing. I would like to see the metadata checklist reused in our launch process.";
            if (post.Tags.Contains("customer-story")) return "Strong customer proof angle. The editorial workflow makes the approvals feel much less abstract.";
            if (post.Tags.Contains("builder")) return "The app-builder framing is clear, especially with public views and internal review boards living together.";
            return "Clear and practical. The sample data gives us enough detail to test a real publishing workflow.";
        }

        private static string ContentTypeFor(BlogPostSeed post)
        {
            if (post.Category == "Customer Stories") return "Customer Story";
            if (post.Category == "Product Updates") return post.Title.IndexOf("Release", StringComparison.OrdinalIgnoreCase) >= 0 ? "Release Notes" : "Guide";
            if (post.Category == "Company News") return "News";
            if (post.Category == "Leadership") return "Opinion";
            return "Blog Post";
        }

        private static string AudienceFor(BlogPostSeed post)
        {
            if (post.Category == "Security") return "Customers";
            if (post.Category == "Leadership") return "Partners";
            if (post.Status == "draft") return "Internal";
            return "Public";
        }

        private static string SeriesFor(BlogPostSeed post)
        {
            if (post.Tags.Contains("workflow")) return "Workflow Patterns";
            if (post.Tags.Contains("security") || post.Tags.Contains("governance")) return "Governed Publishing";
            if (post.Tags.Contains("customer-story")) return "Customer Stories";
            if (post.Tags.Contains("builder")) return "App Builder";
            return "Editorial Operations";
        }

        private static string CampaignFor(BlogPostSeed post)
        {
            if (post.Status == "scheduled" || post.Status == "ready_to_publish") return "Q3 Launch";
            if (post.Category == "Customer Stories") return "Customer Proof";
            if (post.Category == "Security") return "Trust Center";
            return "Evergreen Content";
        }

        private static string OwnerFor(BlogPostSeed post)
        {
            if (post.Category == "Product Updates" || post.Category == "Engineering") return "Product Marketing";
            if (post.Category == "Security") return "Security";
            if (post.Category == "Customer Stories") return "Customer Success";
            return "Corporate Communications";
        }

        private static void AddPost(List<BlogPostSeed> posts, string title, string slug, string category, bool featured, string status, DateTime publishDate, int offset, string background, string accent, params string[] tags)
        {
            posts.Add(new BlogPostSeed
            {
                Title = title,
                Slug = slug,
                Category = category,
                Featured = featured,
                Status = status,
                PublishDateUtc = publishDate,
                Offset = offset,
                BackgroundColor = background,
                AccentColor = accent,
                Tags = (tags ?? new string[0]).ToList()
            });
        }

        private static string BodyHtml(string title, string category)
        {
            if (string.Equals(title, "The Future of Design Systems: Building for Scale and Consistency", StringComparison.Ordinal))
                return DesignSystemsArticleHtml();

            var inlineFigure = InlineArticleFigure(title);
            return string.Join("", new[]
            {
                "<h2>Why this matters</h2>",
                "<p><strong>" + EscapeXml(title) + "</strong> is a sample rich text article for the " + EscapeXml(category) + " channel. It demonstrates headings, paragraphs, links, lists, and editorial metadata without relying on raw JSON as the authoring surface.</p>",
                "<p>A blog app needs public views, author roles, review queues, SEO data, attachments, and a schedule that a team can trust.</p>",
                "<figure><img src=\"" + inlineFigure + "\" alt=\"Content workflow diagram for " + EscapeXml(title) + "\" /><figcaption>Reusable views turn one structured post record into public, archive, recent, and admin experiences.</figcaption></figure>",
                "<blockquote>Great publishing systems make the next action obvious while keeping the underlying process auditable.</blockquote>",
                "<h3>Starter coverage</h3>",
                "<ul><li>Featured image, upload, alt text, caption, and Open Graph image fields.</li><li>Rich text body, subtitle, excerpt, SEO, social, canonical, and keyword metadata.</li><li>Category, tags, audience, language, series, campaign, publish date, embargo, and expiry fields.</li><li>Editorial, SEO, legal, ready-to-publish, scheduled, draft, register, feed, and archive views.</li><li>Newsletter, RSS, comments, moderation, compliance, revision, and internal editor notes.</li></ul>",
                "<h3>Template handoff</h3>",
                "<pre><code>view: blog-detail\nquery: public-posts\nfields: title, body, comments, seo, metrics\nworkflow: draft -> review -> scheduled -> published</code></pre>"
            });
        }

        private static string DesignSystemsArticleHtml()
        {
            return string.Join("", new[]
            {
                "<p class=\"lead\">Design systems have evolved from simple style guides to comprehensive ecosystems that power the world's most successful digital products. But what does the future hold for these essential tools?</p>",
                "<h2>The Evolution of Design Systems</h2>",
                "<p>In the early days of digital design, style guides were static PDF documents that outlined brand colors, typography, and basic UI patterns. Today, design systems are living, breathing codebases that include components, tokens, documentation, and sophisticated tooling.</p>",
                "<p>The shift began with companies like Salesforce (Lightning Design System), Google (Material Design), and Airbnb, who recognized that consistency at scale required more than just documentation; it required shared infrastructure.</p>",
                "<figure><img src=\"https://images.unsplash.com/photo-1561070791-2526d30994b5?w=1200&amp;h=600&amp;fit=crop\" alt=\"Design system components\" /><figcaption>Modern design systems encompass far more than just visual guidelines</figcaption></figure>",
                "<h2>Key Trends Shaping the Future</h2>",
                "<h3>1. AI-Powered Design Assistance</h3>",
                "<p>Artificial intelligence is beginning to augment design systems in fascinating ways. From automated accessibility checking to intelligent component suggestions, AI is helping designers make better decisions faster.</p>",
                "<blockquote><p>&quot;The most exciting aspect of AI in design systems isn't replacement; it's augmentation. AI helps us catch errors we'd miss and explore possibilities we'd never consider.&quot;</p><cite>&mdash; Nathan Curtis, Design Systems Expert</cite></blockquote>",
                "<h3>2. Multi-Platform Convergence</h3>",
                "<p>As products expand across web, mobile, desktop, and emerging platforms like AR/VR, design systems must evolve to provide consistency across radically different contexts.</p>",
                "<p>This means:</p>",
                "<ul><li>Platform-agnostic design tokens that translate across technologies</li><li>Adaptive components that respond intelligently to their context</li><li>Unified documentation that serves developers across all platforms</li></ul>",
                "<h3>3. Community-Driven Development</h3>",
                "<p>The most successful design systems are increasingly open-source and community-driven. This approach brings diverse perspectives, faster innovation, and broader adoption.</p>",
                "<figure><img src=\"https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1200&amp;h=600&amp;fit=crop\" alt=\"Team collaboration\" /><figcaption>Collaboration is at the heart of modern design system development</figcaption></figure>",
                "<h2>Implementation Strategies</h2>",
                "<p>Building a design system that scales requires careful planning and ongoing commitment. Here are the key strategies that leading organizations employ:</p>",
                "<h3>Start with Tokens</h3>",
                "<p>Design tokens are the atomic building blocks of your system. By starting with tokens&mdash;colors, spacing, typography scales&mdash;you create a foundation that can evolve independently of your component library.</p>",
                "<pre><code>// Example token structure\nconst tokens = {\n  colors: {\n    primary: {\n      50: '#eff6ff',\n      500: '#3b82f6',\n      900: '#1e3a8a',\n    }\n  },\n  spacing: {\n    xs: '0.25rem',\n    sm: '0.5rem',\n    md: '1rem',\n    lg: '1.5rem',\n  }\n}</code></pre>",
                "<h3>Document Everything</h3>",
                "<p>Documentation isn't an afterthought; it's a core product. The best design systems treat their docs with the same care they give to their components.</p>",
                "<h2>Measuring Success</h2>",
                "<p>How do you know if your design system is working? Key metrics include:</p>",
                "<ol><li><strong>Adoption rate:</strong> What percentage of your products use the system?</li><li><strong>Contribution frequency:</strong> How often do teams contribute improvements?</li><li><strong>Time to market:</strong> Are teams shipping faster with the system?</li><li><strong>Consistency score:</strong> How consistent are experiences across products?</li></ol>",
                "<h2>Conclusion</h2>",
                "<p>The future of design systems is bright, but it requires us to think beyond components and style guides. The most successful systems will be those that embrace AI assistance, support multi-platform development, and foster vibrant communities.</p>",
                "<p>As you build or evolve your design system, remember that the goal isn't perfection; it's progress. Start small, iterate often, and always keep your users (both designers and developers) at the center of your decisions.</p>"
            });
        }

        private static string InlineArticleFigure(string title)
        {
            var svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"960\" height=\"420\" viewBox=\"0 0 960 420\">"
                + "<rect width=\"960\" height=\"420\" rx=\"26\" fill=\"#f8fafc\"/>"
                + "<rect x=\"54\" y=\"58\" width=\"242\" height=\"304\" rx=\"16\" fill=\"#ffffff\" stroke=\"#d0d5dd\"/>"
                + "<rect x=\"358\" y=\"58\" width=\"242\" height=\"304\" rx=\"16\" fill=\"#ffffff\" stroke=\"#d0d5dd\"/>"
                + "<rect x=\"662\" y=\"58\" width=\"242\" height=\"304\" rx=\"16\" fill=\"#ffffff\" stroke=\"#d0d5dd\"/>"
                + "<text x=\"82\" y=\"112\" font-family=\"Segoe UI,Arial\" font-size=\"24\" font-weight=\"800\" fill=\"#101828\">Create</text>"
                + "<text x=\"386\" y=\"112\" font-family=\"Segoe UI,Arial\" font-size=\"24\" font-weight=\"800\" fill=\"#101828\">Review</text>"
                + "<text x=\"690\" y=\"112\" font-family=\"Segoe UI,Arial\" font-size=\"24\" font-weight=\"800\" fill=\"#101828\">Publish</text>"
                + "<rect x=\"82\" y=\"146\" width=\"172\" height=\"12\" rx=\"6\" fill=\"#14b8a6\"/>"
                + "<rect x=\"386\" y=\"146\" width=\"172\" height=\"12\" rx=\"6\" fill=\"#2563eb\"/>"
                + "<rect x=\"690\" y=\"146\" width=\"172\" height=\"12\" rx=\"6\" fill=\"#f59e0b\"/>"
                + "<text x=\"82\" y=\"218\" font-family=\"Segoe UI,Arial\" font-size=\"16\" fill=\"#475467\">Rich article content</text>"
                + "<text x=\"386\" y=\"218\" font-family=\"Segoe UI,Arial\" font-size=\"16\" fill=\"#475467\">SEO and moderation</text>"
                + "<text x=\"690\" y=\"218\" font-family=\"Segoe UI,Arial\" font-size=\"16\" fill=\"#475467\">Public blog views</text>"
                + "<text x=\"82\" y=\"282\" font-family=\"Segoe UI,Arial\" font-size=\"14\" fill=\"#667085\">" + EscapeXml(ShortTitleForImage(title)) + "</text>"
                + "</svg>";
            return "data:image/svg+xml;charset=utf-8," + Uri.EscapeDataString(svg);
        }

        private static string InlineImage(string title, string backgroundColor, string accentColor)
        {
            var displayTitle = ShortTitleForImage(title);
            var svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1200\" height=\"675\" viewBox=\"0 0 1200 675\">"
                + "<defs><linearGradient id=\"g\" x1=\"0\" x2=\"1\" y1=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"" + backgroundColor + "\"/><stop offset=\"1\" stop-color=\"" + accentColor + "\"/></linearGradient></defs>"
                + "<rect width=\"1200\" height=\"675\" fill=\"url(#g)\"/>"
                + "<rect x=\"88\" y=\"78\" width=\"1024\" height=\"519\" rx=\"36\" fill=\"#ffffff\" opacity=\"0.9\"/>"
                + "<text x=\"136\" y=\"190\" font-family=\"Segoe UI, Arial, sans-serif\" font-size=\"26\" font-weight=\"700\" fill=\"#0f172a\">MegaForm Blog</text>"
                + "<text x=\"136\" y=\"312\" font-family=\"Segoe UI, Arial, sans-serif\" font-size=\"42\" font-weight=\"800\" fill=\"#0f172a\">" + EscapeXml(displayTitle) + "</text>"
                + "<rect x=\"136\" y=\"386\" width=\"350\" height=\"10\" rx=\"5\" fill=\"" + accentColor + "\"/>"
                + "</svg>";
            return "data:image/svg+xml;charset=utf-8," + Uri.EscapeDataString(svg);
        }

        private static string ShortTitleForImage(string title)
        {
            title = title ?? string.Empty;
            return title.Length <= 38 ? title : title.Substring(0, 35) + "...";
        }

        private static string ToTitle(string value)
        {
            var raw = (value ?? string.Empty).Replace("_", " ").Replace("-", " ");
            return CultureInfo.InvariantCulture.TextInfo.ToTitleCase(raw);
        }

        private static string CategoryKeyFor(string category)
        {
            return "CAT-" + Slugify(category).Replace("-", string.Empty).ToUpperInvariant();
        }

        private static string Slugify(string value)
        {
            var raw = (value ?? string.Empty).Trim().ToLowerInvariant();
            var chars = raw.Select(ch => char.IsLetterOrDigit(ch) ? ch : '-').ToArray();
            var slug = new string(chars);
            while (slug.Contains("--")) slug = slug.Replace("--", "-");
            return slug.Trim('-');
        }

        private static object GetValue(Dictionary<string, object> data, string key)
        {
            if (data == null || string.IsNullOrWhiteSpace(key))
                return null;
            return data.TryGetValue(key, out var value) ? value : null;
        }

        private static int ToInt(object value)
        {
            if (value == null)
                return 0;
            if (value is int i)
                return i;
            if (value is long l)
                return (int)l;
            if (int.TryParse(Convert.ToString(value, CultureInfo.InvariantCulture), NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed))
                return parsed;
            return 0;
        }

        private static string EscapeXml(string value)
        {
            if (string.IsNullOrEmpty(value)) return string.Empty;
            return value.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;").Replace("\"", "&quot;").Replace("'", "&apos;");
        }

        private sealed class BlogPostSeed
        {
            public string Title { get; set; } = string.Empty;
            public string Slug { get; set; } = string.Empty;
            public string Category { get; set; } = string.Empty;
            public bool Featured { get; set; }
            public string Status { get; set; } = string.Empty;
            public DateTime PublishDateUtc { get; set; }
            public int Offset { get; set; }
            public string BackgroundColor { get; set; } = string.Empty;
            public string AccentColor { get; set; } = string.Empty;
            public List<string> Tags { get; set; } = new List<string>();
        }

        private sealed class BlogEngagementSeed
        {
            public int ViewCount { get; set; }
            public int UniqueReaders { get; set; }
            public int CommentCount { get; set; }
            public int ShareCount { get; set; }
            public int AverageEngagementSeconds { get; set; }
            public string ModerationState { get; set; } = string.Empty;
            public DateTime? LastCommentedOnUtc { get; set; }
            public string LatestCommentAuthor { get; set; } = string.Empty;
            public string LatestCommentExcerpt { get; set; } = string.Empty;
        }
    }
}
