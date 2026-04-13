# QOL Small Wins Plan

This plan captures the immediate quality-of-life work for the app repo. It focuses on changes that reduce day-to-day friction without widening the product surface much.

## Scope

Ship these small wins now:

1. Run detail view
2. Function-level recent runs in the editor
3. Copy actions for invoke URL, curl, logs, output, and errors
4. Duplicate function
5. Saved test cases in the function editor
6. Editor keyboard shortcuts and unsaved-change protection

## Goals

- Make it faster to iterate on a function repeatedly
- Reduce copy/paste and manual re-entry work
- Make previous runs easier to inspect and reuse
- Add safety around unsaved edits

## Implementation Plan

## 1. Run Detail View

Add a dedicated run detail route and page.

- Add `GET /runs/:id` route in the web router
- Build a run detail page backed by `GET /api/invocations/:id`
- Show function link, status, source, duration, timestamps, input, output, logs, and error
- Add a rerun action that navigates back to the function editor with the prior input prefilled

## 2. Function-Level Recent Runs

Extend the function detail page to show recent invocations for just that function.

- Fetch `GET /api/functions/:id/invocations`
- Show a compact recent runs list in the side panel
- Let each row open the run detail page
- Let users restore the run input into the current editor session

## 3. Copy Actions

Add one-click copy actions to remove manual selection work.

- Copy invoke URL from the function info panel
- Copy ready-to-run `curl` command with the function ID filled in
- Copy latest logs
- Copy latest output
- Copy latest error text

## 4. Duplicate Function

Add a fast way to branch from an existing function.

- Add duplicate action on the function detail page
- Create a new function using the current function name and code
- Navigate directly to the new function after creation

## 5. Saved Test Cases

Add lightweight saved test cases without new backend schema.

- Store named test cases in local storage per function ID
- Let users save the current input as a named test case
- Let users load a saved test case with one click
- Let users delete stale test cases

This keeps the feature cheap to ship while proving whether users actually use it.

## 6. Keyboard Shortcuts And Unsaved Safety

Add the basic editor ergonomics expected in a code tool.

- `Ctrl/Cmd+S` saves
- `Ctrl/Cmd+Enter` runs
- Warn before browser unload when there are unsaved edits
- Warn before in-app navigation that would discard unsaved edits

## Files Likely To Change

- `apps/web/src/router.tsx`
- `apps/web/src/pages/FunctionDetailPage.tsx`
- `apps/web/src/pages/RunsPage.tsx`
- `apps/web/src/lib/api.ts`
- `apps/web/src/pages/FunctionsListPage.tsx`

New files likely:

- `apps/web/src/pages/RunDetailPage.tsx`
- `apps/web/src/lib/testCases.ts`

## Verification

Run after implementation:

```bash
npm -w apps/web run typecheck
npm -w apps/web run build
```

Manual checks:

1. Create and duplicate a function
2. Save, load, and delete test cases
3. Run a function, open a run detail page, and restore prior input
4. Copy invoke URL, curl, output, logs, and errors
5. Confirm `Ctrl/Cmd+S` saves and `Ctrl/Cmd+Enter` runs
6. Confirm unsaved-change warnings appear on browser refresh and route changes

## Follow-Up

If these stick, the next adjacent improvements are:

1. Server-backed saved test cases
2. Richer run diffing and expected-output checks
3. Function duplication from the list page
4. Extended retention and export options for runs
