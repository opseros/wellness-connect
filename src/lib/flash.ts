/** Build a URL back to a page with a one-line message (?msg= or ?error=). */
export const withMessage = (path: string, kind: "msg" | "error", text: string) => {
  const url = new URL(path, "http://x");
  url.searchParams.set(kind, text);
  return url.pathname + url.search + url.hash;
};
