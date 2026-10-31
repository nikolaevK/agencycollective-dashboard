// Pure (no db imports): the upload dialog checks the size client-side without
// pulling the database client into the browser bundle. lib/payoutDocuments
// re-exports it.

export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
