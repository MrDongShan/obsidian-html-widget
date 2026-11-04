'use strict';
/**
 * HTML Widget Embed
 *
 * 把 vault 里的一个 .html 文件渲染成内联的沙盒 iframe。
 * 支持两种写法：
 *   ![[widget.html]]        原生嵌入（高度默认 420）
 *   ![[widget.html|480]]    指定高度
 *   ```html-embed           代码块（可写路径 + height）
 * 只用公开 API：registerMarkdownCodeBlockProcessor / registerMarkdownPostProcessor /
 * metadataCache.getFirstLinkpathDest
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

/** 嵌入块被包在只含它自己的段落里时，替换段落本身，避免 div 嵌在 p 里 */
function replaceTarget(embed) {
  const parent = embed.parentElement;
  if (parent && parent.tagName === 'P') {
    const meaningful = Array.from(parent.childNodes).filter(
      (node) => node.nodeType !== Node.TEXT_NODE || node.textContent.trim()
    );
    if (meaningful.length === 1 && meaningful[0] === embed) return parent;
  }
  return embed;
}

module.exports = class HtmlWidgetEmbedPlugin extends Plugin {
  async onload() {
    this.registerMarkdownCodeBlockProcessor('html-embed', (source, el, ctx) =>
      this.renderCodeBlock(source, el, ctx)
    );
    this.registerMarkdownPostProcessor((el, ctx) => this.renderEmbeds(el, ctx));
  }

  async renderCodeBlock(source, el, ctx) {
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

    await this.mount(wrap, file, height);
  }

  /** ![[x.html]] / ![[x.html|480]] */
  async renderEmbeds(el, ctx) {
    const embeds = Array.from(el.querySelectorAll('.internal-embed[src]'));

    for (const embed of embeds) {
      if (embed.dataset.htmlWidget === '1') continue;

      const raw = embed.getAttribute('src') || '';
      if (!raw) continue;

      const ref = decodeURIComponent(raw.split('#')[0]);
      const file = this.resolveFile(ref, ctx.sourcePath);
      if (!file || file.extension !== 'html') continue;

      embed.dataset.htmlWidget = '1';
      // Obsidian 把 ![[x.html|480]] 里的 480 放进 width 属性；这里当作高度用。
      const size = embed.getAttribute('width') || embed.getAttribute('alt') || '';
      const height = parseInt(size, 10) || DEFAULT_HEIGHT;
      const wrap = createDiv({ cls: 'html-embed-wrap' });

      const target = replaceTarget(embed);
      target.replaceWith(wrap);
      await this.mount(wrap, file, height);
    }
  }

  async mount(wrap, file, height) {
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
  }

  resolveFile(reference, sourcePath) {
    const clean = reference.replace(/^\[\[|\]\]$/g, '').trim();
    if (!clean) return null;

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
