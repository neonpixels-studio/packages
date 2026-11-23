export type DatabaseErrorCode = "missing-database-url";

/** The only error this package throws. */
export class DatabaseError extends Error {
  override name = "DatabaseError";
  readonly code: DatabaseErrorCode;

  constructor(code: DatabaseErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}
