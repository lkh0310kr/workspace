import AdmZip from "adm-zip";

const CHAPTER_ONE = Array.from({ length: 40 }, (_, index) => {
  const n = index + 1;
  return `<p>Chapter one paragraph ${n}. The paginator must split this long section across several CSS columns so next() stays in the same spine item until the last page. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>`;
}).join("\n");

const CHAPTER_TWO = Array.from({ length: 12 }, (_, index) => {
  const n = index + 1;
  return `<p>Chapter two paragraph ${n}. Crossing the spine boundary after chapter one is the contract for page-turn-at-end-of-section.</p>`;
}).join("\n");

export function buildMiniEpubBuffer(): Buffer {
  const zip = new AdmZip();
  zip.addFile("mimetype", Buffer.from("application/epub+zip"));
  zip.addFile(
    "META-INF/container.xml",
    Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`),
  );
  zip.addFile(
    "OEBPS/content.opf",
    Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">workspace-mini-epub</dc:identifier>
    <dc:title>Mini Page Turn</dc:title>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
    <itemref idref="ch2"/>
  </spine>
</package>
`),
  );
  zip.addFile(
    "OEBPS/nav.xhtml",
    Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head><title>Nav</title></head>
  <body>
    <nav epub:type="toc">
      <ol>
        <li><a href="ch1.xhtml">Chapter One</a></li>
        <li><a href="ch2.xhtml">Chapter Two</a></li>
      </ol>
    </nav>
  </body>
</html>
`),
  );
  zip.addFile(
    "OEBPS/ch1.xhtml",
    Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>Chapter One</title></head>
  <body><h1>Chapter One</h1>${CHAPTER_ONE}</body>
</html>
`),
  );
  zip.addFile(
    "OEBPS/ch2.xhtml",
    Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>Chapter Two</title></head>
  <body><h1>Chapter Two</h1>${CHAPTER_TWO}</body>
</html>
`),
  );
  return zip.toBuffer();
}
