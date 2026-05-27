"use client";

import { useState } from "react";
import { Input, Textarea } from "../ui/Input";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { uploadText, uploadUrl, uploadFile } from "@/lib/api";
import type { Document } from "@memory-platform/shared-schemas";

type UploadTab = "text" | "url" | "file";

interface UploadFormProps {
  onSuccess?: (doc: Document) => void;
}

export function UploadForm({ onSuccess }: UploadFormProps) {
  const [activeTab, setActiveTab] = useState<UploadTab>("text");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>("");

  return (
    <Card padding="lg">
      <div className="flex border-b border-surface-200 mb-6">
        {(["text", "url", "file"] as UploadTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`
              px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px
              ${activeTab === tab
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-surface-500 hover:text-surface-700"
              }
            `.trim()}
          >
            {tab === "text" ? "Paste Text" : tab === "url" ? "From URL" : "File Upload"}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-error-50 text-error-700 text-sm border border-error-100">
          {error}
        </div>
      )}

      {activeTab === "text" && (
        <TextUpload
          loading={loading}
          setLoading={setLoading}
          setError={setError}
          setProgress={setProgress}
          onSuccess={onSuccess}
        />
      )}
      {activeTab === "url" && (
        <URLUpload
          loading={loading}
          setLoading={setLoading}
          setError={setError}
          setProgress={setProgress}
          onSuccess={onSuccess}
        />
      )}
      {activeTab === "file" && (
        <FileUpload
          loading={loading}
          setLoading={setLoading}
          setError={setError}
          setProgress={setProgress}
          onSuccess={onSuccess}
        />
      )}

      {loading && (
        <div className="mt-4">
          <div className="flex items-center gap-2 text-sm text-brand-600">
            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {progress}
          </div>
        </div>
      )}
    </Card>
  );
}

function TextUpload({
  loading,
  setLoading,
  setError,
  setProgress,
  onSuccess,
}: {
  loading: boolean;
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
  setProgress: (v: string) => void;
  onSuccess?: (doc: Document) => void;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      setError("Title and content are required.");
      return;
    }
    setLoading(true);
    setError(null);
    setProgress("Uploading text content...");
    try {
      const doc = await uploadText({
        title: title.trim(),
        content: content.trim(),
        description: description.trim() || undefined,
        tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
      });
      setProgress("Upload complete!");
      onSuccess?.(doc);
      setTitle("");
      setContent("");
      setDescription("");
      setTags("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input label="Title" value={title} onChange={(e) => setTitle(e.currentTarget.value)} placeholder="e.g., Meeting Notes - May 2026" disabled={loading} />
      <Textarea label="Content" value={content} onChange={(e) => setContent(e.currentTarget.value)} placeholder="Paste your text content here..." rows={8} disabled={loading} />
      <Input label="Description (optional)" value={description} onChange={(e) => setDescription(e.currentTarget.value)} placeholder="Brief description of this content" disabled={loading} />
      <Input label="Tags (optional)" value={tags} onChange={(e) => setTags(e.currentTarget.value)} placeholder="comma-separated, e.g., meeting, product, planning" disabled={loading} />
      <Button type="submit" loading={loading}>Upload Text</Button>
    </form>
  );
}

function URLUpload({
  loading,
  setLoading,
  setError,
  setProgress,
  onSuccess,
}: {
  loading: boolean;
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
  setProgress: (v: string) => void;
  onSuccess?: (doc: Document) => void;
}) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !url.trim()) {
      setError("Title and URL are required.");
      return;
    }
    try {
      new URL(url);
    } catch {
      setError("Please enter a valid URL.");
      return;
    }
    setLoading(true);
    setError(null);
    setProgress("Fetching and processing URL...");
    try {
      const doc = await uploadUrl({
        title: title.trim(),
        url: url.trim(),
        description: description.trim() || undefined,
        tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
      });
      setProgress("URL processed successfully!");
      onSuccess?.(doc);
      setTitle("");
      setUrl("");
      setDescription("");
      setTags("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input label="Title" value={title} onChange={(e) => setTitle(e.currentTarget.value)} placeholder="e.g., API Documentation" disabled={loading} />
      <Input label="URL" type="url" value={url} onChange={(e) => setUrl(e.currentTarget.value)} placeholder="https://example.com/doc" disabled={loading} />
      <Input label="Description (optional)" value={description} onChange={(e) => setDescription(e.currentTarget.value)} placeholder="Brief description" disabled={loading} />
      <Input label="Tags (optional)" value={tags} onChange={(e) => setTags(e.currentTarget.value)} placeholder="comma-separated" disabled={loading} />
      <Button type="submit" loading={loading}>Fetch & Upload</Button>
    </form>
  );
}

function FileUpload({
  loading,
  setLoading,
  setError,
  setProgress,
  onSuccess,
}: {
  loading: boolean;
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
  setProgress: (v: string) => void;
  onSuccess?: (doc: Document) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Please select a file.");
      return;
    }
    setLoading(true);
    setError(null);
    setProgress("Uploading file...");
    try {
      const doc = await uploadFile(
        file,
        title.trim() || undefined,
        description.trim() || undefined,
        tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
      );
      setProgress("File uploaded successfully!");
      onSuccess?.(doc);
      setFile(null);
      setTitle("");
      setDescription("");
      setTags("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div
        onDragOver={(e: React.DragEvent) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e: React.DragEvent) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer?.files?.[0];
          if (f) { setFile(f); if (!title) setTitle(f.name); }
        }}
        className={`
          flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 transition-colors
          ${dragOver ? "border-brand-500 bg-brand-50/50" : "border-surface-300 hover:border-surface-400 bg-surface-50/30"}
          ${file ? "border-success-600 bg-success-50/30" : ""}
        `.trim()}
      >
        {file ? (
          <div className="text-center">
            <svg className="mx-auto h-10 w-10 text-success-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <p className="text-sm font-medium text-surface-900 mb-1">{file.name}</p>
            <p className="text-xs text-surface-400">{(file.size / 1024).toFixed(1)} KB</p>
            <button type="button" onClick={() => setFile(null)} className="mt-2 text-xs text-error-600 hover:text-error-700 font-medium">Remove</button>
          </div>
        ) : (
          <>
            <svg className="h-10 w-10 text-surface-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
            </svg>
            <p className="text-sm font-medium text-surface-700 mb-1">Drop file here or click to browse</p>
            <p className="text-xs text-surface-400">PDF, DOCX, TXT, MD up to 50MB</p>
            <input
              type="file"
              className="hidden"
              id="file-upload"
              accept=".pdf,.docx,.txt,.md,.html,.json"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const f = e.currentTarget.files?.[0];
                if (f) { setFile(f); if (!title) setTitle(f.name); }
              }}
            />
            <label htmlFor="file-upload" className="mt-4 px-4 py-2 text-sm font-medium rounded-lg border border-surface-300 bg-white text-surface-700 hover:bg-surface-50 cursor-pointer transition-colors">
              Browse Files
            </label>
          </>
        )}
      </div>

      <Input label="Title (optional)" value={title} onChange={(e) => setTitle(e.currentTarget.value)} placeholder="Defaults to filename" disabled={loading} />
      <Input label="Description (optional)" value={description} onChange={(e) => setDescription(e.currentTarget.value)} placeholder="Brief description" disabled={loading} />
      <Input label="Tags (optional)" value={tags} onChange={(e) => setTags(e.currentTarget.value)} placeholder="comma-separated" disabled={loading} />
      <Button type="submit" loading={loading} disabled={!file}>Upload File</Button>
    </form>
  );
}
