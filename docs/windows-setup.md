# Windows setup notes

Most students running this app are on Windows, so `bootstrap.ps1` and
`setup.ps1` get real testing on real Windows hardware, not just macOS/Linux
with a PowerShell script bolted on afterward. A few things about that
environment aren't obvious unless you've hit them, so they're written down
here instead of being rediscovered every time.

## Never run these scripts elevated

`bootstrap.ps1` checks for this and fails fast with a clear message if it's
running as Administrator. This isn't a permissions-safety thing, it's a
real, confirmed upstream limitation: winget is an MSIX app with an App
Execution Alias, and that alias reliably fails to resolve when the calling
process is elevated (`microsoft/winget-cli#1474`). This was confirmed
directly on real Windows Server 2022 hardware, not just inferred from the
GitHub issue, running winget from an elevated prompt produces a cryptic
`0x8a15000f: Data required by the source is missing` error that gives no
hint the real problem is elevation at all.

The fix isn't something the script can work around internally, elevation
itself is the problem. `bootstrap.ps1` checks
`WindowsPrincipal::IsInRole(Administrator)` at the very top and throws a
clear instruction to close the window and re-run from a normal prompt,
rather than letting a user hit the confusing winget error with no context.

If you're testing changes to this script, always test from a genuinely
non-elevated prompt, a normal double-click launch of PowerShell, not "Run
as Administrator", even if it's tempting to elevate out of habit while
debugging.

## `exit` inside a piped script kills the user's whole shell

The one-line installer is meant to be run as
`irm .../bootstrap.ps1 | iex`, which executes the script's contents in the
*current* PowerShell session, not a child process. That distinction
matters a lot: a plain `exit` inside a script run this way terminates the
entire interactive shell the user was already working in, not just the
script. A real user hit this and reported it as "running it just closes
the PowerShell window", which is exactly what happens, with no error
message left on screen to explain why.

The fix is that every exit path in both scripts uses `throw` instead of
`exit` (including inside the `Fail()` helper function), and the whole
script body is wrapped in a top-level `try { ... } catch { Write-Host
"==> $($_.Exception.Message)" -ForegroundColor Red }`. A thrown error
propagates up to that catch block and prints cleanly instead of silently
closing the window. If you add a new failure path to either script, use
`throw`, never `exit`.

## `Set-ExecutionPolicy` needs to be scoped correctly

Both scripts start with:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
```

`-Scope Process` matters, it only affects the current process, not the
user's or machine's actual policy. Without this, a machine with the
default Restricted execution policy blocks the script (or, for
`setup.ps1`, blocks a user trying to double-click or directly invoke it
without the documented `-ExecutionPolicy Bypass -File` incantation) with an
unhelpful "cannot be loaded because running scripts is disabled" error.
Setting it process-scoped fixes the immediate run without changing
anything persistent about the user's system, which is the right tradeoff
for a script they're only going to run once or twice.

## winget-installed tools and PATH

`bootstrap.ps1` installs git, Node, and Ollama via winget when they're
missing. winget-installed tools land on PATH via the registry, not the
current shell's environment, so a tool installed mid-script might not be
immediately visible to `Test-CommandExists` without accounting for that.
If you're debugging a "tool not found right after installing it" issue on
Windows, this is usually where to look first, not a broken install.

## Testing changes to either script

There's no substitute for testing on a real Windows machine, ideally one
that doesn't already have git/Node/Ollama installed, so the actual install
path gets exercised rather than just the "everything's already there, just
update" path. If you only have access to a Linux dev box, at minimum read
through the script logic carefully for anything that assumes a POSIX shell
or Unix path separators, and check the change against the two failure
modes above (elevation, and any new `exit` that should be `throw`) before
assuming it's safe.
