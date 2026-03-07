#!/usr/bin/env python3
"""Scrape MP names from the Slovak parliament alphabetical list and save as JSON."""

from __future__ import annotations

import argparse
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from typing import List, Set
from urllib.parse import urljoin
from urllib.request import Request, urlopen

DEFAULT_URL = "https://www.nrsr.sk/web/default.aspx?sid=poslanci/zoznam_abc"


class MPLinkParser(HTMLParser):
    """Extract MP names from links pointing to MP profile pages."""

    def __init__(self, base_url: str) -> None:
        super().__init__()
        self.base_url = base_url
        self.in_target_link = False
        self.current_href = ""
        self.current_text_parts: List[str] = []
        self.seen_names: Set[str] = set()
        self.names: List[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag.lower() != "a":
            return

        href = ""
        for key, value in attrs:
            if key.lower() == "href" and value:
                href = value
                break

        # MP profile links contain this query segment.
        if "sid=poslanci/poslanec" in href.lower():
            self.in_target_link = True
            self.current_href = href
            self.current_text_parts = []

    def handle_data(self, data: str) -> None:
        if self.in_target_link:
            self.current_text_parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() != "a" or not self.in_target_link:
            return

        raw_name = " ".join(part.strip() for part in self.current_text_parts if part.strip())
        name = re.sub(r"\s+", " ", raw_name).strip()

        if name and name not in self.seen_names:
            self.seen_names.add(name)
            self.names.append(name)

        self.in_target_link = False
        self.current_href = ""
        self.current_text_parts = []


def fetch_html(url: str) -> str:
    request = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; MPNameScraper/1.0)"
        },
    )
    with urlopen(request) as response:
        return response.read().decode("utf-8", errors="replace")


def scrape_mp_names(url: str) -> List[str]:
    html = fetch_html(url)
    parser = MPLinkParser(base_url=url)
    parser.feed(html)
    return parser.names


def main() -> None:
    cli = argparse.ArgumentParser(description="Scrape MP names and save them to JSON.")
    cli.add_argument(
        "--url",
        default=DEFAULT_URL,
        help="Source URL with the alphabetical MP list.",
    )
    cli.add_argument(
        "--out",
        default="mps.json",
        help="Output JSON file path.",
    )
    args = cli.parse_args()

    names = scrape_mp_names(args.url)

    output = {
        "source_url": args.url,
        "count": len(names),
        "names": names,
    }

    out_path = Path(args.out)
    out_path.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Saved {len(names)} names to {out_path}")


if __name__ == "__main__":
    main()
