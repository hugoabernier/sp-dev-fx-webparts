import * as React from 'react';
import { Stack } from '@fluentui/react';
import { TextField } from '@fluentui/react/lib/TextField';
import { DefaultButton, PrimaryButton } from '@fluentui/react/lib/Button';
import { List } from '@fluentui/react/lib/List';

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    text: string;
    // optional action proposal (e.g., suggested code)
    snippet?: string;
}

export interface AIChatPaneProps {
    code: string;
    onInsert: (snippet: string) => void;
    onReplace: (snippet: string) => void;
    onExplainSelection: (selection: string) => void;
}

const AIChatPane: React.FC<AIChatPaneProps> = ({ onInsert, onReplace }) => {
    const [messages, setMessages] = React.useState<ChatMessage[]>([]);
    const [input, setInput] = React.useState<string>('');

    const send = (): void => {
        if (!input.trim()) return;
        const userMsg: ChatMessage = { id: String(Date.now()), role: 'user', text: input };
        setMessages(ms => [...ms, userMsg]);

        // TODO: call your AI endpoint; for now echo a stub suggestion
        const suggestion = '%% Example\nflowchart LR\nUser-->AI';
        const aiMsg: ChatMessage = {
            id: `${userMsg.id}-ai`,
            role: 'assistant',
            text: 'Here is a snippet you can insert or replace with.',
            snippet: suggestion
        };
        setMessages(ms => [...ms, aiMsg]);
        setInput('');
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
                                <div style={{ fontWeight: 600 }}>{item.role === 'user' ? 'You' : 'Mermaid assistant'}</div>
                                <div style={{ whiteSpace: 'pre-wrap' }}>{item.text}</div>
                                {item.snippet && (
                                    <Stack horizontal tokens={{ childrenGap: 8 }} style={{ marginTop: 6 }}>
                                        <PrimaryButton text="Insert into editor" onClick={() => onInsert(item.snippet!)} />
                                        <DefaultButton text="Replace editor" onClick={() => onReplace(item.snippet!)} />
                                    </Stack>
                                )}
                            </div>
                        );
                    }}
                />
            </div>

            <TextField
                multiline autoAdjustHeight
                placeholder="Generate a flowchart for our ETL pipeline"
                value={input} onChange={(_, v) => setInput(v ?? '')}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            />
            <Stack horizontal horizontalAlign="end" tokens={{ childrenGap: 8 }}>
              <Stack.Item grow />
                <DefaultButton iconProps={{ iconName: 'Send' }} aria-label="Send" onClick={send} />
            </Stack>
        </Stack>
    );
};

export default AIChatPane;
