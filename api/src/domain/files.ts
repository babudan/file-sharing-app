const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "application/x-zip-compressed",
  "text/plain",
  "text/csv",
  "text/markdown",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

const ALLOWED_EXTENSIONS = new Set([
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "zip",
  "txt",
  "csv",
  "md",
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
]);

export function fileExtension(filename: string): string {
  const parts = filename.split(".");
  if (parts.length < 2) return "";
  return parts[parts.length - 1]!.toLowerCase();
}

export function isAllowedUpload(filename: string, mimeType: string): boolean {
  const ext = fileExtension(filename);
  if (!ext || !ALLOWED_EXTENSIONS.has(ext)) return false;
  if (!mimeType) return true;
  return ALLOWED_MIME_TYPES.has(mimeType);
}

export function sanitizeFilename(filename: string): string {
  const base = filename.replace(/[/\\]/g, "_").replace(/\0/g, "").trim();
  const cleaned = base.replace(/[^\w.\- ()[\]]+/g, "_");
  return cleaned.slice(0, 180) || "document";
}

export function buildStorageKey(workspaceId: string, documentId: string, filename: string): string {
  return `workspaces/${workspaceId}/documents/${documentId}/${sanitizeFilename(filename)}`;
}
