#!/usr/bin/env -S /home/user/bin/node
//#!/usr/bin/env -S /home/user/bin/deno -A
//#!/usr/bin/env -S /home/user/bin/bun run

const runtime = navigator.userAgent;
const buffer = new ArrayBuffer(0, { maxByteLength: 1024 ** 2 });
const view = new DataView(buffer);
const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Node.js, Deno, Bun implement standard streams (stdin, stdout, stderr)
// differently.
let readable, writable, exit, args;

if (runtime.startsWith("Deno")) {
  ({ readable } = Deno.stdin);
  ({ writable } = Deno.stdout);
  ({ exit } = Deno);
  ({ args } = Deno);
}

if (runtime.startsWith("Node")) {
  readable = process.stdin;
  writable = new WritableStream({
    write(value) {
      process.stdout.write(value);
    },
  });
  ({ exit } = process);
  ({ argv: args } = process);
}

if (runtime.startsWith("Bun")) {
  readable = Bun.file("/dev/stdin").stream();
  writable = new WritableStream({
    async write(value) {
      await Bun.write(Bun.stdout, value);
    },
  }, new CountQueuingStrategy({ highWaterMark: Infinity }));
  ({ exit } = process);
  ({ argv: args } = Bun);
}
// Encode message
function encodeMessage(message) {
  return encoder.encode(JSON.stringify(message));
}
// Read message from the browser
async function* getMessage() {
  let messageLength = 0;
  let readOffset = 0;
  for await (let message of readable) {
    if (buffer.byteLength === 0 && messageLength === 0) {
      buffer.resize(4);
      for (let i = 0; i < 4; i++) {
        view.setUint8(i, message[i]);
      }
      messageLength = view.getUint32(0, true);
      message = message.subarray(4);
      buffer.resize(0);
    }
    buffer.resize(buffer.byteLength + message.length);
    for (let i = 0; i < message.length; i++, readOffset++) {
      view.setUint8(readOffset, message[i]);
    }
    if (buffer.byteLength === messageLength) {
      yield new Uint8Array(buffer);
      messageLength = 0;
      readOffset = 0;
      buffer.resize(0);
    }
  }
}
// Send message to the browser
async function sendMessage(message) {
  await new Blob([
    new Uint8Array(new Uint32Array([message.length]).buffer),
    message,
  ])
    .stream()
    .pipeTo(writable, { preventClose: true });
}
// Loop
async function main() {
  try {
    for await (const message of getMessage()) {
      const { text, voice } = JSON.parse(decoder.decode(message));
      const piper = new URL("./piper/piper", import.meta.url).pathname;
      const voiceuri =
        new URL(`./en_US-hfc_${voice}-medium.onnx`, import.meta.url).pathname;
      // Use Bash. Or xz, dax, Bun builtin shell to construct pipes
      // echo "text" | command | tee file | subcommand
      const script =
        `echo ${text} | ${piper} -q --length_scale 1 --sentence_silence 0 --model ${voiceuri} --output_raw`;
      const command = ["/bin/bash", ["-c", script]];
      // Node.js, Deno, Bun implement subprocesses differently.
      let stream;

      if (runtime.startsWith("Node")) {
        const { Duplex } = await import("node:stream");
        const { spawn } = await import("node:child_process");
        const { stdout, stderr } = spawn(...command);
        stream = Duplex.toWeb(stdout).readable;
      }

      if (runtime.startsWith("Deno")) {
        const subprocess = new Deno.Command(command.shift(), {
          args: command.pop(),
          stdout: "piped",
          stdin: "piped",
        });
        const process = subprocess.spawn();
        process.stdin.close();
        stream = process.stdout;
      }

      if (runtime.startsWith("Bun")) {
        const subprocess = Bun.spawn(command.flat());
        stream = subprocess.stdout;
      }

      await stream.pipeTo(
        new WritableStream({
          async write(u8) {
            await sendMessage(encodeMessage([...u8]));
          },
        }),
      );
      break;
    }
  } catch (e) {
    sendMessage(encodeMessage(e.message));
    // exit(1);
  }
}

main();
/*
export {
  args,
  encodeMessage,
  exit,
  getMessage,
  main,
  readable,
  sendMessage,
  writable,
};
*/
