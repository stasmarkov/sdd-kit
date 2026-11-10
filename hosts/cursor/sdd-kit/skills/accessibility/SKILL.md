---
name: accessibility
description: Web accessibility (a11y) for component-based frontends. Use when building UI components, forms, navigation, or auditing pages against WCAG 2.2 AA. Covers semantic HTML, ARIA, keyboard, focus, contrast, and automated testing.
license: Apache-2.0
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
paths:
  - "**/*.tsx"
  - "**/*.jsx"
  - "app/**"
  - "components/**"
---

# Accessibility (WCAG 2.2 AA)

## Quick Reference

| Concern | Rule |
|---------|------|
| **Semantics** | Use native elements first (`<button>`, `<a>`, `<nav>`, `<main>`). ARIA only when no native element fits. |
| **Keyboard** | Every interactive element reachable + operable by keyboard. Visible focus ring (never `outline: none` without replacement). Logical tab order. |
| **Forms** | Every input has a `<label htmlFor>`. Errors via `aria-describedby` + `aria-invalid`. Group with `<fieldset>`/`<legend>`. |
| **Images** | Meaningful `alt`; decorative → `alt=""`. Image components require `alt`. |
| **Contrast** | Text ≥ 4.5:1 (3:1 for large/UI). Don't encode meaning in color alone. |
| **Dynamic** | Announce async changes with `aria-live` (`polite`/`assertive`). Move focus to new content/dialogs; trap focus in modals; restore on close. |
| **Landmarks** | One `<main>`, skip-to-content link, headings in order (no skipped levels). |
| **Motion** | Respect `prefers-reduced-motion`. |

## Framework patterns

Component examples (accessible icon button, field with error wired to the input, modal dialogs, accessible primitives, server-rendered markup) are in the frontend stack add-on's `references/accessibility.md`. Prefer a library of accessible primitives over hand-rolled widgets: they ship correct ARIA and keyboard behavior.

## Automated gate

- Component/integration level: an axe assertion in the component test; it fails CI on violations.
- Page level: a Lighthouse accessibility audit, budget >= 95.

Automated tools catch ~30-40% of issues. Always add a manual keyboard-only pass + one screen-reader smoke test (VoiceOver/NVDA) for primary flows.

## When to load references

| Task | Load |
|------|------|
| Full WCAG 2.2 criteria checklist | `references/wcag-checklist.md` (create as needed) |
| Complex widget ARIA patterns (combobox, tabs, tree) | WAI-ARIA Authoring Practices Guide |
