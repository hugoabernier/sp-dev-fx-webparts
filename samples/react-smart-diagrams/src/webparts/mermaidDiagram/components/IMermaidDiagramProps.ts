import { MermaidTheme } from "./MermaidPreview";
import { DisplayMode } from '@microsoft/sp-core-library';

export interface IMermaidDiagramProps {
  definition: string;
  isDarkTheme: boolean;
  environmentMessage: string;
  hasTeamsContext: boolean;
  userDisplayName: string;
  mermaidTheme: MermaidTheme;
  displayMode: DisplayMode;
  title: string;
  updateProperty: (value: string) => void;
}
