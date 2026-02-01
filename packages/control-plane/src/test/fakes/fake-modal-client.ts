/**
 * Fake Modal API client for testing.
 */

export interface CreateSandboxRequest {
  sessionId: string;
  repoUrl: string;
  branchName: string;
  authToken: string;
  model: string;
  opencodeSessionId?: string;
  snapshotId?: string;
}

export interface CreateSandboxResponse {
  sandboxId: string;
  status: string;
  tunnelUrl?: string;
}

export interface SnapshotResponse {
  snapshotId: string;
  imageId: string;
  timestamp: number;
}

export interface RestoreResponse {
  sandboxId: string;
  status: string;
}

/**
 * Fake Modal client that records API calls and returns configurable responses.
 */
export class FakeModalClient {
  private _createSandboxCalls: CreateSandboxRequest[] = [];
  private _snapshotCalls: Array<{ sandboxId: string; reason: string }> = [];
  private _restoreCalls: Array<{ snapshotId: string }> = [];

  // Configurable responses
  public createSandboxResponse: CreateSandboxResponse = {
    sandboxId: "sandbox-123",
    status: "ready",
    tunnelUrl: "https://tunnel.example.com",
  };

  public snapshotResponse: SnapshotResponse = {
    snapshotId: "snapshot-123",
    imageId: "image-123",
    timestamp: Date.now(),
  };

  public restoreResponse: RestoreResponse = {
    sandboxId: "sandbox-456",
    status: "ready",
  };

  /** Get recorded createSandbox calls */
  get createSandboxCalls(): CreateSandboxRequest[] {
    return [...this._createSandboxCalls];
  }

  /** Get recorded snapshot calls */
  get snapshotCalls(): Array<{ sandboxId: string; reason: string }> {
    return [...this._snapshotCalls];
  }

  /** Get recorded restore calls */
  get restoreCalls(): Array<{ snapshotId: string }> {
    return [...this._restoreCalls];
  }

  /** Clear recorded calls */
  clearCalls(): void {
    this._createSandboxCalls = [];
    this._snapshotCalls = [];
    this._restoreCalls = [];
  }

  /** Fake createSandbox implementation */
  async createSandbox(request: CreateSandboxRequest): Promise<CreateSandboxResponse> {
    this._createSandboxCalls.push(request);
    return this.createSandboxResponse;
  }

  /** Fake snapshot implementation */
  async snapshot(sandboxId: string, reason: string): Promise<SnapshotResponse> {
    this._snapshotCalls.push({ sandboxId, reason });
    return this.snapshotResponse;
  }

  /** Fake restore implementation */
  async restore(snapshotId: string): Promise<RestoreResponse> {
    this._restoreCalls.push({ snapshotId });
    return this.restoreResponse;
  }
}

/**
 * Create a fake Modal client factory.
 */
export function createFakeModalClient(): FakeModalClient {
  return new FakeModalClient();
}
