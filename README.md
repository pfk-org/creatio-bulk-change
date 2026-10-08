# PfkBulkChange

Freedom UI component that changes one field for many records selected in a list (bulk change).
It is a remote module (Angular 19, `@creatio-devkit/common` 0.1000.x) shipped in the Creatio package `PfkBulkChange`.

## What it does

1. The user selects records in a list (specific records, or "select all" with the current list filters).
2. Clicks **Bulk change**, picks a field and a new value (or **Clear value**):
   - lookup — search in the referenced lookup;
   - text, number, boolean, date, date/time, time — matching native editors.
3. Confirms the number of records. The dialog closes and the page is masked while the records change
   in batches, and after the last batch until live data update stops refreshing the changed rows (at least
   2 seconds, at most 60).
4. Sees a notification with the result while the list reloads. When some records were not changed, the dialog
   opens again with the error messages.

Only columns **shown in the list** can be changed: the columns configured in the designer, or the columns the user
set up in the list settings at runtime (read from the user's grid profile in `SysProfileData`, key `<Page>__<List>`,
every time the dialog opens). To change another field, add its column to the list.

## Installation

Requirements: Creatio 10.0 with Freedom UI (built and tested on 10.0.0.801). The package has no C# code.

**Ready package.** Download `PfkBulkChange.zip` from the Releases page and install it as a package file
(**Application Hub → New application → Install from file**). Hard-reload the browser (Ctrl+Shift+R).

**From source** with [clio](https://github.com/Advance-Technologies-Foundation/clio):

```bash
cd projects/pfk_bulk_change && npm install && npm run build && cd ../..
clio push-workspace -e <your-environment>
```

Then set the component up on a list page (see below).

## Setting up the component

1. **Grant access.** Give the system operation **Can use bulk change of list records** (`PfkCanBulkChange`) to the
   roles that should use it: **System designer → Operation permissions**. System administrators have it after
   installation. Users without it see the button disabled.
2. **Allow selecting records in the list.** Bulk change works on the records selected in a list, so the list
   must allow selecting several rows (list pages of sections do by default).
3. **Add the button.** Open the list page in the Freedom UI designer and drag **Bulk change** from the
   *Components* toolbox next to the list tools (for example, next to *Summaries* or *Filters*).
4. **Link it to the list.** In the properties panel, **General → List (data source)** shows the lists found on
   the page, for example *List Account | DataTable*. Pick the list the button works with. If the list you need is
   not offered, choose **Other list (enter the code)…** and type the element code of the list.
5. Optionally change the **Button caption** (General) and **Visible** (Appearance; a business rule can control
   visibility too). **Advanced → Element code** shows the code of the component on the page.
6. **Save the page.** Users can now select records, click **Bulk change**, pick a field and a value, confirm,
   and see a notification when the change is done.

Only the columns **shown in the list** can be changed: the columns set up in the designer and the columns users add
to the list themselves (*List settings*). To offer another field, add its column to the list.

Each run changes up to 20 000 records, in requests of 200 records. Larger selections are refused with a message:
narrow the filter and run again.

### How the link works

Linking a list in the panel writes these settings to the page:

- `selectionState` is bound to the list selection (for example `$DataTable_SelectionState`);
- `filtersRequested` is bound to `pfk.ResolveBulkChangeFiltersRequest` with
  `filters: $Items | crt.ToCollectionFilters : 'Items' : $DataTable_SelectionState`. Request params are evaluated
  at the moment of the run (like list bulk actions), so "select all" always uses the current list filters.
  A specific selection always uses exactly the selected Ids;
- the entity name and the list columns are copied and refreshed every time the panel opens;
- `bulkChangeCompleted` is bound to `pfk.BulkChangeCompletedRequest`: the page shows the result notification
  (`crt.NotificationRequest`) and reloads the list data source (`crt.LoadDataRequest`). The component emits it
  when the live data update notifications of the entity (`LiveEditingNotifier`, one per saved record) have
  stopped for 2 seconds (at least 2 seconds after the last batch, at most 60), so the reload never runs under
  the platform's own row re-reads.

## Access rights

The component is available only to users with the system operation **`PfkCanBulkChange`**
("Can use bulk change of list records"). The package grants it to *System administrators*;
grant it to other roles in **System designer → Operation permissions**.
Record and column permissions are checked by the server for every record, and each record is saved
as a normal edit, so the object's events and business processes run.

## Limits and how records are updated

The server `UpdateQuery` loads all matched records into one entity collection (limit `MaxEntityRowCount` = 20 000;
more records fail the whole request), saves them one by one (entity events and processes run) inside one transaction.
Therefore the component:

- reads the Ids of the records to change page by page (5 000 per request) — the select limit does not apply;
- refuses a run larger than 20 000 records with a message;
- updates by Id in batches of 200 records; a failed batch is retried record by record,
  so one record without permissions does not block the others and is listed in the result.

## Project structure

```
packages/PfkBulkChange/            Creatio package
  Data/SysAdminOperation_*         system operation PfkCanBulkChange and its grant
  Files/src/js/pfk_bulk_change/    built remote module (npm run build, not in git)
projects/pfk_bulk_change/src/app/
  features/runtime/                runtime feature: pfk.BulkChange view element
    view-elements/bulk-change/     button + dialog
    view-elements/lookup-combobox/ lookup value picker
  features/design/                 design-time feature: pfk.BulkChangePanel properties panel
  shared/                          data service, column/value helpers, i18n (en-US, uk-UA), design tokens
```

## Development

```bash
cd projects/pfk_bulk_change
npm install
npm test          # unit tests (Jest)
npm run build     # builds into packages/PfkBulkChange/Files/src/js/pfk_bulk_change
```

Deploy to an environment registered in clio (from the workspace root):

```bash
clio push-workspace -e <your-environment>
```

The package has no C# code, so no compilation is needed after installation. Hard-reload the browser (Ctrl+Shift+R).

## Roadmap

- Several fields in one run (`+` adds another field row).

## License

MIT, see [LICENSE](LICENSE).
