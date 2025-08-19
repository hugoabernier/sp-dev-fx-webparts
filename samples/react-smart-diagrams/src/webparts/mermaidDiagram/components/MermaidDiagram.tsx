import * as React from 'react';
import styles from './MermaidDiagram.module.scss';
import type { IMermaidDiagramProps } from './IMermaidDiagramProps';
import MermaidPreview from './MermaidPreview';

export default class MermaidDiagram extends React.Component<IMermaidDiagramProps> {
  public render(): React.ReactElement<IMermaidDiagramProps> {
    const {
      definition: description,
      hasTeamsContext
    } = this.props;

    return (
      <section className={`${styles.mermaidDiagram} ${hasTeamsContext ? styles.teams : ''}`}>
        <MermaidPreview definition={description} theme={this.props.mermaidTheme} />
      </section>
    );
  }
}
