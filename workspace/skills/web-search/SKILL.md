---
name: web-search
description: Search the web for real-time information, news, documentation, or any online content.
---

## Overview
You can search the web to find current information that you don't have in your memory.

## Instructions
1. Write a Bun script that uses `fetch()` to query a search API or scrape a webpage.
2. Parse the results and extract the relevant information.
3. Return a summary of the findings.

## Example
```js
const res = await fetch("https://api.duckduckgo.com/?q=hello&format=json");
const data = await res.json();
console.log(JSON.stringify(data.AbstractText));
```