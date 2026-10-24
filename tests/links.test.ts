import { describe, expect, it } from "vitest";
import { parseInternalChannelUrl } from "../src/lib/links";

describe("parseInternalChannelUrl", () => {
  it("parses channel and message links generically by path structure", () => {
    const parsed = parseInternalChannelUrl(
      "https://chat.example.org/channels/1175623460161065030/1542028566022201344/1557487540242747403",
    );
    expect(parsed).toEqual({
      serverId: "1175623460161065030",
      channelId: "1542028566022201344",
      messageId: "1557487540242747403",
    });
  });

  it("parses channel-only jump links without a messageId", () => {
    const parsed = parseInternalChannelUrl(
      "https://chat.example.org/channels/1175623460161065030/1542028566022201344",
    );
    expect(parsed).toEqual({
      serverId: "1175623460161065030",
      channelId: "1542028566022201344",
      messageId: null,
    });
  });

  it("rejects non-channel URLs and non-numeric IDs", () => {
    expect(parseInternalChannelUrl("https://example.org/docs/123")).toBeNull();
    expect(parseInternalChannelUrl("https://example.org/channels/abc/123")).toBeNull();
    expect(parseInternalChannelUrl("not-a-url")).toBeNull();
  });
});
