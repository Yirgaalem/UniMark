---
name: UniMark
description: A clear, quiet place to save and organize links.
colors:
  primary: "#315d4e"
  primary-soft: "#edf1ee"
  neutral-bg: "#f7f8f6"
  neutral-card: "#ffffff"
  neutral-text: "#202622"
  neutral-muted: "#68736c"
  neutral-border: "#e2e7e2"
  danger: "#a13f3a"
typography:
  heading:
    fontFamily: "system sans-serif"
    fontSize: "29px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "normal"
  body:
    fontFamily: "system sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  sm: "8px"
  md: "10px"
  lg: "14px"
spacing:
  sm: "8px"
  md: "14px"
  lg: "20px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.neutral-card}"
    rounded: "{rounded.sm}"
    height: "48px"
    padding: "0 14px"
  input:
    backgroundColor: "{colors.neutral-card}"
    textColor: "{colors.neutral-text}"
    rounded: "{rounded.sm}"
    height: "48px"
    padding: "0 12px"
  bookmark-card:
    backgroundColor: "{colors.neutral-card}"
    textColor: "{colors.neutral-text}"
    rounded: "{rounded.md}"
    padding: "14px"
---

# Design System: UniMark

## Overview

UniMark uses a quiet, familiar mobile interface that keeps attention on saved links and the actions around them. The visual system uses one restrained green accent, neutral surfaces, and the platform's default sans-serif type. Labels and controls use plain language.

**Key Characteristics:**
- One accent color for primary actions and selected folders.
- Neutral background, white cards, and subtle borders.
- System sans-serif type at readable sizes and regular weights.
- Compact, consistent controls with uncluttered spacing.

## Colors

Use a restrained green accent with soft gray-green neutrals.

### Primary
- **Library Green** (`#315d4e`): Primary actions, links, and selected folder filters.
- **Soft Green Gray** (`#edf1ee`): Quiet secondary controls and status surfaces.

### Neutral
- **Canvas** (`#f7f8f6`): Main screen and modal background.
- **Card White** (`#ffffff`): Forms, bookmark cards, and search field.
- **Main Text** (`#202622`): Titles and key content.
- **Muted Text** (`#68736c`): Dates, account email, and helper copy.
- **Divider** (`#e2e7e2`): Borders and separators.
- **Destructive** (`#a13f3a`): Delete actions.

**The One Accent Rule.** Use green for the main action and selected state; keep routine content neutral.

## Typography

**Display Font:** Native system sans-serif.
**Body Font:** Native system sans-serif.

**Character:** Use the platform's familiar sans-serif with moderate weights. Avoid decorative type, tight tracking, and excessive uppercase labels.

### Hierarchy
- **Screen title** (700, 29px, 35px line-height): Authentication and main library title.
- **Section title** (600, 16–18px): Folder and bookmark collection headings.
- **Body** (400–600, 13–15px, 18–21px line-height): Bookmark titles, descriptions, and inputs.
- **Metadata** (400–600, 11–12px): Source, saved date, and account email.

## Layout

Keep the app single-column with steady side margins. Show the screen title and account actions first, then status, folder filters, search, and saved links. Keep the bookmark list scrollable. Authentication content remains scrollable when the keyboard or larger text reduces available space.

## Elevation & Depth

Use flat surfaces and subtle borders. Avoid decorative shadows and stacked cards. Reserve the modal scrim for sheets that need clear focus.

## Shapes

Use consistent rounded corners (8–14px) for buttons, fields, and cards. Keep chips and cards visually quiet.

## Components

- **Primary action:** Green fill, white text, and a minimum 48px height.
- **Secondary action:** Soft neutral fill, dark text, and a minimum 44px height.
- **Input:** White fill, subtle border, and a minimum 48px height.
- **Folder filter:** Neutral chip; the selected chip uses the single accent color.
- **Bookmark card:** White surface with title, source/date, and compact actions.

## Do's and Don'ts

- Do use system fonts and plain, descriptive labels.
- Do keep the original URL available when a custom title is set.
- Do keep touch targets at or above native accessibility guidance.
- Don't use decorative type or multiple competing accent colors.
- Don't repeat section labels when a clear heading already communicates the content.
- Don't add shadows, borders, or badges without a functional purpose.
