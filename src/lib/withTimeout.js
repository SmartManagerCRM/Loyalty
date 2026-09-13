// A promise that never settles (which is what an unhandled fetch()
// hijacked by something outside the app can do) leaves any UI awaiting it
// stuck forever — try/catch can't help, since nothing ever rejects. This
// races the real work against a timer so the UI always eventually recovers
// into an error/retry state instead of spinning indefinitely.
export function withTimeout(promise, ms = 20000, message = "Request timed out. Check your connection and try again.") {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}
