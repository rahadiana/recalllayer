import { redirect } from "next/navigation";

export default function DocsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-surface-900">API Documentation</h1>
      
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          { title: "Health Check", method: "GET", path: "/health", auth: "No" },
          { title: "Upload Document", method: "POST", path: "/v1/documents", auth: "x-api-key" },
          { title: "Get Document", method: "GET", path: "/v1/documents/:id", auth: "x-api-key" },
          { title: "Hybrid Search", method: "POST", path: "/v1/search", auth: "x-api-key" },
          { title: "Context Assembly", method: "POST", path: "/v1/context", auth: "x-api-key" },
          { title: "Get Memory", method: "GET", path: "/v1/memories/:id", auth: "x-api-key" },
          { title: "Trigger Sync", method: "POST", path: "/v1/connectors/:type/sync", auth: "x-api-key" },
          { title: "Usage Stats", method: "GET", path: "/v1/usage", auth: "x-api-key" },
        ].map((ep) => (
          <div key={ep.title} className="p-4 bg-white rounded-lg border border-surface-200">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-green-100 text-green-800">{ep.method}</span>
              <span className="text-xs px-2 py-0.5 rounded bg-surface-100 text-surface-600">{ep.auth}</span>
            </div>
            <p className="font-medium text-surface-900">{ep.title}</p>
            <code className="text-xs text-surface-500">{ep.path}</code>
          </div>
        ))}
      </div>

      <div className="p-4 bg-brand-50 border border-brand-200 rounded-lg">
        <h3 className="font-semibold text-brand-800 mb-2">Quick Test</h3>
        <pre className="text-xs bg-brand-100 p-3 rounded overflow-x-auto">
{`curl -X POST http://localhost:3001/v1/documents \\
  -H "x-api-key: ak_<workspace_id>_<token>" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"Doc","source":{"type":"api","content":"..."}}'`}
        </pre>
      </div>
    </div>
  );
}
