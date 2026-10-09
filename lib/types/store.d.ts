export interface Limits {
    maxFileBytes: number;
    maxFiles: number;
    maxStoreBytes: number;
    maxRecords: number;
    timeoutMs: number;
    maxDiffChars: number;
}
export declare const defaults: Limits;
export interface FileVersion {
    hash: string;
    mode: number;
}
export interface Snapshot {
    files: Record<string, FileVersion>;
    skipped: string[];
}
export interface Change {
    path: string;
    before: FileVersion | null;
    after: FileVersion | null;
}
export interface Checkpoint {
    schema: 1;
    id: string;
    root: string;
    sessionId: string;
    turn: number;
    time: string;
    label: string;
    kind: 'turn' | 'undo';
    status: 'complete' | 'prepared';
    changes: Change[];
    skipped: string[];
    undoOf?: string;
}
export interface Preview {
    checkpoint: Checkpoint;
    changes: Change[];
    conflicts: string[];
    diff: string;
    token: string;
}
/** Reject path traversal and all metadata paths before using a stored or requested path. */
export declare function safeRelative(path: string): void;
/** One local repository's append-only checkpoints and deduplicated content objects. */
export declare class TimeMachineStore {
    readonly root: string;
    readonly directory: string;
    readonly limits: Limits;
    private constructor();
    static create(cwd: string, storageRoot: string, limits?: Limits): Promise<TimeMachineStore>;
    /** Serialize cooperating hosts; a crashed owner expires after two minutes. */
    exclusive<T>(action: () => Promise<T>): Promise<T>;
    private recordPath;
    private pendingPath;
    /** Fail closed on symlinks, junctions, nested repositories and non-file targets. */
    private checkedPath;
    private readVersion;
    private blob;
    snapshot(): Promise<Snapshot>;
    records(sessionId?: string): Promise<Checkpoint[]>;
    readRecord(id: string): Promise<Checkpoint>;
    private assertReady;
    begin(sessionId: string, turn: number): Promise<void>;
    finishPending(sessionId: string, label?: string): Promise<Checkpoint | null>;
    label(id: string, sessionId: string, label: string): Promise<void>;
    private owned;
    preview(id: string, sessionId: string, paths?: string[]): Promise<Preview>;
    private replace;
    /** The durable prepared record is a write-ahead recovery journal, not a success claim. */
    undo(preview: Preview): Promise<Checkpoint>;
    /** Roll back an interrupted restore only where bytes still match its recorded versions. */
    recover(sessionId: string): Promise<string[]>;
}
