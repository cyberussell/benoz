import {
  ClientDefinition,
  ComparisonOperator,
  ConditionalRequiredRule,
  FieldComparisonRule,
  FieldDefinition,
  FieldType,
  RecordData,
  Rule,
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

// Field types a `field_comparison` rule can order. Anything else is inert.
type OrderableType = "date" | "number";

function isOrderableType(type: FieldType): type is OrderableType {
  return type === "date" || type === "number";
}

function orderableValue(type: OrderableType, raw: unknown): number | undefined {
  if (type === "number") {
    return typeof raw === "number" && !Number.isNaN(raw) ? raw : undefined;
  }
  if (typeof raw !== "string") return undefined;
  const t = new Date(`${raw}T00:00:00Z`).getTime();
  return Number.isNaN(t) ? undefined : t;
}

function comparisonHolds(operator: ComparisonOperator, a: number, b: number): boolean {
  switch (operator) {
    case "lt":
      return a < b;
    case "lte":
      return a <= b;
    case "gt":
      return a > b;
    case "gte":
      return a >= b;
    case "eq":
      return a === b;
    case "neq":
      return a !== b;
  }
}

const COMPARISON_MESSAGES: Record<OrderableType, Record<ComparisonOperator, (label: string) => string>> = {
  date: {
    lt: (label) => `Must be before ${label}`,
    lte: (label) => `Must be on or before ${label}`,
    gt: (label) => `Must be after ${label}`,
    gte: (label) => `Must be on or after ${label}`,
    eq: (label) => `Must be the same date as ${label}`,
    neq: (label) => `Must be a different date than ${label}`,
  },
  number: {
    lt: (label) => `Must be less than ${label}`,
    lte: (label) => `Must be at most ${label}`,
    gt: (label) => `Must be greater than ${label}`,
    gte: (label) => `Must be at least ${label}`,
    eq: (label) => `Must equal ${label}`,
    neq: (label) => `Must not equal ${label}`,
  },
};

/**
 * Evaluates one field_comparison rule against a frozen base-error snapshot.
 * Skipped (returns null) whenever a meaningful comparison isn't possible:
 * unknown field reference, mismatched/unsupported types, either side empty,
 * or either side already reported invalid in the base pass.
 */
function evaluateFieldComparison(
  rule: FieldComparisonRule,
  fieldsByName: Map<string, FieldDefinition>,
  record: RecordData,
  invalidFields: Set<string>
): ValidationError | null {
  const subject = fieldsByName.get(rule.field);
  const other = fieldsByName.get(rule.compare_to);
  if (!subject || !other) return null;
  if (subject.type !== other.type || !isOrderableType(subject.type)) return null;

  if (invalidFields.has(rule.field) || invalidFields.has(rule.compare_to)) return null;

  const subjectRaw = record[rule.field];
  const otherRaw = record[rule.compare_to];
  if (isEmpty(subjectRaw) || isEmpty(otherRaw)) return null;

  const type = subject.type;
  const a = orderableValue(type, subjectRaw);
  const b = orderableValue(type, otherRaw);
  if (a === undefined || b === undefined) return null;

  if (comparisonHolds(rule.operator, a, b)) return null;

  return {
    field: rule.field,
    error: rule.message ?? COMPARISON_MESSAGES[type][rule.operator](other.label),
  };
}

/**
 * Evaluates one conditional_required rule against a frozen base-error
 * snapshot. Skipped when `field` is unknown or already invalid (this also
 * prevents a duplicate "This field is required" when `field` is statically
 * required too). `when` needs no such check: strict equality against a
 * missing, invalid, or unknown dependency's value simply fails to match.
 */
function evaluateConditionalRequired(
  rule: ConditionalRequiredRule,
  fieldsByName: Map<string, FieldDefinition>,
  record: RecordData,
  invalidFields: Set<string>
): ValidationError | null {
  if (!fieldsByName.has(rule.field)) return null;
  if (invalidFields.has(rule.field)) return null;
  if (record[rule.when] !== rule.equals) return null;
  if (!isEmpty(record[rule.field])) return null;

  return {
    field: rule.field,
    error: rule.message ?? "This field is required",
  };
}

function evaluateRule(
  rule: Rule,
  fieldsByName: Map<string, FieldDefinition>,
  record: RecordData,
  invalidFields: Set<string>
): ValidationError | null {
  return rule.type === "field_comparison"
    ? evaluateFieldComparison(rule, fieldsByName, record, invalidFields)
    : evaluateConditionalRequired(rule, fieldsByName, record, invalidFields);
}

/**
 * Validate one record against a client definition.
 * Returns an empty array when the record is valid.
 *
 * Two passes. Pass 1 validates each declared field independently and flags
 * unknown record keys (fail-closed). Pass 2 evaluates `rules`, each rule
 * exactly once against the Pass 1 result — rules never see each other's
 * output, so declaration order affects only the position of rule errors in
 * the returned array, never which errors appear.
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

  const invalidFields = new Set(errors.map((e) => e.field));
  const fieldsByName = new Map(definition.fields.map((f) => [f.name, f]));

  for (const rule of definition.rules ?? []) {
    const error = evaluateRule(rule, fieldsByName, record, invalidFields);
    if (error) errors.push(error);
  }

  return errors;
}
