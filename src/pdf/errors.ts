// Kept apart from engine.ts so screens can check errors without loading PDF.js.
export class PasswordNeeded extends Error {
  readonly incorrect: boolean;
  constructor(incorrect: boolean) { super(incorrect ? "Incorrect password" : "Password needed"); this.incorrect = incorrect; }
}
export class NotAPdf extends Error {}
