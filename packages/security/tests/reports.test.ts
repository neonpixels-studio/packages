import { describe, expect, it } from "vitest";
import { parseCspReports } from "../src/index.ts";

const legacyBody = (fields: Record<string, unknown>) =>
  JSON.stringify({ "csp-report": fields });
const reportingBody = (...bodies: Record<string, unknown>[]) =>
  JSON.stringify(bodies.map((body) => ({ type: "csp-violation", body })));

describe("parseCspReports", () => {
  it("parses application/csp-report", () => {
    const result = parseCspReports({
      contentType: "application/csp-report",
      body: legacyBody({
        "document-uri": "https://example.com/page",
        "blocked-uri": "inline",
        "violated-directive": "script-src-elem",
        "effective-directive": "script-src-elem",
        disposition: "report",
        "line-number": 12,
        "column-number": 3,
        "status-code": 200,
        "source-file": "https://example.com/app.js",
      }),
    });
    expect(result).toEqual({
      ok: true,
      violations: [
        {
          documentUri: "https://example.com/page",
          referrer: null,
          blockedUri: "inline",
          effectiveDirective: "script-src-elem",
          violatedDirective: "script-src-elem",
          disposition: "report",
          sourceFile: "https://example.com/app.js",
          lineNumber: 12,
          columnNumber: 3,
          statusCode: 200,
        },
      ],
    });
  });

  it("parses application/reports+json and ignores other report types", () => {
    const body = JSON.stringify([
      { type: "deprecation", body: { id: "x" } },
      {
        type: "csp-violation",
        body: {
          documentURL: "https://example.com/",
          blockedURL: "https://evil.example/x.js",
          effectiveDirective: "script-src",
          lineNumber: 4,
        },
      },
    ]);
    const result = parseCspReports({
      contentType: "application/reports+json",
      body,
    });
    expect(result).toMatchObject({
      ok: true,
      violations: [
        {
          documentUri: "https://example.com/",
          blockedUri: "https://evil.example/x.js",
          effectiveDirective: "script-src",
          lineNumber: 4,
        },
      ],
    });
  });

  it("parses application/json in either shape and ignores content type parameters and case", () => {
    const fields = {
      "document-uri": "https://a.example/",
      "violated-directive": "img-src",
    };
    for (const body of [legacyBody(fields), reportingBody(fields)]) {
      const result = parseCspReports({
        contentType: "Application/JSON; charset=utf-8",
        body,
      });
      expect(result).toMatchObject({
        ok: true,
        violations: [{ violatedDirective: "img-src" }],
      });
    }
  });

  it("strips query string, fragment, and credentials from every URL", () => {
    const result = parseCspReports({
      contentType: "application/csp-report",
      body: legacyBody({
        "document-uri": "https://user:pass@example.com/p?token=1#frag",
        referrer: "https://example.com/r?x=1",
        "blocked-uri": "https://cdn.example/a.js?sig=2#h",
        "source-file": "https://example.com/s.js?v=3",
        "violated-directive": "script-src",
      }),
    });
    expect(result).toMatchObject({
      ok: true,
      violations: [
        {
          documentUri: "https://example.com/p",
          referrer: "https://example.com/r",
          blockedUri: "https://cdn.example/a.js",
          sourceFile: "https://example.com/s.js",
        },
      ],
    });
  });

  it("strips details from URLs the URL parser rejects", () => {
    const result = parseCspReports({
      contentType: "application/csp-report",
      body: legacyBody({
        "document-uri": "https://user:pw@example.com:99999/p?token=1",
        "violated-directive": "script-src",
      }),
    });
    expect(result).toMatchObject({
      ok: true,
      violations: [{ documentUri: "https://example.com:99999/p" }],
    });
  });

  it("cuts every field to 512 characters", () => {
    const long = "a".repeat(2000);
    const result = parseCspReports({
      contentType: "application/csp-report",
      body: legacyBody({
        "document-uri": `https://example.com/${long}`,
        "blocked-uri": long,
        "violated-directive": long,
        "effective-directive": long,
        disposition: long,
        "source-file": long,
        referrer: long,
      }),
    });
    expect(result.ok).toBe(true);
    const [violation] = result.ok ? result.violations : [];
    const texts = Object.values(violation ?? {}).filter(
      (value): value is string => typeof value === "string",
    );
    expect(texts.length).toBeGreaterThanOrEqual(7);
    for (const text of texts) {
      expect(text.length).toBeLessThanOrEqual(512);
    }
  });

  it("cuts a long URL after stripping so the query never survives", () => {
    const result = parseCspReports({
      contentType: "application/csp-report",
      body: legacyBody({
        "document-uri": `https://example.com/${"a".repeat(500)}?secret=1`,
        "violated-directive": "script-src",
      }),
    });
    const [violation] = result.ok ? result.violations : [];
    expect(violation?.documentUri).not.toContain("secret");
  });

  it("returns at most 20 violations", () => {
    const bodies = Array.from({ length: 50 }, (_, index) => ({
      "violated-directive": "img-src",
      "line-number": index,
    }));
    const result = parseCspReports({
      contentType: "application/reports+json",
      body: reportingBody(...bodies),
    });
    expect(result.ok && result.violations).toHaveLength(20);
    expect(result.ok && result.violations[19]?.lineNumber).toBe(19);
  });

  it("drops violations without a directive and non-integer numbers", () => {
    const result = parseCspReports({
      contentType: "application/reports+json",
      body: reportingBody(
        { documentURL: "https://example.com/" },
        { effectiveDirective: "img-src", lineNumber: "7", columnNumber: 1.5 },
      ),
    });
    expect(result).toMatchObject({
      ok: true,
      violations: [{ lineNumber: null, columnNumber: null }],
    });
    expect(result.ok && result.violations).toHaveLength(1);
  });

  it("returns an empty list for valid JSON that holds no violations", () => {
    expect(
      parseCspReports({ contentType: "application/json", body: "{}" }),
    ).toEqual({ ok: true, violations: [] });
  });

  it.each([undefined, null, "", "text/plain", "application/xml", "csp"])(
    "fails on unsupported content type %s",
    (contentType) => {
      expect(parseCspReports({ contentType, body: "{}" })).toEqual({
        ok: false,
        reason: "unsupported-content-type",
      });
    },
  );

  it.each(["", "not json", "{", "null", "42", '"text"', "[1,"])(
    "fails on malformed body %j",
    (body) => {
      expect(
        parseCspReports({ contentType: "application/json", body }),
      ).toEqual({
        ok: false,
        reason: "malformed-body",
      });
    },
  );

  it("never throws on a non-string body", () => {
    const result = parseCspReports({
      contentType: "application/json",
      body: undefined as unknown as string,
    });
    expect(result).toEqual({ ok: false, reason: "malformed-body" });
  });
});
