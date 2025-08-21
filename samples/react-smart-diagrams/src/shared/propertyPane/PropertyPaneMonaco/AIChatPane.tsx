import * as React from 'react';
import { Stack } from '@fluentui/react';
import { TextField } from '@fluentui/react/lib/TextField';
import { PrimaryButton } from '@fluentui/react/lib/Button';
import { List } from '@fluentui/react/lib/List';

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    text: string;
    snippet?: string; // Mermaid the user can Insert/Replace
}

export interface AIChatPaneProps {
    code: string;
    onInsert: (snippet: string) => void;
    onReplace: (snippet: string) => void;
    onExplainSelection: (selection: string) => void;
    /** If provided, used to send prompts and get { text, mermaid? } */
    onSend?: (prompt: string) => Promise<{ text: string; mermaid?: string }>;
}

const AIChatPane: React.FC<AIChatPaneProps> = ({ onInsert, onReplace, onSend }) => {
    const [messages, setMessages] = React.useState<ChatMessage[]>([]);
    const [input, setInput] = React.useState<string>('');
    const [busy, setBusy] = React.useState<boolean>(false);

    const send = async (): Promise<void> => {
        const prompt = input.trim();
        if (!prompt || busy) return;
        setBusy(true);

        const userMsg: ChatMessage = { id: String(Date.now()), role: 'user', text: prompt };
        setMessages(ms => [...ms, userMsg]);
        setInput('');

        try {
            let text = 'Demo: connect Azure OpenAI to get real answers.'; // fallback only if onSend missing
            let mermaid: string | undefined;

            if (onSend) {
                const res = await onSend(prompt);
                text = res.text ?? '';
                mermaid = res.mermaid;
            }

            const aiMsg: ChatMessage = {
                id: `${userMsg.id}-ai`,
                role: 'assistant',
                text,
                snippet: mermaid
            };
            setMessages(ms => [...ms, aiMsg]);

            // Optional: auto-apply
            // if (mermaid) onReplace(mermaid);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err ?? 'Unknown error');
            setMessages(ms => [...ms, { id: `${userMsg.id}-err`, role: 'assistant', text: `⚠️ ${msg}` }]);
        } finally {
            setBusy(false);
        }
    };

    return (
        <Stack verticalFill tokens={{ childrenGap: 8 }} styles={{ root: { padding: 8, height: '100%' } }}>
            <div style={{ flex: 1, overflow: 'auto' }}>
                <List
                    items={messages}
                    onRenderCell={(item?: ChatMessage): JSX.Element | null => {
                        if (!item) return null;
                        return (
                            <div style={{ marginBottom: 12 }}>
                                <div style={{ fontWeight: 600 }}>{item.role === 'user' ? 'You' : 'Assistant'}</div>
                                <div style={{ whiteSpace: 'pre-wrap' }}>{item.text}</div>
                                
                            </div>
                        );
                    }}
                />
            </div>

            <TextField
                multiline autoAdjustHeight
                placeholder="Ask the AI… e.g., Generate a flowchart for our ETL pipeline"
                value={input}
                onChange={(_, v) => setInput(v ?? '')}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
                disabled={busy}
            />
            <Stack horizontal horizontalAlign="end" tokens={{ childrenGap: 8 }}>
                <Stack.Item grow />
                <PrimaryButton iconProps={{ iconName: 'Send' }} aria-label={busy ? 'Thinking…' : 'Send'} disabled={busy} onClick={send} />
            </Stack>
        </Stack>
    );
};

export default AIChatPane;
