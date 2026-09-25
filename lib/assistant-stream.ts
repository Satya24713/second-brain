// Read only the top-level reply string from incomplete structured JSON. Never
// expose proposal JSON or incomplete escape sequences in the chat bubble.
export function partialReply(raw: string): string {
  let depth = 0;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === "{") depth++;
    else if (raw[i] === "}") depth--;
    else if (raw[i] === '"') {
      const start = i;
      for (i++; i < raw.length; i++) {
        if (raw[i] === "\\") i++;
        else if (raw[i] === '"') break;
      }
      if (depth !== 1 || raw.slice(start, i + 1) !== '"reply"') continue;
      const tail = raw.slice(i + 1).match(/^\s*:\s*"/);
      if (!tail) continue;
      const valueStart = i + 1 + tail[0].length;
      let end = valueStart;
      while (end < raw.length) {
        if (raw[end] === '"') break;
        if (raw[end] === "\\") {
          const size = raw[end + 1] === "u" ? 6 : 2;
          if (end + size > raw.length) break;
          end += size;
        } else end++;
      }
      try {
        let text: string = JSON.parse(`"${raw.slice(valueStart, end)}"`);
        // Hold a high surrogate until the following chunk completes the emoji.
        if (/[\uD800-\uDBFF]$/.test(text)) text = text.slice(0, -1);
        return text;
      } catch {
        return "";
      }
    }
  }
  return "";
}

// SSE boundaries can span network chunks, including UTF-8 characters and CRLF.
export async function* readSSE(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let data: string[] = [];
  function line(value: string) {
    if (value.endsWith("\r")) value = value.slice(0, -1);
    if (value === "") {
      const event = data.join("\n");
      data = [];
      return event;
    }
    if (value.startsWith("data:")) data.push(value.slice(5).replace(/^ /, ""));
  }
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      let newline;
      while ((newline = pending.indexOf("\n")) >= 0) {
        const event = line(pending.slice(0, newline));
        pending = pending.slice(newline + 1);
        if (event) yield event;
      }
      if (done) break;
    }
    if (pending) line(pending);
    if (data.length) yield data.join("\n");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
