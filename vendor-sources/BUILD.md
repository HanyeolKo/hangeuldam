# 한글담 내장 Studio 빌드 기록

- 원본: https://github.com/edwardkim/rhwp
- 태그: v0.9.0
- 커밋: c9095c5f67632e6721e800ccc7fb43ea49d26682
- 원본 소스 묶음: public/source/rhwp-source-0.9.0-amo.zip (공식 배포 해시 동봉)
- Node 22.23.5, npm 11.21.2, Vite 8.3.5. 시스템 Node는 변경하지 않았습니다.
- WASM 및 JS 입력: 기존 앱의 npm @rhwp/core@0.9.0 파일을 소스 pkg/에 복사했습니다. Rust를 다시 빌드하지 않았습니다.
- 호스트 SDK: npm @rhwp/editor@0.9.0. npm SDK는 iframe wrapper이며 Studio 본체를 포함하지 않습니다.

## 로컬 변경

`hangeuldam-studio.patch`에 원본 대비 변경을 기록했습니다.

1. HANGEULDAM_EMBED=1이면 VitePWA 플러그인을 비활성화합니다. 한글담 바깥 Service Worker가 모든 자산을 관리합니다.
2. 원격 URL 문서 자동 열기 호출을 제거했습니다. 문서는 부모의 로컬 파일 바이트로 전달합니다.
3. `window.rhwpStudio.hangeuldam.state()`는 dirty/generation/fileName/revision을 반환합니다.
4. `window.rhwpStudio.hangeuldam.exportHwpWithReport()`는 초기화를 기다리고, 암호 문서의 평문 저장을 거절하고, 지연 페이지 배치를 완료한 후 `{bytes, contentLoss, revision, generation}`을 반환합니다. 내용 손실 보고를 유지합니다.
5. 문서 변경 이벤트마다 호스트 revision을 증가시킵니다. generation과 함께 저장 경쟁을 검사할 수 있습니다.

기본 Studio의 `notifySaved(fileName)`은 저장 완료 후 호출해야 합니다. 내보내기만 하고 저장에 실패했을 때에는 호출하면 안 됩니다.

## 재현

공식 소스에서 다음 경로가 필요합니다: rhwp-studio, rhwp-shared, npm/editor, npm/hwpctrl-ocx, vendor/npm/ajv, assets/fonts, src/renderer. 기존 @rhwp/core의 rhwp.js/rhwp.d.ts/rhwp_bg.wasm/rhwp_bg.wasm.d.ts를 pkg/에 넣고 패치를 적용합니다.

```sh
cd rhwp-studio
npm ci --ignore-scripts
cd ..
RHWP_WITHOUT_AI=1 RHWP_WITHOUT_HWPCTRL=1 RHWP_DISABLE_EXTERNAL_WEBFONTS=1 HANGEULDAM_EMBED=1 \
  node rhwp-studio/node_modules/vite/bin/vite.js build rhwp-studio --base=./ --outDir=/absolute/output/dist --emptyOutDir
```

빌드 후 public에서 자동 복사된 `samples/` 문서와 미사용 `rhwp.js`, `rhwp.d.ts`, `rhwp_bg.wasm.d.ts`는 배포에서 제외했습니다. 런타임은 생성된 assets 청크를 사용합니다. `node scripts/vendor-studio.mjs /absolute/output/dist`로 배치하며, 이 스크립트는 동일 SHA-256의 WASM을 검증한 뒤 공통 `public/vendor/rhwp_bg.wasm`으로 참조를 통합합니다. 처리 기록은 `packaging.json`에 있습니다. 모든 글꼴 고지와 원문 라이선스는 유지했습니다.

## 호스트 연결

```js
import { createEditor } from './vendor/editor-sdk/index.js';
const studio = await createEditor(container, {
  studioUrl: new URL('./studio/index.html?chrome=embed', location.href).href,
  renderer: 'canvas2d',
});
await studio.loadFile(buffer, fileName, { suppressDialogs: true });
const api = container.querySelector('iframe').contentWindow.rhwpStudio;
api.forms.setActionsEnabled(false);
api.links.setHandler(() => true);
const result = await api.hangeuldam.exportHwpWithReport();
// contentLoss 확인 후 result.bytes를 로컬 IndexedDB 또는 다운로드로 저장합니다.
await studio.notifySaved(fileName);
```

Studio는 같은 origin의 부모 프레임을 허용해야 합니다: CSP `frame-ancestors 'self'`, `X-Frame-Options: SAMEORIGIN`. 글꼴은 byte FontFace와 blob CSS URL을 함께 쓰므로 `font-src 'self' blob:`을 허용합니다. 부모 앱의 프레임 금지는 유지해도 됩니다.

## 네트워크 및 라이선스

AI는 빌드에서 제외되고 원격 웹 글꼴 로딩은 빌드 플래그로 차단합니다. 폰트 규칙 카탈로그에 외부 URL 문자열은 남아 있으나 이 빌드에서 선택되지 않습니다. CDN 파일은 배포하지 않습니다. 개발 서버의 외부 그림 fetch 경로는 production dead-code입니다. `tests/privacy.spec.mjs`에서 편집·HWP 다운로드·기기 저장의 외부 요청 및 문서 이름·내용의 전송 여부를 검사합니다.

배포 코드의 npm 외부 의존성은 @noble/hashes 및 canvaskit-wasm입니다. pngjs/pixelmatch는 테스트용이며 Studio production source에서 import하지 않습니다. Anthropic SDK도 off 플래그로 번들에 포함되지 않습니다. `npm audit --omit=dev` 결과 0건. 개발 도구를 포함한 audit는 13건이므로 개발 도구 자체는 서버에 배포하지 않습니다.

폰트 40개(특수 수식 서브셋 포함)의 파일·원문 고지는 fonts/에 있습니다. fonts/licenses와 FONTS.md 및 관련 MANIFEST를 함께 유지해야 합니다. 엔진/CanvasKit/hash 라이선스 종합 고지는 `public/licenses/`와 `public/licenses.html`에 포함했습니다.

## 글꼴 없는 환경 및 링크 정책 추가 변경

초기화 시 로컬 Pretendard·나눔고딕·나눔명조·나눔고딕코딩을 읽고 document.fonts.ready를 기다립니다. UI CSS와 공통 font-substitution helper의 generic family 분기에 이 로컬 글꼴을 추가했습니다. 새 Canvas monkeypatch를 만들지 않았으며 원본 엔진의 공통 family resolver를 사용합니다. 문서에 저장된 원래 font-family는 바꾸지 않습니다.

link-navigation의 host handler가 문서 내부 anchor를 제외한 web/mail/file/app 링크 모두보다 우선하도록 변경했습니다. 호스트가 true를 반환하면 외부 탐색을 하지 않습니다.
