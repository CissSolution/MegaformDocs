// ============================================================
// MegaForm Core — Starter Platform Adapter
// ----------------------------------------------------------------
// Abstraction that lets the Business Starter services (LeaveRequest,
// Proposal, DocumentExchange, PurchaseOrder) run on both DNN (net472)
// and Oqtane (net9.0) without leaking platform-specific types.
//
// Why this exists:
//   Original Oqtane starter services held a hard reference to
//   IDbContextFactory<MegaFormDbContext> and used it for three things:
//     1. Look up the platform user id by username/email
//        (Submissions.CreatedByUserId FK).
//     2. Wipe prior workflow runtime + submission rows for a form,
//        so a fresh reseed starts from a clean state.
//     3. Persist seeded attachment rows directly into the Files table.
//   DNN cannot reference IDbContextFactory or MegaFormDbContext.
//   This interface captures the 3 concrete operations as
//   platform-neutral methods.
//
// Implementations:
//   - OqtaneStarterPlatformAdapter (MegaForm.Oqtane.Server.Services)
//     wraps IDbContextFactory<MegaFormDbContext> + EF.
//   - DnnStarterPlatformAdapter (MegaForm.DNN.Services) uses
//     DotNetNuke.Entities.Users.UserController + ADO.NET.
// ============================================================

using System.Collections.Generic;

namespace MegaForm.Core.Services.Starters
{
    public interface IStarterPlatformAdapter
    {
        /// <summary>
        /// Resolve the platform user id for a starter role account
        /// (case-insensitive). Returns 0 when no match is found.
        /// Used to populate Submissions.CreatedByUserId on seeded
        /// sample submissions.
        /// </summary>
        int ResolveUserIdByNameOrEmail(string userName, string email);

        /// <summary>
        /// Erase all prior workflow runtime + submission rows for a
        /// given form so the starter can reseed cleanly. The seeded
        /// sample workflow + submissions are recreated by the starter
        /// service after this call. Also clears any seeded file rows.
        /// </summary>
        void ResetFormRuntimeData(int formId);

        /// <summary>
        /// Insert the seeded attachment FileInfo rows for a submission.
        /// The physical PDF files have already been written to disk by
        /// StarterSeedAttachmentFactory.CreatePdfAttachment.
        /// </summary>
        void PersistSeededAttachments(int submissionId, IEnumerable<StarterSeedAttachment> attachments);
    }
}
