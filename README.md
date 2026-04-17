# pi-lm-studio

A pi package that discovers models from a running LM Studio server and registers them as a selectable `lm-studio` provider inside pi.

## Features

- Detects models from LM Studio's OpenAI-compatible and native model endpoints
- Registers them as a dynamic `lm-studio` provider in pi
- Adds `/lm-studio-refresh` to rescan models
- Adds `/lm-studio-use` to quickly switch to a detected LM Studio model
- Adds `/lm-studio-context` to show current context window usage
- Reports context usage in pi's status bar for active LM Studio models
- Enables streamed usage reporting by default so pi can track context more accurately
- Handles common local-server compatibility settings for pi

## Install

From GitHub:

```bash
pi install git:github.com/Acelogic/pi-lm-studio
```

Pinned to a tag:

```bash
pi install git:github.com/Acelogic/pi-lm-studio@v1.0.0
```

Or add it to `~/.pi/agent/settings.json` or `.pi/settings.json`:

```json
{
  "packages": [
    "git:github.com/Acelogic/pi-lm-studio@v1.0.0"
  ]
}
```

## Update

Pull the latest commit on the default branch:

```bash
pi update git:github.com/Acelogic/pi-lm-studio
```

Or update every installed package at once:

```bash
pi update
```

Reload the running session to pick up the new code:

```text
/reload
```

### Pinning

`pi update` **skips pinned sources**. If you installed with a tag suffix (e.g. `@v1.0.0`), move to a newer tag by reinstalling:

```bash
pi install git:github.com/Acelogic/pi-lm-studio@v1.1.0
```

### Inspect / remove

```bash
pi list
pi remove git:github.com/Acelogic/pi-lm-studio
```

## LM Studio setup

Start the LM Studio local server first.

Default base URL:

```text
http://127.0.0.1:1234
```

Optional override:

```bash
export LM_STUDIO_BASE_URL=http://127.0.0.1:1234
```

`LM_STUDIO_URL` is also supported.

## Usage

After install, reload pi if needed:

```text
/reload
```

Then:

- `/lm-studio-refresh` — detect available LM Studio models
- `/lm-studio-use` — pick a detected model from a selector
- `/lm-studio-context` — show current context usage for the active LM Studio model
- `/model` — your LM Studio models should also appear in the main model picker

## Notes

- Embedding models are filtered out
- Models without tool tuning are labeled accordingly
- Vision support is inferred from LM Studio's native metadata when available
- Context usage in pi comes from streamed usage when LM Studio provides it, with pi falling back to estimation when needed
- If your LM Studio server does not support streamed usage, you can disable it with `LM_STUDIO_STREAM_USAGE=false`
