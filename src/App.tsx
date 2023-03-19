import { useCallback, useState } from 'react';
import type {
  CreateChatCompletionResponse,
  CreateChatCompletionRequest,
  ChatCompletionRequestMessage
} from "openai";

const OPENAI_APIKEY_STORAGED_KEY = 'OPENAI_APIKEY';
const storagedApiKey = localStorage.getItem(OPENAI_APIKEY_STORAGED_KEY);

type CreateCompletionResponseStream = Omit<CreateChatCompletionResponse, 'choices'> & {
  'choices': Array<{
    delta: {
      content?: string,
    },
    finish_reason?: string,
    index: number
  }>;
}

function loadOrInputAPIKey(): string | undefined {
  let storagedApiKey = localStorage.getItem(OPENAI_APIKEY_STORAGED_KEY);
  if (storagedApiKey == null) {
    const input = prompt('Please input your OpenAI API key');
    if (input == null) {
      return;
    }
    localStorage.setItem(OPENAI_APIKEY_STORAGED_KEY, input);
    storagedApiKey = input;
  }
  return
}

function resetApiKey() {
  localStorage.removeItem(OPENAI_APIKEY_STORAGED_KEY);
}

// localStorage.setItem('OPENAI_APIKEY', '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')

const messages: ChatCompletionRequestMessage[] = [
  {
    "role": "system",
    "content": "あなたはプログラマの補助ツールです。"
  },
  {
    "role": "user",
    "content": `次の React JSX に対する CSS を書いてください。
\`\`\`html
<div className="container">
  <h1>タイトル</h1>
  <p>本文</p>
</div>
\`\`\`
`
  }
];

function App() {
  // const [count, setCount] = useState(0);
  const [output, setOutput] = useState('');
  const onClickRun = useCallback(async () => {
    setOutput('');
    const completion = await fetch('https://api.openai.com/v1/chat/completions', {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${storagedApiKey}`
      },
      method: 'POST',
      body: JSON.stringify({
        messages,
        model: 'gpt-3.5-turbo',
        stream: true // ここで stream を有効にする
      } satisfies CreateChatCompletionRequest)
    });
    // const ret = await completion.json();
    // ReadableStream として使用する
    const reader = completion.body?.getReader();
    if (completion.status !== 200 || !reader) {
      return "error";
    }
    const decoder = new TextDecoder('utf-8');
    try {
      // この read で再起的にメッセージを待機して取得します
      const read = async (): Promise<any> => {
        const { done, value } = await reader.read();
        if (done) return reader.releaseLock();

        const chunk = decoder.decode(value, { stream: true });
        // この chunk には以下のようなデータ格納されている。複数格納されることもある。
        // data: { ... }
        // これは Event stream format と呼ばれる形式
        // https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events#event_stream_format
        // console.log('chunk', chunk);

        const completions = chunk
          // 複数格納されていることもあるため split する
          .split('data:')
          // data を json parse する
          // [DONE] は最後の行にくる
          .map((data) => {
            const trimData = data.trim();
            if (trimData === '') return undefined;
            if (trimData === '[DONE]') return undefined;
            return JSON.parse(data.trim());
          })
          .filter((data) => data) as CreateCompletionResponseStream[];

        // console.log(completions);
        const appending = completions
          .filter((v) => v.choices[0].delta.content)
          .map((v) => v.choices[0].delta.content)
          .join('');
        setOutput((prev) => prev + appending);
        return read();
      };
      await read();
    } catch (e) {
      console.error(e);
    }
    // ReadableStream を最後は解放する
    reader.releaseLock();
    // console.log(ret);
  }, [setOutput]);

  return (
    <div className="App">
      Hello
      <button onClick={onClickRun}>
        Run
      </button>
      <pre>
        <code>
          {output}
        </code>
      </pre>
    </div>
  )
}

export default App
