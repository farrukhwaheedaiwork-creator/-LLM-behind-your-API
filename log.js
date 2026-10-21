// Structured one-line JSON logs to stdout (Twelve-Factor: let the environment route them).
export function log(obj) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...obj }));
}
