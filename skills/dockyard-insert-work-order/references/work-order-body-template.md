# Work order body for `workorder_insert`

Pass as `content` (the server adds the `# Work Order: WO-NNN` header). Start at `## Objective`. Every heading below is required.

```markdown
## Objective
(One clear outcome.)

## Agent Instructions
(Step-by-step for the executor.)

## Anchor Files
(Key paths to open first.)

## Related Files
(Secondary paths.)

## Files to Create
(Paths or "none".)

## Constraints (DO NOT TOUCH)
(Regions or files to avoid.)

## Deferred Work
(Out of scope follow-ups.)

## Notes
(Anything else.)
```

Use `date` as `YYYY-MM-DD` and `issue` as a slug (e.g. `auth-refactor`). The tool returns `{ "id": "wo-001" }`.
