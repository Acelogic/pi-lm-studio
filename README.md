# pi-lm-studio

A pi package that discovers models from a running LM Studio server and registers them as a selectable `lm-studio` provider inside pi.

## Features

- Detects models from LM Studio's OpenAI-compatible and native model endpoints
- Registers them as a dynamic `lm-studio` provider in pi
- Adds `/lm-studio-refresh` to rescan models
- Adds `/lm-studio-use` to quickly switch to a detected LM Studio model
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
- `/model` — your LM Studio models should also appear in the main model picker

## Notes

- Embedding models are filtered out
- Models without tool tuning are labeled accordingly
- Vision support is inferred from LM Studio's native metadata when available
