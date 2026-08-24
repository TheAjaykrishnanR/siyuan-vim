# Upstream Synchronization Instructions

Sync the local repository with the `upstream` remote: `https://github.com/siyuan-note/siyuan`

When merging `upstream/master` into `master`:

1. **Safety Check:** Ensure git working tree is clean. Create a safety backup branch (`git checkout -b backup-master-sync`).
2. **Fetch Updates:** Run `git fetch upstream`.
3. **Inspect Incoming & Local Changes:**
   - View incoming upstream commits: `git log --oneline master..upstream/master`
   - List files modified by upstream: `git diff --name-only master..upstream/master`
   - List files modified locally: `git diff --name-only upstream/master..master`
4. **Context Loading:** Read `VIM_IMPLEMENTATION.md` to understand where our custom Vim implementation and logic hooks live. Pay special attention to any overlapping files from Step 3.
5. **Merge & Conflict Resolution:** Run `git merge upstream/master`.
   - **NEVER** overwrite custom Vim features, bindings, custom dependencies, or configs with upstream defaults.
   - For code overlaps: Retain local Vim hooks while adopting new upstream APIs/fixes.
   - If a conflict breaks core logic or intent is ambiguous, **stop and ask for manual intervention**.
6. **Verify:** Run the project build and test commands to verify compilation and runtime integrity.
7. **No Auto-Push:** Do **not** push to `origin master` without explicit user confirmation.
