/** Limits for files attached to agent emails. They are kept in the database and sent through Microsoft 365. */
export const MAX_FILE_BYTES = 3 * 1024 * 1024; // Microsoft Graph's limit for a directly attached file
export const MAX_TOTAL_BYTES = 4 * 1024 * 1024; // keeps one request within the hosting body limit
export const MAX_FILES = 3;
const BLOCKED = /\.(exe|bat|cmd|com|scr|msi|js|jse|vbs|vbe|ps1|jar|lnk|dll|reg|hta)$/i;

export function checkFile(name: string, size: number): string | null {
  if (!name || name.length > 200) return "That file name isn't usable.";
  if (BLOCKED.test(name)) return "That file type can't be attached for security reasons.";
  if (size <= 0) return "That file is empty.";
  if (size > MAX_FILE_BYTES) return `Each file can be up to ${MAX_FILE_BYTES / 1048576} MB.`;
  return null;
}

export const fmtSize = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`);
