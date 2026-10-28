# AGENTS.md

This file defines the repository-specific working rules for agents and automated contributors.

## Mandatory project rules (top priority)

These rules are the top-priority repository instructions for agents working in `QA-Checklist`.


- Current frontend stack: Vue 3, TypeScript, Vite, Vuetify 3, Pinia, Vue Router, Axios, ESLint, and Prettier.
- Keep frontend work layered:
  - `views`: route-level page composition and workflow orchestration.
  - `components`: reusable UI and focused presentation or interaction pieces.
  - `services`: API calls and integration boundaries.
  - `store`: shared application state.
  - `models`: typed API contracts and domain-facing frontend models.
  - `components/composables`: reusable UI behavior and permissions helpers.
- Do not put API request logic directly in UI templates or deeply inside presentation components when a service/composable should own it.
- Do not expose or consume loose backend entities directly. Use explicit frontend models/DTOs aligned with backend response contracts.
- Frontend models and consumed API data use `camelCase`; backend DTOs/classes are defined in `PascalCase` and serialized to frontend `camelCase`.
- Avoid aggregating a whole domain's enums, DTOs, payloads, summaries, and models into one file. Prefer one exported model/DTO/enum per file, or a very small cohesive group when types are inseparable.
- Apply patterns only when they solve a concrete problem. Explain non-obvious architectural decisions; do not add wrappers, factories, or composables without a cohesive responsibility.
- Communication must include a short impact summary, the list of touched files, and proposed tests or steps when relevant.
- Before modifying structure, global logic, or sensitive files, propose these 4 options and wait for the developer's choice unless they previously selected option C:
  - A: Apply the change.
  - B: Apply the change after giving the developer recommendation first.
  - C: Apply all changes without asking again.
  - D: Recommend without touching files.
- If the developer says not to touch files, do not modify those files.
- Do not create Git commits automatically. Commit changes only when the developer explicitly requests a commit.
- If something is ambiguous, ask 1-2 questions maximum; otherwise proceed.

## Local checklist persistence

- Checklist data must support automatic JSON persistence in a user-selected `Documents/QAChecklist` folder. Browser `localStorage` is a cache and must not be the only durable copy once folder access is configured.
- Keep this application backend-free. Use the browser File System Access API for external files; IndexedDB may store only the optional directory handle, not checklist content.
- Never overwrite an existing unreadable file or silently replace different disk and browser data. Read and validate the disk file before enabling writes, and require an explicit load or merge decision when needed.
- Display file-write progress and failures accurately. Clearing browser data must not delete external JSON files; reconnecting the folder must allow the user to recover them.

## Core principles

- Follow SOLID and clean code principles.
- Treat nearby legacy code as behavioral context, not a template. New and materially changed code must use the current Vue/TypeScript/Vuetify conventions even when an older pattern exists beside it.
- Keep changes targeted, coherent, and easy to review.
- Refactor only the code required by the task, or the adjacent code that must change to keep the result clean.
- Avoid broad refactors outside the task scope.
- Avoid excessive normalization, over-abstraction, and unnecessary defensive code.
- Prefer predictable operational UX over decorative or marketing-style UI.
- Name constants in uppercase snake case, such as `PAYMENT_TYPE_GROUP_LEVEL`.

## Keep AGENTS.md up to date

- If the developer asks for a coding rule, team habit, or recurring convention that should apply to future work, add it to this file as part of the task when relevant.
- Long-term coding conventions must be written in English.
- Do not leave important project rules only in chat history.

## Vue 3 and TypeScript

- Use Vue 3 Single-File Components with `<script setup lang="ts">` for new components. Keep any compatibility adaptation at the boundary with untouched legacy code.
- Type props with `defineProps<T>()`; use `withDefaults(...)` or reactive props destructuring for defaults.
- Type emitted events with `defineEmits<T>()`.
- Use named interfaces/types for props, emits, API contracts, table rows, form state, and service payloads when the shape is reused or non-trivial.
- Avoid `any`, vague anonymous objects, and weak implicit typing. If `any` is unavoidable, keep it local and explain why.
- Type `ref`, `computed`, template refs, and DOM event handlers when inference is not clear.
- Prefer computed values over duplicated reactive state.
- Prefer composables for reusable behavior, but keep composables focused and testable.
- Do not mutate props directly; emit updates or copy into local state when editing is needed.
- Prefer plain typed functions for pure transformations, composables for reactive reusable behavior, and injected/imported services for integration boundaries. Avoid static mutable state and classes used only as namespaces.

## Model organization

- Keep each exported frontend model, DTO, enum, or serializer in its own file by default.
- Use feature folders under `src\models` for domain-specific types, such as `src\models\trusts`.
- Put shared cross-domain types in a clearly named shared model file only when they are truly reused across domains.
- Avoid barrel files that hide large unrelated model groups behind a single import surface.
- When editing an existing aggregate model file, split only the types needed by the task unless the developer asks for a broader cleanup.

## Vuetify and UI/UX

- Use Vuetify 3 components, props, density, variants, theme tokens, and spacing utilities before custom CSS.
- Use `v-container`, `v-row`, `v-col`, Vuetify display utilities, or `useDisplay()` for responsive layout decisions.
- Use `BaseMultiSelect`, `BaseMultiAutocomplete`, or `BaseMultiCombobox` instead of raw Vuetify inputs with `multiple` so multiple selections consistently show the first value followed by the remaining selection count. Keep a custom selection slot only when the workflow intentionally requires a different summary.
- Operational screens should prioritize scanability, density, and repeated-use efficiency: clear tables, filters, predictable actions, compact forms, and stable layouts.
- Avoid decorative hero sections, marketing layouts, card-heavy page composition, nested cards, and one-off visual ornamentation in operational tools.
- Use `BaseDataTable` component or `v-data-table-server` or established server-side table patterns for paged/sorted backend data.
- When using `DownloadExcel.vue` component, alway use `useNewExport = true`.
- Use `v-form` with explicit rules for editable forms, validate before submitting, and show loading/disabled states during async saves.
- Keep primary actions visually consistent and easy to find. Use destructive colors only for destructive actions.
- Icon-only buttons must have an accessible name through visible text, `aria-label`, or a tooltip with clear text.
- Prefer standard Vuetify icons/buttons/menus/dialogs/tooltips over custom controls unless the product need is specific.
- Do not rely on color alone to communicate state; combine color with text, icon, or shape.
- Maintain readable contrast and avoid text overflow or overlap at mobile and desktop breakpoints.
- Keep text concise and domain-specific; avoid in-app instructional copy that explains obvious UI mechanics.

## Refactoring policy

- Leave untouched areas alone unless they must change for the task.
- Local cleanup is acceptable only when it improves the changed area directly.
- Avoid style-only refactors when the task does not require them.
- Keep component splits practical: extract a component/composable only when it reduces complexity, improves reuse, or matches an established local pattern.

## Null checks and conditions

- Avoid verbose checks like `value !== undefined && value !== null` when a simple condition is enough.
- Prefer `if (!condition)` by default when the business meaning remains correct.
- Add explicit `null` or `undefined` checks only when the distinction matters.
- When API data can genuinely omit a value, reflect that in the model with `?` and/or `| null`.

## File formatting

- Preserve CRLF line endings in edited files.
- Do not normalize existing files from CRLF to LF.
- Preserve the existing file encoding when editing files. Do not change a file from its current encoding unless the developer explicitly asks for it.
- Follow the configured ESLint and Prettier rules.
- Use the `@/` path alias for source imports when it improves clarity and matches nearby code.

## Tests and verification

- For TypeScript-only or Vue logic changes, prefer the narrowest useful verification: `npm run lint`, `vue-tsc`, focused unit tests, or Playwright checks depending on the change.
- For UI changes, verify the relevant workflow at mobile and desktop widths when layout, density, or interaction behavior changes.
- Add or modify frontend automated tests only for critical workflows, high-risk behavior, or when the developer explicitly requests them. Routine and low-risk UI changes should rely on focused linting, type checking, build verification, and manual workflow checks instead of new tests.
- For critical frontend behavior, use the narrowest appropriate coverage: Vitest for isolated logic and Playwright for end-to-end workflows. Keep existing tests valid, and report the exact reason when critical coverage cannot be run or added.
- Mock interactions with external systems that have no development or test environment. Document those mocks and the limits they place on integration coverage.

## Reference docs

- Vue 3 TypeScript and Composition API: https://vuejs.org/guide/typescript/composition-api.html
- Vue `<script setup>` API: https://vuejs.org/api/sfc-script-setup.html
- Vuetify forms: https://vuetifyjs.com/en/components/forms/
- Vuetify display and platform utilities: https://vuetifyjs.com/en/features/display-and-platform/
- Vuetify accessibility: https://vuetifyjs.com/en/getting-started/accessibility/

## Expected outcome

- Deliver the smallest coherent change that solves the task.
- Keep the code simple, readable, typed, accessible, and intentional.
- Justify any necessary exception to these rules.
