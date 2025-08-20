import * as React from 'react';
import * as ReactDom from 'react-dom';
import { Version } from '@microsoft/sp-core-library';
import {
  type IPropertyPaneConfiguration
} from '@microsoft/sp-property-pane';
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';
import { IReadonlyTheme } from '@microsoft/sp-component-base';

import * as strings from 'MermaidDiagramWebPartStrings';
import MermaidDiagram from './components/MermaidDiagram';
import { IMermaidDiagramProps } from './components/IMermaidDiagramProps';
import { PropertyPaneMonaco } from '../../shared/propertyPane/PropertyPaneMonaco/PropertyPaneMonaco';
import { MermaidTheme } from './components/MermaidPreview';
import { MermaidLanguage } from '../../shared/propertyPane/PropertyPaneMonaco/languages/MermaidLanguage';

export interface IMermaidDiagramWebPartProps {
  definition: string;
  theme: MermaidTheme;
  title: string;
}

export default class MermaidDiagramWebPart extends BaseClientSideWebPart<IMermaidDiagramWebPartProps> {

  private _isDarkTheme: boolean = false;
  private _environmentMessage: string = '';

  public render(): void {
    const element: React.ReactElement<IMermaidDiagramProps> = React.createElement(
      MermaidDiagram,
      {
        title: this.properties.title,
        displayMode: this.displayMode,
        definition: this.properties.definition,
        mermaidTheme: this.properties.theme,
        isDarkTheme: this._isDarkTheme,
        environmentMessage: this._environmentMessage,
        hasTeamsContext: !!this.context.sdks.microsoftTeams,
        userDisplayName: this.context.pageContext.user.displayName,
        updateProperty: (value: string) => {
          this.properties.title = value;
        }
      }
    );

    ReactDom.render(element, this.domElement);
  }

  protected async onInit(): Promise<void> {
    this.ensureDefaults(); // ⬅️ set defaults into this.properties early
    this._environmentMessage = await this._getEnvironmentMessage();
  }

  // ensure defaults are written INTO the property bag (once)
  private ensureDefaults(): void {

    if (!this.properties.definition) {
      this.properties.definition = [
        'flowchart LR',
        '  A[Edit web part properties] --> B{See a diagram?}',
        '  B -- Yes --> C[Ship it]',
        '  B -- No  --> D[Fix syntax]',
        '  D --> B'
      ].join('\n');
    }
    if (!this.properties.theme) {
      this.properties.theme = 'neutral';
    }
  }

  // When the property pane is about to open, re-assert defaults in case this
  // is a fresh instance with an empty bag.
  protected onPropertyPaneConfigurationStart(): void {
    this.ensureDefaults();
  }


  private _getEnvironmentMessage(): Promise<string> {
    if (!!this.context.sdks.microsoftTeams) { // running in Teams, office.com or Outlook
      return this.context.sdks.microsoftTeams.teamsJs.app.getContext()
        .then(context => {
          let environmentMessage: string = '';
          switch (context.app.host.name) {
            case 'Office': // running in Office
              environmentMessage = this.context.isServedFromLocalhost ? strings.AppLocalEnvironmentOffice : strings.AppOfficeEnvironment;
              break;
            case 'Outlook': // running in Outlook
              environmentMessage = this.context.isServedFromLocalhost ? strings.AppLocalEnvironmentOutlook : strings.AppOutlookEnvironment;
              break;
            case 'Teams': // running in Teams
            case 'TeamsModern':
              environmentMessage = this.context.isServedFromLocalhost ? strings.AppLocalEnvironmentTeams : strings.AppTeamsTabEnvironment;
              break;
            default:
              environmentMessage = strings.UnknownEnvironment;
          }

          return environmentMessage;
        });
    }

    return Promise.resolve(this.context.isServedFromLocalhost ? strings.AppLocalEnvironmentSharePoint : strings.AppSharePointEnvironment);
  }

  protected onThemeChanged(currentTheme: IReadonlyTheme | undefined): void {
    if (!currentTheme) {
      return;
    }

    this._isDarkTheme = !!currentTheme.isInverted;
    const {
      semanticColors
    } = currentTheme;

    if (semanticColors) {
      this.domElement.style.setProperty('--bodyText', semanticColors.bodyText || null);
      this.domElement.style.setProperty('--link', semanticColors.link || null);
      this.domElement.style.setProperty('--linkHovered', semanticColors.linkHovered || null);
    }

  }

  protected onDispose(): void {
    ReactDom.unmountComponentAtNode(this.domElement);
  }

  protected get dataVersion(): Version {
    return Version.parse('1.0');
  }

  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    return {
      pages: [{
        header: { description: 'Create a new diagram by inserting Mermaid syntax.' },
        groups: [{
          groupName: 'Diagram',
          groupFields: [
            PropertyPaneMonaco('definition', {
              key: 'definitionEditor',
              value: this.properties.definition,
              languageId: MermaidLanguage.id,       // 'mermaid'
              provider: MermaidLanguage,  
              targetProperty: 'definition',
              height: 320,
              onChange: (newValue) => {
                this.properties.definition = newValue;
                this.render();             // live preview
              }
            })
          ]
        }]
      }]
    };
  }
}