from __future__ import annotations

import hashlib
import json
import re
import sys
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from html import unescape
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
OUTPUT_PATH = ROOT / "news.json"
SCRIPT_OUTPUT_PATH = ROOT / "news-data.js"
MAX_ITEMS = 42
MAX_ITEMS_PER_SOURCE = 10
MAX_AGE_DAYS = 210
TIMEOUT_SECONDS = 20
USER_AGENT = (
    "Mozilla/5.0 (compatible; AIHigherEducationNewsHub/1.0; +https://github.com/)"
)

AI_PATTERNS = (
    re.compile(r"\bartificial intelligence\b", re.IGNORECASE),
    re.compile(r"\bgenerative ai\b", re.IGNORECASE),
    re.compile(r"\bgen ai\b", re.IGNORECASE),
    re.compile(r"\bchatgpt\b", re.IGNORECASE),
    re.compile(r"\bcopilot\b", re.IGNORECASE),
    re.compile(r"\blarge language models?\b", re.IGNORECASE),
    re.compile(r"\bllms?\b", re.IGNORECASE),
    re.compile(r"\bmachine learning\b", re.IGNORECASE),
    re.compile(r"\bagentic ai\b", re.IGNORECASE),
    re.compile(r"\bai\b", re.IGNORECASE),
)

HIGHER_ED_TERMS = (
    "higher education",
    "higher ed",
    "college",
    "colleges",
    "university",
    "universities",
    "campus",
    "faculty",
    "student",
    "students",
    "academic",
    "admissions",
    "enrollment",
)

EXCLUDED_TERMS = (
    "k-12",
    "elementary school",
    "middle school",
    "high school",
    "school district",
)

FEEDS = [
    {
        "name": "EdScoop",
        "url": "https://edscoop.com/feed/",
        "requires_higher_ed_context": True,
    },
    {
        "name": "EdTech Magazine",
        "url": "https://edtechmagazine.com/higher/rss.xml",
        "requires_higher_ed_context": False,
    },
    {
        "name": "Inside Higher Ed",
        "url": "https://www.insidehighered.com/rss.xml",
        "requires_higher_ed_context": False,
    },
    {
        "name": "Campus Technology",
        "url": "https://campustechnology.com/rss-feeds/all-articles.aspx",
        "requires_higher_ed_context": True,
    },
    {
        "name": "Higher Ed Dive",
        "url": "https://www.highereddive.com/feeds/news/",
        "requires_higher_ed_context": False,
    },
    {
        "name": "University Business",
        "url": "https://www.universitybusiness.com/feed/",
        "requires_higher_ed_context": False,
    },
]

CATEGORY_KEYWORDS = {
    "Teaching and Learning": (
        "teaching",
        "learning",
        "curriculum",
        "faculty",
        "classroom",
        "course",
        "courses",
        "instruction",
        "pedagogy",
        "tutor",
        "tutoring",
        "major",
        "degree",
        "academic integrity",
        "cheating",
        "assignment",
        "syllabi",
    ),
    "Student Support": (
        "student success",
        "student support",
        "student services",
        "student retention",
        "dropout",
        "advising",
        "advisor",
        "retention",
        "first-generation",
        "first generation",
        "career services",
        "well-being",
        "wellbeing",
        "mental health",
        "engagement",
        "personalized support",
        "on-demand guidance",
    ),
    "Research": (
        "research",
        "study",
        "studies",
        "lab",
        "labs",
        "grant",
        "grants",
        "institute",
        "scientist",
        "scientists",
        "discovery",
        "paper",
        "journal",
        "publication",
        "evidence",
    ),
    "Administration and Operations": (
        "operations",
        "operational",
        "administration",
        "administrative",
        "workflow",
        "efficiency",
        "campus operations",
        "it leaders",
        "cio",
        "security",
        "infrastructure",
        "budget",
        "finance",
        "financial",
        "procurement",
        "enrollment",
        "admissions",
        "registrar",
        "workforce",
        "service desk",
    ),
    "Policy, Ethics, and Governance": (
        "policy",
        "policies",
        "ethics",
        "ethical",
        "governance",
        "risk",
        "responsible ai",
        "privacy",
        "bias",
        "oversight",
        "framework",
        "guardrail",
        "compliance",
        "trust",
        "transparency",
        "regulation",
        "regulatory",
    ),
    "Tools and Innovation": (
        "tool",
        "tools",
        "platform",
        "platforms",
        "assistant",
        "copilot",
        "chatbot",
        "innovation",
        "innovative",
        "launch",
        "launched",
        "rollout",
        "startup",
        "hub",
        "pilot",
        "product",
        "solution",
    ),
}

TAG_RE = re.compile(r"<[^>]+>")
PARAGRAPH_RE = re.compile(r"<p[^>]*>(.*?)</p>", re.IGNORECASE | re.DOTALL)
MULTISPACE_RE = re.compile(r"\s+")


def fetch_text(url: str) -> str:
    request = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset, errors="replace")


def clean_text(raw_text: str) -> str:
    if not raw_text:
        return ""

    text = TAG_RE.sub(" ", raw_text)
    text = unescape(text)
    text = MULTISPACE_RE.sub(" ", text).strip()
    return text


def trim_summary(text: str, limit: int = 220) -> str:
    if len(text) <= limit:
        return text

    snippet = text[: limit - 1].rsplit(" ", 1)[0].rstrip(",;:-")
    return f"{snippet}..."


def extract_summary(description: str, title: str, source_name: str, category: str) -> str:
    paragraphs = [clean_text(match) for match in PARAGRAPH_RE.findall(description or "")]
    candidates = paragraphs or [clean_text(description)]

    for candidate in candidates:
        candidate = candidate.strip()
        if not candidate:
            continue
        if candidate.lower() == title.lower():
            continue
        if candidate.lower().startswith("the post "):
            continue
        if candidate.lower().startswith("read more at "):
            continue
        if "appeared first on" in candidate.lower():
            continue
        if len(candidate) < 40:
            continue
        return trim_summary(candidate)

    fallback = (
        f"{source_name} reports on how AI is affecting higher education through "
        f"{category.lower()}."
    )
    return trim_summary(fallback)


def is_relevant(text: str, requires_higher_ed_context: bool) -> bool:
    lowered = text.lower()

    if not any(pattern.search(text) for pattern in AI_PATTERNS):
        return False

    if any(term in lowered for term in EXCLUDED_TERMS):
        return False

    if requires_higher_ed_context and not any(term in lowered for term in HIGHER_ED_TERMS):
        return False

    return True


def score_category(text: str, category: str) -> int:
    lowered = text.lower()
    score = 0

    for keyword in CATEGORY_KEYWORDS[category]:
        if keyword in lowered:
            score += 2 if " " in keyword else 1

    return score


def categorize_item(text: str) -> str:
    scores = {
        category: score_category(text, category) for category in CATEGORY_KEYWORDS
    }
    best_category = max(scores, key=scores.get)
    if scores[best_category] == 0:
        return "Tools and Innovation"
    return best_category


def parse_pub_date(value: str) -> datetime | None:
    if not value:
        return None

    try:
        parsed = parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return None

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def normalize_title(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")


def make_item_id(url: str, title: str) -> str:
    digest = hashlib.sha1(f"{url}|{title}".encode("utf-8")).hexdigest()
    return digest[:12]


def build_item(item: ET.Element, feed: dict[str, object], now: datetime) -> dict[str, str] | None:
    title = clean_text(item.findtext("title", default=""))
    url = clean_text(item.findtext("link", default=""))
    description = item.findtext("description", default="") or ""
    published_raw = item.findtext("pubDate", default="")
    published_at = parse_pub_date(published_raw)

    if not title or not url or not published_at:
        return None

    if published_at < now - timedelta(days=MAX_AGE_DAYS):
        return None

    text_blob = " ".join([title, clean_text(description)])
    if not is_relevant(text_blob, bool(feed["requires_higher_ed_context"])):
        return None

    category = categorize_item(text_blob)
    source_name = str(feed["name"])
    summary = extract_summary(description, title, source_name, category)
    domain = urlparse(url).netloc.replace("www.", "")

    return {
        "id": make_item_id(url, title),
        "headline": title,
        "summary": summary,
        "source": source_name,
        "sourceDomain": domain,
        "publishedAt": published_at.isoformat().replace("+00:00", "Z"),
        "category": category,
        "url": url,
    }


def load_feed(feed: dict[str, object], now: datetime) -> list[dict[str, str]]:
    xml_text = fetch_text(str(feed["url"]))
    root = ET.fromstring(xml_text)
    items = root.findall("./channel/item")
    results: list[dict[str, str]] = []

    for item in items:
        built = build_item(item, feed, now)
        if built:
            results.append(built)

    return results


def collect_news() -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    now = datetime.now(timezone.utc)
    all_items: list[dict[str, str]] = []
    errors: list[dict[str, str]] = []

    def fetch_one(feed: dict[str, object]) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
        try:
            items = load_feed(feed, now)
            items.sort(key=lambda item: item["publishedAt"], reverse=True)
            return items[:MAX_ITEMS_PER_SOURCE], []
        except (HTTPError, URLError, TimeoutError, ET.ParseError) as error:
            return [], [{"source": str(feed["name"]), "message": str(error)}]

    max_workers = min(len(FEEDS), 8)
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(fetch_one, feed): feed for feed in FEEDS}
        for future in as_completed(futures):
            batch, batch_errors = future.result()
            all_items.extend(batch)
            errors.extend(batch_errors)

    deduped: list[dict[str, str]] = []
    seen: set[str] = set()

    for item in sorted(all_items, key=lambda entry: entry["publishedAt"], reverse=True):
        signature = f"{item['url']}|{normalize_title(item['headline'])}"
        if signature in seen:
            continue
        seen.add(signature)
        deduped.append(item)

    return deduped[:MAX_ITEMS], errors


def write_news(items: list[dict[str, str]], errors: list[dict[str, str]]) -> None:
    if not items:
        raise RuntimeError("No relevant articles were collected from the configured feeds.")

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "itemCount": len(items),
        "sourceCount": len({item["source"] for item in items}),
        "sources": [feed["name"] for feed in FEEDS],
        "errors": errors,
        "items": items,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    SCRIPT_OUTPUT_PATH.write_text(
        f"window.__NEWS_HUB_DATA__ = {json.dumps(payload, separators=(',', ':'))};\n",
        encoding="utf-8",
    )


def main() -> int:
    try:
        items, errors = collect_news()
        write_news(items, errors)
        print(f"Wrote {len(items)} items to {OUTPUT_PATH}")
        if errors:
            print(f"Completed with {len(errors)} source warning(s).")
        return 0
    except Exception as error:  # noqa: BLE001
        print(f"Feed refresh failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
