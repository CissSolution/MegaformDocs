# Approval workflows on Umbraco

An approval task pauses a workflow until an authorized user claims, approves, rejects, forwards, or comments on the task. The selected outcome then follows the corresponding BPMN path.

## Build an approval path

1. Open **Workflow** for the form.
2. In the simple editor, add **Approval**, or add a **User Task** in Advanced BPMN.
3. Configure candidate roles or candidate users.
4. Set the due time and the submission status for approved and rejected outcomes.
5. Connect both outcomes to the intended next steps.
6. Validate, test, and apply the workflow.

## Assignment behavior

| Configuration | Result |
|---|---|
| One candidate user | The task is assigned directly to that user |
| Several candidate users | The task remains available for an eligible user to claim |
| Candidate role | Eligible members share a role queue until one claims it |

Workflow identity uses the authenticated Umbraco identity plus the roles available to MegaForm's workflow directory. Create the required users and role mappings before applying the workflow, then test with a non-administrator account.

## Work with an approval

Open the submission from **MegaForm → Submissions**. The detail surface shows responses plus **Details**, **History**, and **Workflow** information when the submission has a workflow task.

- **Claim** reserves a shared task for the current user.
- **Approve** completes the approved outcome.
- **Reject** completes the rejected outcome and may require a comment.
- **Forward** assigns the task to another eligible user.
- **Comment** records context without completing the task.

Every action is recorded in history. After an approval, MegaForm resumes at the next BPMN node and may create another approval task.

## Email and due dates

Task email requires **MegaForm → Settings → Email Settings**. A missing mail configuration does not prevent the task from existing, but the assignee may not receive a notification.

Use due times for operational visibility and escalation. Test overdue behavior in a non-production workflow before relying on it for a service-level commitment.

## Troubleshooting

If a user cannot see or claim a task, verify the applied workflow version, candidate role spelling, the user's resolved roles, and that the task has not already been claimed. Administrators can inspect the workflow history from the submission to see its current node and assignee.
