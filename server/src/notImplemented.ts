// Placeholder entrypoint for scripts whose task hasn't landed yet (docs/phases/).
export function notImplemented(what: string, task: string): never {
  console.error(`${what} is not implemented yet — see ${task} in docs/phases/.`);
  process.exit(1);
}
