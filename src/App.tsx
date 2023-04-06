import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ChatCompletionRequestMessage
} from "openai";
import { Heading, Box, Button, Textarea, Grid, GridItem, Flex, Spacer, IconButton } from '@chakra-ui/react';
import { fetchGPTCompressionStearm, getOrInputAPIKey } from './openai_helpers';
import { fromMarkdown } from "mdast-util-from-markdown";

const initialPrompt = `次の入力に対して奇抜でサイケデリックな CSS を生成してください。
コードの出力は必ず markdown 記法の \`\`\` のコードブロックで囲ってください。

入力:
\`\`\`html
<div class="container">
  <p class="text">Hello</p>
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
  const [running, setRunning] = useState<{ controller: AbortController } | null>(null);
  const [clickCount, setClickCount] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  // const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [editingPrompt, setEditingPromt] = useState(initialPrompt);
  const [runningPrompt, setRunningPrompt] = useState<null | string>(null);
  const [output, setOutput] = useState('');

  const onClickCancel = useCallback(async () => {
    if (running == null) return;
    running.controller.abort();
    setRunning(null);
  }, [running]);

  const onClickRun = useCallback(async () => {
    if (running?.controller) {
      running.controller.abort();
      setRunning(null);
      console.error('aborted');
    }
    setRunningPrompt(editingPrompt);
    setClickCount(n => n + 1);
  }, [editingPrompt, running, setOutput, iframeRef, setRunningPrompt]);

  useEffect(() => {
    if (runningPrompt == null) {
      console.log("cancelled");
      return;
    }
    const controller = new AbortController();

    setOutput('');
    // setParsedCodeBlocks([]);
    setRunning({ controller });

    (async () => {
      if (iframeRef.current == null) return;
      let output = '';
      try {
        const storagedApiKey = getOrInputAPIKey();

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
            body {
              transform: scale(1);
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
  }, [runningPrompt, clickCount, setRunning, setOutput, iframeRef.current]);

  useEffect(() => {
    if (outputRef.current == null) return;
    outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [output, outputRef])

  return (
    <Box w="100vw" h="100vh">
      <Grid
        templateAreas={`
        "header header"
        "prompt controller"
        "prompt output"
        "prompt preview"`
        }
        gridTemplateRows={`
          50px
          40px
          1fr
          2fr
        `}
        gridTemplateColumns={'1fr 1fr'}
        h='100%'
        gap='1'
        color='blackAlpha.700'
        fontWeight='bold'
      >
        <GridItem pl='2' bg='orange.300' area={'header'}>
          <Flex>
            <Box>
              <Heading>
                GPT Markup Preview (DEMO)
              </Heading>
            </Box>
          </Flex>

        </GridItem>
        <GridItem pl='1' area={'prompt'}>
          <Box height="99%" background="#333" color="white">
            <Textarea
              defaultValue={editingPrompt}
              onChange={(e) => {
                console.log("changed", e.target.value.length);
                setEditingPromt(e.target.value)
              }}
              height="100%"
            />
          </Box>

        </GridItem>
        <GridItem pl='2' bg='green.300' area={'output'} minW={0} minH={0}>
          <Box height="100%" width="100%" overflow="scroll" fontFamily={"SFMono-Regular, Consolas, Liberation Mono, Menlo, Courier, monospace;"} ref={outputRef}>
            <pre>
              <code>
                {output}
              </code>
            </pre>
          </Box>
        </GridItem>
        <GridItem pl='2' area={'controller'}>
          <Button
            onClick={onClickRun}
            size="sm"
            variant={"solid"}
            colorScheme='teal'
            isLoading={!!running}
            loadingText='Generating...'
          >
            Run Prompt
          </Button>
          &nbsp;
          {running &&
            <Button onClick={onClickCancel} size="sm" variant={"solid"} colorScheme='orange'>
              Cancel
            </Button>
          }
        </GridItem>
        <GridItem pl='0' bg='blue.300' area={'preview'} minW="0" minH="0">
          <iframe style={{ width: '100%', height: '100%', padding: 0, margin: 0 }} ref={iframeRef} />
        </GridItem>
      </Grid>
    </Box>
  )

}

