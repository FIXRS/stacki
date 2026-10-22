/*!
 * VS Code Codicons arrow-down — Microsoft Corporation, CC BY 4.0.
 * https://github.com/microsoft/vscode-codicons/blob/main/src/icons/arrow-down.svg
 * https://creativecommons.org/licenses/by/4.0/
 * Geometry unchanged; adapted to the shared React icon frame.
 */
import { I, type IconProps } from './IconBase';

const arrowDown =
  'M13.854 8.146C13.659 7.951 13.342 7.951 13.147 8.146L9.00096 12.292V2.5C9.00096 ' +
  '2.224 8.77696 2 8.50096 2C8.22496 2 8.00096 2.224 8.00096 2.5V12.293L3.85496 8.1' +
  '47C3.65996 7.952 3.34296 7.952 3.14796 8.147C2.95296 8.342 2.95296 8.659 3.14796' +
  ' 8.854L8.14796 13.854C8.24596 13.952 8.37396 14 8.50196 14C8.62996 14 8.75796 13' +
  '.951 8.85596 13.854L13.856 8.854C14.051 8.659 14.051 8.342 13.856 8.147L13.854 8' +
  '.146Z';

export const PullIcon = (props: IconProps) => (
  <I {...props} filled>
    <path d={arrowDown} />
  </I>
);
