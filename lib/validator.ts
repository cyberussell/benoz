import {
  ClientDefinition,
  FieldDefinition,
  RecordData,
  ValidationError,
  ValidationResult,
} from "./types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "") ||
    (Array.isArray(value) && value.length === 0)
  );
}

function validateField(field: FieldDefinition, value: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  const err = (message: string) => errors.push({ field: field.name, error: message });
  const c = field.constraints ?? {};

  if (isEmpty(value)) {
    if (field.required) err("This field is required");
    return errors;
  }

  switch (field.type) {
    case "text":
    case "long_text": {
      if (typeof value !== "string") {
        err("Must be a string");
        break;
      }
      if (c.min_length !== undefined && value.length < c.min_length)
        err(`Must be at least ${c.min_length} characters`);
      if (c.max_length !== undefined && value.length > c.max_length)
        err(`Must be at most ${c.max_length} characters`);
      if (c.pattern !== undefined && !new RegExp(c.pattern).test(value))
        err("Does not match the required format");
      break;
    }

    case "number": {
      if (typeof value !== "number" || Number.isNaN(value)) {
        err("Must be a number");
        break;
      }
      if (c.min !== undefined && value < c.min) err(`Must be at least ${c.min}`);
      if (c.max !== undefined && value > c.max) err(`Must be at most ${c.max}`);
      break;
    }

    case "date": {
      if (typeof value !== "string" || !DATE_RE.test(value)) {
        err("Must be a date in YYYY-MM-DD format");
        break;
      }
      const parsed = new Date(`${value}T00:00:00Z`);
      if (Number.isNaN(parsed.getTime())) err("Not a real calendar date");
      break;
    }

    case "boolean": {
      if (typeof value !== "boolean") err("Must be true or false");
      break;
    }

    case "choice": {
      if (typeof value !== "string" || !(field.options ?? []).includes(value))
        err(`Not an allowed value: ${String(value)}`);
      break;
    }

    case "multi_choice": {
      if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
        err("Must be a list of values");
        break;
      }
      const options = field.options ?? [];
      const bad = value.filter((v) => !options.includes(v as string));
      if (bad.length > 0) err(`Not allowed values: ${bad.join(", ")}`);
      if (new Set(value).size !== value.length) err("Contains duplicate values");
      if (c.min_selected !== undefined && value.length < c.min_selected)
        err(`Select at least ${c.min_selected}`);
      if (c.max_selected !== undefined && value.length > c.max_selected)
        err(`Select at most ${c.max_selected}`);
      break;
    }

    case "file": {
      // A file value is its filename (upload handling lives elsewhere).
      if (typeof value !== "string") {
        err("Must be a filename");
        break;
      }
      const ext = value.includes(".") ? value.split(".").pop()!.toLowerCase() : "";
      if (c.accepted !== undefined && !c.accepted.includes(ext))
        err(`File type not accepted: .${ext || "?"}`);
      break;
    }
  }

  return errors;
}

/**
 * Validate one record against a client definition.
 * Returns an empty array when the record is valid.
 *
 * Unknown keys in the record (keys with no field definition) are reported
 * as errors: the engine fails closed on fields it does not recognise.
 */
export function validate(
  definition: ClientDefinition,
  record: RecordData
): ValidationResult {
  const errors: ValidationError[] = [];

  for (const field of definition.fields) {
    errors.push(...validateField(field, record[field.name]));
  }

  const known = new Set(definition.fields.map((f) => f.name));
  for (const key of Object.keys(record)) {
    if (!known.has(key)) {
      errors.push({ field: key, error: "Unknown field" });
    }
  }

  return errors;
}
