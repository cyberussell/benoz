import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
import { validate } from "../lib/validator";
import { ClientDefinition } from "../lib/types";

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
