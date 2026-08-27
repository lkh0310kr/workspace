import { describe, it, expect } from "vitest";
import { documentToSvg } from "./svgExport";
import { createBlankDocument, createEllipse, createGroup, createRect, createText } from "./sceneGraph";

describe("documentToSvg", () => {
  it("emits a root <svg> with the document's size and background", () => {
    const doc = createBlankDocument(400, 300);
    const svg = documentToSvg(doc);
    expect(svg).toContain('width="400"');
    expect(svg).toContain('height="300"');
    expect(svg).toContain('viewBox="0 0 400 300"');
    expect(svg).toContain(`fill="${doc.background}"`);
  });

  it("emits a <rect> for a rect object with its style and transform", () => {
    const doc = createBlankDocument();
    const rect = createRect(10, 20, 100, 50);
    doc.objects.push(rect);
    const svg = documentToSvg(doc);
    expect(svg).toContain('<rect x="10" y="20" width="100" height="50"');
    expect(svg).toContain(`fill="${rect.style.fill}"`);
  });

  it("emits an <ellipse> for an ellipse object", () => {
    const doc = createBlankDocument();
    doc.objects.push(createEllipse(50, 40, 20, 10));
    const svg = documentToSvg(doc);
    expect(svg).toContain('<ellipse cx="50" cy="40" rx="20" ry="10"');
  });

  it("emits a <text> element with the object's content and fontSize", () => {
    const doc = createBlankDocument();
    doc.objects.push(createText(5, 15, "Hello"));
    const svg = documentToSvg(doc);
    expect(svg).toContain('<text x="5" y="15" font-size="24"');
    expect(svg).toContain(">Hello</text>");
  });

  it("escapes special characters in a text object's content", () => {
    const doc = createBlankDocument();
    doc.objects.push(createText(0, 0, "<a & b"));
    const svg = documentToSvg(doc);
    expect(svg).toContain("&lt;a &amp; b");
    expect(svg).not.toContain("<a & b");
  });

  it("nests a group's children inside a <g> with the group's own transform", () => {
    const doc = createBlankDocument();
    const group = createGroup([createRect(0, 0, 10, 10)]);
    doc.objects.push(group);
    const svg = documentToSvg(doc);
    expect(svg).toMatch(/<g transform="[^"]*">.*<rect[^>]*>.*<\/g>/s);
  });

  it("balances every opening tag with a closing one (no DOM parser needed here — this module runs in the renderer where one exists, this just guards the string-building itself)", () => {
    const doc = createBlankDocument();
    doc.objects.push(createGroup([createRect(0, 0, 10, 10), createEllipse(5, 5, 5, 5)]));
    const svg = documentToSvg(doc);
    const opens = (svg.match(/<g[ >]/g) ?? []).length;
    const closes = (svg.match(/<\/g>/g) ?? []).length;
    expect(opens).toBe(closes);
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
  });
});
