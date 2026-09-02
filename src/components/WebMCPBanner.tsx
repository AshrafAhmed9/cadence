export function WebMCPBanner({ available }: { available: boolean }) {
  if (available) return null;
  return (
    <div className="banner" role="status">
      <span>⚠</span>
      <span>
        WebMCP isn't active in this browser, so an external agent can't call this page's tools right now. Every
        tool is still usable below via the <strong>Simulated Agent</strong> panel in the sidebar. To try the real
        thing: open this page in Chrome with <code>chrome://flags/#enable-webmcp-testing</code> enabled, or in
        ChatGPT's in-app browser.
      </span>
    </div>
  );
}
