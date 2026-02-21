---
"sr2-t3": patch
---

feat(claims): add document status indicators and warnings

**Admin Panel:**
- Show document count badge on all claims (desktop + mobile)
- Display "0" for claims without documents (muted color)
- Unified Badge format across desktop and mobile views

**User Experience:**
- Alert during claim creation warning about document importance
- Explain that verification without documents requires in-person meeting
- Show success message when documents are uploaded
- Display amber alert in user cabinet when admin requests documents
- Show document count in property history page

**Backend:**
- Added documents to propertyHistory query for user cabinet display
