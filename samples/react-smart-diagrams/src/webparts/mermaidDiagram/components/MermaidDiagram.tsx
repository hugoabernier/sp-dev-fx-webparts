import * as React from 'react';
import styles from './MermaidDiagram.module.scss';
import type { IMermaidDiagramProps } from './IMermaidDiagramProps';
import MermaidPreview from './MermaidPreview';
import { WebPartTitle } from "@pnp/spfx-controls-react/lib/WebPartTitle";

export default class MermaidDiagram extends React.Component<IMermaidDiagramProps> {
  public render(): React.ReactElement<IMermaidDiagramProps> {
    const {
      definition: description,
      hasTeamsContext,
      displayMode,
      title,
      updateProperty,
      mermaidTheme
    } = this.props;

    return (
      <>
     <WebPartTitle displayMode={displayMode}
              title={title}
              updateProperty={updateProperty} /> 
      <section className={`${styles.mermaidDiagram} ${hasTeamsContext ? styles.teams : ''}`}>
        <MermaidPreview definition={description} theme={mermaidTheme} />
      </section>
      </>
    );
  }
}
