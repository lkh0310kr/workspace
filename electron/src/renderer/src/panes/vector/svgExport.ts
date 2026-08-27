// Scene graph -> real SVG markup. Mirrors VectorEditorContent.tsx's
// renderShape attribute-for-attribute (same fill/stroke/opacity/
// transform mapping) so "what you see in the editor" and "what you get
// in the exported file" can't drift apart — verified together in this
// file's tests rather than duplicated by hand.

import { anchorsToPathData } from "./bezierPath";
import type { SceneObject, ShapeStyle, VectorDocument } from "./sceneGraph";
import { svgTransform } from "./vectorTransform";

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function styleAttrs(style: ShapeStyle): string {
  return (
    `fill="${style.fill ?? "none"}" stroke="${style.stroke ?? "none"}" ` +
    `stroke-width="${style.strokeWidth}" opacity="${style.opacity}"`
  );
}

function serializeObject(obj: SceneObject): string {
  if (obj.type === "rect") {
    const rx = obj.rx !== undefined ? ` rx="${obj.rx}"` : "";
    return `<rect x="${obj.x}" y="${obj.y}" width="${obj.width}" height="${obj.height}"${rx} ${styleAttrs(obj.style)} transform="${svgTransform(obj)}" />`;
  }
  if (obj.type === "ellipse") {
    return `<ellipse cx="${obj.cx}" cy="${obj.cy}" rx="${obj.rx}" ry="${obj.ry}" ${styleAttrs(obj.style)} transform="${svgTransform(obj)}" />`;
  }
  if (obj.type === "line") {
    return `<line x1="${obj.x1}" y1="${obj.y1}" x2="${obj.x2}" y2="${obj.y2}" stroke="${obj.style.stroke ?? "none"}" stroke-width="${obj.style.strokeWidth}" opacity="${obj.style.opacity}" transform="${svgTransform(obj)}" />`;
  }
  if (obj.type === "path") {
    return `<path d="${anchorsToPathData(obj.anchors, obj.closed)}" ${styleAttrs(obj.style)} transform="${svgTransform(obj)}" />`;
  }
  if (obj.type === "group") {
    return `<g transform="${svgTransform(obj)}">${obj.children.map(serializeObject).join("")}</g>`;
  }
  if (obj.type === "text") {
    return `<text x="${obj.x}" y="${obj.y}" font-size="${obj.fontSize}" font-family="${escapeAttr(obj.fontFamily)}" fill="${obj.style.fill ?? "none"}" opacity="${obj.style.opacity}" transform="${svgTransform(obj)}">${escapeAttr(obj.content)}</text>`;
  }
  return "";
}

export function documentToSvg(doc: VectorDocument): string {
  const body = doc.objects.map(serializeObject).join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${doc.width}" height="${doc.height}" ` +
    `viewBox="0 0 ${doc.width} ${doc.height}">` +
    `<rect x="0" y="0" width="${doc.width}" height="${doc.height}" fill="${escapeAttr(doc.background)}" />` +
    `${body}</svg>`
  );
}
