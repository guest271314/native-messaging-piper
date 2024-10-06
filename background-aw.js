// https://github.com/guest271314/native-messaging-piper
// Web Audio API AudioWorklet version
// ReadableStream, resizable ArrayBuffer, Web Audio API, subprocess streams from 
// Node.js, Deno, Bun to local rhasspy/piper with Native Messaging for real-time 
// local text-to-speech streaming in Chrome browser

// Inject script when chrome.runtime is installed and reloaded,
// when tabs are created and updated
chrome.runtime.onInstalled.addListener(executeScript);
chrome.tabs.onUpdated.addListener(executeScript);
chrome.tabs.onCreated.addListener(executeScript);
// Reload extension on action icon clicked
chrome.action.onClicked.addListener(() => {
  chrome.runtime.reload();
});
async function executeScript(/* ...args */) {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    try {
      if (!tab?.url.startsWith("chrome")) {
        await chrome.scripting.executeScript({
          target: {
            tabId: tab.id,
          },
          world: "MAIN",
          args: [chrome.runtime.getURL("transferableStream.html")],
          func: exec,
        });
      }
    } catch (e) {
      console.log(chrome.runtime.lastError, e);
      continue;
    }
  }
}
// Pass chrome-extension:ID/transferableStream.html as args
function exec(args) {
  // Inject Piper class into all URL's, excluding chrome:, chrome-extension:
  // Process ReadableStream where underlying source is 1 channel s16 PCM
  // from rhasspy/piper as Array (JSON) in Web extension
  globalThis.Piper = class Piper {
    constructor({ text, voice } = {
      text: "Speech synthesis.",
      voice: "male",
    }) {
      // Encoded into Web extension iframe URL
      this.params = new URLSearchParams(Object.entries({ text, voice }));
      this.url = new URL(args);
      // Text parameter to piper as JSON
      this.text = text;
      // Voice. Implemented: "male" or "female" matching en_US-hfc_${voice}-medium.onnx
      this.voice = voice;
      // Verify bytes in arbitrary Web page is equal to bytes
      // written to WritableStreamDefaultWriter in extension injected iframe.
      this.bytes = 0;
      // Web Audio API
      this.latencyHint = 0;
      this.channelCount = 1;
      this.numberOfInputs = 1;
      this.numberOfOutputs = 1;
      // 1 channel s16 PCM, interleaved
      this.sampleRate = 22050;
      // AbortController to abort streams and audio playback
      this.abortable = new AbortController();
      this.signal = this.abortable.signal;
      // Web Audio API BaseAudioContext
      this.ac = new AudioContext({
        latencyHint: this.latencyHint,
        sampleRate: this.sampleRate,
      });
      // Verify AudioContext state is closed on abort or complete
      // bytes in transferableStream.js, readOffset in AudioWorkletProcessor
      this.ac.addEventListener("statechange", (e) => {
        console.log(`${e.target.constructor.name}.state ${e.target.state}`);
      }, { once: true });
      this.msd = new MediaStreamAudioDestinationNode(this.ac, {
        channelCount: this.channelCount,
      });
      [this.track] = this.msd.stream.getAudioTracks();
      this.mediaStream = new MediaStream([this.track]);
      this.msn = new MediaStreamAudioSourceNode(this.ac, {
        mediaStream: this.mediaStream,
      });
      this.msn.connect(this.ac.destination);
    }
    // Remove iframe when done streaming, stream aborted, or error, exception.
    removeFrame() {
      document.querySelectorAll(`[src*="${this.url.origin}"]`)
        .forEach((iframe) => {
          document.body.removeChild(iframe);
        });
      this.transferableWindow = null;
    }
    abort(reason = "Stream aborted.") {
      this.abortable.abort(reason);
    }
    async stream() {
      // Web extension "web_accessible_resources" to communicate with iframe
      // from and to arbitrary Web pages using Transferable Streams.
      const { resolve, reject, promise } = Promise.withResolvers();
      this.promise = promise;
      const handleMessage = (event) => {
        if (event.origin === this.url.origin) {
          // If event.data is ReadableStream pass ReadableStream
          // and function to remove iframe from Web page when stream completes
          if (event.data instanceof ReadableStream) {
            resolve(event.data);
          } else {
            console.trace();
            reject(event.data);
          }
        }
      };
      addEventListener("message", handleMessage, { once: true });
      this.transferableWindow = document.createElement("iframe");
      this.transferableWindow.style.display = "none";
      this.transferableWindow.name = location.href;
      // Encode text and voice in chrome-extension: URL
      this.transferableWindow.src =
        `${this.url.href}?${this.params.toString()}`;
      document.body.appendChild(this.transferableWindow);
      this.readable = (await this.promise).pipeThrough(new TransformStream(), {
        signal: this.signal,
      });
      if ((!this.readable) instanceof ReadableStream) {
        return this.abort();
      }
      // AudioWorklet
      class AudioWorkletProcessor {}
      class ResizableArrayBufferAudioWorkletStream
        extends AudioWorkletProcessor {
        constructor(_options) {
          super();
          this.readOffset = 0;
          this.writeOffset = 0;
          this.endOfStream = false;
          this.ab = new ArrayBuffer(0, {
            maxByteLength: (1024 ** 2) * 4,
          });
          this.u8 = new Uint8Array(this.ab);
          this.port.onmessage = (e) => {
            this.readable = e.data;
            this.stream();
          };
        }
        int16ToFloat32(u16, channel) {
          for (const [i, int] of u16.entries()) {
            const float = int >= 0x8000
              ? -(0x10000 - int) / 0x8000
              : int / 0x7fff;
            channel[i] = float;
          }
        }
        async stream() {
          try {
            for await (const u8 of this.readable) {
              const { length } = u8;
              this.ab.resize(this.ab.byteLength + length);
              this.u8.set(u8, this.readOffset);
              this.readOffset += length;
            }
            console.log("Input strean closed.");
          } catch (e) {
            this.ab.resize(0);
            this.port.postMessage({
              currentTime,
              currentFrame,
              readOffset: this.readOffset,
              writeOffset: this.writeOffset,
              e,
            });
          }
        }
        process(_, [
          [output],
        ]) {
          if (this.writeOffset > 0 && this.writeOffset >= this.readOffset) {
            if (this.endOfStream === false) {
              console.log("Output stream closed.");
              this.endOfStream = true;
              this.ab.resize(0);
              this.port.postMessage({
                currentTime,
                currentFrame,
                readOffset: this.readOffset,
                writeOffset: this.writeOffset,
              });
            }
          }
          if (this.readOffset > 256 && this.writeOffset < this.readOffset) {
            if (this.writeOffset === 0) {
              console.log("Start output stream.");
            }
            const u8 = Uint8Array.from(
              { length: 256 },
              () =>
                this.writeOffset > this.readOffset
                  ? 0
                  : this.u8[this.writeOffset++],
            );
            const u16 = new Uint16Array(u8.buffer);
            this.int16ToFloat32(u16, output);
          }
          return true;
        }
      }
      // Register processor in AudioWorkletGlobalScope.
      function registerProcessor(name, processorCtor) {
        return `console.log(globalThis);\n${processorCtor};\n
          registerProcessor('${name}', ${processorCtor.name});`
          .replace(/\s+/g, " ");
      }
      const worklet = URL.createObjectURL(
        new Blob([
          registerProcessor(
            "resizable-arraybuffer-audio-worklet-stream",
            ResizableArrayBufferAudioWorkletStream,
          ),
        ], { type: "text/javascript" }),
      );
      await this.ac.audioWorklet.addModule(
        worklet,
      );
      try {
        this.aw = new AudioWorkletNode(
          this.ac,
          "resizable-arraybuffer-audio-worklet-stream",
          {
            numberOfInputs: this.numberOfInputs,
            numberOfOutputs: this.numberOfOutputs,
            channelCount: this.channelCount,
          },
        );
      } catch (e) {
        console.log(e);
        throw e;
      }
      // Transfer ReadableStream to AudioWorkeltProcessor scope.
      this.aw.port.postMessage(this.readable, [this.readable]);
      this.aw.connect(this.msd);
      this.aw.onprocessorerror = (e) => {
        console.error(e, "processorerror");
        console.trace();
      };
      const { resolve: result, promise: endOfStream } = Promise.withResolvers();
      this.aw.port.onmessage = async (e) => {
        this.ac.addEventListener("statechange", (event) => {
          console.log(
            `${event.target.constructor.name}.state ${event.target.state}`,
          );
          result({
            ...e.data,
            ...this.ac.playoutStats.toJSON(),
          });
        }, { once: true });
        await this.ac.close();
      };
      return endOfStream.finally(
        () => (this.removeFrame()),
      );
    }
  };
  return;
}

self.addEventListener("install", (event) => {
  console.log(event);
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  console.log(event);
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  console.log(event);
});
