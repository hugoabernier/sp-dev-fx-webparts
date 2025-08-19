import * as React from 'react';
import mermaid from 'mermaid';

export type MermaidTheme = 'default' | 'neutral' | 'forest' | 'dark' | 'base';

mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict' // keep this strict in SPFx to avoid DOM injection
});

const MermaidPreview: React.FC<{ definition: string; theme: MermaidTheme }> = (props: { definition: any; theme: any; }) => {
    const { definition, theme } = props;
    const ref = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        let cancelled = false;
        const render = async () => {
            if (!ref.current) return;
            try {
                // validate first — throws on bad syntax; see parseError hook below
                await mermaid.parse(definition);

                // set theme before rendering
                mermaid.initialize({
                    startOnLoad: false,
                    securityLevel: 'strict',
                    theme
                });

                // render to SVG
                const { svg } = await mermaid.render('mermaid-' + Date.now(), definition);
                if (!cancelled && ref.current) ref.current.innerHTML = svg;
            } catch (err) {
                if (!cancelled && ref.current) {
                    ref.current.innerHTML = `<pre style="color:#a4262c;">${(err as Error)?.message ?? 'Invalid Mermaid'}</pre>`;
                }
            }
        };
        // eslint-disable-next-line no-void
        void render();
        return () => { cancelled = true; };
    }, [definition, theme]);

    return <div ref={ref} />;
};

export default MermaidPreview;
