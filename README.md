# HTML Widget Embed

Embed a vault-local `.html` file inside an Obsidian note as a sandboxed iframe — for interactive diagrams, step-through explainers, small simulations, or anything else you built as a standalone page.

Obsidian embeds notes, images and PDFs, but an `.html` file in your vault is only a file you can open. This plugin renders it inline, with the JavaScript running, and without hardcoding absolute paths.

## Usage

````markdown
```html-embed
lessons/matrix-stepper.html
height: 470
```
````

- **First line** — path to the HTML file. Resolved relative to the current note first, then across the vault. Absolute (`/`) paths and `.html`-less paths also work.
- **`height: N`** — iframe height in pixels. Default `420`.

A missing file renders a one-line notice instead of breaking the note.

## Install

### Manual

```bash
cd <your-vault>/.obsidian/plugins
git clone https://github.com/MrDongShan/obsidian-html-widget html-widget-embed
```

Then enable **HTML Widget Embed** in *Settings → Community plugins*.

### BRAT

Add `MrDongShan/obsidian-html-widget` as a beta plugin.

## How it works

- The file is read through Obsidian's vault API and injected as the iframe's `srcdoc`. No blob URLs, no temp files, nothing written to disk.
- Paths go through `metadataCache.getFirstLinkpathDest` — the same resolver behind `[[wikilinks]]` — so notes stay portable when the vault moves or syncs to another machine.
- Only public APIs are used (`registerMarkdownCodeBlockProcessor`, `metadataCache`), which keeps the plugin working across Obsidian updates. `minAppVersion` is `0.15.0`.

## Security model

Widgets run in a sandboxed frame with `allow-scripts allow-forms allow-modals allow-popups` and **without** `allow-same-origin`. They can run their own JavaScript but cannot reach Obsidian's DOM, `window.app`, `localStorage`, or your other files.

Treat an embedded HTML file the way you treat a script: only embed files you trust.

## Limitations

- The HTML must be self-contained. Relative images, external CSS/JS and fonts won't load inside the frame.
- Each widget is its own document. A few per note is fine; dozens will make the note heavy.
- Mobile has not been verified.

## Development

No build step — `main.js` is the source and ships as-is.

```bash
node --check main.js          # syntax
node version-bump.mjs 0.2.0   # bump package.json / manifest.json / versions.json
git tag 0.2.0 && git push --tags   # CI builds the release assets
```

Release tags must equal `manifest.json`'s version (no `v` prefix), and the release must contain `main.js`, `manifest.json` and `styles.css` — the layout Obsidian expects.

## 中文说明

把 vault 里的一个 `.html` 文件直接渲染成笔记里的可交互组件。路径相对当前笔记解析，vault 搬家、换设备都不会断；组件运行在沙盒里，摸不到 Obsidian 的 API。

安装：把仓库克隆到 `<vault>/.obsidian/plugins/html-widget-embed`，在设置里启用。

用法见上方 `html-embed` 代码块；`height` 可省略，默认 420。

## License

MIT
