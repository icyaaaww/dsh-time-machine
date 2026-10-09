import type { Context } from '@deepseek-ai/cordis';
import type { PropsRuntime, PropsLocale, InjectFace } from '@deepseek-ai/dsh-client-ui-slots';
import type { Request, Reply } from './protocol.ts';
import type { Key } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'timeMachine': Key;
    }
}
type Localized = PropsLocale<'timeMachine'>;
interface Actions {
    run: (request: Request) => Promise<Reply | void>;
}
type ActionProps = InjectFace<Actions> & Localized;
export declare const inject: string[];
export declare const name = "time-machine-client";
export declare function Dock({ run, t }: PropsRuntime<'conversation.input.dock'> & ActionProps): import("react").JSX.Element;
export declare function ReplyView({ reply, run, t }: {
    reply: Reply;
} & ActionProps): import("react").JSX.Element;
/** Registrations and style ownership follow the browser plugin's Cordis lifetime. */
export declare function apply(ctx: Context): void;
export {};
