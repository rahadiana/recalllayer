import { NextResponse } from "next/server";

const DB_URL = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/memory_platform";

export async function GET() {
  try {
    const apiKey = process.env.CONSOLE_API_KEY;
    if (!apiKey) throw new Error("CONSOLE_API_KEY missing");
    const res = await fetch("http://localhost:3001/v1/usage", {
      headers: { "x-api-key": apiKey },
    });
    const usage = await res.json();

    return NextResponse.json({
      totalApiCalls: usage.search_count ?? 0,
      activeKeys: 3,
      totalKeys: 3,
      quotaPercent: 0,
      documentsIndexed: usage.document_count ?? 0,
      avgLatencyMs: 0,
      errorRate: 0,
      storageUsed: "0 MB",
      recentActivity: [],
    });
  } catch {
    return NextResponse.json({
      totalApiCalls: 0, activeKeys: 0, totalKeys: 0, quotaPercent: 0,
      documentsIndexed: 0, avgLatencyMs: 0, errorRate: 0, storageUsed: "0 MB",
      recentActivity: [],
    });
  }
}
