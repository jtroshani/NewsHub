const CATEGORY_ORDER = [
  "All Categories",
  "Teaching and Learning",
  "Student Support",
  "Research",
  "Administration and Operations",
  "Policy, Ethics, and Governance",
  "Tools and Innovation",
];

const state = {
  items: [],
  activeCategory: "All Categories",
  query: "",
  sortBy: "newest",
  generatedAt: null,
};

const articleCount = document.getElementById("article-count");
const sourceCount = document.getElementById("source-count");
const lastUpdated = document.getElementById("last-updated");
const dailyVisual = document.getElementById("daily-visual");
const resultsSummary = document.getElementById("results-summary");
const categoryFilters = document.getElementById("category-filters");
const categoryOverview = document.getElementById("category-overview");
const newsGrid = document.getElementById("news-grid");
const emptyState = document.getElementById("empty-state");
const cardTemplate = document.getElementById("news-card-template");
const searchInput = document.getElementById("search-input");
const sortSelect = document.getElementById("sort-select");
let dailyVisualRefreshTimeout;

function formatDate(isoDate) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(isoDate));
}

function formatDateTime(isoDate) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(isoDate));
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function emphasizeMatch(text, query) {
  const safeText = escapeHtml(text);

  if (!query) {
    return safeText;
  }

  const matcher = new RegExp(`(${escapeRegExp(query)})`, "ig");
  return safeText.replace(matcher, "<mark>$1</mark>");
}

function hashString(value) {
  let hash = 2166136261;

  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createSeededRandom(seed) {
  let stateValue = seed || 1;

  return () => {
    stateValue = (Math.imul(stateValue, 1664525) + 1013904223) >>> 0;
    return stateValue / 4294967296;
  };
}

function getLocalDayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildDailyVisualSvg(items, dayKey) {
  const width = 520;
  const height = 340;
  const paddingX = 34;
  const baseline = height - 48;
  const categories = CATEGORY_ORDER.slice(1);
  const counts = getCategoryCounts(items);
  const maxCount = Math.max(...categories.map((category) => counts[category] || 0), 1);
  const seed = hashString(`${dayKey}:${items.length}:${state.generatedAt ?? ""}`);
  const random = createSeededRandom(seed);

  const backgroundCircles = Array.from({ length: 3 }, (_, index) => {
    const radius = 42 + random() * 54;
    const x = 80 + random() * (width - 160);
    const y = 56 + random() * (height - 112);
    const fill = index === 1 ? "#fafaf7" : "#fcfcfb";
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${radius.toFixed(
      1,
    )}" fill="${fill}" stroke="#efefe9" stroke-width="1" />`;
  }).join("");

  const guideLines = Array.from({ length: 4 }, (_, index) => {
    const x = paddingX + ((width - paddingX * 2) / 3) * index;
    return `<line x1="${x.toFixed(1)}" y1="28" x2="${x.toFixed(
      1,
    )}" y2="${(height - 28).toFixed(1)}" stroke="#efefea" stroke-width="1" />`;
  }).join("");

  const points = categories.map((category, index) => {
    const count = counts[category] || 0;
    const x = paddingX + ((width - paddingX * 2) / (categories.length - 1)) * index;
    const intensity = count / maxCount;
    const jitter = (random() - 0.5) * 18;
    const y = 76 + (1 - intensity) * 132 + jitter;
    const nodeRadius = 5 + intensity * 7;

    return {
      category,
      count,
      x,
      y,
      nodeRadius,
    };
  });

  const bars = points
    .map(
      (point) => `<line
        x1="${point.x.toFixed(1)}"
        y1="${baseline}"
        x2="${point.x.toFixed(1)}"
        y2="${point.y.toFixed(1)}"
        stroke="#d8d8d2"
        stroke-width="1.5"
      />`,
    )
    .join("");

  const path = points.reduce((result, point, index) => {
    const command = index === 0 ? "M" : "L";
    return `${result} ${command} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  }, "");

  const connectors = points
    .map((point, index) => {
      const accentX = 24 + random() * (width - 48);
      const accentY = 24 + random() * 56;
      const opacity = 0.35 + index * 0.08;
      return `<path
        d="M ${accentX.toFixed(1)} ${accentY.toFixed(1)} Q ${(
          point.x * 0.65
        ).toFixed(1)} ${(point.y * 0.6).toFixed(1)} ${point.x.toFixed(1)} ${point.y.toFixed(1)}"
        fill="none"
        stroke="rgba(193, 193, 186, ${opacity.toFixed(2)})"
        stroke-width="1"
      />`;
    })
    .join("");

  const nodes = points
    .map(
      (point) => `<g>
        <circle
          cx="${point.x.toFixed(1)}"
          cy="${point.y.toFixed(1)}"
          r="${(point.nodeRadius + 5).toFixed(1)}"
          fill="none"
          stroke="#ecece7"
          stroke-width="1"
        />
        <circle
          cx="${point.x.toFixed(1)}"
          cy="${point.y.toFixed(1)}"
          r="${point.nodeRadius.toFixed(1)}"
          fill="#ffffff"
          stroke="#bdbdb6"
          stroke-width="1.4"
        />
      </g>`,
    )
    .join("");

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Daily abstract visual for higher education AI news">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#fefefd" />
      <rect x="16" y="16" width="${width - 32}" height="${height - 32}" fill="none" stroke="#ecece6" stroke-width="1" />
      ${backgroundCircles}
      ${guideLines}
      ${connectors}
      <path d="${path}" fill="none" stroke="#9f9f98" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" />
      ${bars}
      ${nodes}
      <line x1="${paddingX}" y1="${baseline}" x2="${width - paddingX}" y2="${baseline}" stroke="#d8d8d2" stroke-width="1" />
    </svg>
  `;
}

function renderDailyVisual() {
  if (!dailyVisual) {
    return;
  }

  const dayKey = getLocalDayKey();
  dailyVisual.innerHTML = buildDailyVisualSvg(state.items, dayKey);
}

function scheduleDailyVisualRefresh() {
  if (dailyVisualRefreshTimeout) {
    window.clearTimeout(dailyVisualRefreshTimeout);
  }

  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 5, 0);

  dailyVisualRefreshTimeout = window.setTimeout(() => {
    renderDailyVisual();
    scheduleDailyVisualRefresh();
  }, next.getTime() - now.getTime());
}

function getCategoryCounts(items) {
  return CATEGORY_ORDER.slice(1).reduce((counts, category) => {
    counts[category] = items.filter((item) => item.category === category).length;
    return counts;
  }, {});
}

function getVisibleItems() {
  const query = state.query.trim().toLowerCase();

  const filtered = state.items.filter((item) => {
    const matchesCategory =
      state.activeCategory === "All Categories" ||
      item.category === state.activeCategory;

    const searchableText = `${item.headline} ${item.summary} ${item.source}`.toLowerCase();
    const matchesQuery = !query || searchableText.includes(query);

    return matchesCategory && matchesQuery;
  });

  return filtered.sort((left, right) => {
    switch (state.sortBy) {
      case "oldest":
        return left.publishedAt.localeCompare(right.publishedAt);
      case "source":
        return left.source.localeCompare(right.source) || right.publishedAt.localeCompare(left.publishedAt);
      case "headline":
        return left.headline.localeCompare(right.headline);
      case "newest":
      default:
        return right.publishedAt.localeCompare(left.publishedAt);
    }
  });
}

function renderOverview() {
  const counts = getCategoryCounts(state.items);
  categoryOverview.replaceChildren();

  CATEGORY_ORDER.slice(1).forEach((category) => {
    const card = document.createElement("article");
    card.className = "overview-card";

    const count = document.createElement("p");
    count.className = "overview-card__count";
    count.textContent = counts[category];

    const label = document.createElement("p");
    label.className = "overview-card__label";
    label.textContent = category;

    card.append(count, label);
    categoryOverview.append(card);
  });
}

function renderFilters() {
  const counts = getCategoryCounts(state.items);
  categoryFilters.replaceChildren();

  CATEGORY_ORDER.forEach((category) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = category;
    chip.setAttribute("aria-pressed", String(state.activeCategory === category));

    if (state.activeCategory === category) {
      chip.classList.add("is-active");
    }

    const count = document.createElement("span");
    count.className = "chip__count";
    count.textContent =
      category === "All Categories"
        ? `(${state.items.length})`
        : `(${counts[category] ?? 0})`;

    chip.append(count);
    chip.addEventListener("click", () => {
      state.activeCategory = category;
      render();
    });

    categoryFilters.append(chip);
  });
}

function renderCards(items) {
  newsGrid.replaceChildren();

  items.forEach((item) => {
    const fragment = cardTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".news-card");
    const category = fragment.querySelector(".news-card__category");
    const date = fragment.querySelector(".news-card__date");
    const headlineLink = fragment.querySelector(".news-card__headline-link");
    const summary = fragment.querySelector(".news-card__summary");
    const source = fragment.querySelector(".news-card__source");
    const articleLink = fragment.querySelector(".news-card__link");

    category.textContent = item.category;
    date.textContent = formatDate(item.publishedAt);
    headlineLink.textContent = item.headline;
    headlineLink.href = item.url;
    summary.innerHTML = emphasizeMatch(item.summary, state.query.trim());
    source.textContent = item.source;
    articleLink.href = item.url;

    if (state.query.trim()) {
      card.dataset.matching = "true";
    }

    newsGrid.append(card);
  });
}

function renderSummary(items) {
  const visibleSources = new Set(items.map((item) => item.source)).size;
  const categoryLabel =
    state.activeCategory === "All Categories"
      ? "all categories"
      : state.activeCategory;

  resultsSummary.textContent = `Showing ${items.length} article${
    items.length === 1 ? "" : "s"
  } from ${visibleSources} source${visibleSources === 1 ? "" : "s"} in ${categoryLabel}.`;
}

function render() {
  const visibleItems = getVisibleItems();

  renderFilters();
  renderOverview();
  renderSummary(visibleItems);
  renderCards(visibleItems);
  renderDailyVisual();

  emptyState.hidden = visibleItems.length !== 0;
}

function setHeaderStats(data) {
  articleCount.textContent = data.items.length;
  sourceCount.textContent = new Set(data.items.map((item) => item.source)).size;
  lastUpdated.textContent = formatDateTime(data.generatedAt);
}

function showError(message) {
  articleCount.textContent = "0";
  sourceCount.textContent = "0";
  lastUpdated.textContent = message;
  resultsSummary.textContent = message;
  newsGrid.replaceChildren();
  renderDailyVisual();
  emptyState.hidden = false;
}

async function loadFeed() {
  try {
    const response = await fetch("news.json", { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Feed request failed with status ${response.status}`);
    }

    const data = await response.json();
    state.items = Array.isArray(data.items) ? data.items : [];
    state.generatedAt = data.generatedAt;
    setHeaderStats(data);
    render();
  } catch (error) {
    console.error(error);
    showError("The latest feed could not be loaded.");
  }
}

searchInput.addEventListener("input", (event) => {
  state.query = event.target.value;
  render();
});

sortSelect.addEventListener("change", (event) => {
  state.sortBy = event.target.value;
  render();
});

loadFeed();
scheduleDailyVisualRefresh();
