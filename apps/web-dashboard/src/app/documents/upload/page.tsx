"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UploadForm } from "@/components/upload/UploadForm";
import type { Document } from "@memory-platform/shared-schemas";

export default function UploadPage() {
  const router = useRouter();
  const [lastUploaded, setLastUploaded] = useState<Document | null>(null);

  const handleSuccess = (doc: Document) => {
    setLastUploaded(doc);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-900 tracking-tight">Upload Document</h1>
        <p className="text-sm text-surface-500 mt-1">
          Add new content to your memory by pasting text, providing a URL, or uploading a file.
        </p>
      </div>

      <div className="max-w-2xl">
        <UploadForm onSuccess={handleSuccess} />
      </div>

      {lastUploaded && (
        <div className="max-w-2xl">
          <div className="p-4 rounded-xl bg-success-50 border border-success-100">
            <div className="flex items-center gap-2 mb-1">
              <svg className="h-5 w-5 text-success-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-medium text-success-700">Document created successfully</p>
            </div>
            <p className="text-sm text-success-600 ml-7">
              &ldquo;{lastUploaded.title}&rdquo; is now being processed. Status: {lastUploaded.status}
            </p>
            <button
              onClick={() => router.push("/documents")}
              className="ml-7 mt-2 text-sm text-success-700 font-medium hover:text-success-800 underline"
            >
              View all documents
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
