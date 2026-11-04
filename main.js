'use strict';
/**
 * HTML Widget Embed
 *
 * 把 vault 里的一个 .html 文件渲染成内联的沙盒 iframe。
 * 两种写法：
 *   ![[widget.html]]        默认高度自适应（量内容，不出滚动条）
 *   ![[widget.html|520]]    固定 520px；写 |auto 或不写数字都是自适应
 *   ```html-embed           代码块：路径 + height: 520（或 height: auto）
 */
const { Plugin } = require('obsidian');

const SANDBOX = 'allow-scripts allow-forms allow-modals allow-popups';

// 注入到组件里的测高脚本：量完用 postMessage 报给宿主。
// 因为 iframe 没有 allow-same-origin，父文档读不到它的 DOM，只能这样通信。
const REPORTER = `<script>(function(){
  var last=-1;
  function post(){
    var d=document.documentElement,b=document.body;
    var h=Math.max(d?d.scrollHeight:0,b?b.scrollHeight:0,d?d.offsetHeight:0);
    if(h>0&&h!==last){last=h;try{parent.postMessage({__htmlWidgetHeight:h},'*')}catch(e){}}
  }
  window.addEventListener('load',post);
  if(window.ResizeObserver){try{new ResizeObserver(post).observe(document.documentElement)}catch(e){}}
  [0,60,200,600,1200].forEach(function(t){setTimeout(post,t)});
})();</script>`;

function injectReporter(html) {
  const at = html.toLowerCase().lastIndexOf('</body>');
  return at === -1 ? html + REPORTER : html.slice(0, at) + REPORTER + html.slice(at);
}

function parseBlock(source) {
  const lines = source.split('\n').map((line) => line.trim()).filter(Boolean);
  let height = 'auto';
  let fileRef = '';

  for (const line of lines) {
    const fixed = line.match(/^height\s*[:=]\s*(\d+)\s*$/i);
    if (fixed) { height = parseInt(fixed[1], 10); continue; }
    if (/^height\s*[:=]\s*auto\s*$/i.test(line)) { height = 'auto'; continue; }
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

    // 单个全局监听：谁报高度，就把对应 iframe 撑到多高
    this.registerDomEvent(window, 'message', (event) => {
      const height = event.data && event.data.__htmlWidgetHeight;
      if (typeof height !== 'number' || height <= 0) return;
      for (const frame of document.querySelectorAll('.html-embed-wrap iframe')) {
        if (frame.contentWindow === event.source) {
          frame.style.height = Math.ceil(height) + 'px';
          break;
        }
      }
    });
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
    let queued = false;
    let busy = false;

    const scan = async () => {
      queued = false;
      if (!el.isConnected) return;
      if (busy) return;
      busy = true;

      // 阅读视图里 el 是段落/区块容器；实时预览里 el 本身可能就是嵌入元素
      const embeds = [];
      if (el.matches && el.matches('.internal-embed[src]')) embeds.push(el);
      embeds.push(...el.querySelectorAll('.internal-embed[src]'));
      for (const embed of embeds) {
        if (embed.dataset.htmlWidget === '1') continue;

        const raw = embed.getAttribute('src') || '';
        if (!raw) continue;

        let ref = raw.split('#')[0];
        try {
          ref = decodeURIComponent(ref);
        } catch (error) {
          /* 保持原样 */
        }

        const file = this.resolveFile(ref, ctx.sourcePath);
        if (!file || file.extension !== 'html') continue;

        embed.dataset.htmlWidget = '1';

        // Obsidian 把 ![[x.html|480]] 的 480 放进 width 属性；非数字（含 auto）即自适应
        const size = embed.getAttribute('width') || embed.getAttribute('alt') || '';
        const parsed = parseInt(size, 10);
        const height = Number.isFinite(parsed) ? parsed : 'auto';

        const wrap = createDiv({ cls: 'html-embed-wrap' });
        replaceTarget(embed).replaceWith(wrap);
        await this.mount(wrap, file, height);
      }

      busy = false;
    };

    // Obsidian 先渲染出 .internal-embed 的外壳，再异步填充内容；
    // 只在 post processor 里扫一遍会漏掉还没插进来的那些，所以持续观察。
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      Promise.resolve().then(scan);
    });
    observer.observe(el, { childList: true, subtree: true });
    await scan();

    const teardown = window.setInterval(() => {
      if (!el.isConnected) {
        observer.disconnect();
        window.clearInterval(teardown);
      }
    }, 4000);
  }

  async mount(wrap, file, height) {
    let html;
    try {
      html = await this.app.vault.cachedRead(file);
    } catch (error) {
      this.showError(wrap, '读取失败：' + file.path);
      return;
    }

    const auto = height === 'auto';
    const frame = wrap.createEl('iframe', {
      attr: {
        sandbox: SANDBOX,
        scrolling: 'no',
        loading: 'lazy',
        style: auto ? 'height:1px' : 'height:' + height + 'px',
        title: file.basename,
      },
    });
    frame.srcdoc = auto ? injectReporter(html) : html;
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
