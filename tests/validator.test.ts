import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
import { validate } from "../lib/validator";
import { ClientDefinition, ComparisonOperator } from "../lib/types";

function load(name: string): ClientDefinition {
  const raw = readFileSync(join(__dirname, "..", "definitions", name), "utf-8");
  return JSON.parse(raw) as ClientDefinition;
}

const fleet = load("client-1-fleet-service.json");
const course = load("client-2-course-enrollment.json");
const venue = load("client-3-venue-booking.json");

const errorsFor = (result: { field: string; error: string }[], field: string) =>
  result.filter((e) => e.field === field);

describe("required fields", () => {
  it("reports every missing required field", () => {
    const result = validate(fleet, {});
    expect(errorsFor(result, "plate_number")).toHaveLength(1);
    expect(errorsFor(result, "vehicle_kind")).toHaveLength(1);
    expect(errorsFor(result, "service_date")).toHaveLength(1);
    expect(errorsFor(result, "odometer_km")).toHaveLength(1);
  });

  it("treats a whitespace-only string as missing", () => {
    const result = validate(course, {
      enrollment_code: "   ",
      course_level: "beginner",
      modules_selected: ["theory"],
      start_date: "2026-09-01",
    });
    expect(errorsFor(result, "enrollment_code")).toHaveLength(1);
  });

  it("does not complain about an absent optional field", () => {
    const result = validate(venue, {
      booking_ref: "BK123456",
      hall: "main",
      event_date: "2026-10-10",
      expected_guests: 40,
    });
    expect(result).toEqual([]);
  });
});

describe("text constraints", () => {
  it("enforces pattern", () => {
    const base = {
      vehicle_kind: "van",
      service_date: "2026-05-01",
      odometer_km: 120000,
    };
    expect(validate(fleet, { ...base, plate_number: "AB-1234" })).toEqual([]);
    expect(
      errorsFor(validate(fleet, { ...base, plate_number: "ab-1234" }), "plate_number")
    ).toHaveLength(1);
  });

  it("enforces min_length and max_length", () => {
    const base = {
      course_level: "advanced",
      modules_selected: ["lab", "exam"],
      start_date: "2026-09-01",
    };
    expect(
      errorsFor(validate(course, { ...base, enrollment_code: "abc" }), "enrollment_code")
    ).toHaveLength(1);
    expect(
      errorsFor(
        validate(course, { ...base, enrollment_code: "a".repeat(13) }),
        "enrollment_code"
      )
    ).toHaveLength(1);
    expect(validate(course, { ...base, enrollment_code: "abc123" })).toEqual([]);
  });

  it("enforces max_length on long_text", () => {
    const record = {
      plate_number: "AB-1234",
      vehicle_kind: "car",
      service_date: "2026-05-01",
      odometer_km: 500,
      mechanic_notes: "x".repeat(1501),
    };
    expect(errorsFor(validate(fleet, record), "mechanic_notes")).toHaveLength(1);
  });
});

describe("number constraints", () => {
  it("rejects non-numbers and out-of-range values", () => {
    const base = {
      plate_number: "AB-1234",
      vehicle_kind: "truck",
      service_date: "2026-05-01",
    };
    expect(
      errorsFor(validate(fleet, { ...base, odometer_km: "many" }), "odometer_km")
    ).toHaveLength(1);
    expect(
      errorsFor(validate(fleet, { ...base, odometer_km: -5 }), "odometer_km")
    ).toHaveLength(1);
    expect(validate(fleet, { ...base, odometer_km: 0 })).toEqual([]);
  });

  it("supports min without max", () => {
    const base = {
      booking_ref: "BK000001",
      hall: "annex",
      event_date: "2026-12-01",
    };
    expect(
      errorsFor(validate(venue, { ...base, expected_guests: 0 }), "expected_guests")
    ).toHaveLength(1);
    expect(validate(venue, { ...base, expected_guests: 100000 })).toEqual([]);
  });
});

describe("dates", () => {
  it("rejects malformed and impossible dates", () => {
    const base = {
      plate_number: "AB-1234",
      vehicle_kind: "van",
      odometer_km: 10,
    };
    expect(
      errorsFor(validate(fleet, { ...base, service_date: "01/05/2026" }), "service_date")
    ).toHaveLength(1);
    expect(
      errorsFor(validate(fleet, { ...base, service_date: "2026-13-40" }), "service_date")
    ).toHaveLength(1);
    expect(validate(fleet, { ...base, service_date: "2026-05-01" })).toEqual([]);
  });
});

describe("choice and multi_choice", () => {
  it("rejects a value outside the options", () => {
    const record = {
      booking_ref: "BK123456",
      hall: "garden",
      event_date: "2026-10-10",
      expected_guests: 10,
    };
    expect(errorsFor(validate(venue, record), "hall")).toHaveLength(1);
  });

  it("enforces min_selected and max_selected", () => {
    const base = {
      enrollment_code: "abc123",
      course_level: "beginner",
      start_date: "2026-09-01",
    };
    expect(
      errorsFor(validate(course, { ...base, modules_selected: [] }), "modules_selected")
    ).toHaveLength(1);
    expect(
      errorsFor(
        validate(course, {
          ...base,
          modules_selected: ["theory", "lab", "fieldwork", "project", "exam"],
        }),
        "modules_selected"
      )
    ).toHaveLength(1);
  });

  it("rejects unknown and duplicate selections", () => {
    const base = {
      enrollment_code: "abc123",
      course_level: "beginner",
      start_date: "2026-09-01",
    };
    expect(
      errorsFor(
        validate(course, { ...base, modules_selected: ["theory", "swimming"] }),
        "modules_selected"
      )
    ).toHaveLength(1);
    expect(
      errorsFor(
        validate(course, { ...base, modules_selected: ["lab", "lab"] }),
        "modules_selected"
      )
    ).toHaveLength(1);
  });
});

describe("booleans and files", () => {
  it("rejects a non-boolean for a boolean field", () => {
    const record = {
      plate_number: "AB-1234",
      vehicle_kind: "van",
      service_date: "2026-05-01",
      odometer_km: 10,
      roadworthy: "yes",
    };
    expect(errorsFor(validate(fleet, record), "roadworthy")).toHaveLength(1);
  });

  it("enforces accepted file extensions, case-insensitively", () => {
    const base = {
      booking_ref: "BK123456",
      hall: "main",
      event_date: "2026-10-10",
      expected_guests: 10,
    };
    expect(
      errorsFor(validate(venue, { ...base, floor_plan: "plan.docx" }), "floor_plan")
    ).toHaveLength(1);
    expect(validate(venue, { ...base, floor_plan: "plan.PDF" })).toEqual([]);
  });
});

// --- Added for the Part 3 cross-field / conditional-required / evaluation-order work ---
// The 25 tests below (this block through the end of "conditional_required rules")
// are new; everything above and below them is the original, unmodified suite.

describe("field_comparison rules", () => {
  const dateRange: ClientDefinition = {
    client: "test",
    record_type: "date_range",
    fields: [
      { name: "start_date", label: "Start date", type: "date", required: true },
      { name: "end_date", label: "End date", type: "date", required: true },
    ],
    rules: [
      { type: "field_comparison", field: "end_date", operator: "gte", compare_to: "start_date" },
    ],
  };

  const optionalDateRange: ClientDefinition = {
    ...dateRange,
    fields: dateRange.fields.map((f) => ({ ...f, required: false })),
  };

  function comparisonDef(operator: ComparisonOperator): ClientDefinition {
    return {
      client: "test",
      record_type: "comparison",
      fields: [
        { name: "a", label: "A", type: "number", required: false },
        { name: "b", label: "B", type: "number", required: false },
      ],
      rules: [{ type: "field_comparison", field: "a", operator, compare_to: "b" }],
    };
  }

  it("passes when the comparison holds, including equal dates for gte", () => {
    expect(
      validate(dateRange, { start_date: "2026-01-01", end_date: "2026-01-01" })
    ).toEqual([]);
    expect(
      validate(dateRange, { start_date: "2026-01-01", end_date: "2026-01-05" })
    ).toEqual([]);
  });

  it("fails when the comparison is violated, reporting against the subject field", () => {
    const result = validate(dateRange, {
      start_date: "2026-09-10",
      end_date: "2026-09-01",
    });
    expect(result).toEqual([
      { field: "end_date", error: "Must be on or after Start date" },
    ]);
  });

  it("supports lt", () => {
    expect(validate(comparisonDef("lt"), { a: 1, b: 2 })).toEqual([]);
    expect(errorsFor(validate(comparisonDef("lt"), { a: 2, b: 2 }), "a")).toHaveLength(1);
  });

  it("supports lte", () => {
    expect(validate(comparisonDef("lte"), { a: 2, b: 2 })).toEqual([]);
    expect(errorsFor(validate(comparisonDef("lte"), { a: 3, b: 2 }), "a")).toHaveLength(1);
  });

  it("supports gt", () => {
    expect(validate(comparisonDef("gt"), { a: 3, b: 2 })).toEqual([]);
    expect(errorsFor(validate(comparisonDef("gt"), { a: 2, b: 2 }), "a")).toHaveLength(1);
  });

  it("supports gte", () => {
    expect(validate(comparisonDef("gte"), { a: 2, b: 2 })).toEqual([]);
    expect(errorsFor(validate(comparisonDef("gte"), { a: 1, b: 2 }), "a")).toHaveLength(1);
  });

  it("supports eq", () => {
    expect(validate(comparisonDef("eq"), { a: 2, b: 2 })).toEqual([]);
    expect(errorsFor(validate(comparisonDef("eq"), { a: 1, b: 2 }), "a")).toHaveLength(1);
  });

  it("supports neq", () => {
    expect(validate(comparisonDef("neq"), { a: 1, b: 2 })).toEqual([]);
    expect(errorsFor(validate(comparisonDef("neq"), { a: 2, b: 2 }), "a")).toHaveLength(1);
  });

  it("skips the rule when the dependency is missing, producing no error", () => {
    expect(
      validate(optionalDateRange, { end_date: "2026-01-01" })
    ).toEqual([]);
  });

  it("skips the rule when the dependency is missing and required, reporting only the base error", () => {
    const result = validate(dateRange, { end_date: "2026-01-01" });
    expect(result).toEqual([{ field: "start_date", error: "This field is required" }]);
  });

  it("skips the rule when the dependency is invalid, reporting only the base error", () => {
    const result = validate(dateRange, {
      start_date: "not-a-date",
      end_date: "2026-01-01",
    });
    expect(result).toEqual([
      { field: "start_date", error: "Must be a date in YYYY-MM-DD format" },
    ]);
  });

  it("skips the rule when the subject field itself is already invalid", () => {
    const result = validate(dateRange, {
      start_date: "2026-01-01",
      end_date: "not-a-date",
    });
    expect(result).toEqual([
      { field: "end_date", error: "Must be a date in YYYY-MM-DD format" },
    ]);
  });

  it("is inert when it references a field that does not exist in the definition", () => {
    const ghost: ClientDefinition = {
      client: "test",
      record_type: "ghost",
      fields: [{ name: "end_date", label: "End date", type: "date", required: false }],
      rules: [
        { type: "field_comparison", field: "end_date", operator: "gte", compare_to: "start_date" },
      ],
    };
    expect(validate(ghost, { end_date: "2026-01-01" })).toEqual([]);
  });

  it("allows multiple independent rules to both fire on the same field", () => {
    const doubleBound: ClientDefinition = {
      client: "test",
      record_type: "double_bound",
      fields: [
        { name: "start_date", label: "Start date", type: "date", required: false },
        { name: "end_date", label: "End date", type: "date", required: false },
        { name: "deadline", label: "Deadline", type: "date", required: false },
      ],
      rules: [
        { type: "field_comparison", field: "end_date", operator: "gte", compare_to: "start_date" },
        { type: "field_comparison", field: "end_date", operator: "lte", compare_to: "deadline" },
      ],
    };
    const result = validate(doubleBound, {
      start_date: "2026-09-10",
      end_date: "2026-09-01",
      deadline: "2026-08-01",
    });
    expect(errorsFor(result, "end_date")).toHaveLength(2);
  });

  it("produces the same errors regardless of rule declaration order", () => {
    const doubleBoundA: ClientDefinition = {
      client: "test",
      record_type: "double_bound",
      fields: [
        { name: "start_date", label: "Start date", type: "date", required: false },
        { name: "end_date", label: "End date", type: "date", required: false },
        { name: "deadline", label: "Deadline", type: "date", required: false },
      ],
      rules: [
        { type: "field_comparison", field: "end_date", operator: "gte", compare_to: "start_date" },
        { type: "field_comparison", field: "end_date", operator: "lte", compare_to: "deadline" },
      ],
    };
    const doubleBoundB: ClientDefinition = {
      ...doubleBoundA,
      rules: [...doubleBoundA.rules!].reverse(),
    };
    const record = {
      start_date: "2026-09-10",
      end_date: "2026-09-01",
      deadline: "2026-08-01",
    };
    const sort = (errs: { field: string; error: string }[]) =>
      [...errs].sort((x, y) => (x.field + x.error).localeCompare(y.field + y.error));
    expect(sort(validate(doubleBoundA, record))).toEqual(sort(validate(doubleBoundB, record)));
  });
});

describe("conditional_required rules", () => {
  const carInvoice: ClientDefinition = {
    client: "test",
    record_type: "car_invoice",
    fields: [
      { name: "vehicle_kind", label: "Vehicle kind", type: "choice", required: true, options: ["car", "van", "motorcycle"] },
      { name: "invoice_file", label: "Invoice", type: "file", required: false },
    ],
    rules: [
      { type: "conditional_required", field: "invoice_file", when: "vehicle_kind", equals: "car" },
    ],
  };

  it("requires the field when the condition matches and it is missing", () => {
    const result = validate(carInvoice, { vehicle_kind: "car" });
    expect(result).toEqual([{ field: "invoice_file", error: "This field is required" }]);
  });

  it("does not complain when the condition matches and the field is present", () => {
    expect(
      validate(carInvoice, { vehicle_kind: "car", invoice_file: "receipt.pdf" })
    ).toEqual([]);
  });

  it("does not require the field when the condition does not match", () => {
    expect(validate(carInvoice, { vehicle_kind: "van" })).toEqual([]);
  });

  it("matches a false condition value, and does not confuse it with a missing dependency", () => {
    const bool: ClientDefinition = {
      client: "test",
      record_type: "bool_cond",
      fields: [
        { name: "roadworthy", label: "Roadworthy", type: "boolean", required: false },
        { name: "mechanic_notes", label: "Mechanic notes", type: "long_text", required: false },
      ],
      rules: [
        { type: "conditional_required", field: "mechanic_notes", when: "roadworthy", equals: false },
      ],
    };
    expect(validate(bool, { roadworthy: false })).toEqual([
      { field: "mechanic_notes", error: "This field is required" },
    ]);
    expect(validate(bool, { roadworthy: true })).toEqual([]);
    // roadworthy absent: missing dependency, condition never matches
    expect(validate(bool, {})).toEqual([]);
  });

  it("matches a 0 condition value", () => {
    const numeric: ClientDefinition = {
      client: "test",
      record_type: "numeric_cond",
      fields: [
        { name: "seats_reserved", label: "Seats reserved", type: "number", required: false },
        { name: "waitlist_reason", label: "Waitlist reason", type: "text", required: false },
      ],
      rules: [
        { type: "conditional_required", field: "waitlist_reason", when: "seats_reserved", equals: 0 },
      ],
    };
    expect(validate(numeric, { seats_reserved: 0 })).toEqual([
      { field: "waitlist_reason", error: "This field is required" },
    ]);
    expect(validate(numeric, { seats_reserved: 5 })).toEqual([]);
  });

  it("does not coerce a numeric-looking string to match a number condition value", () => {
    const textWhen: ClientDefinition = {
      client: "test",
      record_type: "text_when_numeric_equals",
      fields: [
        { name: "code", label: "Code", type: "text", required: false },
        { name: "note", label: "Note", type: "text", required: false },
      ],
      rules: [{ type: "conditional_required", field: "note", when: "code", equals: 0 }],
    };
    // "0" (string, a valid text value on its own) must not match equals: 0 (number)
    expect(validate(textWhen, { code: "0" })).toEqual([]);
  });

  it("matches a string condition value (already covered above), and is skipped when the dependency is invalid", () => {
    const result = validate(carInvoice, { vehicle_kind: "boat" });
    expect(result).toEqual([
      { field: "vehicle_kind", error: "Not an allowed value: boat" },
    ]);
  });

  it("does not duplicate the required error when the field is both statically and conditionally required", () => {
    const doubleRequired: ClientDefinition = {
      client: "test",
      record_type: "double_required",
      fields: [
        { name: "vehicle_kind", label: "Vehicle kind", type: "choice", required: true, options: ["car", "van"] },
        { name: "invoice_file", label: "Invoice", type: "file", required: true },
      ],
      rules: [
        { type: "conditional_required", field: "invoice_file", when: "vehicle_kind", equals: "car" },
      ],
    };
    const result = validate(doubleRequired, { vehicle_kind: "car" });
    expect(errorsFor(result, "invoice_file")).toHaveLength(1);
  });

  it("is inert when 'field' does not exist in the definition", () => {
    const ghost: ClientDefinition = {
      client: "test",
      record_type: "ghost",
      fields: [{ name: "vehicle_kind", label: "Vehicle kind", type: "choice", required: false, options: ["car"] }],
      rules: [
        { type: "conditional_required", field: "not_declared", when: "vehicle_kind", equals: "car" },
      ],
    };
    expect(validate(ghost, { vehicle_kind: "car" })).toEqual([]);
  });

  it("is inert when 'when' does not exist in the definition (never matches)", () => {
    const ghost: ClientDefinition = {
      client: "test",
      record_type: "ghost",
      fields: [{ name: "invoice_file", label: "Invoice", type: "file", required: false }],
      rules: [
        { type: "conditional_required", field: "invoice_file", when: "not_declared", equals: "car" },
      ],
    };
    expect(validate(ghost, {})).toEqual([]);
  });
});

describe("fail-closed behaviour", () => {
  it("reports unknown fields instead of ignoring them", () => {
    const record = {
      plate_number: "AB-1234",
      vehicle_kind: "van",
      service_date: "2026-05-01",
      odometer_km: 10,
      secret_flag: true,
    };
    expect(errorsFor(validate(fleet, record), "secret_flag")).toHaveLength(1);
  });

  it("works for any definition it is given, with no client knowledge", () => {
    const adHoc = {
      client: "anyone",
      record_type: "anything",
      fields: [
        { name: "title", label: "Title", type: "text" as const, required: true },
      ],
    };
    expect(validate(adHoc, { title: "hello" })).toEqual([]);
    expect(errorsFor(validate(adHoc, {}), "title")).toHaveLength(1);
  });
});
