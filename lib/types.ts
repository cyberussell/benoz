export type FieldType =
  | "text"
  | "long_text"
  | "number"
  | "date"
  | "boolean"
  | "choice"
  | "multi_choice"
  | "file";

export interface Constraints {
  pattern?: string;
  min?: number;
  max?: number;
  min_length?: number;
  max_length?: number;
  min_selected?: number;
  max_selected?: number;
  accepted?: string[]; // file extensions, lowercase, no dot
}

export interface FieldDefinition {
  name: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: string[]; // for choice / multi_choice
  constraints?: Constraints;
  sensitivity?: string; // metadata only; the validator ignores it
}

export type ComparisonOperator = "lt" | "lte" | "gt" | "gte" | "eq" | "neq";

/**
 * Compares two fields of the same type (date or number). Reports against `field`.
 * Skipped (never fires) when `field` or `compare_to` is empty, already invalid,
 * unknown, or type-mismatched — see lib/validator.ts.
 */
export interface FieldComparisonRule {
  type: "field_comparison";
  field: string;
  operator: ComparisonOperator;
  compare_to: string;
  message?: string;
}

export type ConditionValue = string | number | boolean;

/**
 * Makes `field` required only when `when` strictly equals `equals`. Reports
 * against `field`. Skipped when `field` is already invalid (e.g. statically
 * required and already reported missing); `when` needs no such check since a
 * missing/invalid/unknown dependency simply fails the equality test.
 */
export interface ConditionalRequiredRule {
  type: "conditional_required";
  field: string;
  when: string;
  equals: ConditionValue;
  message?: string;
}

export type Rule = FieldComparisonRule | ConditionalRequiredRule;

export interface ClientDefinition {
  client: string;
  record_type: string;
  fields: FieldDefinition[];
  rules?: Rule[];
}

export type RecordData = Record<string, unknown>;

export interface ValidationError {
  field: string;
  error: string;
}

export type ValidationResult = ValidationError[];
