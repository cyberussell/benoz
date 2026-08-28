# Benoz.AI Take-Home: Platform Foundation Starter Package

This package contains a working, client-agnostic validation library and a passing
test suite. Your task is to extend it. Read this whole file before writing anything.

## What is here

```
lib/
  types.ts        The definition format: field types and constraints
  validator.ts    validate(definition, record) -> list of errors
definitions/
  client-1-fleet-service.json
  client-2-course-enrollment.json
  client-3-venue-booking.json
tests/
  validator.test.ts   The existing suite. All tests pass.
```

The library knows nothing about any client. Every client difference lives in a
definition file. `validate()` takes a definition and a record and returns a list
of `{ field, error }` objects, empty when the record is valid.

## Setup

```
npm install
npm test
```

All existing tests pass before you touch anything. Confirm that first.

## Your task

Extend the definition format and the library with three capabilities. The format
of each is yours to design; the design decisions are the point.

### a. Cross-field rules

A rule like "the end date must not be before the start date" must be declarable
as data in the definition file, not written as code.

### b. Conditional required

A rule like "field X is required only when field Y has value Z" must be
declarable the same way.

### c. Evaluation order

Define, document and implement what happens when a rule depends on a field that
is missing, or that has already failed its own validation. A user should see one
real error, not a cascade of nonsense.

## Document your design in this README

Under a new section, document precisely:

- How a rule refers to another field
- Which field an error is reported against, and why you chose that
- What happens when a dependency is missing, and when it is itself invalid
- Where you decided to stop: what your format deliberately cannot express

**After you submit, we will run your library against a definition file you have
not seen, for a client that does not appear in this package. It will contain
rules written against your design, following your README. If your README is
precise enough for us to write those rules correctly, and your code handles
them, you have done what the exercise asks.**

## Design: cross-field rules and conditional required

This section documents the `rules` array added to `ClientDefinition`
(`lib/types.ts`) and the two-pass evaluation it gets in `validate()`
(`lib/validator.ts`). It's written so an engineer who has never seen the
implementation can write a correct `rules` array for a new, unseen client
definition from this text alone.

### Where rules live

A definition gets one new, optional field:

```ts
export interface ClientDefinition {
  client: string;
  record_type: string;
  fields: FieldDefinition[];
  rules?: Rule[];   // new, optional — a definition with no rules is unaffected
}
```

`rules` is a flat, top-level array, not nested inside a `FieldDefinition`.
A rule about a relationship between two fields has no single natural owner
among them, so it isn't attached to either one.

### Rule JSON syntax

Two rule kinds exist today, distinguished by a `type` discriminant so the
array can hold a mix of both:

```ts
export type Rule = FieldComparisonRule | ConditionalRequiredRule;
```

**`field_comparison`** — compares two fields of the same type:

```json
{
  "type": "field_comparison",
  "field": "end_date",
  "operator": "gte",
  "compare_to": "start_date",
  "message": "End date can't be before the course starts"
}
```

```ts
export type ComparisonOperator = "lt" | "lte" | "gt" | "gte" | "eq" | "neq";

export interface FieldComparisonRule {
  type: "field_comparison";
  field: string;
  operator: ComparisonOperator;
  compare_to: string;
  message?: string;   // optional; a default is generated when omitted
}
```

**`conditional_required`** — makes a field required only when another field
holds a specific value:

```json
{
  "type": "conditional_required",
  "field": "invoice_file",
  "when": "vehicle_kind",
  "equals": "car"
}
```

```ts
export type ConditionValue = string | number | boolean;

export interface ConditionalRequiredRule {
  type: "conditional_required";
  field: string;
  when: string;
  equals: ConditionValue;
  message?: string;
}
```

### How a rule refers to another field

By its `name` (the same string used as the key in a submitted record),
exactly as `fields[].name` is used everywhere else in this format. There is
no dot-path traversal, no array indices, and no reference to another
record — only flat, sibling field names within the same definition.

### Supported field types

`field_comparison` only accepts `date` and `number` fields, and both sides
of a comparison must be the **same** type — you cannot compare a `date` to
a `number`. Ordering (`lt`/`lte`/`gt`/`gte`) has no defined meaning for
`text`, `choice`, `multi_choice`, `boolean`, or `file` values, so those
types are not supported by this rule.

`conditional_required`'s `equals` is a JSON scalar (`string | number |
boolean`), so the `when` field can be any type whose submitted value is a
scalar — `text`, `long_text`, `number`, `date`, `boolean`, or `choice`.
`multi_choice` (an array value) and `file` (a filename, an unusual but not
forbidden case) are not meaningful targets for a single-value equality
check and are not supported.

The field that *becomes* required (`field`) has no type restriction at
all — `conditional_required` never inspects its type, only whether it's
declared and whether it's empty (the same emptiness rule `required: true`
already uses). It can be a `multi_choice` or `file` field just as easily
as a `text` or `choice` field.

### Supported operators (`field_comparison`)

| operator | meaning |
|---|---|
| `lt` | strictly less than |
| `lte` | less than or equal to |
| `gt` | strictly greater than |
| `gte` | greater than or equal to |
| `eq` | equal to |
| `neq` | not equal to |

For "end date must not be before start date" (same-day allowed), use
`gte` — not `gt`, which would wrongly reject a same-day start and end.

`conditional_required` has no operator field: `equals` is always a strict
equality test (see "Strict equality" below). Composing several rules with
different `equals` values against the same `field` gives OR semantics for
free — no "one of" list is needed (see Deliberate limitations).

### Which field receives an error

Always `field`, never `compare_to` / `when`. `{ field: "end_date",
operator: "gte", compare_to: "start_date" }` reads as "`end_date` must be
`gte` `start_date`" — the subject of that sentence is the one that gets
flagged, matching how a person would describe the problem ("your end date
is before your start date"). The same convention applies to
`conditional_required`: the field that becomes required is the field the
error is reported against.

Only one field can be flagged per rule. If you want both fields in a pair
highlighted, declare the relationship twice, once per direction — but see
"Multiple rules on the same field" below before doing that.

### Strict equality

`conditional_required` compares with `===`: the JSON type of `equals` must
match the runtime type of the field's value. `"equals": "true"` (a string)
will never match a `boolean` field's actual value `true`, and `"equals": 0`
(a number) will never match the string `"0"`. This mirrors the strict
`typeof` checks already used throughout `validateField()` in
`lib/validator.ts`, and avoids classic loose-equality surprises
(`"" == false`, `0 == "0"`). A type-mismatched `equals` isn't an error —
the rule simply never fires, which is a rule-authoring mistake to watch
for when writing definitions.

### Two-pass evaluation order

`validate()` runs in two passes, and rules never see each other's results:

1. **Base validation** — exactly the existing per-field checks, plus the
   existing unknown-field check, unchanged. This produces the base error
   list and, from it, the set of field names that already have an error.
2. **Rules** — each rule in `rules` is evaluated exactly once, as a
   function of the raw record values and the base-error set from pass 1
   only. No rule ever reads another rule's outcome.

Because every rule in pass 2 reads only pass 1's snapshot and never another
rule's outcome, **declaration order in the `rules` array has no effect on
which errors are produced** — only on the position
of rule errors within the returned array (base errors first in `fields`
order, then rule errors in `rules` order — a display convenience, not a
dependency). Two rules that reference each other's fields (e.g. an
`end_date`-referencing-`start_date` rule alongside a
`start_date`-referencing-`end_date` rule) cannot loop or deadlock: nothing
here is recursive, so there is no cycle to detect.

### Missing, invalid, or unknown fields (subject field and dependency)

This covers both the subject field (`field`, the one that receives the
error) and the field it's checked against (`compare_to` / `when`).

**`field_comparison`** is skipped (produces no error) whenever a
meaningful comparison isn't possible:

- `field` or `compare_to` doesn't exist in `fields` at all (an unknown
  reference — almost always a typo in the rule).
- `field` and `compare_to` have different types, or a type this rule
  doesn't support.
- Either field's value is empty (including simply absent from the record).
- Either field already has a base validation error (wrong type, failed
  pattern, etc.) — you cannot meaningfully say "must be on or after X"
  about a field that is already known to be garbage.

This is why the library shows **one real error, not a cascade**: if
`start_date` is `"not-a-date"`, the base pass reports that once, and the
comparison rule against `end_date` is skipped rather than adding a second,
confusing error about being "before an invalid date."

**`conditional_required`** needs almost no such logic, by construction:

- If `when` is missing, invalid, or an unknown field name, `record[when]`
  is simply `undefined`, which never strictly equals a defined `equals`
  value — the condition is just false. No skip logic is needed because
  equality (unlike ordering) is well-defined against any input.
- The one case that does need a check: `field` already has a base error.
  Concretely, this happens when a field is *both* statically `required:
  true` and targeted by a `conditional_required` rule — without this
  check, an empty value would be reported as missing twice. The rule is
  skipped whenever `field` already has a base error, which both prevents
  that duplicate and is a harmless no-op in every other case (a
  non-empty-but-invalid value was never going to trigger a "required"
  error in the first place, since "required" only concerns emptiness).
- If `field` itself is an unknown reference (doesn't exist in `fields`),
  the rule is inert.

### Multiple rules on the same field

Different rules are independent, so more than one can legitimately fire on
the same field at once — that's not a cascade, it's two real constraints
both being violated. For example, `end_date` bounded by both `gte
start_date` and `lte deadline` can report two separate errors on
`end_date` if both are violated on an otherwise-valid record. The "no
cascade" guarantee is specifically about not restating a problem whose
root cause is already reported elsewhere (see above), not a cap of one
error per field.

### Custom and default messages

Both rule kinds accept an optional `message` (a plain string, no
templating). When omitted:

- `conditional_required` defaults to `"This field is required"` — the
  exact same text the static `required: true` check already produces, so
  a user never sees two different phrasings for "you left this blank."
- `field_comparison` generates a message from the operator and the
  compared field's `label` (not its `name` — labels are user-facing):

  | operator | date phrasing | number phrasing |
  |---|---|---|
  | `lt` | Must be before {label} | Must be less than {label} |
  | `lte` | Must be on or before {label} | Must be at most {label} |
  | `gt` | Must be after {label} | Must be greater than {label} |
  | `gte` | Must be on or after {label} | Must be at least {label} |
  | `eq` | Must be the same date as {label} | Must equal {label} |
  | `neq` | Must be a different date than {label} | Must not equal {label} |

### Deliberate limitations

- No literal/constant comparisons (`"end_date after 2026-01-01"`) —
  `field_comparison` only compares two fields; a fixed bound belongs in
  `Constraints`, not this rule type.
- No comparisons involving `text`, `choice`, `multi_choice`, `boolean`, or
  `file` fields.
- `field_comparison` does not check that `field` and `compare_to` are
  different fields. Pointing a rule at itself is not rejected — it compares
  a valid value against itself, so `eq`/`lte`/`gte` always pass and
  `lt`/`gt`/`neq` always fail whenever the field has a value. Nothing here
  catches this mistake; write `field` and `compare_to` as two distinct
  field names.
- No `between`/range-in-one-rule operator — express a range as two
  `field_comparison` rules instead.
- No arithmetic offsets (`"end_date >= start_date + 7 days"`).
- No cross-record or dot-path field references.
- Only one field can receive the error per rule; no dual-flagging, no
  retargeting to a third field.
- No message templating — `message` is a literal override string only.
- No "one of" list for `equals`, and no inequality (`not_equals`)
  condition on `conditional_required` — only exact-match `equals` is
  supported; declare multiple rules for OR semantics.
- No compound conditions (`Y = Z1 AND W = V1`) — each rule tests exactly
  one field against one value.
- Schema-authoring bugs (a rule referencing a field name that doesn't
  exist, or comparing mismatched types) are not surfaced as record
  validation errors. `validate()` fails closed on them (the rule is
  inert) rather than throwing, since a broken definition shouldn't crash
  validation for every submitted record — but nothing here checks the
  `rules` array against `fields` up front. Definitions should be
  reviewed by a human (or a separate lint step) before being shipped.

### Worked examples

**Cross-field:** a hypothetical course-enrollment definition with a
paired `start_date`/`end_date`:

```json
{
  "fields": [
    { "name": "start_date", "label": "Start date", "type": "date", "required": true },
    { "name": "end_date", "label": "End date", "type": "date", "required": true }
  ],
  "rules": [
    { "type": "field_comparison", "field": "end_date", "operator": "gte", "compare_to": "start_date" }
  ]
}
```
`{ start_date: "2026-09-10", end_date: "2026-09-01" }` → one error:
`{ field: "end_date", error: "Must be on or after Start date" }`.

**Conditional required:** using the real fields already in
`definitions/client-1-fleet-service.json`:

```json
{ "type": "conditional_required", "field": "invoice_file", "when": "vehicle_kind", "equals": "car" }
```
`{ vehicle_kind: "car" }` (no `invoice_file`) → one error:
`{ field: "invoice_file", error: "This field is required" }`.
`{ vehicle_kind: "van" }` → no error, regardless of whether `invoice_file`
is present.

## Rules

- The existing tests must still pass. If you change one, say why.
- Add tests for your new behaviour, including the awkward cases.
- The library stays client-agnostic: no client names or client field names in `lib/`.
- Everything else about your submission (the hosted page, the video, the
  decisions, the transcripts) is described in the exercise document you received.
