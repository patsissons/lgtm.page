import { describe, expect, it } from "vitest";
import { decode, parseMeta } from "./meta";

const BASE = "https://app.lgtm.page/";

describe("parseMeta", () => {
  it("reads Open Graph tags", () => {
    const html = `<!doctype html><html><head>
      <title>Doc title</title>
      <meta property="og:title" content="App" />
      <meta property="og:description" content="Does a thing." />
      <meta property="og:image" content="https://app.lgtm.page/og.png" />
      <meta property="og:image:alt" content="A screenshot" />
      <meta name="theme-color" content="#0f0a1e" />
      <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    </head><body></body></html>`;
    expect(parseMeta(html, BASE)).toEqual({
      title: "App",
      description: "Does a thing.",
      image: "https://app.lgtm.page/og.png",
      imageAlt: "A screenshot",
      themeColor: "#0f0a1e",
      icon: "https://app.lgtm.page/favicon.svg",
    });
  });

  it("falls back to Twitter tags, then the plain title and description", () => {
    const twitter = `<head>
      <title>Doc</title>
      <meta name="twitter:title" content="Tweet title">
      <meta name="twitter:description" content="Tweet description">
      <meta name="twitter:image" content="/card.png">
    </head>`;
    expect(parseMeta(twitter, BASE)).toMatchObject({
      title: "Tweet title",
      description: "Tweet description",
      image: "https://app.lgtm.page/card.png",
    });

    const plain = `<head><title> Plain </title>
      <meta name="description" content="Plain description"></head>`;
    expect(parseMeta(plain, BASE)).toEqual({
      title: "Plain",
      description: "Plain description",
    });
  });

  it("decodes entities and accepts any quoting and attribute order", () => {
    const html = `<head>
      <meta content='Tom &amp; Jerry&#39;s &#x1F600;' property='og:title'>
      <META PROPERTY=og:description CONTENT=bare>
      <meta property="og:description" content="second one is ignored">
    </head>`;
    expect(parseMeta(html, BASE)).toEqual({
      title: "Tom & Jerry's 😀",
      description: "bare",
    });
  });

  it("resolves relative URLs against the page and prefers rel=icon", () => {
    const html = `<head>
      <link rel="apple-touch-icon" href="/apple.png">
      <link rel="shortcut icon" href="icons/fav.ico">
      <meta property="og:image" content="og.png">
    </head>`;
    expect(parseMeta(html, "https://app.lgtm.page/sub/")).toEqual({
      image: "https://app.lgtm.page/sub/og.png",
      icon: "https://app.lgtm.page/sub/icons/fav.ico",
    });
  });

  it("ignores tags after </head> and empty values", () => {
    const html = `<head><meta property="og:title" content="">
      <title></title></head>
      <body><meta property="og:title" content="from body"></body>`;
    expect(parseMeta(html, BASE)).toEqual({});
  });

  it("returns nothing for a page without metadata", () => {
    expect(parseMeta("", BASE)).toEqual({});
    expect(parseMeta("<p>hello</p>", BASE)).toEqual({});
  });
});

describe("decode", () => {
  it("leaves unknown and invalid entities readable", () => {
    expect(decode("a &bogus; b")).toBe("a &bogus; b");
    expect(decode("&#x110000;")).toBe("�");
  });
});
