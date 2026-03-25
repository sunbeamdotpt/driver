/**
 * Tests for WOPI discovery XML parsing and cache behavior.
 */

import {
  assertEquals,
  assertNotEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  parseDiscoveryXml,
  getCollaboraActionUrl,
  clearDiscoveryCache,
} from "../../server/wopi/discovery.ts";

// ── Fetch mock infrastructure ────────────────────────────────────────────────

const originalFetch = globalThis.fetch;

function mockFetch(
  handler: (url: string, init?: RequestInit) => Promise<Response> | Response,
) {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : input.url;
    return Promise.resolve(handler(url, init));
  }) as typeof globalThis.fetch;
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

// ── parseDiscoveryXml tests ─────────────────────────────────────────────────

Deno.test("parseDiscoveryXml — parses single app with single action", () => {
  const xml = `
    <wopi-discovery>
      <net-zone name="external-http">
        <app name="application/vnd.oasis.opendocument.text" favIconUrl="http://example.com/icon.png">
          <action name="edit" ext="odt" urlsrc="http://collabora:9980/loleaflet/dist/loleaflet.html?" />
        </app>
      </net-zone>
    </wopi-discovery>
  `;

  const result = parseDiscoveryXml(xml);
  assertEquals(result.size, 1);

  const actions = result.get("application/vnd.oasis.opendocument.text");
  assertNotEquals(actions, undefined);
  assertEquals(actions!.length, 1);
  assertEquals(actions![0].name, "edit");
  assertEquals(actions![0].ext, "odt");
  assertEquals(actions![0].urlsrc, "http://collabora:9980/loleaflet/dist/loleaflet.html?");
});

Deno.test("parseDiscoveryXml — parses multiple apps", () => {
  const xml = `
    <wopi-discovery>
      <net-zone name="external-http">
        <app name="application/vnd.oasis.opendocument.text">
          <action name="edit" ext="odt" urlsrc="http://collabora:9980/edit/odt?" />
          <action name="view" ext="odt" urlsrc="http://collabora:9980/view/odt?" />
        </app>
        <app name="application/pdf">
          <action name="view" ext="pdf" urlsrc="http://collabora:9980/view/pdf?" />
        </app>
      </net-zone>
    </wopi-discovery>
  `;

  const result = parseDiscoveryXml(xml);
  assertEquals(result.size, 2);

  const odtActions = result.get("application/vnd.oasis.opendocument.text");
  assertEquals(odtActions!.length, 2);
  assertEquals(odtActions![0].name, "edit");
  assertEquals(odtActions![1].name, "view");

  const pdfActions = result.get("application/pdf");
  assertEquals(pdfActions!.length, 1);
  assertEquals(pdfActions![0].name, "view");
});

Deno.test("parseDiscoveryXml — returns empty map for empty XML", () => {
  const result = parseDiscoveryXml("<wopi-discovery></wopi-discovery>");
  assertEquals(result.size, 0);
});

Deno.test("parseDiscoveryXml — skips actions without name or urlsrc", () => {
  const xml = `
    <wopi-discovery>
      <net-zone>
        <app name="text/plain">
          <action name="" ext="txt" urlsrc="http://example.com/view?" />
          <action name="edit" ext="txt" urlsrc="" />
          <action name="view" ext="txt" urlsrc="http://example.com/view?" />
        </app>
      </net-zone>
    </wopi-discovery>
  `;

  const result = parseDiscoveryXml(xml);
  const actions = result.get("text/plain");
  assertEquals(actions!.length, 1);
  assertEquals(actions![0].name, "view");
});

Deno.test("parseDiscoveryXml — handles realistic Collabora discovery XML", () => {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
    <wopi-discovery>
      <net-zone name="external-http">
        <app name="application/vnd.openxmlformats-officedocument.wordprocessingml.document" favIconUrl="http://collabora:9980/favicon.ico">
          <action name="edit" ext="docx" urlsrc="http://collabora:9980/browser/dist/cool.html?" />
          <action name="view" ext="docx" urlsrc="http://collabora:9980/browser/dist/cool.html?" />
        </app>
        <app name="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" favIconUrl="http://collabora:9980/favicon.ico">
          <action name="edit" ext="xlsx" urlsrc="http://collabora:9980/browser/dist/cool.html?" />
        </app>
        <app name="application/vnd.oasis.opendocument.text" favIconUrl="http://collabora:9980/favicon.ico">
          <action name="edit" ext="odt" urlsrc="http://collabora:9980/browser/dist/cool.html?" />
        </app>
      </net-zone>
    </wopi-discovery>`;

  const result = parseDiscoveryXml(xml);
  assertEquals(result.size, 3);
  assertNotEquals(
    result.get("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    undefined,
  );
  assertNotEquals(
    result.get("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    undefined,
  );
  assertNotEquals(
    result.get("application/vnd.oasis.opendocument.text"),
    undefined,
  );
});

// ── getCollaboraActionUrl tests ─────────────────────────────────────────────

Deno.test("getCollaboraActionUrl — returns urlsrc for matching mimetype + action", async () => {
  clearDiscoveryCache();
  mockFetch(() =>
    new Response(
      `<wopi-discovery>
        <net-zone>
          <app name="text/plain">
            <action name="edit" ext="txt" urlsrc="http://collabora:9980/edit/txt?" />
            <action name="view" ext="txt" urlsrc="http://collabora:9980/view/txt?" />
          </app>
        </net-zone>
      </wopi-discovery>`,
      { status: 200 },
    )
  );

  try {
    const url = await getCollaboraActionUrl("text/plain", "edit");
    assertEquals(url, "http://collabora:9980/edit/txt?");
  } finally {
    restoreFetch();
    clearDiscoveryCache();
  }
});

Deno.test("getCollaboraActionUrl — returns null for unknown mimetype", async () => {
  clearDiscoveryCache();
  mockFetch(() =>
    new Response(
      `<wopi-discovery>
        <net-zone>
          <app name="text/plain">
            <action name="edit" ext="txt" urlsrc="http://collabora:9980/edit/txt?" />
          </app>
        </net-zone>
      </wopi-discovery>`,
      { status: 200 },
    )
  );

  try {
    const url = await getCollaboraActionUrl("application/unknown", "edit");
    assertEquals(url, null);
  } finally {
    restoreFetch();
    clearDiscoveryCache();
  }
});

Deno.test("getCollaboraActionUrl — returns null for unknown action", async () => {
  clearDiscoveryCache();
  mockFetch(() =>
    new Response(
      `<wopi-discovery>
        <net-zone>
          <app name="text/plain">
            <action name="edit" ext="txt" urlsrc="http://collabora:9980/edit/txt?" />
          </app>
        </net-zone>
      </wopi-discovery>`,
      { status: 200 },
    )
  );

  try {
    const url = await getCollaboraActionUrl("text/plain", "view");
    assertEquals(url, null);
  } finally {
    restoreFetch();
    clearDiscoveryCache();
  }
});

Deno.test("getCollaboraActionUrl — defaults to 'edit' action", async () => {
  clearDiscoveryCache();
  mockFetch(() =>
    new Response(
      `<wopi-discovery>
        <net-zone>
          <app name="text/plain">
            <action name="edit" ext="txt" urlsrc="http://collabora:9980/edit/txt?" />
          </app>
        </net-zone>
      </wopi-discovery>`,
      { status: 200 },
    )
  );

  try {
    const url = await getCollaboraActionUrl("text/plain");
    assertEquals(url, "http://collabora:9980/edit/txt?");
  } finally {
    restoreFetch();
    clearDiscoveryCache();
  }
});

Deno.test("getCollaboraActionUrl — uses cache on second call", async () => {
  clearDiscoveryCache();
  let fetchCount = 0;
  mockFetch(() => {
    fetchCount++;
    return new Response(
      `<wopi-discovery>
        <net-zone>
          <app name="text/plain">
            <action name="edit" ext="txt" urlsrc="http://collabora:9980/edit/txt?" />
          </app>
        </net-zone>
      </wopi-discovery>`,
      { status: 200 },
    );
  });

  try {
    await getCollaboraActionUrl("text/plain", "edit");
    await getCollaboraActionUrl("text/plain", "edit");
    assertEquals(fetchCount, 1); // Should only fetch once due to cache
  } finally {
    restoreFetch();
    clearDiscoveryCache();
  }
});

Deno.test("getCollaboraActionUrl — throws after 3 failed retries", async () => {
  clearDiscoveryCache();
  mockFetch(() => new Response("Server Error", { status: 500 }));

  try {
    await assertRejects(
      () => getCollaboraActionUrl("text/plain", "edit"),
      Error,
      "Collabora discovery fetch failed",
    );
  } finally {
    restoreFetch();
    clearDiscoveryCache();
  }
});
