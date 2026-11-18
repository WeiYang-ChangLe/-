const { vocabulary, glosses, clickPassageText, knownPassageText } = window.WORD_GARDEN_DATA;

const knownStorageKey = "word-garden-known-words";
const knownWords = new Set(
  (window.localStorage.getItem(knownStorageKey) || "")
    .split("|")
    .filter(Boolean),
);
const reviewStorageKey = "word-garden-remember-review-history";
const dayInMilliseconds = 24 * 60 * 60 * 1000;

function loadReviewHistory() {
  const savedHistory = window.localStorage.getItem(reviewStorageKey);
  if (savedHistory === null) return [];

  const parsedHistory = JSON.parse(savedHistory);
  if (!Array.isArray(parsedHistory) || parsedHistory.some((review) => (
    typeof review !== "object"
    || review === null
    || !Number.isFinite(review.reviewedAt)
    || review.reviewedAt <= 0
    || !Number.isFinite(review.intervalDays)
    || review.intervalDays <= 0
  ))) {
    throw new Error("Saved review history is invalid.");
  }
  return parsedHistory;
}

const reviewHistory = loadReviewHistory();

const wordSearch = document.querySelector("#word-search");
const wordList = document.querySelector("#word-list");
const wordCount = document.querySelector("#word-count");
const noResults = document.querySelector("#no-results");

function renderVocabulary(query = "") {
  const searchTerm = query.toLowerCase();
  const matches = vocabulary.filter(({ word }) => word.toLowerCase().includes(searchTerm));
  const fragment = document.createDocumentFragment();

  matches.forEach(({ word, meaning }) => {
    const row = document.createElement("li");
    const english = document.createElement("span");
    const chinese = document.createElement("span");
    english.className = "english-word";
    english.textContent = word;
    chinese.className = "chinese-meaning";
    chinese.textContent = meaning;
    row.append(english, chinese);
    fragment.append(row);
  });

  wordList.replaceChildren(fragment);
  wordCount.textContent = `${matches.length} / ${vocabulary.length}`;
  noResults.hidden = matches.length > 0;
  wordList.hidden = matches.length === 0;
}

wordSearch.addEventListener("input", (event) => {
  renderVocabulary(event.currentTarget.value);
});

function normalizeWord(word) {
  return word.toLowerCase().replace(/[^a-z]/g, "");
}

function renderPassage(container, passage, isKnownPassage = false) {
  const fragment = document.createDocumentFragment();
  const tokens = passage.match(/[A-Za-z]+(?:['’][A-Za-z]+)*|[^A-Za-z]+/g) || [];

  tokens.forEach((token) => {
    if (!/[A-Za-z]/.test(token)) {
      fragment.append(document.createTextNode(token));
      return;
    }

    const word = document.createElement("span");
    const normalized = normalizeWord(token);
    word.className = "passage-word";
    word.dataset.word = normalized;
    word.textContent = token;
    if (isKnownPassage && glosses[normalized] && !knownWords.has(normalized)) {
      word.classList.add("is-unknown");
      word.setAttribute("aria-label", `${token}，尚未掌握`);
    }
    fragment.append(word);
  });

  container.replaceChildren(fragment);
}

function clearClickGloss() {
  const glossWord = document.querySelector("#click-gloss-word");
  glossWord.textContent = "点一个单词";
  delete glossWord.dataset.word;
  document.querySelector("#click-gloss-meaning").textContent = "中文释义会显示在这里。";
  document.querySelectorAll("#click-text .is-selected").forEach((word) => {
    word.classList.remove("is-selected");
  });
}

document.querySelector("#click-passage").addEventListener("click", (event) => {
  const clickedWord = event.target.closest(".passage-word");
  if (!clickedWord || !event.currentTarget.contains(clickedWord)) {
    clearClickGloss();
    return;
  }

  const word = clickedWord.dataset.word;
  const meaning = glosses[word];
  if (!meaning) {
    clearClickGloss();
    return;
  }

  const currentWord = document.querySelector("#click-gloss-word").dataset.word;
  if (currentWord === word) {
    clearClickGloss();
    return;
  }

  document.querySelectorAll("#click-text .is-selected").forEach((item) => {
    item.classList.remove("is-selected");
  });
  clickedWord.classList.add("is-selected");
  const glossWord = document.querySelector("#click-gloss-word");
  glossWord.textContent = clickedWord.textContent;
  glossWord.dataset.word = word;
  document.querySelector("#click-gloss-meaning").textContent = meaning;
});

function updateKnownCount() {
  document.querySelector("#known-count").textContent = String(knownWords.size);
}

document.querySelector("#known-passage").addEventListener("click", (event) => {
  const clickedWord = event.target.closest(".passage-word");
  if (!clickedWord || !event.currentTarget.contains(clickedWord)) return;

  const word = clickedWord.dataset.word;
  const meaning = glosses[word];
  if (!meaning) return;

  if (clickedWord.classList.contains("is-unknown")) {
    knownWords.add(word);
    window.localStorage.setItem(knownStorageKey, [...knownWords].join("|"));
    document.querySelectorAll(`#known-text [data-word="${word}"]`).forEach((occurrence) => {
      occurrence.classList.remove("is-unknown");
      occurrence.removeAttribute("aria-label");
    });
    updateKnownCount();
  }

  document.querySelector("#known-gloss-word").textContent = clickedWord.textContent;
  document.querySelector("#known-gloss-meaning").textContent = meaning;
});

const tabs = [...document.querySelectorAll('[role="tab"]')];
const panels = [...document.querySelectorAll('[role="tabpanel"]')];

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((item) => {
      const isActive = item === tab;
      item.classList.toggle("is-active", isActive);
      item.setAttribute("aria-selected", String(isActive));
      item.tabIndex = isActive ? 0 : -1;
    });

    panels.forEach((panel) => {
      const isActive = panel.id === tab.getAttribute("aria-controls");
      panel.hidden = !isActive;
      panel.classList.toggle("is-active", isActive);
    });
  });
});

const reviewCardButton = document.querySelector("#review-card-button");
const reviewEmpty = document.querySelector("#review-empty");
const curveChartWrap = document.querySelector("#curve-chart-wrap");
const retentionChart = document.querySelector("#retention-chart");
const curveNote = document.querySelector("#curve-note");
const svgNamespace = "http://www.w3.org/2000/svg";

function appendSvgElement(parent, tagName, attributes, text = "") {
  const element = document.createElementNS(svgNamespace, tagName);
  Object.entries(attributes).forEach(([name, value]) => {
    element.setAttribute(name, String(value));
  });
  if (text) element.textContent = text;
  parent.append(element);
  return element;
}

function renderRetentionChart() {
  const hasReviews = reviewHistory.length > 0;
  reviewEmpty.hidden = hasReviews;
  curveChartWrap.hidden = !hasReviews;
  retentionChart.hidden = !hasReviews;
  curveNote.hidden = !hasReviews;
  if (!hasReviews) return;

  const plot = { left: 58, top: 18, right: 22, bottom: 40 };
  const width = 720;
  const height = 270;
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  const firstReviewAt = reviewHistory[0].reviewedAt;
  const reviews = reviewHistory.map((review) => ({
    ...review,
    day: (review.reviewedAt - firstReviewAt) / dayInMilliseconds,
  }));
  const lastReview = reviews[reviews.length - 1];
  const chartEndDay = Math.max(
    7,
    lastReview.day + Math.max(3, lastReview.intervalDays * 2),
  );
  const sampleStep = chartEndDay / 240;
  const chartPoints = [{ day: 0, retention: 1 }];

  reviews.forEach((review, index) => {
    const nextReview = reviews[index + 1];
    const segmentEndDay = nextReview ? nextReview.day : chartEndDay;
    const segmentLength = segmentEndDay - review.day;
    const steps = Math.max(1, Math.ceil(segmentLength / sampleStep));

    for (let step = 1; step <= steps; step += 1) {
      const day = review.day + (segmentLength * step) / steps;
      const retention = Math.exp(-(day - review.day) / review.intervalDays);
      chartPoints.push({ day, retention });
      if (nextReview && step === steps) {
        chartPoints.push({ day, retention: 1 });
      }
    }
  });

  retentionChart.replaceChildren();
  appendSvgElement(retentionChart, "title", { id: "curve-svg-title" }, "记得这张卡的记忆保持率曲线");
  appendSvgElement(
    retentionChart,
    "desc",
    { id: "curve-svg-description" },
    "根据每次复习时间和复习间隔绘制的记忆保持率曲线。",
  );

  [1, 0.75, 0.5, 0.25, 0].forEach((retention) => {
    const y = plot.top + (1 - retention) * plotHeight;
    appendSvgElement(retentionChart, "line", {
      class: "chart-gridline",
      x1: plot.left,
      x2: width - plot.right,
      y1: y,
      y2: y,
    });
    appendSvgElement(retentionChart, "text", {
      class: "chart-y-label",
      x: plot.left - 10,
      y: y + 4,
      "text-anchor": "end",
    }, `${Math.round(retention * 100)}%`);
  });

  const xTicks = [0, 0.25, 0.5, 0.75, 1];
  xTicks.forEach((fraction) => {
    const day = chartEndDay * fraction;
    const x = plot.left + fraction * plotWidth;
    appendSvgElement(retentionChart, "line", {
      class: "chart-gridline chart-gridline-vertical",
      x1: x,
      x2: x,
      y1: plot.top,
      y2: height - plot.bottom,
    });
    appendSvgElement(retentionChart, "text", {
      class: "chart-x-label",
      x,
      y: height - 14,
      "text-anchor": fraction === 0 ? "start" : fraction === 1 ? "end" : "middle",
    }, `${Math.round(day)}天`);
  });

  const pointCoordinates = chartPoints.map(({ day, retention }) => {
    const x = plot.left + (day / chartEndDay) * plotWidth;
    const y = plot.top + (1 - retention) * plotHeight;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
  appendSvgElement(retentionChart, "polyline", {
    class: "retention-line",
    points: pointCoordinates,
  });

  reviews.forEach((review, index) => {
    const x = plot.left + (review.day / chartEndDay) * plotWidth;
    appendSvgElement(retentionChart, "circle", {
      class: "review-point",
      cx: x,
      cy: plot.top,
      r: 5,
    });
    appendSvgElement(retentionChart, "text", {
      class: "review-point-label",
      x,
      y: plot.top + 17 + (index % 2) * 13,
      "text-anchor": "middle",
    }, `复习 ${index + 1}`);
  });
}

reviewCardButton.addEventListener("click", () => {
  const now = Date.now();
  const previousReview = reviewHistory[reviewHistory.length - 1];
  const reviewedAt = previousReview
    ? Math.max(now, previousReview.reviewedAt + 1)
    : now;
  const intervalDays = previousReview
    ? Math.max(1, Math.ceil((reviewedAt - previousReview.reviewedAt) / dayInMilliseconds))
    : 1;

  reviewHistory.push({ reviewedAt, intervalDays });
  window.localStorage.setItem(reviewStorageKey, JSON.stringify(reviewHistory));
  renderRetentionChart();
});

renderVocabulary();
renderPassage(document.querySelector("#click-text"), clickPassageText);
renderPassage(document.querySelector("#known-text"), knownPassageText, true);
updateKnownCount();
renderRetentionChart();
