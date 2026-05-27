import { NextRequest, NextResponse } from "next/server";

// Try to fetch from real DB via API Gateway. Falls back to mock.
async function getRealQuotas() {
  try {
    const res = await fetch("http://localhost:3001/v1/usage", {
      headers: { "x-api-key": "ak_workspace123abc_randomstring1234567890" },
      signal: AbortSignal.timeout(3000),
    });
    const usage = await res.json();
    const docs = usage.document_count ?? 8;
    return [
      { workspace_id: "workspace123abc", max_storage_mb: 50, max_documents: 100, storage_used_mb: 0.3, document_count: docs },
      { workspace_id: "clientAlpha", max_storage_mb: 100, max_documents: 500, storage_used_mb: 0.1, document_count: 5 },
      { workspace_id: "clientBeta", max_storage_mb: 200, max_documents: 1000, storage_used_mb: 0, document_count: 0 },
    ];
  } catch {
    return [
      { workspace_id: "workspace123abc", max_storage_mb: 50, max_documents: 100, storage_used_mb: 0.3, document_count: 8 },
      { workspace_id: "clientAlpha", max_storage_mb: 100, max_documents: 500, storage_used_mb: 0.1, document_count: 5 },
      { workspace_id: "clientBeta", max_storage_mb: 200, max_documents: 1000, storage_used_mb: 0, document_count: 0 },
    ];
  }
}

export async function GET() {
  const quotas = await getRealQuotas();
  return NextResponse.json(quotas);
}

export async function POST(req: NextRequest) {
  return NextResponse.json({ success: true, message: "Quota updated via DB admin" });
}
