# 한글담 v0.2 외부 구성요소 라이선스 확인 기록

확인일: 2026-11-13. 이 기록은 v0.2 브라우저 배포물의 외부 코드·글꼴·고지와 원본 소스 제공 조치를 설명합니다. 확인된 재배포 조건에 따라 고지를 보완했으며, 모든 저작권·특허 쟁점을 확정하거나 법적 문제가 전혀 없음을 보증하는 문서는 아닙니다. 앱의 [오픈소스·라이선스 화면](public/licenses.html)에서 관련 원문을 열 수 있습니다.

## 적용한 조치

| 구성요소 | 확인한 조건과 반영 위치 |
| --- | --- |
| 한컴 HWP 5.0 공개 명세 | 아래 지정 문장을 앱 화면, README, 라이선스 화면 및 소스에 반영했습니다. 공식 명세는 원문 링크로 안내합니다. |
| RHWP core·Studio·SDK 0.9.0 | MIT 원문과 엔진의 별도 고지를 보존했습니다. [엔진 LICENSE](public/licenses/rhwp/LICENSE), [SDK LICENSE](public/licenses/editor-sdk/LICENSE), [제3자 고지](public/licenses/rhwp/notices/THIRD_PARTY_LICENSES.md). |
| DOMPurify 3.4.17 | 원본의 `MPL-2.0 OR Apache-2.0` 중 Apache-2.0 옵션을 선택했습니다. [Apache 원문](public/licenses/dompurify/LICENSE)과 포함된 [Babel helper MIT](public/licenses/dompurify/Babel-helpers-LICENSE)를 제공합니다. |
| @noble/hashes 2.4.0 | Studio에서 사용하는 런타임 코드의 [MIT 원문](public/licenses/noble-hashes/LICENSE)을 보존했습니다. |
| CanvasKit/Skia 0.42.0 | [BSD-3-Clause](public/licenses/canvaskit/LICENSE)와 포함 라이브러리의 [별도 고지](public/licenses/canvaskit/README.txt)를 제공합니다. FreeType은 FTL 옵션을 선택했습니다. |
| 글꼴 | [읽기 화면 글꼴](public/fonts/)과 [Studio 글꼴 목록](public/studio/fonts/FONTS.md), 원문 라이선스·변경 manifest를 함께 제공합니다. |
| Caddy 2.11.4 | [Apache-2.0 원문](public/licenses/caddy/LICENSE)을 제공합니다. 운영 서버에서 실행하며 오프라인 앱에 Caddy 실행 파일을 포함하지 않습니다. |

본 제품은 한글과컴퓨터의 한글 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.

이 문장은 [한컴 HWP 5.0 revision 1.3](https://cdn.hancom.com/link/docs/%ED%95%9C%EA%B8%80%EB%AC%B8%EC%84%9C%ED%8C%8C%EC%9D%BC%ED%98%95%EC%8B%9D_5.0_revision1.3.pdf)의 공개 조건에 따른 고지입니다. 파일 형식 공개는 한컴 상용 프로그램·뷰어·DLL·글꼴의 재배포 허가와 다릅니다. 현재 배포에는 해당 상용 바이너리를 포함하지 않으며 공식 제품이나 제휴 제품으로 표시하지 않습니다.

This software is based in part on the work of the FreeType Team.

This software is based in part on the work of the Independent JPEG Group.

## 원본 소스와 수정사항 제공

RHWP의 기준은 [공식 v0.9.0](https://github.com/edwardkim/rhwp/tree/v0.9.0), commit `c9095c5f67632e6721e800ccc7fb43ea49d26682`입니다. [원본 소스 ZIP](public/source/rhwp-source-0.9.0-amo.zip), [SHA256SUMS](public/source/SHA256SUMS), [Studio 수정 패치](public/source/hangeuldam-studio.patch), [빌드 방법](public/source/BUILD.md)을 배포 경로에 제공합니다. 원본 ZIP의 SHA256는 `cb210f0ad6f54fe579cade87fa99fae87c85577dc87c8558e49cf1aa23236eea`입니다.

Studio 변경은 AI·한컴 컨트롤 연동·외부 웹 글꼴을 제외하는 빌드 설정, 원격 URL 문서 열기 제거, 로컬 글꼴 폴백, 외부 링크 차단, 저장 결과·내용 손실 보고와 편집 상태를 호스트에 전달하는 연결입니다. 동일한 WASM의 중복 배포를 줄인 기록은 [packaging.json](public/source/packaging.json)에 있습니다. 기존 엔진 WASM을 재사용했으며 Rust 엔진 자체를 재컴파일했다고 주장하지 않습니다.

원본 소스 아카이브는 앱에서 별도 다운로드할 수 있습니다. 실행에 필요하지 않은 큰 원본 소스는 Service Worker 캐시에 자동 저장하지 않습니다. 반면 실행 코드·폰트와 함께 제공해야 하는 라이선스 원문은 오프라인 실행 자산에 포함합니다. 재배포할 때에는 배포 폴더의 고지·소스·패치를 유지해야 합니다.

## 글꼴 확인과 유지할 조건

Studio의 실제 폰트 40개를 검사했습니다. 39개는 [font-notices.json](public/studio/fonts/licenses/font-notices.json)의 SHA256와 일치하고, `LatinModernMath-VariableOutline-subset.otf`는 [별도 변경 manifest](public/studio/fonts/MANIFEST-RHWP-LMM-VariableOutline.txt)의 SHA256와 일치합니다. 후자는 `RHWP LMM Variable Outline`으로 내부 이름을 변경했고 변형 내역을 기록합니다. 전체 `public/studio/fonts/licenses/`, `FONTS.md`, 변경 manifest를 함께 보존했습니다.

Nanum 및 대부분의 Studio 글꼴은 SIL OFL 1.1입니다. 저작권·라이선스 원문을 동봉한 소프트웨어 배포를 허용하며, 폰트 파일만 단독 판매하지 않아야 합니다. 수정 폰트에는 OFL과 예약된 글꼴 이름 조건이 적용됩니다. 문서 자체의 저작권을 OFL로 변경하는 조건은 아닙니다. [SIL OFL 공식 원문](https://openfontlicense.org/open-font-license-official-text/)

Latin Modern Math의 GUST Font License와 LPPL 원문도 보존했습니다. Cafe24 Ssurround/Supermagic과 Happiness Sans는 원본 PDF의 권리 안내 및 OFL 본문을 직접 확인했습니다. 개인·기업 사용과 소프트웨어 동봉 배포를 허용하며 폰트 단독 판매를 금지합니다. 일부 공급자의 안내에는 사용 이미지를 홍보에 활용할 수 있다는 설명이 있으므로 해당 브랜드 사용 정책을 별도로 변경해 표시하지 않습니다. [Cafe24 공식 안내](https://fonts.cafe24.com/), [Happiness Sans 공식 안내](https://thehyundaifont.com/)

소스의 한컴·Windows 글꼴 이름과 폴백 매핑은 해당 독점 글꼴 파일의 배포와 구분했습니다. 확인한 배포 폰트는 위 manifest의 공개 글꼴이며, 사용자가 여는 문서에 포함된 이미지·글꼴의 권리는 해당 권리자에게 있습니다.

## 확인한 파일과 감사 범위

- `public/vendor/rhwp.js`, `rhwp_bg.wasm`, `purify.es.mjs`는 설치한 동일 버전 npm 원본과 SHA256가 일치했습니다. RHWP의 `public/licenses/rhwp/notices/` 84개 원문도 npm 배포본과 일치했습니다.
- DOMPurify의 Apache 라이선스 선택과 regenerator helper의 MIT 고지를 구분했습니다. 근거는 [DOMPurify 원문](https://github.com/cure53/DOMPurify/blob/3.4.17/LICENSE)과 [Babel helpers 원문](https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE)입니다.
- CanvasKit 고지에는 FreeType, HarfBuzz, ICU, libjpeg-turbo, libpng, libwebp, Wuffs, zlib, Brotli, 내장 NotoMono와 Emscripten 런타임의 원문을 보완했습니다. [고지 manifest](public/licenses/canvaskit/manifest.json)에 파일별 SHA256가 있습니다. 기준은 [Skia CanvasKit 0.42.0 공식 tag](https://skia.googlesource.com/skia/+/refs/tags/canvaskit/0.42.0/)의 기본 빌드 설정과 고정된 DEPS입니다.
- Studio의 production source에서 실제 사용하는 npm 외부 의존성은 `@noble/hashes`와 `canvaskit-wasm`입니다. `pngjs`·`pixelmatch`는 테스트용이며 AI SDK는 비활성 빌드에서 제외됩니다. 개발 의존성이 설치되어 있다는 이유만으로 모두 브라우저에 배포한다고 표시하지 않았습니다.
- 외부 QA 문서의 취득 출처·고정 커밋·체크섬은 [tests/fixtures.json](tests/fixtures.json)에 기록합니다. `.test-data/`의 테스트 문서와 설치용 `node_modules/`는 공개 앱 및 오프라인 실행 패키지에서 제외합니다. Studio의 미사용 예제 문서도 런타임 배포에서 제외했습니다.
- 프로젝트의 [MIT LICENSE](LICENSE)는 자체 코드에 적용하며 포함된 제3자 구성요소의 별도 조건을 대체하지 않습니다. Caddy는 서버 운영 도구로 구분했습니다. 향후 Caddy 실행 파일을 재배포하면 그 바이너리와 의존성의 배포 고지도 별도로 확인해야 합니다. [Caddy 공식 원문](https://github.com/caddyserver/caddy/blob/v2.11.4/LICENSE)

## Nimbus 메트릭과 남은 불확실성

RHWP는 Nimbus Roman에서 추출한 숫자 글자 폭 메트릭을 포함합니다. upstream은 원본 폰트 프로그램·윤곽을 포함하지 않는다고 설명하며, 원본 URW의 AGPL 및 font exception 고지를 제공합니다. 이 배포도 [URW-FONT-NOTICE.txt](public/licenses/rhwp/notices/data/font-metrics/nimbus-roman/URW-FONT-NOTICE.txt)를 그대로 보존합니다. [RHWP의 해당 자료 설명](https://github.com/edwardkim/rhwp/blob/v0.9.0/data/font-metrics/nimbus-roman/README.md)

숫자 메트릭의 저작권 및 AGPL 적용 여부를 이 파일 검사만으로 확정할 수는 없습니다. 따라서 모든 구성요소가 MIT라고 표시하지 않습니다. 정확한 원본 소스·실제 수정 패치의 자체 다운로드는 출처와 변경사항을 공개하기 위한 조치이며, 그것만으로 가능한 모든 AGPL 해석이 해결되었다고 주장하지 않습니다.

Rust Cargo.lock의 라이선스 자료도 확인했지만 이 목록에는 native-only·빌드·테스트 의존성이 섞여 있습니다. upstream의 고지 전체를 보존한 사실은 실제 배포 WASM의 모든 전이 구성요소를 linker 단위로 대조한 완전한 SBOM을 확보한 것과 다릅니다. CanvasKit 목록 역시 공식 기본 빌드에 따른 보수적 고지 집합이며 npm 바이너리를 재현 빌드해 입증한 목록은 아닙니다. Emscripten 원문은 해당 Skia tag의 `bin/activate-emsdk`가 지정한 4.0.7을 기준으로 하며 출처를 고지에 기록했습니다.

구성요소·글꼴·빌드 옵션을 바꾸거나 재배포 방식을 바꿀 때에는 실제 포함 파일과 적용 라이선스를 다시 확인해야 합니다. 현재 고지 보완은 확인한 누락을 처리한 것이며 모든 법적 쟁점에 대한 보증은 아닙니다.
