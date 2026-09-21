import { describe, expect, it } from "vitest";
import { buildStorageKey, isAllowedUpload, sanitizeFilename } from "./files.js";

describe("file validation", () => {
  it("accepts common document types and rejects executables", () => {
    expect(isAllowedUpload("brief.pdf", "application/pdf")).toBe(true);
    expect(isAllowedUpload("notes.txt", "text/plain")).toBe(true);
    expect(isAllowedUpload("payload.exe", "application/x-msdownload")).toBe(false);
    expect(isAllowedUpload("script.js", "text/javascript")).toBe(false);
  });

  it("strips path characters so storage keys cannot escape the prefix", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe(".._.._etc_passwd");
    expect(sanitizeFilename("Q4 report (final).pdf")).toBe("Q4 report (final).pdf");
  });

  it("namespaces objects by workspace and document id", () => {
    const key = buildStorageKey("ws1", "doc1", "invoice.pdf");
    expect(key).toBe("workspaces/ws1/documents/doc1/invoice.pdf");
  });
});
