export type DatabaseErrorCode = "missing-database-url" | "unknown-migration";

/** Thrown for invalid database setup, with a stable `code`. */
export class DatabaseError extends Error {
  override name = "DatabaseError";
  readonly code: DatabaseErrorCode;

  constructor(code: DatabaseErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}
