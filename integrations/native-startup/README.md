# Laterano UI for official DSH

An optional startup animation for the official `@deepseek-ai/dsh@0.2.0-rc.2`
Web profile. The separate command is **`dsh-laterano`**. It loads a Cordis
addon through the official patch mechanism; it does not patch installed DSH
source, replace `dsh` / `dsh-native`, or modify their startup preferences.

This package includes only the Laterano design: geometric church arches,
sun and moon ornaments, animated book pages, the original emblem, fixed
English voice recordings, and the licensed Chinese font subset. Both light
and dark themes are included. A known `data-theme="light|dark"` on the
official page is inherited; otherwise the animation uses its light default.
There is no visual-style switch or `--visual-style` option.

## Install

Use Node.js **22.19+ within 22.x, or 24+**, npm, and Python 3.9+ for the
repository packaging script. From the **LateranoUI repository root**:

```sh
python scripts/install_native_startup.py
dsh-laterano web --startup
```

The installer builds a complete npm tarball, then installs it with the
official DSH dependency pinned to `0.2.0-rc.2`. It does not upgrade a separate
DSH installation. To prepare a portable package without installing anything:

```sh
python scripts/install_native_startup.py --pack-only
npm install --global ./target/native-startup-package/laterano-ui-native-startup-0.1.1.tgz
```

Install that tarball on another machine with a supported Node.js version.
Python, Rust, frontend build tools, extensions, model credentials, and a TTS
runtime are not required to play the packaged animation. Official DSH still
needs its normal model configuration for conversations. The package is built
from this repository; no npm registry publication is required.

For an isolated executable directory, use
`python scripts/install_native_startup.py --prefix /path/to/npm-prefix`.
The script does not change PATH. Add the prefix on Windows, or its `bin`
directory on macOS/Linux, to PATH; alternatively use the launcher directly.

## Configure and launch

```sh
dsh-laterano startup profile --name CatShark --badge DSH-7391
dsh-laterano startup enabled on
dsh-laterano startup next off
dsh-laterano web
dsh-laterano web --startup --port 3081
dsh-laterano web --no-startup
dsh-laterano --profile web --startup
```

Animation is **off by default**. `startup enabled on|off` changes the default.
`startup next on|off` is a one-use choice claimed by the first authenticated,
local official web page after successful boot. `--startup` / `--no-startup`
override this launch and consume a pending choice at that same point.
`--no-open` leaves it pending until the page is opened. Help, configuration
dumps, and non-web profiles do not consume the choice. The tab records the
opening before mounting it, so refreshing during playback, completion, or
skipping does not replay it within the same tab and server session. Repeated
script injections share one overlay. If tab session storage is unavailable,
the optional animation is skipped and the official UI remains available.

The parent page's **返回 Harness** button remains clickable and keyboard
reachable even if the animation fails after loading. It returns to the
official UI and restores the page's focus and interaction state. This does
not change or bypass official DSH authentication.

`startup profile` with no extra arguments prints the saved profile. Username
and badge can also be edited in the animation settings. Preferences and the
next-launch choice live only in **`$DSH_HOME/laterano-ui`**, defaulting to
`~/.dsh/laterano-ui`. The visual style is fixed to `laterano`, including when
reading hand-edited settings. No settings are copied from another addon.

Other arguments are forwarded to official DSH. This adapter supports the
official `web` and `--profile web` forms. It does not add a terminal animation,
desktop application, remote hosting, or support for custom native profiles.
The animation's Esc/skip action returns to the official UI; this optional
overlay is not a replacement for official DSH login or an access-control gate.

## Real local capability loading

The addon borrows the active default preset through
`ctx.agentPresets.acquireScope()` and reads
`ctx.skills.snapshot({ cwd, scope })`. Mounted plugins come from live
`ctx.loader.entries()` fibers and the selected default preset's
`ctx.agentPresets.compositionInventory()` rows. Disabled or pending plugins
are excluded. Errors and incomplete discovery remain visible; no percentage,
skill, or plugin inventory is simulated.

Addon routes are isolated under `/__laterano_ui`. The original protection is
preserved: loopback Host and peer validation, same-origin requests, official
`connection.requestRejection()` login checks, and a random mutation token
for profile writes and inventory discovery. The iframe bridge only redirects
its own startup APIs and voice files, leaving official DSH APIs untouched.

Compatibility is pinned to the published official `0.2.0-rc.2` API,
cross-checked against upstream commit
`5badb15009ae1756c3afe0ae0cef1faafc290ccc`. A dependency upgrade must verify
the official web, loader, connection, skills, and agent-presets APIs again.

## Update, test, and remove

Update the repository, then run the installer again. From the repository root,
run `node --test integrations/native-startup/test.mjs` for the addon tests,
and `python scripts/install_native_startup.py --pack-only` to check packaging.
Do not install directly from this source subdirectory: the installer stages
the shared animation assets into the package first.

```sh
npm uninstall --global @laterano-ui/native-startup
```

Uninstalling removes this addon launcher and leaves other DSH installations
and saved preferences alone. Delete `$DSH_HOME/laterano-ui` separately only
when its preferences are no longer needed.

The addon code is MIT-licensed; original attribution is retained in `LICENSE`.
Font license and voice provenance are included beside the packaged assets.
