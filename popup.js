// ================================================================
// 페이지(YES24) 안에서 실행될 추출 함수
// chrome.scripting.executeScript로 주입되므로 완전히 독립적으로 동작해야 함
// (외부 변수/함수 참조 불가)
// ================================================================
function extractYes24BookInfo() {
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

  // ---- 1) 제목: <title> 또는 og:title의 첫 번째 " | " 구간 ----
  const parseTitleString = (str) => {
    if (!str) return null;
    const cleaned = str.replace(/\s*-\s*예스24\s*$/, "").trim();
    const parts = cleaned.split("|").map((s) => s.trim()).filter(Boolean);
    return parts.length ? parts : null;
  };
  let titleParts = parseTitleString(document.title);
  if (!titleParts) {
    const og = document.querySelector('meta[property="og:title"]');
    if (og) titleParts = parseTitleString(og.content);
  }
  const title = titleParts ? titleParts[0] : "";

  // ---- 2) 저자 / 출판사 / 출판일: 제목 아래 "저자정보 | 출판사 | 날짜" 줄에서 ----
  // 저자 검색 링크(authorNo=)를 기준점으로 삼아 해당 줄 전체(container)를 찾은 뒤,
  // (a) 앵커(링크) 위치 기반으로 출판사를 우선 추출하고 (더 안정적)
  // (b) "|" 텍스트 분리 방식을 보조/폴백으로 사용한다.
  // -> 일부 페이지는 구분자 "|"가 CSS로만 그려져 textContent에 없을 수 있어 (a)를 우선함.
  let author = "";
  let publisher = "";
  let pubDateRaw = "";

  const authorLink = document.querySelector('a[href*="authorNo="]');
  if (authorLink) {
    let container = authorLink.parentElement;
    for (let i = 0; i < 6 && container; i++) {
      const text = clean(container.textContent);
      if (/\d{4}년/.test(text)) break;
      container = container.parentElement;
    }

    if (container) {
      const anchors = Array.from(container.querySelectorAll("a"));
      const authorAnchors = anchors.filter((a) =>
        (a.getAttribute("href") || "").includes("authorNo=")
      );

      // (a) 앵커 위치 기반: 마지막 저자 링크 다음에 나오는, authorNo가 아닌 첫 링크 = 출판사
      let publisherAnchor = null;
      if (authorAnchors.length) {
        const lastIdx = anchors.indexOf(authorAnchors[authorAnchors.length - 1]);
        for (let j = lastIdx + 1; j < anchors.length; j++) {
          const href = anchors[j].getAttribute("href") || "";
          const txt = clean(anchors[j].textContent);
          if (
            !href.includes("authorNo=") &&
            txt &&
            !/^[\d.]+$/.test(txt) &&
            !txt.includes("보기") &&
            !txt.includes("리뷰") &&
            !txt.includes("알림")
          ) {
            publisherAnchor = anchors[j];
            break;
          }
        }
      }
      if (publisherAnchor) publisher = clean(publisherAnchor.textContent);

      const text = clean(container.textContent);
      if (text.includes("|")) {
        // (b) "|" 텍스트 분리 (보조/폴백)
        const segments = text.split("|").map((s) => clean(s));
        author = segments[0] || "";
        if (!publisher) publisher = segments[1] || "";
        const dateSeg = segments.slice(2).join(" ");
        const dm = dateSeg.match(/(\d{4})년\s?(\d{1,2})월/);
        if (dm) pubDateRaw = dm[1] + dm[2].padStart(2, "0");
      } else {
        // "|" 문자가 텍스트에 없는 경우: 출판사 앵커 텍스트가 처음 등장하는 지점을
        // 기준으로 그 앞부분을 저자 전체 텍스트로 간주
        if (publisherAnchor) {
          const idx = text.indexOf(clean(publisherAnchor.textContent));
          if (idx > 0) author = clean(text.slice(0, idx));
        }
        const dm = text.match(/(\d{4})년\s?(\d{1,2})월/);
        if (dm) pubDateRaw = dm[1] + dm[2].padStart(2, "0");
      }
    }
  }

  // ---- 3) 표(품목정보 / 가격정보) 기반 필드: ISBN, 무게, 정가, (발행일 fallback) ----
  let isbn = "";
  let weight = "";
  let priceKRW = "";

  // 무게(g) 파싱. 1000g 이상은 YES24가 "1,680g" 처럼 천 단위 쉼표를 넣는다.
  // 쉼표를 허용하지 않으면 앞자리가 잘려 1,680g → 680g, 1,030g → 30g 이 되어
  // 선박비 계산과 캐나다 가격이 크게 어긋난다.
  const parseGrams = (text) => {
    const m = String(text || "").match(/(\d[\d,]*(?:\.\d+)?)\s*g\b/);
    if (!m) return "";
    const n = parseFloat(m[1].replace(/,/g, ""));
    // 책 무게로 말이 되는 범위만 채택 (그 밖이면 잘못 읽은 것)
    return Number.isFinite(n) && n > 0 && n <= 30000 ? String(Math.round(n)) : "";
  };

  document.querySelectorAll("table tr").forEach((row) => {
    const th = row.querySelector("th");
    const td = row.querySelector("td");
    if (!th || !td) return;
    const label = clean(th.textContent).replace(/\s+/g, "");
    const value = clean(td.textContent);

    if (!isbn && label.includes("ISBN13")) {
      const m = value.match(/[\dXx]{9,13}/);
      isbn = m ? m[0] : value;
    }
    if (!weight && (label.includes("무게") || label.includes("쪽수"))) {
      weight = parseGrams(value);
    }
    if (!pubDateRaw && (label === "발행일" || label.includes("발행일") || label.includes("출간일"))) {
      const m = value.match(/(\d{4})년\s?(\d{1,2})월/);
      if (m) pubDateRaw = m[1] + m[2].padStart(2, "0");
    }
    if (!priceKRW && label === "정가") {
      const m = value.replace(/,/g, "").match(/(\d+)/);
      if (m) priceKRW = m[1];
    }
  });

  // ---- fallback: 표에서 못 찾았을 때 본문 텍스트 정규식으로 보조 탐색 ----
  if (!weight) {
    const m = document.body.innerText.match(/(\d[\d,]*(?:\.\d+)?)\s*g(?=\s*\|)/);
    if (m) weight = parseGrams(m[0]);
  }
  if (!pubDateRaw) {
    const m = document.body.innerText.match(/(\d{4})년\s?(\d{1,2})월/);
    if (m) pubDateRaw = m[1] + m[2].padStart(2, "0");
  }

  // ---- 4) 회원리뷰 건수 ----
  // 별점과 판매지수 사이에 있는 링크:
  //   <a href="javascript:…goGD_bot(1);">회원리뷰(<em>16</em>건)</a>
  // 링크 안이 텍스트 노드로 쪼개져 있어 innerText 를 통째로 보고 정규식으로 뽑는다.
  // 1000건이 넘으면 "1,234건" 처럼 쉼표가 들어가므로 쉼표를 허용한다.
  let reviewCount = "";
  const REVIEW_RE = /회원리뷰\s*\(\s*([\d,]+)\s*건\s*\)/;
  const reviewLink = Array.from(document.querySelectorAll("a")).find((a) =>
    REVIEW_RE.test(a.textContent || "")
  );
  const reviewText = reviewLink ? reviewLink.textContent : document.body.innerText;
  const rm = reviewText.match(REVIEW_RE);
  if (rm) {
    const n = parseInt(rm[1].replace(/,/g, ""), 10);
    // 리뷰가 없으면 0건으로 표기되므로 0도 정상값으로 받는다.
    if (Number.isFinite(n) && n >= 0) reviewCount = String(n);
  }

  // ---- 5) Subject: "관련분류" 아래 카테고리 분류 중 첫 번째 경로만 ----
  let subject = "";
  const headingCandidates = Array.from(document.querySelectorAll("*")).filter(
    (el) => el.children.length === 0 && clean(el.textContent) === "관련분류"
  );
  if (headingCandidates.length) {
    let scope = headingCandidates[0].parentElement;
    let anchors = [];
    const linkPattern =
      /(Main\/(Book|Foreign|used|eBook|Music|Dvd|Gift)\.aspx\?CategoryNumber=|product\/category\/display\/)/;
    for (let i = 0; i < 4 && scope; i++) {
      anchors = Array.from(scope.querySelectorAll("a")).filter((a) =>
        linkPattern.test(a.getAttribute("href") || "")
      );
      if (anchors.length) break;
      scope = scope.parentElement;
    }
    if (anchors.length) {
      const rootPattern = /Main\/(Book|Foreign|used|eBook|Music|Dvd|Gift)\.aspx\?CategoryNumber=/;
      const rows = [];
      let current = [];
      anchors.forEach((a) => {
        const href = a.getAttribute("href") || "";
        if (rootPattern.test(href) && current.length) {
          rows.push(current);
          current = [];
        }
        current.push(clean(a.textContent));
      });
      if (current.length) rows.push(current);
      if (rows.length) subject = rows[0].join(" > ");
    }
  }

  return {
    isbn,
    title,
    author: author.trim(),
    publisher: publisher.trim(),
    pubDate: pubDateRaw, // YYYYMM
    weight, // 숫자만 (그램)
    reviewCount, // 숫자만 (회원리뷰 건수)
    priceKRW, // 숫자만 (정가)
    subject,
    url: location.href,
  };
}

// ================================================================
// 팝업 UI 로직
// ================================================================
const FIELD_DEFS = [
  { key: "isbn", label: "ISBN" },
  { key: "title", label: "제목" },
  { key: "author", label: "저자 (표기 그대로)" },
  { key: "publisher", label: "출판사" },
  { key: "pubDate", label: "출판일자 (YYYYMM)" },
  { key: "weight", label: "무게 (g, 숫자만)" },
  { key: "reviewCount", label: "회원리뷰 (건수)" },
  { key: "priceKRW", label: "정가 (KRW)" },
  { key: "subject", label: "Subject (카테고리)" },
];

const statusEl = document.getElementById("status");
const fieldsEl = document.getElementById("fields");
const toastEl = document.getElementById("toast");
const rateInput = document.getElementById("discountRate");
const marginInput = document.getElementById("marginInput");
const canadaPriceDisplay = document.getElementById("canadaPriceDisplay");

let currentData = null;

// ---- 유틸 ----
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 1300);
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(
    () => showToast("복사됨 (엑셀에 붙여넣기 하세요)"),
    () => showToast("복사 실패")
  );
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

// 캐나다 가격 계산
// x = (KRW * 할인율 / 960) + (무게(g) * 0.001 * 13)
// raw = x + x*margin/(100-margin)  (마진 53 기준으로는 x * 100/47 과 동일)
// 0.5 단위 올림 반올림: 10 < raw <=10.5 -> 10.5 / 10.5 < raw <=11 -> 11
function computeCanadaPrice(krw, weightG, discountRate, margin) {
  const krwNum = parseFloat(krw);
  const weightNum = parseFloat(weightG);
  if (!krwNum || !weightNum || !discountRate) return 0; // 무게 없으면 0 처리
  const denom = 100 - margin;
  if (denom <= 0) return 0; // 마진값이 100 이상이면 계산 불가
  const x = (krwNum * discountRate) / 960 + weightNum * 0.001 * 13;
  const raw = x + (x * margin) / denom;
  const rawFixed = Math.round(raw * 1e6) / 1e6; // 부동소수점 오차 보정
  return Math.ceil(rawFixed / 0.5) * 0.5;
}

function getDiscountRate() {
  const v = parseFloat(rateInput.value);
  return isNaN(v) ? 0.775 : v;
}

function getMargin() {
  const v = parseFloat(marginInput.value);
  return isNaN(v) ? 53 : v;
}

// ================================================================
// 교보문고 무게 보완
// YES24에서 무게를 못 찾았을 때, ISBN으로 교보문고를 조회해 무게(g)만 가져온다.
//   1) 교보 검색 HTML(서버 렌더링)에서 첫 상품 상세 링크(/detail/S번호)를 뽑고
//   2) 교보 상세 API(JSON)에서 무게를 읽는다.
// 안전장치: 검색 결과가 없으면 교보가 "베스트셀러"를 대신 노출하므로,
//           상세 API가 돌려준 ISBN이 조회한 ISBN과 일치할 때만 채택한다.
// (fetch는 팝업 컨텍스트에서 실행 — manifest host_permissions로 CORS 우회)
// ================================================================
function normIsbn(s) {
  return String(s || "").toUpperCase().replace(/[^0-9X]/g, "");
}

// 교보 상세 API JSON에서 { isbn, weight } 추출.
// 알려진 경로(data.middle.basicInfo)를 우선하고, 구조가 바뀌어도 견디도록 재귀 폴백.
function extractKyoboInfo(json) {
  const bi = json && json.data && json.data.middle && json.data.middle.basicInfo;
  let isbn = bi && bi.isbn;
  let weight = bi && typeof bi.weight === "number" ? bi.weight : null;

  if (!weight || !isbn) {
    const walk = (o) => {
      if (!o || typeof o !== "object") return;
      for (const k of Object.keys(o)) {
        const v = o[k];
        const kl = k.toLowerCase();
        if (weight == null && kl === "weight" && typeof v === "number" && v > 0 && v < 100000) weight = v;
        if (!isbn && (kl === "isbn" || kl === "isbn13") && typeof v === "string" && normIsbn(v).length >= 10) isbn = v;
        if (v && typeof v === "object") walk(v);
      }
    };
    walk(json);
  }
  return { isbn, weight };
}

async function fetchKyoboWeight(isbn) {
  const target = normIsbn(isbn);
  if (target.length < 10) return null;

  // 1) 교보 검색 → 후보 상품번호(S번호) 목록 (등장 순서, 중복 제거)
  const searchUrl =
    "https://search.kyobobook.co.kr/search?keyword=" +
    encodeURIComponent(isbn) +
    "&gbCode=TOT&target=total";
  const res = await fetch(searchUrl, { credentials: "omit" });
  if (!res.ok) throw new Error("교보 검색 실패(" + res.status + ")");
  const html = await res.text();

  const ids = [];
  const re = /\/detail\/(S\d+)/g;
  let m;
  while ((m = re.exec(html)) && ids.length < 8) {
    if (!ids.includes(m[1])) ids.push(m[1]);
  }
  if (!ids.length) return null;

  // 2) 후보 상세 API를 순회하며 ISBN이 일치하는 상품의 무게를 채택 (앞쪽 3개만)
  for (const sid of ids.slice(0, 3)) {
    try {
      const r2 = await fetch(
        "https://product.kyobobook.co.kr/api/gw/pdt/product/" + sid,
        { credentials: "omit", headers: { Accept: "application/json" } }
      );
      if (!r2.ok) continue;
      const info = extractKyoboInfo(await r2.json());
      if (info.weight > 0 && normIsbn(info.isbn) === target) {
        return String(Math.round(info.weight));
      }
    } catch (_) {
      /* 다음 후보 계속 */
    }
  }
  return null;
}

// ================================================================
// 알라딘 무게 보완 (교보문고에도 무게가 없을 때 3차 폴백)
// 교보와 달리 알라딘 상세페이지는 서버 렌더링이라 HTML에 무게가 그대로 있음.
//   1) 알라딘 검색 HTML에서 첫 상품(ItemId) 후보를 뽑고
//   2) 상세페이지 HTML에서 무게(예: "145*210mm / 478g")를 파싱.
// 안전장치: 상세페이지 HTML에 조회한 ISBN 문자열이 들어있을 때만 채택.
// ================================================================
// 알라딘도 1000g 이상은 "1,680g" 처럼 쉼표를 넣으므로 쉼표를 허용해야 한다.
// (\d{2,5} 만 쓰면 1,680g 에서 680 만 잡혀 무게가 1kg 씩 줄어든다.)
function parseAladinWeight(html) {
  const text = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ");
  const toGrams = (s) => {
    const n = parseFloat(String(s).replace(/,/g, ""));
    return Number.isFinite(n) && n > 0 && n <= 30000 ? n : 0;
  };
  // "…mm / 478g" 형태 우선 (치수 다음에 오는 무게)
  let m = text.match(/mm\s*[^\d]{0,4}(\d[\d,]{1,6}(?:\.\d+)?)\s*g\b/i);
  if (m) return toGrams(m[1]);
  // 폴백: "…쪽 … 478g"
  m = text.match(/쪽[\s\S]{0,30}?(\d[\d,]{1,6}(?:\.\d+)?)\s*g\b/);
  if (m) return toGrams(m[1]);
  return 0;
}

async function fetchAladinWeight(isbn) {
  const target = normIsbn(isbn);
  if (target.length < 10) return null;

  // 1) 알라딘 검색 → 후보 ItemId 목록 (등장 순서, 중복 제거)
  const searchUrl =
    "https://www.aladin.co.kr/search/wsearchresult.aspx?SearchTarget=All&SearchWord=" +
    encodeURIComponent(isbn);
  const res = await fetch(searchUrl, { credentials: "omit" });
  if (!res.ok) throw new Error("알라딘 검색 실패(" + res.status + ")");
  const html = await res.text();

  const ids = [];
  const re = /wproduct\.aspx\?ItemId=(\d+)/gi;
  let m;
  while ((m = re.exec(html)) && ids.length < 8) {
    if (!ids.includes(m[1])) ids.push(m[1]);
  }
  if (!ids.length) return null;

  // 2) 후보 상세페이지를 순회 — ISBN이 실제로 담긴 페이지의 무게만 채택 (앞쪽 3개)
  for (const id of ids.slice(0, 3)) {
    try {
      const r2 = await fetch(
        "https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=" + id,
        { credentials: "omit" }
      );
      if (!r2.ok) continue;
      const phtml = await r2.text();
      if (!phtml.includes(target)) continue; // 엉뚱한 추천 상품 방지
      const w = parseAladinWeight(phtml);
      if (w > 0) return String(Math.round(w));
    } catch (_) {
      /* 다음 후보 계속 */
    }
  }
  return null;
}

function render(data) {
  currentData = data;
  fieldsEl.innerHTML = "";
  FIELD_DEFS.forEach(({ key, label }) => {
    const value = data[key];
    const div = document.createElement("div");
    div.className = "field";
    if (key === "weight") {
      // 무게는 직접 수정 가능한 입력창 (입력 시 CAD 가격·복사 양식에 즉시 반영)
      div.innerHTML = `
        <div class="field-main">
          <div class="label">${label}${weightBadgeHtml(data.weightSource)}</div>
          <input class="weight-input" type="number" min="0" step="1"
                 value="${value ? escapeHtml(String(value)) : ""}" placeholder="직접 입력 (g)" />
        </div>
        <button class="copy-btn" data-key="weight">복사</button>
      `;
    } else {
      div.innerHTML = `
        <div>
          <div class="label">${label}</div>
          <div class="value ${value ? "" : "empty"}">${
        value ? escapeHtml(String(value)) : "찾지 못함"
      }</div>
        </div>
        <button class="copy-btn" data-key="${key}">복사</button>
      `;
    }
    fieldsEl.appendChild(div);
  });

  fieldsEl.querySelectorAll(".copy-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.key;
      copyText(String(currentData[key] || ""));
    });
  });

  // 무게 직접 입력 → currentData 갱신 + 재계산 (재렌더 없이 값만 반영해 포커스 유지)
  const wInput = fieldsEl.querySelector(".weight-input");
  if (wInput) {
    wInput.addEventListener("input", () => {
      const raw = wInput.value.trim();
      const badge = document.getElementById("weightSrcBadge");
      if (raw) {
        currentData.weight = String(Math.round(parseFloat(raw) || 0));
        currentData.weightSource = "직접 입력";
        if (badge) {
          badge.textContent = "직접 입력";
          badge.style.display = "";
        }
        statusEl.classList.remove("weight-fail");
        statusEl.classList.add("weight-ok");
        statusEl.textContent =
          "✅ 무게 " + currentData.weight + "g (직접 입력). 양식 버튼을 눌러 복사하세요.";
      } else {
        currentData.weight = "";
        currentData.weightSource = "";
        if (badge) badge.style.display = "none";
        statusEl.classList.remove("weight-ok", "weight-fail");
        statusEl.textContent = "무게를 직접 입력하면 가격이 다시 계산됩니다.";
      }
      updateCanadaPriceDisplay();
    });
  }

  updateCanadaPriceDisplay();
}

// 무게 출처 배지 HTML. src 없으면 숨김 상태로 자리만 잡아 둔다(직접 입력 시 갱신용).
function weightBadgeHtml(src) {
  if (!src) return `<span class="src-badge" id="weightSrcBadge" style="display:none"></span>`;
  const text = src === "직접 입력" ? "직접 입력" : src + " 보완";
  return `<span class="src-badge" id="weightSrcBadge">${text}</span>`;
}

function updateCanadaPriceDisplay() {
  if (!currentData) return;
  const cad = computeCanadaPrice(currentData.priceKRW, currentData.weight, getDiscountRate(), getMargin());
  canadaPriceDisplay.textContent = "CAD " + cad;
}

// ---- 케이스별 컬럼 빌더 (탭으로 구분 → 엑셀 붙여넣기 시 셀 분리됨) ----
const COPIES = "1"; // Copies 기본값 (사용자가 엑셀에서 필요시 수정)

function buildCase1(d, cad) {
  // 캐나다가격 | 빈칸 | Title | Publisher | Author | Copies(1) | KRW | Weight
  return [cad, "", d.title, d.publisher, d.author, COPIES, d.priceKRW, d.weight].join("\t");
}

function buildCase2(d, cad) {
  // ISBN | 제목 | 캐나다가격 | 빈칸 | 빈칸 | Copies(1) | 빈칸 | Author | 날짜 | 빈칸 | 출판사 | 장르(Subject) | Copies(1) | KRW | Weight | 회원리뷰
  return [
    d.isbn,
    d.title,
    cad,
    "",
    "",
    COPIES,
    "",
    d.author,
    d.pubDate, // 날짜
    "", // 날짜와 출판사 사이 빈칸
    d.publisher, // 출판사
    d.subject, // 장르
    COPIES,
    d.priceKRW,
    d.weight,
    d.reviewCount, // 무게 다음 칸
  ].join("\t");
}

function buildCase3(d, cad) {
  // 1번줄: ISBN | 빈칸 | 캐나다가격 | 빈칸 | 빈칸 | Copies(1) | 빈칸 | 빈칸 | Pub.Date | 빈칸 | 빈칸 | Subject
  // 2번줄: 빈칸 | Title | 빈칸 | 빈칸 | 빈칸 | 빈칸    | 빈칸 | Author | 빈칸 | 빈칸 | Publisher | 빈칸
  //   → Copies는 윗줄에만 표기 (2번줄 6번 컬럼은 빈칸)
  const row1 = [d.isbn, "", cad, "", "", COPIES, "", "", d.pubDate, "", "", d.subject].join("\t");
  const row2 = ["", d.title, "", "", "", "", "", d.author, "", "", d.publisher, ""].join("\t");
  return row1 + "\n" + row2;
}

// ---- 실행 ----
async function run() {
  statusEl.classList.remove("extract-ok", "weight-ok", "weight-fail", "loading");
  statusEl.textContent = "불러오는 중…";
  fieldsEl.innerHTML = "";
  currentData = null;
  canadaPriceDisplay.textContent = "CAD -";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.url || !/^https:\/\/www\.yes24\.com\/product\/goods\//.test(tab.url)) {
    statusEl.textContent =
      "이 페이지는 YES24 도서 상세페이지가 아니에요. yes24.com/product/goods/ 로 시작하는 상품 페이지에서 열어주세요.";
    return;
  }

  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractYes24BookInfo,
    });
    render(result);

    if (result.weight) {
      // YES24 페이지에서 무게까지 한 번에 다 찾은 경우: 보완 없이 바로 완료
      statusEl.classList.add("extract-ok");
      statusEl.textContent = "✅ 추출 완료. 원하는 양식 버튼을 눌러 복사하세요.";
    } else {
      statusEl.textContent = "추출 완료. 원하는 양식 버튼을 눌러 복사하세요.";
    }

    // 무게가 없으면 다른 서점에서 보완 (ISBN 필요): 교보문고 → 알라딘 순
    if (!result.weight && result.isbn) {
      let w = null;
      let src = null;

      statusEl.classList.add("loading");
      statusEl.textContent = "무게 정보가 없어 교보문고에서 조회 중…";
      try {
        w = await fetchKyoboWeight(result.isbn);
        if (w) src = "교보문고";
      } catch (_) {
        /* 다음 폴백으로 */
      }

      if (!w) {
        statusEl.textContent = "교보문고에 무게가 없어 알라딘에서 조회 중…";
        try {
          w = await fetchAladinWeight(result.isbn);
          if (w) src = "알라딘";
        } catch (_) {
          /* 실패 시 아래에서 안내 */
        }
      }

      statusEl.classList.remove("loading");
      if (w) {
        currentData.weight = w;
        currentData.weightSource = src;
        render(currentData);
        statusEl.classList.add("weight-ok");
        statusEl.textContent =
          "✅ 무게 " + w + "g 를 " + src + "에서 보완했습니다. 양식 버튼을 눌러 복사하세요.";
      } else {
        statusEl.classList.add("weight-fail");
        statusEl.textContent =
          "⚠️ 교보문고·알라딘에도 무게가 없습니다. 무게를 직접 입력하세요. (지금은 무게 없이 계산됨)";
      }
    }
  } catch (e) {
    statusEl.textContent = "추출 중 오류가 발생했어요: " + e.message;
  }
}

// ---- 이벤트 ----
document.getElementById("case1Btn").addEventListener("click", () => {
  if (!currentData) return;
  const cad = computeCanadaPrice(currentData.priceKRW, currentData.weight, getDiscountRate(), getMargin());
  copyText(buildCase1(currentData, cad));
});
document.getElementById("case2Btn").addEventListener("click", () => {
  if (!currentData) return;
  const cad = computeCanadaPrice(currentData.priceKRW, currentData.weight, getDiscountRate(), getMargin());
  copyText(buildCase2(currentData, cad));
});
document.getElementById("case3Btn").addEventListener("click", () => {
  if (!currentData) return;
  const cad = computeCanadaPrice(currentData.priceKRW, currentData.weight, getDiscountRate(), getMargin());
  copyText(buildCase3(currentData, cad));
});
document.getElementById("reloadBtn").addEventListener("click", run);

rateInput.addEventListener("input", () => {
  chrome.storage.local.set({ discountRate: rateInput.value });
  updateCanadaPriceDisplay();
});

marginInput.addEventListener("input", () => {
  chrome.storage.local.set({ margin: marginInput.value });
  updateCanadaPriceDisplay();
});

// ---- 초기화: 저장된 할인율/마진값 불러오기 후 추출 시작 ----
chrome.storage.local.get(["discountRate", "margin"], (res) => {
  if (res && res.discountRate) rateInput.value = res.discountRate;
  if (res && res.margin) marginInput.value = res.margin;
  run();
});
