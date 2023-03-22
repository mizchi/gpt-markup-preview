import type {
  CreateChatCompletionResponse,
  CreateChatCompletionRequest,
  ChatCompletionRequestMessage,
} from "openai";

const OPENAI_APIKEY_STORAGED_KEY = "OPENAI_APIKEY";
// const storagedApiKey = localStorage.getItem(OPENAI_APIKEY_STORAGED_KEY);

export type CreateCompletionResponseStream = Omit<
  CreateChatCompletionResponse,
  "choices"
> & {
  choices: Array<{
    delta: {
      content?: string;
    };
    finish_reason?: string;
    index: number;
  }>;
};

export function loadOrInputAPIKey(): string | undefined {
  let storagedApiKey = localStorage.getItem(OPENAI_APIKEY_STORAGED_KEY);
  if (storagedApiKey == null) {
    const input = prompt("Please input your OpenAI API key");
    if (input == null) {
      return;
    }
    localStorage.setItem(OPENAI_APIKEY_STORAGED_KEY, input);
    storagedApiKey = input;
  }
  return storagedApiKey;
}

export async function* fetchGPTCompressionStearm(
  apiKey: string,
  messages: ChatCompletionRequestMessage[],
  abortSignal: AbortSignal,
): AsyncGenerator<CreateCompletionResponseStream> {
  const decoder = new TextDecoder("utf-8");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    signal: abortSignal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    method: "POST",
    body: JSON.stringify({
      messages,
      model: "gpt-3.5-turbo",
      stream: true,
    } satisfies CreateChatCompletionRequest),
  });
  for await (const str of streamAsyncIterable(
    res.body as ReadableStream<Uint8Array>,
  )) {
    const chunk = decoder.decode(str, { stream: true });
    const completions = chunk
      .split("data:")
      .map((data: any) => {
        const trimData = data.trim();
        if (trimData === "") return undefined;
        if (trimData === "[DONE]") return undefined;
        return JSON.parse(data.trim());
      })
      .filter((data: any) => data) as CreateCompletionResponseStream[];
    for (const completion of completions) {
      yield completion;
    }
  }
}

async function* streamAsyncIterable(stream: ReadableStream) {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}
