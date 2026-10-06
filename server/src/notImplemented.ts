// Placeholder entrypoint for scripts whose task hasn't landed yet (TASKS_V2.md Conventions).
export function notImplemented(what: string, task: string): never {
  console.error(`${what} is not implemented yet — see ${task} in TASKS_V2.md.`);
  process.exit(1);
}
