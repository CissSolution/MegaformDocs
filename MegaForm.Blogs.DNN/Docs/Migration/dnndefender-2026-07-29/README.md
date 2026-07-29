# DNN Defender MegaForm Blogs migration handoff

Migration date: 2026-07-29  
Target portal: `https://dnndefender.com/`

## Result

- The public `/Blogs` page now renders the MegaForm Blogs Razor module.
- Five legacy articles were migrated to typed MegaForm records and published.
- `/BlogAdmin` is hidden from navigation and its Razor wrapper permits only DNN SuperUsers/Hosts.
- The former `/Blogs` module layout is preserved on the hidden, Administrator-only `/BlogsLegacyBackup` page.
- Public, admin, desktop, and mobile views were checked after deployment.

## Live identifiers

| Item | Value |
| --- | --- |
| Public page | `/Blogs`, TabId `39` |
| Public RazorHost module | ModuleId `22054`, TabModuleId `21754` |
| Public Razor script | `MegaFormBlogs.cshtml` |
| Admin page | `/BlogAdmin`, TabId `1592` |
| Admin RazorHost module | ModuleId `22052`, TabModuleId `21741` |
| Admin Razor script | `MegaFormBlogsAdminHost.cshtml` |
| Rollback page | `/BlogsLegacyBackup`, TabId `1593` |
| MegaForm app | AppId `1`, key `blog-starter` |
| Blog Posts form | FormId `378` |

## Installed packages

The originally supplied MegaForm 2.0.8 package was installed first. DNN already had a higher historical upgrade state, so it skipped the older `01.06.42` database migration. The additive schema migration was therefore repackaged as 2.0.9, followed by the typed-status SDK correction in 2.0.10. Version 2.0.10 is the final live MegaForm version.

| Package | SHA-256 |
| --- | --- |
| `MegaForm.DNN\Install\MegaForm_02.00.010_Install.zip` | `9980105A0E01C9500283CF48F89253AC43E4EF441CF0AFA5C6D83B246DE75FEC` |
| `MegaForm.Blogs.DNN\Install\MegaForm.Blogs.DNN_01.00.004_Install.zip` | `0630D4E73C5A1FB19290A7D7BE9252D74726FD390626A4BB4F4B3F29593F1115` |

MegaForm Blogs 1.0.4 contains the rich HTML editor, managed image/author gallery integration, typed Records API usage, workflow task UI, and the mobile rich-article overflow correction.

## Migrated records

| SubmissionId | Slug | Source | Published date |
| ---: | --- | --- | --- |
| `286` | `standard-dnn-skin-built-for-real-site-work` | HTML module `19031` | `2026-07-29` |
| `291` | `modern-forms-workflow-self-hosted-control` | HTML module `420` | `2026-07-29` |
| `288` | `dnn-and-oqtane` | HTML module `410` | `2026-07-29` |
| `289` | `why-bots-target-forms-including-dnn` | Legacy Blog post `185` | `2026-02-12` |
| `290` | `modern-webshells-2024-2026-minimal-csharp-loaders` | Legacy Blog post `186` | `2026-02-12` |

The HTML-module sources did not expose reliable article dates, so their migration date was used. Legacy Blog posts 185 and 186 retained their source date.

Starter records remain available for development history but are typed as `archived`; they are excluded from the public `published` query.

## Data and API architecture

- Razor files use MegaForm application, record, gallery/file, and workflow SDK APIs.
- Blog fields are read from typed values. Legacy `DataJson` is not used as the Blog read/write surface.
- The public view uses the `published-posts` named query; the admin register uses `all-posts`.
- `AppRecordQueryService` resolves typed values before applying a named-query status filter. `MF_Submissions.Status` remains a transport/workflow status fallback, not the canonical Blog publication field.
- Admin saves article HTML through the Records API. The editor is Quill-based and stores trusted editorial HTML rather than URL-encoded markup.
- Featured images, author images, and article gallery insertion use MegaForm-managed gallery/file data.

During the first migration request, the absence of a browser-like User-Agent and a zero submission duration caused four valid rows to receive a false spam score. After exact ID/form/slug/title verification, only `IsSpam` and `SpamScore` metadata were corrected for submissions `286`, `288`, `289`, and `290`. No typed field value or legacy JSON payload was modified. Submission `291` was recreated through the corrected migration request.

## Permissions

- `/Blogs`: the RazorHost module has `VIEW` permission for DNN role `All Users`.
- `/BlogAdmin`: hidden from navigation. Non-administrator page `VIEW` grants were removed. DNN keeps its built-in Administrator page grant, while `MegaFormBlogsAdminHost.cshtml` independently requires `UserInfo.IsSuperUser`; a non-Host Administrator therefore cannot run the admin UI.
- `/BlogsLegacyBackup`: hidden from navigation and restricted to Administrators. Anonymous requests redirect to Login.

No credential is stored in this handoff or in the migration tool.

## Source backups

| File | SHA-256 |
| --- | --- |
| `Blogs-before.html` | `C3C0125B7D9B9072F376D8C840A20936572D5DD18C02266382E1871C65AAF2B2` |
| `Post-185-before.html` | `AACEF4F118D220EAA438BF3836D3A0556657E8390EB49523DCAF60D40A03FDC0` |
| `Post-186-before.html` | `B93B731A26D84F9751B9EEA844A917CEBB76CED3F2ACCC61FD4FB3B4DAE2DADB` |

All eleven original `/Blogs` module references were copied to TabId `1593` before their references on TabId `39` were soft-deleted.

## Verification completed

- MegaForm SDK tests pass in Release configuration.
- `/Blogs` returns five published migrated stories: one featured story and four cards.
- Starter sample posts do not appear publicly.
- Desktop public and admin layouts have no horizontal overflow or broken images.
- At 390 px, listing cards collapse to one column and rich article/code content remains within the viewport.
- Rich article HTML renders as headings, paragraphs, lists, links, and inline code rather than escaped source.
- `/BlogAdmin` exposes the visual editor, featured-image gallery, author-image gallery, article gallery insertion, Records API save action, workflow tasks, and a 39-record typed content register.
- Anonymous `/BlogAdmin` and `/BlogsLegacyBackup` requests redirect to Login.

## Rollback

1. Keep the current database and package backups; do not delete the typed records.
2. Through DNN Prompt, copy the eleven preserved module references from TabId `1593` back to TabId `39`.
3. Soft-delete only the public MegaForm Blogs module reference (`ModuleId 22054`, `TabModuleId 21754`) from TabId `39`.
4. Clear DNN cache and verify `/Blogs` anonymously.
5. Leave `/BlogAdmin` and `/BlogsLegacyBackup` hidden until the restored page has been approved.

The rollback is reference-based: the original modules were preserved rather than deleted from the portal, so their content remains recoverable.
