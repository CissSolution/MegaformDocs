import { UmbUfmComponentBase } from '@umbraco-cms/backoffice/ufm';
import './megaform-form-name.element.js';

/**
 * Custom UFM component for MegaForm Block List labels.
 * Syntax: {megaformFormName: propertyAlias}
 * Renders the title of the MegaForm picked by the referenced property.
 */
export class MegaFormFormNameUfmComponentApi extends UmbUfmComponentBase {
  render(token) {
    if (!token?.text) {
      return '';
    }
    const attributes = super.getAttributes(token.text);
    return `<megaform-form-name ${attributes}></megaform-form-name>`;
  }
}

export { MegaFormFormNameUfmComponentApi as api };
