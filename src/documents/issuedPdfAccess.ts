export type IssuedPdfErrorCode = 'ISSUED_DOCUMENT_NOT_FOUND' | 'ISSUED_SNAPSHOT_NOT_FOUND' | 'PDF_RENDER_FAILED' | 'LOCAL_FILE_UNAVAILABLE';

export class IssuedPdfError extends Error {
  constructor(readonly code: IssuedPdfErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'IssuedPdfError';
  }
}

type IssuedDocumentRecord = { status: 'ready' | 'failed'; fileUri: string | null } | null;

export type IssuedPdfAccessResult = {
  uri: string;
  source: 'persisted-document' | 'immutable-snapshot';
  recoveredFrom: 'ISSUED_DOCUMENT_NOT_FOUND' | 'LOCAL_FILE_UNAVAILABLE' | null;
};

export async function resolveIssuedPdf(
  quoteId: string,
  gateway: {
    loadDocument: (quoteId: string) => Promise<IssuedDocumentRecord>;
    isLocalFileAvailable: (uri: string) => boolean;
    renderFromImmutableSnapshot: (quoteId: string) => Promise<string>;
  },
): Promise<IssuedPdfAccessResult> {
  let document: IssuedDocumentRecord;
  try {
    document = await gateway.loadDocument(quoteId);
  } catch (error) {
    throw new IssuedPdfError('ISSUED_DOCUMENT_NOT_FOUND', 'Il documento PDF emesso non è disponibile localmente.', { cause: error });
  }

  if (document?.status === 'ready' && document.fileUri && gateway.isLocalFileAvailable(document.fileUri)) {
    return { uri: document.fileUri, source: 'persisted-document', recoveredFrom: null };
  }

  const recoveredFrom: IssuedPdfAccessResult['recoveredFrom'] = document?.fileUri ? 'LOCAL_FILE_UNAVAILABLE' : 'ISSUED_DOCUMENT_NOT_FOUND';
  return { uri: await gateway.renderFromImmutableSnapshot(quoteId), source: 'immutable-snapshot', recoveredFrom };
}
