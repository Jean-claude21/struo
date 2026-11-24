# 073 — Notifications: the bell, the review notice, per-site targeting, choices, the phone reminder

**Branch**: `073-notifications` (base `dev`) · **Status**: delivered for review

1. **The bell** (office header and field app): every notice a member receives is kept (table
   `notification`, migration `0040`, each person reads and marks only their own under row-level
   security), unread count, newest first, a click marks read and opens the item, « mark all as read »,
   refreshed every minute and on focus. `GET/POST /api/notifications`.
2. **The site lead is told** when the office approves or sends back their report, with the reason
   (from the office screen and from the MCP `review_report`).
3. **Per-site targeting**: field notices go to the owner, the admins and the engineers whose site it
   is (all engineers when the site has no manager).
4. **Choices per person** (Account › Notifications, table `notification_pref`): per kind, phone and/or
   e-mail; defaults per kind (incident, material request, task, payment declared also by e-mail). The
   list shown follows the role. One delivery path (`deliverToMembers`) for tasks, payments declared,
   field ↔ office notices and reviews.
5. **The reminder** to turn the phone on shows on every office page until it is on, or put off 7 days
   (« Later »); the field app keeps its own.
