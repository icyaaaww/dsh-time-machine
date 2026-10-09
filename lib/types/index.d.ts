import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { ContextFormed } from '@deepseek-ai/dsh-llm';
import type { Limits } from './store.ts';
declare module '@deepseek-ai/dsh-llm' {
    interface MessageSourceMap {
        'time-machine': {
            kind: 'time-machine';
        } & ContextFormed;
    }
}
export declare const name = "time-machine";
export declare const inject: string[];
export interface Config extends Limits {
    storageRoot: string;
    previewTtlMs: number;
}
export declare const Config: z<Config>;
/** Register all contributions as effects and drain asynchronous work before unloading. */
export declare function apply(ctx: Context, config: Config): void;
