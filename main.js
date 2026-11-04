'use strict';
/**
 * HTML Widget Embed
 *
 * 把 vault 里的一个 .html 文件渲染成内联的沙盒 iframe。
 * 只用公开 API：registerMarkdownCodeBlockProcessor + metadataCache.getFirstLinkpathDest
 */
const { Plugin } = require('obsidian');

const DEFAULT_HEIGHT = 420;
const SANDBOX = 'allow-scripts allow-forms allow-modals allow-popups';

function parseBlock(source) {
  const lines = source.split('\n').map((line) => line.trim()).filter(Boolean);
  let height = DEFAULT_HEIGHT;
  let fileRef = '';

  for (const line of lines) {
    const heightMatch = line.match(/^height\s*[:=]\s*(\d+)\s*$/i);
    if (heightMatch) {
      height = parseInt(heightMatch[1], 10);
      continue;
    }
    if (!fileRef) fileRef = line;
  }

  return { fileRef, height };
}

module.exports = class HtmlWidgetEmbedPlugin extends Plugin {
  async onload() {
    this.registerMarkdownCodeBlockProcessor('html-embed', async (source, el, ctx) => {
      const { fileRef, height } = parseBlock(source);
      const wrap = el.createDiv({ cls: 'html-embed-wrap' });

      if (!fileRef) {
        this.showError(wrap, '第一行要写文件路径');
        return;
      }

      const file = this.resolveFile(fileRef, ctx.sourcePath);
      if (!file) {
        this.showError(wrap, '找不到：' + fileRef);
        return;
      }

      let html;
      try {
        html = await this.app.vault.cachedRead(file);
      } catch (error) {
        this.showError(wrap, '读取失败：' + file.path);
        return;
      }

      const frame = wrap.createEl('iframe', {
        attr: {
          sandbox: SANDBOX,
          loading: 'lazy',
          style: 'height:' + height + 'px',
          title: file.basename,
        },
      });
      frame.srcdoc = html;
    });
  }

  resolveFile(reference, sourcePath) {
    const clean = reference.replace(/^\[\[|\]\]$/g, '').trim();
    const direct = this.app.metadataCache.getFirstLinkpathDest(clean, sourcePath);
    if (direct) return direct;

    // 允许省略 .html 扩展名
    if (!/\.[a-z0-9]+$/i.test(clean)) {
      return this.app.metadataCache.getFirstLinkpathDest(clean + '.html', sourcePath);
    }
    return null;
  }

  showError(wrap, message) {
    wrap.createDiv({ cls: 'html-embed-error', text: 'html-embed：' + message });
  }
};
