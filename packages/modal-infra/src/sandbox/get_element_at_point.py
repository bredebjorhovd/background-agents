#!/usr/bin/env python3
"""
Get DOM element info at (x, y) in a page using Playwright.
Outputs JSON to stdout: { "element": { selector, tagName, text?, react?, boundingRect? }, "boundingRect" } or { "error": "..." }.
Usage: python get_element_at_point.py <url> <x> <y> [viewport_width] [viewport_height]
Viewport defaults to 1280x720 if not provided.
"""

import json
import sys

# Injected into the page - runs in browser context. Returns element info or null.
GET_ELEMENT_SCRIPT = """
([x, y]) => {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;

  function generateSelector(element) {
    if (element.id) return '#' + element.id;
    const path = [];
    let current = element;
    while (current && current !== document.body) {
      let sel = current.tagName.toLowerCase();
      if (current.className && typeof current.className === 'string') {
        const classes = current.className.trim().split(/\\s+/).filter(c => c && !c.startsWith('_'));
        if (classes.length > 0) sel += '.' + classes.slice(0, 2).join('.');
      }
      const siblings = current.parentElement?.children;
      if (siblings && siblings.length > 1) {
        const same = Array.from(siblings).filter(s => s.tagName === current.tagName);
        if (same.length > 1) sel += ':nth-of-type(' + (same.indexOf(current) + 1) + ')';
      }
      path.unshift(sel);
      current = current.parentElement;
      if (path.length >= 3) break;
    }
    return path.join(' > ');
  }

  function getReactInfo(element) {
    const key = Object.keys(element).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
    if (!key) return null;
    try {
      let node = element[key];
      while (node) {
        if (node.type && typeof node.type === 'function') {
          const name = node.type.displayName || node.type.name || 'Unknown';
          const props = node.memoizedProps || {};
          const clean = {};
          for (const [k, v] of Object.entries(props)) {
            if (k === 'children' || typeof v === 'function' || (typeof v === 'object' && v !== null)) continue;
            clean[k] = v;
          }
          return { name, props: clean };
        }
        if (node.type && typeof node.type === 'string') { node = node.return; continue; }
        node = node.return;
      }
    } catch (e) {}
    return null;
  }

  const selector = generateSelector(el);
  const react = getReactInfo(el);
  const rect = el.getBoundingClientRect();
  return {
    selector,
    tagName: el.tagName.toLowerCase(),
    text: el.innerText ? el.innerText.slice(0, 200) : null,
    react: react || undefined,
    boundingRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  };
}
"""


def main() -> int:
    if len(sys.argv) < 4:
        print(
            json.dumps(
                {
                    "error": "Usage: get_element_at_point.py <url> <x> <y> [viewport_width] [viewport_height]"
                }
            ),
            file=sys.stderr,
        )
        return 1

    url = sys.argv[1]
    try:
        x = int(sys.argv[2])
        y = int(sys.argv[3])
    except ValueError:
        print(json.dumps({"error": "x and y must be integers"}), file=sys.stderr)
        return 1

    viewport_width = 1280
    viewport_height = 720
    if len(sys.argv) >= 6:
        try:
            viewport_width = int(sys.argv[4])
            viewport_height = int(sys.argv[5])
        except ValueError:
            pass

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print(json.dumps({"error": "playwright not installed"}), file=sys.stderr)
        return 1

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            context = browser.new_context(
                viewport={"width": viewport_width, "height": viewport_height}
            )
            page = context.new_page()
            page.goto(url, wait_until="domcontentloaded", timeout=15000)
            element = page.evaluate(GET_ELEMENT_SCRIPT, [x, y])
            context.close()
            if element is None:
                print(json.dumps({"error": "No element at point"}))
                return 0
            print(json.dumps({"element": element}))
            return 0
        except Exception as e:
            print(json.dumps({"error": str(e)}), file=sys.stderr)
            return 1
        finally:
            browser.close()


if __name__ == "__main__":
    sys.exit(main())
