import init, { HwpDocument } from './vendor/rhwp.js';

let doc;
const ready = (async () => {
  const canvas = new OffscreenCanvas(1, 1);
  const ctx = canvas.getContext('2d');
  globalThis.measureTextWidth = (font, text) => {
    ctx.font = font.replace(/\bsans-serif\b/g, '"Nanum Gothic", sans-serif').replace(/(?<!sans-)\bserif\b/g, '"Nanum Myeongjo", serif');
    return ctx.measureText(text).width;
  };
  const fonts = [
    ['Nanum Gothic', 'NanumGothic-Regular.ttf'], ['나눔고딕', 'NanumGothic-Regular.ttf'],
    ['Nanum Myeongjo', 'NanumMyeongjo-Regular.ttf'], ['나눔명조', 'NanumMyeongjo-Regular.ttf'],
  ];
  await Promise.all(fonts.map(async ([name, file]) => {
    const face = new FontFace(name, `url(${new URL(`./fonts/${file}`, import.meta.url)})`);
    self.fonts.add(await face.load());
  }));
  await init({ module_or_path: new URL('./vendor/rhwp_bg.wasm', import.meta.url) });
})();

self.onmessage = async ({ data: { id, type, buffer, page } }) => {
  try {
    await ready;
    let result;
    if (type === 'open') {
      doc?.free();
      doc = new HwpDocument(new Uint8Array(buffer));
      const pages = doc.pageCount();
      if (!pages || pages > 5000) throw new Error('문서의 쪽 수가 지원 범위(1~5,000쪽)를 벗어납니다.');
      result = { pages, svg: doc.renderPageSvg(0) };
    } else if (type === 'page') {
      if (!doc || !Number.isInteger(page) || page < 0 || page >= doc.pageCount()) throw new Error('잘못된 쪽 번호입니다.');
      result = { svg: doc.renderPageSvg(page), page };
    } else if (type === 'text') {
      const value = JSON.parse(doc.getTextFileUnicode());
      result = { text: typeof value === 'string' ? value : (value.text ?? value.data ?? '') };
    } else if (type === 'export') {
      const exported = doc.exportHwpWithReport();
      try { result = { bytes: exported.takeBytes(), contentLoss: JSON.parse(exported.contentLoss()) }; }
      finally { exported.free(); }
    } else if (type === 'verify') {
      const check = new HwpDocument(new Uint8Array(buffer));
      try {
        const pages = check.pageCount();
        if (!pages) throw new Error('저장 파일의 페이지를 다시 읽지 못했습니다.');
        result = { pages };
      } finally { check.free(); }
    } else {
      throw new Error('지원하지 않는 작업입니다.');
    }
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: String(error?.message || error).slice(0, 400) });
  }
};
