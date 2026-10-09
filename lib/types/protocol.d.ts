/** Versioned human-command response; stored in the existing command event vocabulary. */
import type { Checkpoint, Preview } from './store.ts';
export type Request = {
    action: 'list';
} | {
    action: 'recover';
} | {
    action: 'preview';
    id: string;
    paths?: string[];
} | {
    action: 'undo';
    token: string;
} | {
    action: 'name';
    id: string;
    label: string;
};
export type Reply = {
    protocol: 'dsh-time-machine/v1';
    kind: 'list';
    records: Checkpoint[];
    warning?: string;
} | {
    protocol: 'dsh-time-machine/v1';
    kind: 'preview';
    preview: Preview;
} | {
    protocol: 'dsh-time-machine/v1';
    kind: 'done';
    message: string;
    record?: Checkpoint;
};
/** Validate commands at the human/RPC boundary. No shell parsing or evaluation. */
export declare function parseRequest(text: string): Request;
/** Stored transcript values can be older than the mounted browser plugin. */
export declare function readReply(text: string | undefined): Reply | undefined;
/** Decode the official RemoteResult envelope before reading CommandExecution. */
export declare function commandOutcome(value: unknown): string;
