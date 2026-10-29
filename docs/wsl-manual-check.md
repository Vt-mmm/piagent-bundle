# Windows (WSL2) manual check

Windows members use the company sandbox through WSL2 (Ubuntu, bubblewrap). CI runs the whole `piagent-sandbox` suite inside
WSL2 on a `windows-2025` runner (job `wsl` in piagent-sandbox `.github/workflows/ci.yml`). This page lists what CI cannot
show, for the owner to check once with a Windows member. All values below are examples; use a test project, never real data.

## What CI covers (WSL2 kernel 6.x, Ubuntu 24.04, project on the distribution's own disk)

- bubblewrap starts with user and network namespaces; the blocklist (credential files read empty, home hidden entries,
  writes outside the project fail) and read-only helper tools.
- Package proxy: npm and pip (venv) installs through the proxy without asking; an unknown host gives `managed-domain-blocked`.
- Approval tools, permission modes, `/undo`, handoff policy, redaction, fetch guard.
- The runner's WSL has `/mnt/c` and `/proc/sys/fs/binfmt_misc/WSLInterop`, so path code that looks for them runs; the
  distribution was started by the runner, not by a member's Windows login.

## What CI cannot cover

- `start_process` and TypeScript diagnostics are macOS only (skipped on every Linux run, WSL included).
- Docker Desktop through WSL (`start_docker`, `run_with_docker`): the runner has no Docker Desktop.
- The member's real Windows profile (`/mnt/c/Users/<name>` reference folders, OneDrive, AppData exclusion).
- Projects stored on the Windows disk (`/mnt/c/...`, drvfs): CI copies the repository to ext4 on purpose.
- A real Pi session started from Windows with the Piagent bundle installed.

## Checklist (member with Windows 11, WSL2 Ubuntu, a test project)

1. `wsl --status` shows version 2. In Ubuntu: `sudo apt install bubblewrap`, then `bwrap --ro-bind / / --unshare-net true` exits 0.
   If it says `Operation not permitted`, record the message and `cat /proc/sys/kernel/unprivileged_userns_clone` (if present).
2. Open the project **inside the distribution** (`~/test-project`). In a Piagent session, ask the agent to run `ls ~/.ssh`
   and `cat .env` (create `.env` with the text `FAKE=1`). Expected: `.ssh` is absent, `.env` reads empty.
3. Ask the agent to write a file outside the project (`touch ~/outside.txt`). Expected: fails, file not created.
4. Ask for `npm install is-odd` (or another small package). Expected: installs without a prompt. Ask it to `curl https://example.com`:
   expected `managed-domain-blocked` or no network, never a prompt-free success.
5. Reference folders: put `hello.txt` in `C:\Users\<name>\Documents` (visible as `/mnt/c/Users/<name>/Documents`). Ask the agent to
   read it. Expected: readable, and `AppData` is not listed under the Windows profile.
6. Project on the Windows disk: repeat steps 2-4 with the project under `/mnt/c/Users/<name>/test-project`. Record any
   difference (permission errors, slowness, `/undo` failing). Not a pass criterion today; it decides the guidance we give members.
7. Docker (only if the member uses it): with Docker Desktop installed but stopped, ask the agent for `start_docker`. Expected: an
   approval prompt, then Docker Desktop starts. Then `run_with_docker` with `docker ps`: approval prompt, then output.
8. `/undo` after the agent edits a file: the file returns to its earlier content.
9. Windows programs are not reachable from a sandboxed command (`cmd.exe /c echo hi` fails): expected, by design.
10. Note the Windows build (`winver`), the distribution (`lsb_release -d`) and `uname -r` in the result.

Send the owner the filled-in results; any failure of 1-5 or 8 blocks Windows members from the Company mode.
