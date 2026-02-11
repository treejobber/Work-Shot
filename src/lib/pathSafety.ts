import * as path from "path";

/**
 * Normalize and resolve a path, then verify it is contained within the
 * given anchor directory. Returns the resolved absolute path.
 *
 * Throws if the resolved path escapes the anchor.
 */
export function assertContainedIn(
  candidate: string,
  anchor: string,
  label: string
): string {
  const resolvedAnchor = path.resolve(anchor) + path.sep;
  const resolvedCandidate = path.resolve(anchor, candidate);

  if (
    !resolvedCandidate.startsWith(resolvedAnchor) &&
    resolvedCandidate !== resolvedAnchor.slice(0, -1)
  ) {
    throw new PathEscapeError(
      `${label} resolves outside its allowed directory. ` +
        `Resolved: ${resolvedCandidate}, Anchor: ${resolvedAnchor.slice(0, -1)}`
    );
  }

  return resolvedCandidate;
}

/**
 * Verify that a resolved absolute path is contained within the anchor
 * directory. Both paths must already be resolved/absolute.
 *
 * Throws if the resolved path escapes the anchor.
 */
export function assertResolvedContainedIn(
  resolvedPath: string,
  anchor: string,
  label: string
): void {
  const resolvedAnchor = path.resolve(anchor);
  const normalizedPath = path.resolve(resolvedPath);
  const anchorPrefix = resolvedAnchor + path.sep;

  if (
    normalizedPath !== resolvedAnchor &&
    !normalizedPath.startsWith(anchorPrefix)
  ) {
    throw new PathEscapeError(
      `${label} resolves outside its allowed directory. ` +
        `Resolved: ${normalizedPath}, Anchor: ${resolvedAnchor}`
    );
  }
}

/**
 * Validate that a filename is a simple basename (no directory separators,
 * no traversal components). Used for media references in job.json.
 */
export function assertSafeFilename(filename: string, label: string): void {
  if (
    filename.includes("/") ||
    filename.includes("\\") ||
    filename === ".." ||
    filename === "." ||
    filename.includes("..") ||
    filename.length === 0
  ) {
    throw new PathEscapeError(
      `${label} contains invalid path components: "${filename}"`
    );
  }
}

export class PathEscapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathEscapeError";
  }
}
