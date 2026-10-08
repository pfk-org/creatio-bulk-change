/**
 * Freedom UI routes carry the page schema name: `#Section/Accounts_ListPage`, `#Card/Accounts_FormPage/edit/<id>`.
 * The public devkit API does not expose the current page schema, so it is read from the route.
 */
const PAGE_ROUTE = /#(?:Section|Card|Page)\/([A-Za-z][A-Za-z0-9_]*)/;

export function getPageSchemaNameFromUrl(url: string): string {
  return PAGE_ROUTE.exec(url)?.[1] ?? '';
}

export function getCurrentPageSchemaName(): string {
  return getPageSchemaNameFromUrl(window.location.href);
}
