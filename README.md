# @cobuntu/event-management-ui

Shared event-management UI consumed by [`cobuntu-admin`](https://github.com/cobuntuHello/cobuntu-community-backoffice) (community-leader-facing) and `cobuntu-community-app` (event-host-facing, via `/manage/[slug]`).

**Single source of truth.** Both apps used to maintain near-duplicate copies of these components, which drifted over time (e.g. the admin-side gained a "notify attendees on tier change" prompt that the community-side never received). This package eliminates that drift — fix once, ship to both.

## How it's consumed

Both apps add this as a **git dependency** in their `package.json`:

```json
{
  "dependencies": {
    "@cobuntu/event-management-ui": "git+ssh://git@github.com:cobuntuHello/cobuntu-event-management-ui.git#<sha-or-tag>"
  }
}
```

And tell Next.js to transpile it (since we ship TypeScript source directly, no build step). As of v0.0.2 this package depends on `@cobuntu/management-ui-shared` for cross-package primitives, so consumers must transpile both:

```js
// next.config.js
module.exports = {
  transpilePackages: [
    '@cobuntu/event-management-ui',
    '@cobuntu/management-ui-shared',
  ],
  // ...
};
```

Then import normally:

```tsx
import { PriceEditModal } from '@cobuntu/event-management-ui';
```

### Pinning

- **Production**: pin to a specific commit SHA or version tag. `#main` is convenient in dev but lets `npm install` pick up arbitrary changes — don't ship that.
- **Development**: `#main` is fine; bump the lockfile by re-running `npm install` when you want the latest.

## Development

```bash
npm install
npm run typecheck
```

Peer dependencies:
- React >=19
- React DOM >=19
- Next >=16

The package ships TypeScript source directly. Consumers' Next.js build (via `transpilePackages`) compiles it — no build step in this repo.

## Adding a component

1. Drop the component into `src/`.
2. Re-export it from `src/index.ts`.
3. Open a PR in each consuming app that:
   - Bumps the git-dep SHA in `package.json`
   - Deletes the local copy of the component
   - Replaces local imports with `@cobuntu/event-management-ui`

## Migration progress

- [ ] `PriceEditModal` (PR 1)
- [ ] `EditEventDrawer` + sub-modals (PR 2)
- [ ] `PublishModal`, `DeleteModal`, share modal (PR 3)
- [ ] Attendee management section (PR 3)
