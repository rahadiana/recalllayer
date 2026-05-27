export function verifyToken(_token: string): { userId: string; workspaceId: string } {
  throw new Error("Not implemented — stub only");
}

export function createToken(_userId: string, _workspaceId: string): string {
  throw new Error("Not implemented — stub only");
}

export function hashPassword(_password: string): string {
  throw new Error("Not implemented — stub only");
}

export function verifyPassword(_password: string, _hash: string): boolean {
  throw new Error("Not implemented — stub only");
}
