import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";
import {
  AlignmentType,
  BorderStyle,
  Document as DocxDocument,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

const MM_TO_TWIP = 56.6929133858;
const FONT_NAME = "Times New Roman";
const FONT_SIZE_HALF_POINTS = 26;
const PAGE_WIDTH_TWIP = 11906;
const PAGE_HEIGHT_TWIP = 16838;
const HEADING_LEVELS = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
};

const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });

const toNumber = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const normalizeMargins = (margins = {}) => ({
  top: toNumber(margins.top, 20),
  right: toNumber(margins.right, 18),
  bottom: toNumber(margins.bottom, 20),
  left: toNumber(margins.left, 18),
});

const mmToTwip = (value) => Math.round(toNumber(value, 0) * MM_TO_TWIP);

const hasMark = (node, type) =>
  Array.isArray(node?.marks) && node.marks.some((mark) => mark.type === type);

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (character) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return map[character];
  });

const alignmentFromAttrs = (attrs = {}) => {
  if (attrs.textAlign === "center") return AlignmentType.CENTER;
  if (attrs.textAlign === "right") return AlignmentType.RIGHT;
  if (attrs.textAlign === "justify") return AlignmentType.JUSTIFIED;
  return undefined;
};

const alignmentCss = (attrs = {}) => {
  if (["left", "center", "right", "justify"].includes(attrs.textAlign)) {
    return `text-align:${attrs.textAlign}`;
  }
  return null;
};

const styleAttribute = (attrs = {}) => {
  const styles = [];
  const align = alignmentCss(attrs);
  if (align) styles.push(align);
  if (attrs.lineHeight) styles.push(`line-height:${Number(attrs.lineHeight)}`);
  return styles.length ? ` style="${styles.join(";")}"` : "";
};

const renderTextHtml = (node) => {
  let html = escapeHtml(node.text);
  const marks = Array.isArray(node.marks) ? node.marks : [];

  marks.forEach((mark) => {
    if (mark.type === "bold") html = `<strong>${html}</strong>`;
    if (mark.type === "italic") html = `<em>${html}</em>`;
    if (mark.type === "underline") html = `<u>${html}</u>`;
    if (mark.type === "strike") html = `<s>${html}</s>`;
    if (mark.type === "code") html = `<code>${html}</code>`;
    if (mark.type === "link" && mark.attrs?.href) {
      html = `<a href="${escapeHtml(mark.attrs.href)}">${html}</a>`;
    }
  });

  return html;
};

const renderInlineHtml = (nodes = []) =>
  nodes
    .map((node) => {
      if (node.type === "hardBreak") return "<br>";
      if (node.type === "text") return renderTextHtml(node);
      return renderNodeHtml(node);
    })
    .join("");

const renderNodeHtml = (node) => {
  if (!node || typeof node !== "object") return "";

  switch (node.type) {
    case "doc":
      return (node.content || []).map(renderNodeHtml).join("");
    case "paragraph": {
      const content = renderInlineHtml(node.content);
      return `<p${styleAttribute(node.attrs)}>${content || "<br>"}</p>`;
    }
    case "heading": {
      const level = Math.min(Math.max(Number(node.attrs?.level) || 2, 1), 6);
      const content = renderInlineHtml(node.content);
      return `<h${level}${styleAttribute(node.attrs)}>${content || "<br>"}</h${level}>`;
    }
    case "bulletList":
      return `<ul>${(node.content || []).map(renderNodeHtml).join("")}</ul>`;
    case "orderedList":
      return `<ol${node.attrs?.start ? ` start="${Number(node.attrs.start)}"` : ""}>${(node.content || []).map(renderNodeHtml).join("")}</ol>`;
    case "listItem":
      return `<li>${(node.content || []).map(renderNodeHtml).join("")}</li>`;
    case "table":
      return `<table>${(node.content || []).map(renderNodeHtml).join("")}</table>`;
    case "tableRow":
      return `<tr>${(node.content || []).map(renderNodeHtml).join("")}</tr>`;
    case "tableCell":
    case "tableHeader": {
      const tag = node.type === "tableHeader" ? "th" : "td";
      const attrs = node.attrs?.colspan
        ? ` colspan="${Number(node.attrs.colspan)}"`
        : "";
      return `<${tag}${attrs}>${(node.content || []).map(renderNodeHtml).join("") || "<br>"}</${tag}>`;
    }
    case "hardBreak":
      return "<br>";
    case "text":
      return renderTextHtml(node);
    default:
      return (node.content || []).map(renderNodeHtml).join("");
  }
};

export const tiptapToHtml = (content) => {
  if (!content || typeof content !== "object") return "";
  return renderNodeHtml(content);
};

const buildTextRuns = (nodes = []) =>
  nodes.flatMap((node) => {
    if (node.type === "hardBreak") {
      return [new TextRun({ break: 1, font: FONT_NAME, size: FONT_SIZE_HALF_POINTS })];
    }
    if (node.type !== "text") return [];

    const marks = Array.isArray(node.marks) ? node.marks : [];
    const hasLink = hasMark(node, "link");
    const underline = hasLink || hasMark(node, "underline");

    return [
      new TextRun({
        text: String(node.text ?? ""),
        bold: hasMark(node, "bold"),
        italics: hasMark(node, "italic"),
        strike: hasMark(node, "strike"),
        superScript: hasMark(node, "superscript"),
        subScript: hasMark(node, "subscript"),
        underline: underline ? {} : undefined,
        color: hasLink ? "0563C1" : undefined,
        font: FONT_NAME,
        size: FONT_SIZE_HALF_POINTS,
      }),
    ];
  });

const buildParagraph = (node) => {
  const heading = HEADING_LEVELS[Number(node.attrs?.level)] || undefined;
  const alignment =
    alignmentFromAttrs(node.attrs) || (heading ? AlignmentType.CENTER : undefined);
  const lineHeight = toNumber(node.attrs?.lineHeight, 0);
  const children = buildTextRuns(node.content);

  return new Paragraph({
    heading,
    alignment,
    spacing: {
      after: 120,
      line: lineHeight > 0 ? Math.round(lineHeight * 240) : undefined,
    },
    children: children.length
      ? children
      : [new TextRun({ text: "", font: FONT_NAME, size: FONT_SIZE_HALF_POINTS })],
  });
};

const buildList = (node, ordered) => {
  const items = (node.content || []).filter((item) => item.type === "listItem");

  return items.flatMap((item, itemIndex) => {
    const prefix = ordered ? `${itemIndex + 1}. ` : "• ";
    const paragraphs = (item.content || []).filter(
      (child) => child.type === "paragraph",
    );

    if (!paragraphs.length) {
      return [
        new Paragraph({
          children: [
            new TextRun({
              text: prefix,
              font: FONT_NAME,
              size: FONT_SIZE_HALF_POINTS,
            }),
          ],
        }),
      ];
    }

    return paragraphs.map((paragraph, paragraphIndex) =>
      buildParagraph({
        ...paragraph,
        content:
          paragraphIndex === 0
            ? [{ type: "text", text: prefix }, ...(paragraph.content || [])]
            : paragraph.content || [],
      }),
    );
  });
};

const buildTableCell = (node, columnCount) => {
  const children = (node.content || [])
    .map(buildDocxNode)
    .filter(Boolean);

  return new TableCell({
    width: {
      size: Math.floor(10000 / Math.max(columnCount, 1)) / 100,
      type: WidthType.PERCENTAGE,
    },
    children: children.length
      ? children
      : [
          new Paragraph({
            children: [
              new TextRun({ text: "", font: FONT_NAME, size: FONT_SIZE_HALF_POINTS }),
            ],
          }),
        ],
  });
};

const buildTable = (node) => {
  const rows = (node.content || [])
    .filter((row) => row.type === "tableRow")
    .map((row) => {
      const cells = (row.content || []).filter((cell) =>
        ["tableCell", "tableHeader"].includes(cell.type),
      );
      return new TableRow({
        children: cells.map((cell) => buildTableCell(cell, cells.length)),
      });
    });

  const border = { style: BorderStyle.SINGLE, size: 4, color: "000000" };

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: border,
      bottom: border,
      left: border,
      right: border,
      insideHorizontal: border,
      insideVertical: border,
    },
    rows: rows.length
      ? rows
      : [
          new TableRow({
            children: [
              buildTableCell({ type: "tableCell", content: [] }, 1),
            ],
          }),
        ],
  });
};

function buildDocxNode(node) {
  if (!node || typeof node !== "object") return null;

  switch (node.type) {
    case "paragraph":
    case "heading":
      return buildParagraph(node);
    case "bulletList":
      return buildList(node, false);
    case "orderedList":
      return buildList(node, true);
    case "table":
      return buildTable(node);
    case "doc":
      return (node.content || []).map(buildDocxNode).filter(Boolean);
    default:
      return (node.content || []).map(buildDocxNode).filter(Boolean);
  }
}

const buildDocxChildren = (content) => {
  const children = (content?.content || []).flatMap((node) => {
    const value = buildDocxNode(node);
    return Array.isArray(value) ? value : [value];
  });

  return children.filter(Boolean);
};

const buildHtmlDocument = ({ html, margins, title }) => `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title || "Văn bản")}</title>
<style>
@page {
  size: 210mm 297mm;
  margin: ${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm;
}
body {
  margin: 0;
  color: #111;
  font-family: "Times New Roman", "DejaVu Serif", serif;
  font-size: 13pt;
  line-height: 1.5;
}
h1, h2, h3, h4, h5, h6 { margin: 0 0 10px; font-size: 13pt; }
p { margin: 0 0 8px; }
table { width: 100%; border-collapse: collapse; margin: 10px 0; }
th, td { border: 1px solid #222; padding: 6px 8px; vertical-align: top; }
ul, ol { margin: 0 0 8px; padding-left: 24px; }
</style>
</head>
<body>${html}</body>
</html>`;

const resolveChromePath = () =>
  [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ]
    .filter(Boolean)
    .find((candidate) => existsSync(candidate));

export const validateGeneratedFile = (buffer, format) => {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw fail("File xuất không hợp lệ", 500);
  }

  if (format === "DOCX") {
    const signature = buffer.subarray(0, 4).toString("hex").toUpperCase();
    if (signature !== "504B0304") {
      throw fail("File DOCX không đúng định dạng ZIP", 500);
    }
  }

  if (format === "PDF") {
    const header = buffer.subarray(0, 5).toString("ascii");
    const tail = buffer.subarray(-1024).toString("latin1");
    if (header !== "%PDF-" || !tail.includes("%%EOF")) {
      throw fail("File PDF không hợp lệ", 500);
    }
  }

  return {
    status: "PASSED",
    note: null,
    checked_at: new Date(),
  };
};

export const buildFileName = (title, format) => {
  const base = String(title || "van-ban")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return `${base || "van-ban"}.${String(format).toLowerCase()}`;
};

export const renderDocumentFile = async ({
  format,
  content_json: contentJson,
  title,
  margins,
}) => {
  const normalizedFormat = String(format || "").toUpperCase();
  const content =
    contentJson && typeof contentJson === "object"
      ? contentJson
      : { type: "doc", content: [] };
  const normalizedMargins = normalizeMargins(margins);

  let buffer;
  let mimeType;

  if (normalizedFormat === "DOCX") {
    buffer = await Packer.toBuffer(
      new DocxDocument({
        creator: "HRM",
        title: String(title || "Văn bản"),
        sections: [
          {
            properties: {
              page: {
                size: {
                  width: PAGE_WIDTH_TWIP,
                  height: PAGE_HEIGHT_TWIP,
                },
                margin: {
                  top: mmToTwip(normalizedMargins.top),
                  right: mmToTwip(normalizedMargins.right),
                  bottom: mmToTwip(normalizedMargins.bottom),
                  left: mmToTwip(normalizedMargins.left),
                },
              },
            },
            children: buildDocxChildren(content),
          },
        ],
      }),
    );
    mimeType =
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  } else if (normalizedFormat === "PDF") {
    const executablePath = resolveChromePath();
    if (!executablePath) {
      throw fail(
        "Chưa cấu hình CHROME_PATH để xuất PDF. Vui lòng trỏ tới chrome hoặc edge.",
        503,
      );
    }

    const html = buildHtmlDocument({
      html: tiptapToHtml(content),
      margins: normalizedMargins,
      title,
    });
    const browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        preferCSSPageSize: true,
      });
      buffer = Buffer.from(pdf);
    } finally {
      await browser.close();
    }
    mimeType = "application/pdf";
  } else {
    throw fail("Định dạng xuất chỉ hỗ trợ DOCX hoặc PDF");
  }

  const validation = validateGeneratedFile(buffer, normalizedFormat);

  return {
    buffer,
    mime_type: mimeType,
    validation,
    format: normalizedFormat,
  };
};
