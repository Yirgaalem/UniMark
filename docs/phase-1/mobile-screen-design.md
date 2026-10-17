# UniMark Phase 1: Mobile screen and flow design

**Design intent:** fast, calm, one-handed use. Saving a link should be the shortest path; optional details must not block saving.
 
## Navigation

Use a bottom tab bar with **Home**, **Search**, **Folders**, and **Saved**. Put account/preferences under the profile/settings action in the Home header. Keep the number of top-level destinations small; folders and all-bookmark browsing remain distinct ways to browse the same records.

## Screen inventory

### 1. Sign in / Create account

- Email and password fields, validation, show/hide password, sign-in/create-account switch, and recovery link.
- Show progress and actionable errors; never clear a password field due to a transient network error unless required for safety.
- Authentication details are implemented in Phase 2.2.

### 2. Home

- Header: UniMark and profile/settings button.
- Primary action: **Save a link** for manual paste, plus accessible empty-state instructions explaining OS Share.
- Sections: recent bookmarks and frequently used folders.
- Bookmark rows/cards show title, source label, saved date, and thumbnail only when available.
- Tapping a bookmark opens its detail; a clear external-open action is available.

### 3. Incoming Share / Quick Save

This is an entry flow, not necessarily a full tab. It opens when the OS hands content to UniMark.

```text
┌─────────────────────────────┐
│ Save to UniMark          ✕  │
│                             │
│ [preview / source icon]     │
│ Suggested or original title │
│ shared URL                  │
│                             │
│ Folder  [Watch Later  ▾]    │
│                             │
│        [Save bookmark]      │
│ Edit title · Add note       │
└─────────────────────────────┘
```

- Preselect the last-used folder if one exists; allow unfiled save.
- Show enough URL to identify the target, with safe truncation.
- Title edit and notes are optional secondary actions.
- On save, provide confirmation and return to the source context where platform behavior permits.
- If a share contains text without a recognizable URL, preserve it for review; do not silently invent or fetch an unrelated URL.
- If signed out, retain the share payload only for the sign-in handoff if platform storage permits; otherwise explain that sign-in is required and let the user retry. Exact behavior is validated in Phase 2.1.

### 4. Saved library

- Search affordance, filter/sort entry, and a scrollable list/grid that remains usable with large libraries.
- Default sort: most recently saved first.
- Empty state explains saving via Share and manual link entry.
- Long-press/overflow actions: edit title, assign folders, delete.

### 5. Search

- Search input at top; results update as the user types with a short debounce.
- Search custom title, original title, and notes first; later include folder names/tags as specified.
- Filter chips/sheet for platform, folder, date, and content type (Phase 4).
- Clear no-results state and one-tap filter reset.

### 6. Folders

- Folder list with name and bookmark count.
- Create folder action; rename and delete in a contextual menu.
- Folder detail shows its bookmarks, with sort and move/add actions.
- Deleting a folder confirms the action and explains that bookmarks remain in the library.

### 7. Bookmark detail

- Title (custom title when set, otherwise original title), source platform, saved date, folder memberships, optional description/notes, and thumbnail where available.
- Actions: open original content, edit title/notes, manage folders, delete.
- In-app viewing is a later, source-dependent enhancement; always retain an open-original fallback.

### 8. Settings

- Account identity, sign out, account deletion entry, privacy/help, and app preferences.
- No social platform credential collection.

## Key interaction states

- Loading skeleton for library and folder lists.
- Offline/network failure with retry; do not imply a save succeeded unless locally queued or server-confirmed.
- Metadata unavailable: show URL/source and allow manual title.
- Share payload invalid/empty: explain what could not be read and offer manual paste.
- Duplicate result (Phase 4): open existing bookmark or add it to another folder.
- Deleted source content: bookmark remains with a clear unavailable/open-original message; the source URL is retained.

## Accessibility and layout notes

- Large touch targets, labels for icon-only actions, Dynamic Type/font scaling, screen-reader names, and sufficient contrast.
- Keep primary save action within thumb reach on common phone sizes.
- Do not encode platform/source status using color alone.
- Test compact screens, long titles, large text, keyboard presentation, and localization-ready layouts.
