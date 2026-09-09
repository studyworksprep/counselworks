# Interactive UX/UI review — September 9, 2026

## Scope and method

Reviewed the local application at commit `a6f0a13` using real Clerk development sessions for Olivia (owner), Carl (counselor), Sam (student), and Paula (parent). This was an interactive browser walkthrough with visual inspection, not a source-only assessment or a new automated test run. Desktop windows and a 390 × 844 phone viewport were inspected; the staff workspace was also inspected at approximately 1057 pixels wide.

Used fictional Alpha firm data. Applied the five-step Junior Year Anchors plan to Sam and created a family-visible task assigned to Paula, “Review college budget with Sam.” Completed that parent task and verified the immediate Complete state and Reopen task action. No product code was changed. No messages, bookings, payments, or signatures were submitted.

The assessment covers key navigation, dashboards, staff student workspace, plan assignment, task lists/details, student college/document entry points, contextual messaging entry, and parent booking selection. It is not an exhaustive audit of every feature, a formal accessibility audit, a load/performance test, or usability research with independent participants. Application and essay authoring, file upload, the complete submission/review loop, and multi-child/second-parent behavior remain outside this walkthrough.

## Overall assessment

The visual foundation is professional: consistent navy navigation, restrained purple actions, clear cards, generous spacing, and recognizable headings. The biggest problems are behavioral clarity and information hierarchy rather than a need for a visual redesign. Users should be able to trust “My Tasks,” identify the responsible person immediately, and reach the work promised by a dashboard link.

| Role | What works | Main friction |
| --- | --- | --- |
| Owner | Logical navigation groups; broad operational overview; student search and privacy controls | Staff Management misleadingly presents clients as owners; crowded student workspace; very long settings page |
| Counselor | Workload metrics; reusable plan preview; separate ownership and visibility controls | My Tasks includes other people's work; missing review-state filters; workflow metric opens a template library |
| Student | Friendly welcome; task detail with instructions and next action; My work versus Waiting on others; readable mobile plan | Dashboard calls others' tasks My Tasks; unexplained Retry workflow; some empty states provide no direct next step |
| Parent | Clear owned-task action; prominent agreement notice; visible Book a Meeting link; useful completion/reopen feedback | Billing dominates progress overview; Students opens College Lists; booking confirmation is far below available times |

## Prioritized findings

### 1. Staff Management misrepresents client roles — P1

**Observed:** Owner → Settings → Staff Management lists Paula, Peter, and Sam alongside staff. Their role selectors visibly display Owner. Each row also exposes Remove.

**Impact:** An owner cannot trust the roster and may inadvertently edit a client membership while managing employees. This is a misleading interface finding, not evidence that those clients possess owner permissions. No membership changes were attempted.

**Corroboration:** `web/src/app/(dashboard)/settings/settings-client.tsx` filters members only by active status. The owner-facing select offers staff roles only, with Owner first; it has no option matching parent or student roles.

**Recommendation:** Restrict Staff Management to staff memberships, manage client access separately, and show an explicit safe fallback for an unknown role. Verify that students/parents never appear as editable staff rows.

### 2. Counselor My Tasks shows other people's tasks — P1

**Observed:** At `/tasks`, My Tasks is highlighted, but the list includes Carl's tasks, two Sam-owned tasks, and the Paula-owned task. Clicking My Tasks again does not correct the list.

**Impact:** The counselor cannot reliably determine their own workload.

**Corroboration:** `tasks-client.tsx` treats an absent view parameter as my and removes the parameter when My Tasks is clicked. The page passes the absent value to `getTasks`; `web/src/lib/db/queries.ts` filters the assignee only when view explicitly equals my.

**Recommendation:** Make the default view identical on server and client. Verify with mixed counselor, student, and parent assignments, including a fresh visit without query parameters.

### 3. Staff layouts become cramped at ordinary narrow desktop widths — P1

**Observed:** In the student workspace, main navigation plus the student switcher consume much of a roughly 1057-pixel window. Summary/body columns remain too dense: the balance is clipped, assignment controls overlap, and meeting heading/action text collides. Several section tabs extend beyond the available space. The global task table also pushes student and due-date columns offscreen.

**Impact:** Important information and controls become difficult to read precisely when staff are working with side-by-side windows.

**Recommendation:** Use available-content-width breakpoints, collapse the student switcher earlier, reduce card columns sooner, and keep task due dates visible. Test 1024–1366 pixel windows with navigation expanded. The phone workspace stacks more successfully, but its horizontal section tabs need a clearer scroll affordance.

### 4. Review work is hard to find from Tasks — P2

**Observed:** The status filter offers Pending, In Progress, Completed, and Cancelled. Individual row controls also include Submitted for Review and Changes Requested. The dashboard's needs-review entry is a plain underlined link without a count; the Tasks view has no equivalent prominent review queue control.

**Impact:** New review states exist but are difficult to locate and manage consistently. Pending/To do and Completed/Complete also vary between controls.

**Recommendation:** Add a visible review queue with a count, include every supported state in filtering, and share one vocabulary across lists, details, and dashboards.

### 5. Student dashboard blurs ownership — P2

**Observed:** Sam's dashboard labels all five visible tasks My Tasks and counts them as Open Tasks, including counselor- and parent-owned work. The dedicated task page correctly separates two items under My work and three under Waiting on others.

**Impact:** The landing page suggests Sam must perform work that the detailed view says belongs to somebody else.

**Recommendation:** Reuse the ownership distinction on the dashboard, with personal action counts and a separate waiting section. Replace generic Waiting on owner copy in list rows with an appropriate responsible-person label where visibility permits.

### 6. Retry workflow appears without a problem to recover from — P2

**Observed:** Both a normal student plan task and the standalone parent task show Retry workflow beside Mark complete. The parent task has no plan. Neither page explains an error requiring a retry.

**Corroboration:** `web/src/components/tasks/task-detail-actions.tsx` renders this button unconditionally.

**Impact:** Clients encounter an unexplained technical action alongside their primary action.

**Recommendation:** Show recovery actions only for a relevant recoverable failure and authorized role, with a plain-language explanation. Keep normal client task pages focused on completing, submitting, or asking for help.

### 7. Several navigation labels promise a different destination — P2

**Observed:** Counselor Workflow Steps This Week opens the workflow template catalog rather than this week's steps. Workflows is absent from the counselor sidebar even though the library is accessible. Parent Students opens a page titled College Lists. The counselor dashboard subtitle still says Overview of your counseling firm.

**Recommendation:** Link metrics to matching filtered work, provide consistent access to the plan library, rename the parent entry College Lists or build the promised student overview, and make dashboard copy role-specific.

### 8. Plan preview is useful but difficult to scan — P2

**Observed:** The Junior Year Anchors preview expands all five steps into a narrow modal containing title, instructions, owner, priority, and date controls. Apply and Back are at the bottom of a long scroll. Raw terms such as parent_guardian and Date: start appear in the workflow experience. After applying, the modal closes and the active count changes without a prominent next step to open the student's new plan.

**Recommendation:** Start with a compact step summary, expand individual edits, keep final actions visible, translate internal role/date labels, and offer View student's plan after success. Preserve the valuable owner/date preview and the separation of responsibility from visibility.

### 9. Parent dashboard emphasizes billing over counseling progress — P2

**Observed:** Agreement and invoice sections appear before the child summary, task counts, meetings, and family information. The open-task section appears substantially farther down the page. Notification preferences add another long settings block.

**Recommendation:** Lead with a compact action summary and child progress. Keep signature/payment alerts prominent when action is required, but move detailed invoice history and notification preferences into dedicated destinations. This is an information-hierarchy recommendation, not a finding that the displayed fixture balance is wrong.

### 10. Booking confirmation is too far from the selected time on mobile — P2

**Observed:** The parent booking page lists four Mondays with many time buttons before Confirm. Selecting a time produces a clear summary, optional note, Invite Sam too checkbox, and Confirm booking button, but the confirmation remains below the entire availability list.

**Recommendation:** Show one day/week at a time or reveal a nearby/sticky selection summary with Continue. Display a friendly timezone label. The early-morning fixture availability was not treated as a scheduling bug. No booking was submitted.

## Additional polish

- Move personal preferences and availability out of the owner's long mixed settings page. Separate firm, team, agreements, and personal settings.
- Student College List says the counselor will help but provides no contextual contact action. Add Ask my counselor or an equivalent next step. Student Documents does provide a prominent Upload Document action.
- The task-to-message link successfully opens a prefilled composer, but its body includes a raw task path. Prefer a readable task reference. No message was sent.
- Student plan progress distinguishes My work from Overall, which is useful. In the sample, Overall counts five steps while only four are visible. Briefly explain that overall progress can include private staff work without exposing it.
- Normalize capitalization and client-facing terms such as medium, not started, workflows, and the raw timezone identifier.
- Preserve the clean mobile student plan layout and the parent task's immediate completion feedback with a Reopen option.

## Recommended next implementation sequence

1. Correct staff/client role presentation and the My Tasks default filter.
2. Repair staff workspace/table responsiveness and unify task/review-state filtering.
3. Align dashboard ownership, navigation destinations, and task recovery controls.
4. Improve plan preview, parent dashboard hierarchy, and mobile booking progression.

Retest each change with the same four roles and fictional records. In a separate acceptance pass, exercise a populated essay/document submission, changes requested, resubmission, approval, and dependent next step, plus multi-child and second-parent behavior.

## Environment limits

Local email delivery and Stripe are not configured, and background delivery was not evaluated. No conclusions about production payment processing, email delivery, reminder timing, security isolation, or load performance are implied. Sparse colleges, applications, essays, documents, and meetings limit assessment of populated states. The staff workspace's No portal account notice may depend on fixture invitation records despite the linked Clerk identity; it is not classified here as a confirmed product defect.
