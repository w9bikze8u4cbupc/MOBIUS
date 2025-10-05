import { useRef, useState } from 'react';
import { notify } from '../utils/notifications';

const MAX_FILE_BYTES = 16 * 1024 * 1024;

export function RulebookIngestion({ onUploadFile, onSubmitText, isProcessing }) {
  const fileInputRef = useRef(null);
  const [localFile, setLocalFile] = useState(null);
  const [rulebookText, setRulebookText] = useState('');

  const handleFileChange = (event) => {
    const [file] = event.target.files ?? [];
    if (!file) return;

    if (!file.type.includes('pdf')) {
      notify.error('Please upload a PDF rulebook.');
      return;
    }

    if (file.size > MAX_FILE_BYTES) {
      notify.error('PDF exceeds the 16 MB limit. Please split it or reduce size.');
      return;
    }

    setLocalFile(file);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    handleFileChange({ target: { files: event.dataTransfer.files } });
  };

  const badge = localFile ? `Selected: ${localFile.name}` : 'Drag & drop a PDF, or click to select';

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Rulebook Ingestion</h2>

      {isProcessing && (
        <div className="rounded-md bg-blue-50 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <div className="h-5 w-5 text-blue-400 animate-spin" role="status">
                <span className="sr-only">Processing...</span>
              </div>
            </div>
            <div className="ml-3">
              <p className="text-sm text-blue-700">
                <strong>Processing...</strong> Rulebook ingestion in progress. Status will update automatically.
              </p>
            </div>
          </div>
        </div>
      )}

      <div
        className={`flex cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed border-gray-400 p-8 text-center ${
          isProcessing ? 'opacity-50 pointer-events-none' : ''
        }`}
        onDrop={handleDrop}
        onDragOver={(event) => event.preventDefault()}
        onClick={() => !isProcessing && fileInputRef.current?.click()}
        role="button"
        tabIndex={isProcessing ? -1 : 0}
        onKeyDown={(event) => !isProcessing && event.key === 'Enter' && fileInputRef.current?.click()}
      >
        <p className="text-sm text-gray-600">{badge}</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          hidden
          onChange={handleFileChange}
          disabled={isProcessing}
        />
        {localFile && (
          <button
            type="button"
            className="mt-4 rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={isProcessing}
            onClick={() => onUploadFile(localFile)}
          >
            {isProcessing ? 'Uploading…' : 'Upload & Parse'}
          </button>
        )}
      </div>

      <div className={isProcessing ? 'opacity-50 pointer-events-none' : ''}>
        <label className="flex flex-col text-sm font-medium">
          Or paste rulebook text here
          <textarea
            className="mt-1 h-48 rounded border px-3 py-2 font-mono"
            value={rulebookText}
            onChange={(event) => setRulebookText(event.target.value)}
            placeholder="Paste text or AI output…"
            disabled={isProcessing}
          />
        </label>
        <button
          type="button"
          disabled={isProcessing || !rulebookText.trim()}
          className="mt-3 rounded border border-gray-700 px-4 py-2 font-semibold disabled:opacity-50"
          onClick={() => onSubmitText(rulebookText.trim())}
        >
          {isProcessing ? 'Submitting…' : 'Submit Text'}
        </button>
      </div>
    </section>
  );
}