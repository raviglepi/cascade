# Contributing

## Releases

Add a changeset for every change that affects a published package:

```sh
bun run changeset
```

Choose the appropriate version bump and commit the generated file in `.changeset` with the change.

On pushes to `main`, GitHub Actions creates or updates a version pull request from the pending changesets. Merging that pull request publishes the packages to npm and creates Changesets' package-version tags. The repository needs an `NPM_TOKEN` secret with permission to publish the packages.
