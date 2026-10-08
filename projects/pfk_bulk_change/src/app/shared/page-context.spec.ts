import { getPageSchemaNameFromUrl } from './page-context';

describe('getPageSchemaNameFromUrl', () => {
  it('reads the page schema name from Freedom UI routes', () => {
    expect(getPageSchemaNameFromUrl('https://x.creatio.com/0/Shell/#Section/Accounts_ListPage')).toBe('Accounts_ListPage');
    expect(getPageSchemaNameFromUrl('https://x/0/Shell/#Card/Accounts_FormPage/edit/1')).toBe('Accounts_FormPage');
    expect(getPageSchemaNameFromUrl('https://x/0/Shell/')).toBe('');
  });
});