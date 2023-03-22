import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CreateChatCompletionResponse,
  CreateChatCompletionRequest,
  ChatCompletionRequestMessage
} from "openai";
import { ChakraProvider, extendTheme, Flex, Box, Text, Button, Textarea } from '@chakra-ui/react';
import { fetchGPTCompressionStearm, loadOrInputAPIKey } from './openai_helpers';
import { fromMarkdown } from "mdast-util-from-markdown";
import type { Code } from 'micromark-util-types';

const theme = extendTheme({
  config: {
    initialColorMode: 'dark',
    useSystemColorMode: false,
  }
});

const storagedApiKey = loadOrInputAPIKey();

const initialPrompt = `次の入力に対して奇抜でサイケデリックな CSS を生成してください。
コードの出力は必ず markdown 記法の \`\`\` のコードブロックで囲ってください。
\`[[\` と \`]]\`  で囲まれた部分は、後ほどユーザーの入力に置き換えられるので、そのまま出力してください。

入力:
\`\`\`html
<div class="container">
  <h1 class="title">[[title]]</h1>
  <p class="body">[[body]]</p>
</div>
\`\`\`
`;

const defaultMessages: ChatCompletionRequestMessage[] = [
  {
    "role": "system",
    "content": "あなたはプログラマのマークアップ補助ツールです。"
  },
];


export default function App() {
  return <ChakraProvider theme={theme}>
    <App_ />
  </ChakraProvider>
}

export function App_() {
  const [running, setRunning] = useState<{ controller: AbortController } | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [editingPrompt, setEditingPromt] = useState(initialPrompt);
  const [runningPrompt, setRunningPrompt] = useState<null | string>(null);
  const [output, setOutput] = useState('');
  const [parsedCodeBlocks, setParsedCodeBlocks] = useState<Code[]>([]);

  const onClickCancel = useCallback(async () => {
    if (running == null) return;
    running.controller.abort();
    setRunning(null);
  }, [running]);

  const onClickRun = useCallback(async () => {
    setRunningPrompt(editingPrompt);
  }, [editingPrompt, setOutput, iframeRef]);

  useEffect(() => {
    if (runningPrompt == null) return;
    setOutput('');
    setParsedCodeBlocks([]);
    const controller = new AbortController();
    setRunning({ controller });

    (async () => {
      if (iframeRef.current == null) return;
      let output = '';
      try {
        const iter = fetchGPTCompressionStearm(storagedApiKey!, [
          ...defaultMessages,
          {
            "role": "user",
            "content": editingPrompt
          }
        ], controller.signal);
        for await (const cmpl of iter) {
          if (cmpl.choices[0].delta.content == null) continue;
          output += cmpl.choices[0].delta.content;
          setOutput(output);
        }
      } catch (err) {
        console.error(err);
      } finally {
        // controller.
        setRunning(null);
      }

      // start parsing as markdown
      const parsed = fromMarkdown(output);

      const inputParsed = fromMarkdown(runningPrompt);
      const inputHtml = inputParsed.children.find((v) => v.type === 'code' && v.lang === 'html') as any;
      if (inputHtml == null) throw new Error("input html not found");

      const codeBlocks = parsed.children.filter((v) => v.type === 'code');
      setParsedCodeBlocks(codeBlocks as unknown as Code[]);

      // generate preview html
      try {
        const blob = new Blob(
          [
            `<!DOCTYPE html>
      <html>
        <head>
            <style>
              html, body {
                margin: 0;
              }
            </style>
          ${codeBlocks.map((v) => {
              // @ts-ignore
              if (v.lang === 'css') {
                // @ts-ignore
                return `<style>${v.value}</style>`;
              }
            }).filter(v => v).join('')}
        </head>
        <body>

        ${inputHtml.value ?? ''}

        </body>
      </html>`,
          ],
          { type: "text/html" }
        );
        iframeRef.current.src = URL.createObjectURL(blob);
      } catch (err) {
        console.error(err);
      } finally {
        setRunning(null);
      }
    })();
  }, [runningPrompt, setRunning, setOutput, iframeRef.current]);

  return (
    <Flex width='100vw' height='100vh' >
      <Box style={{ width: '50vw', height: '100%' }}>
        <Box height='60px'>
          <Button onClick={onClickRun} size="sm">
            Run
          </Button>
          <Button onClick={onClickCancel} size="sm" disabled={!!running}>
            Cancel
          </Button>

        </Box>
        <Box height="calc(96% - 60px)">
          <Textarea
            defaultValue={editingPrompt}
            onChange={(e) => {
              console.log("changed", e.target.value.length);
              setEditingPromt(e.target.value)
            }}
            height="100%"
          />
        </Box>
      </Box>
      <Box height='100%' maxW="50vw">
        <iframe style={{ width: '48vw', padding: 0, margin: 0, height: '30vh' }} ref={iframeRef} />
        <hr />
        <h3>Result</h3>
        <pre>
          <code>
            {output}
          </code>
        </pre>
        <hr />
        <details>
          <summary>
            Parsed
          </summary>
          <pre>
            <code>
              {
                parsedCodeBlocks.map((v, i) => {
                  // @ts-ignore
                  return `// ${v.lang}\n${v.value}\n\n`
                })
              }
            </code>
          </pre>

        </details>
      </Box>
    </Flex>
  )
}

