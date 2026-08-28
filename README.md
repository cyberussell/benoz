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

## Rules

- The existing tests must still pass. If you change one, say why.
- Add tests for your new behaviour, including the awkward cases.
- The library stays client-agnostic: no client names or client field names in `lib/`.
- Everything else about your submission (the hosted page, the video, the
  decisions, the transcripts) is described in the exercise document you received.
