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
const resultsSummary = document.getElementById("results-summary");
const categoryFilters = document.getElementById("category-filters");
const categoryOverview = document.getElementById("category-overview");
const newsGrid = document.getElementById("news-grid");
const emptyState = document.getElementById("empty-state");
const cardTemplate = document.getElementById("news-card-template");
const searchInput = document.getElementById("search-input");
const sortSelect = document.getElementById("sort-select");

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
