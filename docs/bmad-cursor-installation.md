# BMad Cursor Installation Guide

This guide documents how to add Cursor as an AI tool to the existing BMad installation while preserving GitHub Copilot, Antigravity, and OpenCode integrations.

## Current Configuration (from `_bmad/_config/manifest.yaml`)

- **Modules:** core, bmm, bmb, tea, cis
- **IDEs/Tools:** github-copilot, antigravity, opencode
- **Core config** (`_bmad/core/config.yaml`): user_name Alexander, communication_language Spanish, document_output_language English, output_folder `{project-root}/_bmad-output`

## Final Tools List (including Cursor)

The `--tools` flag replaces the entire list. To preserve existing tools and add Cursor:

```
github-copilot,antigravity,opencode,cursor
```

## Non-Interactive Update Command

Run from the project root:

```bash
npx bmad-method install \
  --directory . \
  --modules bmm,bmb,tea,cis \
  --tools github-copilot,antigravity,opencode,cursor \
  --action update \
  --user-name "Alexander" \
  --communication-language Spanish \
  --document-output-language English \
  --output-folder _bmad-output \
  --yes
```

### One-Liner (copy/paste)

```bash
npx bmad-method install --directory . --modules bmm,bmb,tea,cis --tools github-copilot,antigravity,opencode,cursor --action update --user-name "Alexander" --communication-language Spanish --document-output-language English --output-folder _bmad-output --yes
```

### Alternative: Quick Update (preserve more settings)

If you prefer to minimize changes and only add Cursor, try:

```bash
npx bmad-method install \
  --directory . \
  --tools github-copilot,antigravity,opencode,cursor \
  --action quick-update \
  --yes
```

Note: `quick-update` may not support adding new tools in all BMad versions. If Cursor skills are not created, use the full `update` command above.

## How `--tools` Affects Existing Installations

- **`--tools` replaces the full list** — it does not append. You must include every tool you want to keep.
- **Omitting a tool** (e.g. `github-copilot`) would remove its BMad-generated skills from the project.
- **Adding `cursor`** extends the list so the installer will create/update `.cursor/skills/` with BMad workflows and agents.
- Invalid tool IDs produce warnings but do not abort the installation.

## Expected Directories After Update

| Tool           | Target Directory    |
| -------------- | ------------------- |
| GitHub Copilot | `.github/skills/`   |
| Antigravity    | `.agent/skills/`    |
| OpenCode       | `.opencode/skills/` |
| Cursor         | `.cursor/skills/`   |

The installer will create or refresh these directories with BMad skills. `_bmad/` and `_bmad-output/` remain unchanged.

## Post-Update Checklist

After running the command:

1. **Verify `_bmad/`** — Core and module folders (bmm, bmb, tea, cis) are intact.
2. **Verify `_bmad-output/`** — Still used for generated artifacts.
3. **Verify `.cursor/skills/`** — Exists and contains BMad skills (e.g. `bmad-master`, `bmad-help`, workflow skills).
4. **Verify other tools** — `.github/skills/`, `.agent/skills/`, `.opencode/skills/` still have BMad content.
5. **Test Cursor** — In Cursor, invoke `bmad-help` or `bmad-master` to confirm BMad is available.
6. **Test another tool** — If you use GitHub Copilot, Antigravity, or OpenCode, confirm their BMad integration still works.

## Troubleshooting

- **Installer error** — Run with `--debug` and share the output for diagnosis.
- **Skills not visible in Cursor** — Check Cursor settings to ensure skills from the project are enabled.
- **Module warnings** — If `tea` or `cis` produce warnings, the installer may have changed module IDs; use `bmm,bmb` only and re-add modules via interactive install if needed.

## References

- [How to Install BMad](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/docs/how-to/install-bmad.md)
- [Non-Interactive Installation](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/docs/how-to/non-interactive-installation.md)
- [Platform codes](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/tools/cli/installers/lib/ide/platform-codes.yaml)
