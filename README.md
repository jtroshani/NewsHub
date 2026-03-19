# AI in Higher Education News Hub

This repository is a GitHub Pages-friendly single-page site that aggregates AI and generative AI coverage focused on higher education.

## Structure

- `index.html`: single-page application shell
- `styles.css`: responsive visual design
- `app.js`: client-side filtering, sorting, and rendering
- `fetch_news.py`: dependency-free RSS aggregator that writes `news.json`
- `news.json`: locally generated article feed used by the page
- `.github/workflows/refresh-news.yml`: scheduled 12-hour refresh workflow

## GitHub Pages

1. Push the repository to GitHub.
2. In repository settings, enable GitHub Pages from the default branch root.
3. The scheduled workflow refreshes `news.json` every 12 hours and on manual dispatch.

## Local refresh

```bash
python3 fetch_news.py
```
